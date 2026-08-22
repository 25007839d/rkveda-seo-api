const {
    crawlWebsite
} = require("./crawler.service");

const {
    analyzeWebsite
} = require("./analyzer.service");


const runAudit = async (
    project,
    maxPages = 2
) => {

    const startedAt = new Date();

    try {

        // ==========================================
        // 1. Validate project
        // ==========================================

        if (
            !project ||
            !project.website_url
        ) {

            return {

                success: false,

                auditStatus: "failed",

                startedAt,

                completedAt: new Date(),

                error:
                    "Project website URL is missing."

            };

        }


        // ==========================================
        // 2. Limit crawler pages
        // ==========================================

        const pageLimit =
            Math.min(
                Number(maxPages) || 2,
                2
            );


        // ==========================================
        // 3. Start crawler
        // ==========================================

        console.log(
            `Starting crawl: ${project.website_url}`
        );

        console.log(
            `Maximum pages allowed: ${pageLimit}`
        );


        const crawlResult =
            await crawlWebsite(
                project.website_url,
                pageLimit
            );


        // ==========================================
        // 4. Handle crawler failure
        // ==========================================

        if (
            !crawlResult ||
            !crawlResult.success
        ) {

            return {

                success: false,

                auditStatus: "failed",

                startedAt,

                completedAt: new Date(),

                error:
                    crawlResult?.error ||
                    "Website crawl failed."

            };

        }


        // ==========================================
        // 5. Analyze crawled pages
        // ==========================================

        console.log(
            `Analyzing ${crawlResult.pagesCrawled} pages...`
        );


        const analysis =
            analyzeWebsite(
                crawlResult
            );


        // ==========================================
        // 6. Calculate page statistics
        // ==========================================

        const pagesCrawled =
            crawlResult.pagesCrawled || 0;


        const pagesFailed =
            analysis.pagesFailed || 0;


        const pagesOk =
            analysis.pagesOk || 0;


        const pagesNotFound =
            analysis.pagesNotFound || 0;


        // ==========================================
        // 7. Return completed audit
        // ==========================================

        return {

            success: true,

            auditStatus: "completed",

            startedAt,

            completedAt: new Date(),

            // -------------------------------
            // Overall SEO score
            // -------------------------------

            score:
                analysis.score || 0,

            // -------------------------------
            // Page statistics
            // -------------------------------

            pagesCrawled,

            pagesAnalyzed:
                analysis.pagesAnalyzed || 0,

            pagesOk,

            pagesFailed,

            pagesNotFound,

            // -------------------------------
            // SEO statistics
            // -------------------------------

            issuesCount:
                analysis.issuesCount || 0,

            warningsCount:
                analysis.warningsCount || 0,

            passedCount:
                analysis.passedCount || 0,

            // -------------------------------
            // SEO findings
            // -------------------------------

            issues:
                analysis.issues || [],

            warnings:
                analysis.warnings || [],

            passed:
                analysis.passed || [],

            // -------------------------------
            // Page-level results
            // -------------------------------

            pageResults:
                analysis.pageResults || [],

            // -------------------------------
            // Crawl performance
            // -------------------------------

            crawlTime:
                crawlResult.crawlTime || 0

        };

    } catch (error) {

        console.error(
            "Audit failed:",
            error
        );


        return {

            success: false,

            auditStatus: "failed",

            startedAt,

            completedAt: new Date(),

            error:
                error.message

        };

    }

};


module.exports = {
    runAudit
};