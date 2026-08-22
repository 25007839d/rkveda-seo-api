const {
    crawlWebsite
} = require("./services/seo/crawler.service");


const test = async () => {

    console.log(
        "Starting multi-page crawl..."
    );


    const result =
        await crawlWebsite(
            "https://infinityaicloudacademy.com",
            2
        );


    console.log(
        JSON.stringify(
            result,
            null,
            2
        )
    );

};


test();