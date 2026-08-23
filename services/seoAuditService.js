const db = require("../config/database");

const {
    runAudit
} = require("./seo/audit.service");


// =====================================================
// RUN SEO AUDIT
// =====================================================

const processAudit = async (auditId) => {

    console.log("====================================");
    console.log("SEO AUDIT WORKER STARTED");
    console.log("Audit ID:", auditId);
    console.log("====================================");


    try {

        // ---------------------------------------------
        // 1. Get audit + project
        // ---------------------------------------------

        const [rows] = await db.execute(
            `SELECT
                a.id AS audit_id,
                a.project_id,
                p.website_url
             FROM seo_audits a
             INNER JOIN seo_projects p
                 ON a.project_id = p.id
             WHERE a.id = ?`,
            [auditId]
        );


        if (rows.length === 0) {

            throw new Error(
                `Audit ${auditId} not found`
            );

        }


        const audit = rows[0];


        console.log(
            "Website:",
            audit.website_url
        );


        // ---------------------------------------------
        // 2. Mark audit as running
        // ---------------------------------------------

        await db.execute(
            `UPDATE seo_audits
             SET
                audit_status = 'running',
                started_at = ?
             WHERE id = ?`,
            [
                new Date(),
                auditId
            ]
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
            "Audit result:",
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

            await db.execute(
                `UPDATE seo_audits
                 SET
                    audit_status = 'failed',
                    started_at = ?,
                    completed_at = ?
                 WHERE id = ?`,
                [
                    result.startedAt || new Date(),
                    result.completedAt || new Date(),
                    auditId
                ]
            );


            throw new Error(
                result.error ||
                "SEO audit failed"
            );

        }


        // ---------------------------------------------
        // 6. Update successful audit
        // ---------------------------------------------

        await db.execute(
            `UPDATE seo_audits
             SET
                score = ?,
                pages_crawled = ?,
                issues_count = ?,
                warnings_count = ?,
                audit_status = 'completed',
                started_at = ?,
                completed_at = ?
             WHERE id = ?`,
            [

                result.score || 0,

                result.pagesCrawled || 0,

                result.issuesCount || 0,

                result.warningsCount || 0,

                result.startedAt || new Date(),

                result.completedAt || new Date(),

                auditId

            ]
        );


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
            "====================================");


        return {

            success: true,

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


        // ---------------------------------------------
        // Mark audit failed
        // ---------------------------------------------

        try {

            await db.execute(
                `UPDATE seo_audits
                 SET
                    audit_status = 'failed',
                    completed_at = ?
                 WHERE id = ?`,
                [
                    new Date(),
                    auditId
                ]
            );

        } catch (dbError) {

            console.error(
                "Failed to update audit status:",
                dbError
            );

        }


        throw error;

    }

};


module.exports = {
    processAudit
};