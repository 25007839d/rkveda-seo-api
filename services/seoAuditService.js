const {
    runAudit
} = require("./seo/audit.service");


// =====================================================
// CONFIGURATION
// =====================================================

const API_BASE_URL =
    process.env.API_BASE_URL ||
    "https://api.rkveda.in";

const WORKER_TOKEN =
    process.env.WORKER_TOKEN;


// =====================================================
// VALIDATE CONFIGURATION
// =====================================================

if (!WORKER_TOKEN) {

    console.error(
        "ERROR: WORKER_TOKEN environment variable is required"
    );

}


// =====================================================
// API REQUEST HELPER
// =====================================================

const apiRequest = async (
    endpoint,
    options = {}
) => {

    if (!WORKER_TOKEN) {

        throw new Error(
            "WORKER_TOKEN environment variable is not configured"
        );

    }


    const url =
        `${API_BASE_URL}${endpoint}`;


    const headers = {

        "Content-Type":
            "application/json",

        ...(options.headers || {}),

        Authorization:
            `Bearer ${WORKER_TOKEN}`

    };


    console.log(
        `${options.method || "GET"} ${url}`
    );


    const response =
        await fetch(
            url,
            {
                ...options,
                headers
            }
        );


    const text =
        await response.text();


    let data;


    try {

        data =
            text
                ? JSON.parse(text)
                : {};

    } catch {

        data = {

            success: false,

            message: text

        };

    }


    if (!response.ok) {

        throw new Error(

            data.error ||

            data.message ||

            `API request failed: ${response.status}`

        );

    }


    return data;

};


// =====================================================
// GET AUDIT
// =====================================================

const getAudit = async (
    auditId
) => {

    console.log(
        `Getting audit ${auditId} from API...`
    );


    const result =
        await apiRequest(
            `/api/audits/${auditId}`,
            {
                method: "GET"
            }
        );


    if (
        !result.success ||
        !result.audit
    ) {

        throw new Error(
            `Audit ${auditId} not found`
        );

    }


    return result.audit;

};


// =====================================================
// MARK AUDIT RUNNING
// =====================================================

const markAuditRunning = async (
    auditId
) => {

    console.log(
        `Marking audit ${auditId} as running...`
    );


    return await apiRequest(
        `/api/audits/${auditId}/status`,
        {

            method: "PUT",

            body: JSON.stringify({

                audit_status:
                    "running",

                started_at:
                    new Date().toISOString()

            })

        }
    );

};


// =====================================================
// UPDATE AUDIT SUCCESS
// =====================================================

const updateAuditCompleted = async (
    auditId,
    result
) => {

    console.log(
        `Updating audit ${auditId} with results...`
    );


    return await apiRequest(
        `/api/audits/${auditId}/result`,
        {

            method: "PUT",

            body: JSON.stringify({

                score:
                    result.score || 0,

                pages_crawled:
                    result.pagesCrawled || 0,

                issues_count:
                    result.issuesCount || 0,

                warnings_count:
                    result.warningsCount || 0,

                audit_status:
                    "completed",

                started_at:
                    result.startedAt ||
                    new Date().toISOString(),

                completed_at:
                    result.completedAt ||
                    new Date().toISOString(),

                audit_result:
                    result

            })

        }
    );

};


// =====================================================
// UPDATE AUDIT FAILED
// =====================================================

const updateAuditFailed = async (
    auditId,
    error
) => {

    console.log(
        `Marking audit ${auditId} as failed...`
    );


    try {

        await apiRequest(
            `/api/audits/${auditId}/result`,
            {

                method: "PUT",

                body: JSON.stringify({

                    audit_status:
                        "failed",

                    completed_at:
                        new Date().toISOString(),

                    error:
                        error.message ||
                        String(error)

                })

            }
        );


        console.log(
            `Audit ${auditId} marked as failed`
        );


    } catch (updateError) {

        console.error(
            "Failed to update audit failure status:"
        );

        console.error(
            updateError
        );

    }

};


// =====================================================
// RUN SEO AUDIT
// =====================================================

const processAudit = async (
    auditId
) => {

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
        "API:",
        API_BASE_URL
    );

    console.log(
        "===================================="
    );


    try {

        // ---------------------------------------------
        // 1. Get audit from API
        // ---------------------------------------------

        const audit =
            await getAudit(
                auditId
            );


        console.log(
            "Website:",
            audit.website_url
        );


        // ---------------------------------------------
        // 2. Mark audit as running
        // ---------------------------------------------

        await markAuditRunning(
            auditId
        );


        // ---------------------------------------------
        // 3. Create project object
        // ---------------------------------------------

        const project = {

            id:
                audit.project_id,

            website_url:
                audit.website_url

        };


        // ---------------------------------------------
        // 4. Run crawler + analyzer
        // ---------------------------------------------

        console.log(
            "Starting SEO audit..."
        );


        const result =
            await runAudit(
                project,
                20
            );


        console.log(
            "Audit result:"
        );


        console.log(
            JSON.stringify(
                result,
                null,
                2
            )
        );


        // ---------------------------------------------
        // 5. Handle failed audit
        // ---------------------------------------------

        if (!result.success) {

            const auditError =
                new Error(
                    result.error ||
                    "SEO audit failed"
                );


            await updateAuditFailed(
                auditId,
                auditError
            );


            throw auditError;

        }


        // ---------------------------------------------
        // 6. Update successful audit
        // ---------------------------------------------

        await updateAuditCompleted(
            auditId,
            result
        );


        // ---------------------------------------------
        // 7. Success
        // ---------------------------------------------

        console.log(
            "===================================="
        );

        console.log(
            "SEO AUDIT COMPLETED"
        );

        console.log(
            "Audit ID:",
            auditId
        );

        console.log(
            "Score:",
            result.score
        );

        console.log(
            "Pages:",
            result.pagesCrawled
        );

        console.log(
            "Issues:",
            result.issuesCount
        );

        console.log(
            "Warnings:",
            result.warningsCount
        );

        console.log(
            "===================================="
        );


        return {

            success:
                true,

            auditId,

            score:
                result.score,

            pagesCrawled:
                result.pagesCrawled,

            issuesCount:
                result.issuesCount,

            warningsCount:
                result.warningsCount

        };


    } catch (error) {

        console.error(
            "SEO AUDIT WORKER ERROR:"
        );

        console.error(
            error
        );


        /*
         * If the failure happened after the audit
         * was already marked failed above, this will
         * safely attempt the update again.
         *
         * updateAuditFailed() itself catches API
         * update errors, so the original error remains
         * the main worker error.
         */

        await updateAuditFailed(
            auditId,
            error
        );


        throw error;

    }

};


// =====================================================
// EXPORT
// =====================================================

module.exports = {

    processAudit

};