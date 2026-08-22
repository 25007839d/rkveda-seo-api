const { chromium } = require("playwright");


// =====================================================
// CRAWLER CONFIG
// =====================================================

const CRAWLER_CONFIG = {

    // Maximum pages to crawl for one website
    maxPagesPerWebsite: 2,

    // Maximum time allowed for page navigation
    navigationTimeout: 15000,

    // Do not wait for every network request
    waitUntil: "domcontentloaded"

};


// =====================================================
// NORMALIZE URL
// =====================================================

const normalizeUrl = (url) => {

    try {

        const parsed = new URL(url);

        // Remove fragment
        parsed.hash = "";

        // Remove trailing slash except root
        if (
            parsed.pathname !== "/" &&
            parsed.pathname.endsWith("/")
        ) {

            parsed.pathname =
                parsed.pathname.slice(0, -1);

        }

        return parsed.toString();

    } catch {

        return null;

    }

};


// =====================================================
// CRAWL SINGLE PAGE
// =====================================================

const crawlPage = async (page, url) => {

    const startTime = Date.now();


    // -------------------------------------------------
    // Default result
    // -------------------------------------------------

    const emptyResult = {

        success: false,

        url,

        statusCode: null,

        responseTime: 0,

        title: null,
        titleCount: 0,

        metaDescription: null,
        metaDescriptionCount: 0,

        h1: null,
        h1Count: 0,

        canonical: null,
        canonicalCount: 0,

        robots: null,

        wordCount: 0,

        imagesCount: 0,

        imagesWithoutAlt: 0,

        internalLinksCount: 0,

        internalLinks: [],

        error: null

    };


    try {

        // =================================================
        // NAVIGATION
        // =================================================

        const response = await page.goto(url, {

            waitUntil:
                CRAWLER_CONFIG.waitUntil,

            timeout:
                CRAWLER_CONFIG.navigationTimeout

        });


        const responseTime =
            Date.now() - startTime;


        const statusCode =
            response
                ? response.status()
                : null;


        // =================================================
        // READ DOM DIRECTLY
        //
        // Important:
        // We don't use locator.getAttribute()
        // for optional SEO elements.
        //
        // Missing elements return null immediately.
        // =================================================

        const seoData = await page.evaluate(() => {

            const getMetaContent = (selector) => {

                const element =
                    document.querySelector(selector);

                return element
                    ? element.getAttribute("content")
                    : null;

            };


            const getAttribute = (
                selector,
                attribute
            ) => {

                const element =
                    document.querySelector(selector);

                return element
                    ? element.getAttribute(attribute)
                    : null;

            };


            const title =
                document.title || null;


            const titleCount =
                document.querySelectorAll(
                    "title"
                ).length;


            const metaDescription =
                getMetaContent(
                    'meta[name="description"]'
                );


            const metaDescriptionCount =
                document.querySelectorAll(
                    'meta[name="description"]'
                ).length;


            const h1Elements =
                Array.from(
                    document.querySelectorAll("h1")
                );


            const h1 =
                h1Elements.length > 0
                    ? h1Elements[0].innerText
                    : null;


            const h1Count =
                h1Elements.length;


            const canonical =
                getAttribute(
                    'link[rel="canonical"]',
                    "href"
                );


            const canonicalCount =
                document.querySelectorAll(
                    'link[rel="canonical"]'
                ).length;


            const robots =
                getMetaContent(
                    'meta[name="robots"]'
                );


            // ---------------------------------------------
            // IMAGES
            // ---------------------------------------------

            const imageElements =
                Array.from(
                    document.querySelectorAll("img")
                );


            const imagesWithoutAlt =
                imageElements.filter(
                    img => {

                        const alt =
                            img.getAttribute("alt");

                        return (
                            !alt ||
                            alt.trim() === ""
                        );

                    }
                ).length;


            // ---------------------------------------------
            // INTERNAL LINKS
            // ---------------------------------------------

            const currentHostname =
                window.location.hostname;


            const internalLinks =
                Array.from(
                    document.querySelectorAll(
                        "a[href]"
                    )
                )
                    .map(
                        link =>
                            link.href
                    )
                    .filter(
                        href => {

                            try {

                                const parsed =
                                    new URL(href);

                                return (
                                    parsed.hostname ===
                                        currentHostname &&

                                    (
                                        parsed.protocol ===
                                            "http:" ||

                                        parsed.protocol ===
                                            "https:"
                                    )
                                );

                            } catch {

                                return false;

                            }

                        }
                    );


            // ---------------------------------------------
            // BODY TEXT
            // ---------------------------------------------

            const bodyText =
                document.body
                    ? document.body.innerText
                    : "";


            const cleanText =
                bodyText
                    .replace(/\s+/g, " ")
                    .trim();


            const wordCount =
                cleanText
                    ? cleanText.split(/\s+/).length
                    : 0;


            return {

                title,

                titleCount,

                metaDescription,

                metaDescriptionCount,

                h1,

                h1Count,

                canonical,

                canonicalCount,

                robots,

                wordCount,

                imagesCount:
                    imageElements.length,

                imagesWithoutAlt,

                internalLinksCount:
                    internalLinks.length,

                internalLinks

            };

        });


        // =================================================
        // SUCCESSFUL RESULT
        // =================================================

        return {

            success: true,

            url,

            statusCode,

            responseTime,

            title:
                seoData.title,

            titleCount:
                seoData.titleCount,

            metaDescription:
                seoData.metaDescription,

            metaDescriptionCount:
                seoData.metaDescriptionCount,

            h1:
                seoData.h1
                    ? seoData.h1.trim()
                    : null,

            h1Count:
                seoData.h1Count,

            canonical:
                seoData.canonical,

            canonicalCount:
                seoData.canonicalCount,

            robots:
                seoData.robots,

            wordCount:
                seoData.wordCount,

            imagesCount:
                seoData.imagesCount,

            imagesWithoutAlt:
                seoData.imagesWithoutAlt,

            internalLinksCount:
                seoData.internalLinksCount,

            internalLinks:
                seoData.internalLinks,

            error: null

        };


    } catch (error) {

        // =================================================
        // FAILED PAGE
        // =================================================

        return {

            ...emptyResult,

            responseTime:
                Date.now() - startTime,

            error:
                error.message

        };

    }

};


