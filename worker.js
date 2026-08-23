const {
    processAudit
} = require("./services/seoAuditService");


const auditId =
    process.env.AUDIT_ID;


if (!auditId) {

    console.error(
        "AUDIT_ID environment variable is required"
    );

    process.exit(1);

}


console.log(
    "Starting SEO audit worker"
);

console.log(
    "Audit ID:",
    auditId
);


processAudit(auditId)
    .then((result) => {

        console.log(
            "Worker completed successfully"
        );

        console.log(
            JSON.stringify(
                result,
                null,
                2
            )
        );

        process.exit(0);

    })
    .catch((error) => {

        console.error(
            "Worker failed"
        );

        console.error(
            error
        );

        process.exit(1);

    });