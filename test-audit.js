const {
    runAudit
} = require("./services/seo/audit.service");


const test = async () => {

    console.log(
        "Starting multi-page SEO audit..."
    );


    const project = {

        id: 1,

        project_name:
            "Infinity AI Cloud Academy",

        website_url:
            "https://infinityaicloudacademy.com",

        domain:
            "infinityaicloudacademy.com"

    };


    const result =
        await runAudit(
            project,
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