const {
    crawlWebsite
} = require("./services/seo/crawler.service");

const {
    analyzeWebsite
} = require("./services/seo/analyzer.service");


const test = async () => {

    const url =
        "https://infinityaicloudacademy.com";


    console.log("Starting crawler...");


    const crawlResult =
        await crawlWebsite(url, 2);


    if (!crawlResult.success) {

        console.error(
            "Crawler failed:",
            crawlResult.error
        );

        return;
    }


    console.log(
        `Crawler completed. Pages crawled: ${crawlResult.pages.length}`
    );


    console.log("Starting analyzer...");


    const analysis =
        analyzeWebsite(crawlResult);


    console.log("Analyzer completed.");


    console.log(
        JSON.stringify(
            analysis,
            null,
            2
        )
    );

};


test();