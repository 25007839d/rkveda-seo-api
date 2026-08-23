const {
    processAudit
} = require("./services/seoAuditService");


// ---------------------------------------------
// Get Audit ID
// ---------------------------------------------

const auditId =
    process.env.AUDIT_ID ||
    process.argv[2];


if (!auditId) {

    console.error(
        "AUDIT_ID is required"
    );

    console.error(
        "Usage:"
    );

    console.error(
        "  AUDIT_ID=20 node worker.js"
    );

    console.error(
        "or"
    );

    console.error(
        "  node worker.js 20"
    );

    process.exit(1);

}


// ---------------------------------------------
// Start worker
// ---------------------------------------------

console.log(
    "===================================="
);

console.log(
    "SEO AUDIT WORKER STARTED"
);

console.log(
    "Audit ID:",
    auditId
);

console.log(
    "===================================="
);


// ---------------------------------------------
// Process audit
// ---------------------------------------------

processAudit(auditId)

    .then((result) => {

        console.log(
            "===================================="
        );

        console.log(
            "WORKER COMPLETED SUCCESSFULLY"
        );

        console.log(
            JSON.stringify(
                result,
                null,
                2
            )
        );

        console.log(
            "===================================="
        );

        process.exit(0);

    })

    .catch((error) => {

        console.error(
            "===================================="
        );

        console.error(
            "WORKER FAILED"
        );

        console.error(
            error
        );

        console.error(
            "===================================="
        );

        process.exit(1);

    });