const analyzePage = (page) => {

    // =====================================================
    // CRAWL FAILURE
    // =====================================================

    if (!page || page.success === false) {

        return {

            url: page?.url || null,

            score: 0,

            crawlFailed: true,

            issuesCount: 1,

            warningsCount: 0,

            passedCount: 0,

            issues: [
                {
                    code: "CRAWL_FAILED",
                    message:
                        `Page could not be crawled${
                            page?.error
                                ? `: ${page.error}`
                                : "."
                        }`
                }
            ],

            warnings: [],

            passed: []

        };

    }


    const issues = [];
    const warnings = [];
    const passed = [];


    // =====================================================
    // HTTP STATUS
    // =====================================================

    if (page.statusCode === 200) {

        passed.push({
            code: "HTTP_OK",
            message:
                "Page returned HTTP 200."
        });

    } else {

        issues.push({
            code: "HTTP_ERROR",
            message:
                `Page returned HTTP ${page.statusCode}.`
        });


        // =================================================
        // 404 PAGE
        // =================================================

        if (page.statusCode === 404) {

            issues.push({
                code: "PAGE_NOT_FOUND",
                message:
                    "Page returned HTTP 404 Not Found."
            });


            return {

                url: page.url,

                score: 0,

                crawlFailed: false,

                pageStatus: "not_found",

                statusCode:
                    page.statusCode,

                issuesCount:
                    issues.length,

                warningsCount: 0,

                passedCount:
                    passed.length,

                issues,

                warnings: [],

                passed

            };

        }


        // =================================================
        // OTHER HTTP ERRORS
        // =================================================

        if (
            page.statusCode >= 400
        ) {

            return {

                url: page.url,

                score: 0,

                crawlFailed: false,

                pageStatus: "http_error",

                statusCode:
                    page.statusCode,

                issuesCount:
                    issues.length,

                warningsCount: 0,

                passedCount:
                    passed.length,

                issues,

                warnings: [],

                passed

            };

        }

    }


    // =====================================================
    // TITLE
    // =====================================================

    if (page.title) {

        passed.push({
            code: "TITLE_PRESENT",
            message:
                "Title tag is present."
        });

    } else {

        issues.push({
            code: "TITLE_MISSING",
            message:
                "Page is missing a title tag."
        });

    }


    if (page.titleCount > 1) {

        issues.push({
            code: "DUPLICATE_TITLE",
            message:
                `Page contains ${page.titleCount} title tags.`
        });

    }


    if (
        page.title &&
        page.title.length > 60
    ) {

        warnings.push({
            code: "TITLE_TOO_LONG",
            message:
                "Title is longer than 60 characters."
        });

    }


    // =====================================================
    // META DESCRIPTION
    // =====================================================

    if (page.metaDescription) {

        passed.push({
            code:
                "META_DESCRIPTION_PRESENT",

            message:
                "Meta description is present."
        });

    } else {

        issues.push({
            code:
                "META_DESCRIPTION_MISSING",

            message:
                "Page is missing a meta description."
        });

    }


    if (
        page.metaDescriptionCount > 1
    ) {

        issues.push({
            code:
                "DUPLICATE_META_DESCRIPTION",

            message:
                `Page contains ${page.metaDescriptionCount} meta description tags.`
        });

    }


    // =====================================================
    // H1
    // =====================================================

    if (page.h1) {

        passed.push({
            code: "H1_PRESENT",
            message:
                "H1 heading is present."
        });

    } else {

        issues.push({
            code: "H1_MISSING",
            message:
                "Page is missing an H1 heading."
        });

    }


    if (page.h1Count > 1) {

        warnings.push({
            code: "MULTIPLE_H1",
            message:
                `Page contains ${page.h1Count} H1 headings.`
        });

    }


    // =====================================================
    // CANONICAL
    // =====================================================

    if (page.canonical) {

        passed.push({
            code: "CANONICAL_PRESENT",
            message:
                "Canonical URL is present."
        });

    } else {

        issues.push({
            code: "CANONICAL_MISSING",
            message:
                "Page is missing a canonical URL."
        });

    }


    if (
        page.canonicalCount > 1
    ) {

        issues.push({
            code: "DUPLICATE_CANONICAL",
            message:
                `Page contains ${page.canonicalCount} canonical tags.`
        });

    }


    // =====================================================
    // ROBOTS
    // =====================================================

    if (page.robots) {

        passed.push({
            code: "ROBOTS_PRESENT",
            message:
                "Robots meta tag is present."
        });

    } else {

        warnings.push({
            code: "ROBOTS_MISSING",
            message:
                "Robots meta tag is not present."
        });

    }


    // =====================================================
    // CONTENT
    // =====================================================

    if (page.wordCount >= 300) {

        passed.push({
            code: "CONTENT_LENGTH_OK",
            message:
                `Page contains ${page.wordCount} words.`
        });

    } else {

        warnings.push({
            code: "THIN_CONTENT",
            message:
                `Page contains only ${page.wordCount} words.`
        });

    }


    // =====================================================
    // IMAGES
    // =====================================================

    if (
        page.imagesWithoutAlt === 0
    ) {

        passed.push({
            code: "IMAGE_ALT_OK",
            message:
                "All images have alt text."
        });

    } else {

        issues.push({
            code: "IMAGE_ALT_MISSING",
            message:
                `${page.imagesWithoutAlt} images are missing alt text.`
        });

    }


    // =====================================================
    // PAGE SPEED
    // =====================================================

    if (
        page.responseTime > 5000
    ) {

        issues.push({
            code: "SLOW_PAGE",
            message:
                `Page response time is ${page.responseTime} ms.`
        });

    } else if (
        page.responseTime > 2000
    ) {

        warnings.push({
            code:
                "MODERATE_PAGE_SPEED",

            message:
                `Page response time is ${page.responseTime} ms.`
        });

    } else {

        passed.push({
            code:
                "PAGE_SPEED_OK",

            message:
                `Page response time is ${page.responseTime} ms.`
        });

    }


    // =====================================================
    // SCORE
    // =====================================================

    const totalChecks =
        issues.length +
        warnings.length +
        passed.length;


    let score = 100;


    if (totalChecks > 0) {

        score =
            Math.round(
                (
                    passed.length +
                    warnings.length * 0.5
                )
                /
                totalChecks
                *
                100
            );

    }


    // =====================================================
    // RESULT
    // =====================================================

    return {

        url: page.url,

        score,

        crawlFailed: false,

        pageStatus: "ok",

        statusCode:
            page.statusCode,

        issuesCount:
            issues.length,

        warningsCount:
            warnings.length,

        passedCount:
            passed.length,

        issues,

        warnings,

        passed

    };

};