// =====================================================
// MULTI PAGE CRAWLER
// =====================================================

const crawlWebsite = async (
    startUrl,
    maxPages =
        CRAWLER_CONFIG.maxPagesPerWebsite
) => {

    let browser;

    const startTime =
        Date.now();


    try {

        // =================================================
        // NORMALIZE START URL
        // =================================================

        const normalizedStartUrl =
            normalizeUrl(startUrl);


        if (!normalizedStartUrl) {

            return {

                success: false,

                error:
                    "Invalid website URL."

            };

        }


        // =================================================
        // HOSTNAME
        // =================================================

        const startHostname =
            new URL(
                normalizedStartUrl
            ).hostname;


        // =================================================
        // LIMIT PAGES
        // =================================================

        const pageLimit =
            Math.min(
                Number(maxPages) || 2,
                CRAWLER_CONFIG.maxPagesPerWebsite
            );


        // =================================================
        // LAUNCH BROWSER
        // =================================================

        browser =
            await chromium.launch({

                headless: true

            });


        const page =
            await browser.newPage({

                userAgent:
                    "RKVedaSEO-Crawler/1.0"

            });


        // =================================================
        // QUEUE
        // =================================================

        const queue = [
            normalizedStartUrl
        ];


        const visited =
            new Set();


        const pages = [];


        // =================================================
        // CRAWL LOOP
        // =================================================

        while (

            queue.length > 0 &&

            pages.length < pageLimit

        ) {

            const currentUrl =
                queue.shift();


            const normalizedUrl =
                normalizeUrl(
                    currentUrl
                );


            if (!normalizedUrl) {

                continue;

            }


            if (
                visited.has(
                    normalizedUrl
                )
            ) {

                continue;

            }


            visited.add(
                normalizedUrl
            );


            console.log(
                `Crawling ${pages.length + 1}/${pageLimit}: ${normalizedUrl}`
            );


            const result =
                await crawlPage(
                    page,
                    normalizedUrl
                );


            pages.push(result);


            // =================================================
            // ADD INTERNAL LINKS
            // =================================================

            if (
                result.success &&
                Array.isArray(
                    result.internalLinks
                )
            ) {

                for (
                    const link
                    of result.internalLinks
                ) {

                    const normalizedLink =
                        normalizeUrl(
                            link
                        );


                    if (!normalizedLink) {

                        continue;

                    }


                    try {

                        const linkHostname =
                            new URL(
                                normalizedLink
                            ).hostname;


                        if (
                            linkHostname !==
                            startHostname
                        ) {

                            continue;

                        }

                    } catch {

                        continue;

                    }


                    if (

                        !visited.has(
                            normalizedLink
                        ) &&

                        !queue.includes(
                            normalizedLink
                        )

                    ) {

                        queue.push(
                            normalizedLink
                        );

                    }

                }

            }

        }


        // =================================================
        // STATISTICS
        // =================================================

        const successfulPages =
            pages.filter(
                page =>
                    page.success
            );


        const failedPages =
            pages.filter(
                page =>
                    !page.success
            );


        const totalWords =
            successfulPages.reduce(

                (
                    total,
                    page
                ) =>

                    total +
                    (page.wordCount || 0),

                0

            );


        const totalImages =
            successfulPages.reduce(

                (
                    total,
                    page
                ) =>

                    total +
                    (page.imagesCount || 0),

                0

            );


        const totalImagesWithoutAlt =
            successfulPages.reduce(

                (
                    total,
                    page
                ) =>

                    total +
                    (
                        page.imagesWithoutAlt ||
                        0
                    ),

                0

            );


        const totalInternalLinks =
            successfulPages.reduce(

                (
                    total,
                    page
                ) =>

                    total +
                    (
                        page.internalLinksCount ||
                        0
                    ),

                0

            );


        // =================================================
        // FINAL RESULT
        // =================================================

        return {

            success: true,

            startUrl:
                normalizedStartUrl,

            maxPages:
                pageLimit,

            pagesCrawled:
                pages.length,

            successfulPages:
                successfulPages.length,

            failedPages:
                failedPages.length,

            totalWords,

            totalImages,

            totalImagesWithoutAlt,

            totalInternalLinks,

            crawlTime:
                Date.now() - startTime,

            pages

        };


    } catch (error) {

        return {

            success: false,

            startUrl,

            error:
                error.message,

            crawlTime:
                Date.now() - startTime

        };


    } finally {

        if (browser) {

            await browser.close();

        }

    }

};


// =====================================================
// EXPORT
// =====================================================

module.exports = {

    crawlPage,

    crawlWebsite

};