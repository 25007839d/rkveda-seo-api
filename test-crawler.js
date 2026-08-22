const {
    crawlPage
} = require("./services/seo/crawler.service");

const test = async () => {

    const result = await crawlPage(
        "https://infinityaicloudacademy.com"
    );

    console.log(
        JSON.stringify(result, null, 2)
    );
};

test();