// =====================================================
// MULTI PAGE ANALYZER
// =====================================================

const analyzeWebsite = (
    crawlResult
) => {

    if (
        !crawlResult ||
        !Array.isArray(
            crawlResult.pages
        )
    ) {

        return {

            success: false,

            error:
                "Invalid crawl result."

        };

    }


    // =====================================================
    // ANALYZE EACH PAGE
    // =====================================================

    const pageResults =
        crawlResult.pages.map(
            page =>
                analyzePage(page)
        );


    // =====================================================
    // AGGREGATE RESULTS
    // =====================================================

    const issues =
        pageResults.flatMap(
            page =>
                page.issues
        );


    const warnings =
        pageResults.flatMap(
            page =>
                page.warnings
        );


    const passed =
        pageResults.flatMap(
            page =>
                page.passed
        );


    // =====================================================
    // ONLY SUCCESSFULLY CRAWLED PAGES
    // ARE USED FOR SEO SCORE
    //
    // 404 is technically crawled successfully,
    // but is NOT included in SEO score.
    // =====================================================

    const successfulPages =
        pageResults.filter(
            page =>
                page.crawlFailed === false &&
                page.statusCode === 200
        );


    const scores =
        successfulPages

            .map(
                page =>
                    page.score
            )

            .filter(
                score =>
                    typeof score === "number"
            );


    const score =
        scores.length > 0

            ? Math.round(

                scores.reduce(
                    (
                        sum,
                        value
                    ) =>
                        sum + value,

                    0
                )
                /
                scores.length

            )

            : 0;


    // =====================================================
    // CRAWL SUMMARY
    // =====================================================

    const pagesCrawled =
        pageResults.filter(
            page =>
                page.crawlFailed === false
        ).length;


    const pagesFailed =
        pageResults.filter(
            page =>
                page.crawlFailed === true
        ).length;


    const pagesOk =
        pageResults.filter(
            page =>
                page.statusCode === 200
        ).length;


    const pagesNotFound =
        pageResults.filter(
            page =>
                page.statusCode === 404
        ).length;


    // =====================================================
    // FINAL RESULT
    // =====================================================

    return {

        success: true,

        score,

        pagesAnalyzed:
            pageResults.length,

        pagesCrawled,

        pagesFailed,

        pagesOk,

        pagesNotFound,

        issuesCount:
            issues.length,

        warningsCount:
            warnings.length,

        passedCount:
            passed.length,

        issues,

        warnings,

        passed,

        pageResults

    };

};


// =====================================================
// EXPORT
// =====================================================

module.exports = {

    analyzePage,

    analyzeWebsite

};