const db = require("../config/database");

const {
    runAudit
} = require("../services/seo/audit.service");


// =====================================================
// CREATE + RUN AUDIT
// =====================================================

const createAudit = async (req, res) => {

    let auditId = null;

    try {

        const user_id =
            req.user.userId;

        const project_id =
            req.params.projectId;


        // ---------------------------------------------
        // 1. Verify project ownership
        // ---------------------------------------------

        const [projects] =
            await db.execute(
                `SELECT
                    id,
                    website_url
                 FROM seo_projects
                 WHERE id = ?
                   AND user_id = ?`,
                [
                    project_id,
                    user_id
                ]
            );


        if (projects.length === 0) {

            return res.status(404).json({

                success: false,

                message:
                    "Project not found"

            });

        }


        const project =
            projects[0];


        // ---------------------------------------------
        // 2. Create pending audit
        // ---------------------------------------------

        const [result] =
            await db.execute(
                `INSERT INTO seo_audits
                (
                    project_id,
                    audit_status,
                    started_at
                )
                VALUES
                (
                    ?,
                    'pending',
                    ?
                )`,
                [
                    project_id,
                    new Date()
                ]
            );


        auditId =
            result.insertId;


        console.log(
            `Audit ${auditId} created.`
        );


        // ---------------------------------------------
        // 3. Run SEO audit
        // ---------------------------------------------

        console.log(
            `Starting audit ${auditId}...`
        );


        const auditResult =
            await runAudit(
                project,
                2
            );


        // ---------------------------------------------
        // 4. Handle audit failure
        // ---------------------------------------------

        if (
            !auditResult.success
        ) {

            await db.execute(
                `UPDATE seo_audits
                 SET
                    audit_status = 'failed',
                    started_at = ?,
                    completed_at = ?
                 WHERE id = ?`,
                [
                    auditResult.startedAt || new Date(),
                    auditResult.completedAt || new Date(),
                    auditId
                ]
            );


            return res.status(500).json({

                success: false,

                message:
                    "SEO audit failed",

                audit: {

                    id:
                        auditId,

                    project_id,

                    audit_status:
                        "failed",

                    error:
                        auditResult.error

                }

            });

        }


        // ---------------------------------------------
        // 5. Update audit summary
        // ---------------------------------------------

        await db.execute(
            `UPDATE seo_audits
             SET
                score = ?,
                pages_crawled = ?,
                issues_count = ?,
                warnings_count = ?,
                audit_status = ?,
                started_at = ?,
                completed_at = ?
             WHERE id = ?`,
            [
                auditResult.score ?? 0,

                auditResult.pagesCrawled ?? 0,

                auditResult.issuesCount ?? 0,

                auditResult.warningsCount ?? 0,

                auditResult.auditStatus || "completed",

                auditResult.startedAt || null,

                auditResult.completedAt || null,

                auditId
            ]
        );


        // ---------------------------------------------
        // 6. Return result
        // ---------------------------------------------

        console.log(
            `Audit ${auditId} completed.`
        );


        return res.status(201).json({

            success: true,

            message:
                "SEO audit completed successfully",

            audit: {

                id:
                    auditId,

                project_id,

                score:
                    auditResult.score,

                pages_crawled:
                    auditResult.pagesCrawled,

                issues_count:
                    auditResult.issuesCount,

                warnings_count:
                    auditResult.warningsCount,

                audit_status:
                    auditResult.auditStatus,

                started_at:
                    auditResult.startedAt,

                completed_at:
                    auditResult.completedAt

            },

            // Temporary API response.
            // We will optimize this later.
            result: auditResult

        });


    } catch (error) {

        console.error(
            "Create audit error:",
            error
        );


        // ---------------------------------------------
        // Mark audit failed if it was created
        // ---------------------------------------------

        if (auditId) {

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

            } catch (updateError) {

                console.error(
                    "Failed to update audit status:",
                    updateError
                );

            }

        }


        return res.status(500).json({

            success: false,

            message:
                "Internal server error",
            error: error.message

        });

    }

};


// =====================================================
// GET ALL AUDITS FOR PROJECT
// =====================================================

const getAudits = async (req, res) => {

    try {

        const user_id =
            req.user.userId;

        const project_id =
            req.params.projectId;


        // Verify project ownership

        const [projects] =
            await db.execute(
                `SELECT id
                 FROM seo_projects
                 WHERE id = ?
                   AND user_id = ?`,
                [
                    project_id,
                    user_id
                ]
            );


        if (projects.length === 0) {

            return res.status(404).json({

                success: false,

                message:
                    "Project not found"

            });

        }


        const [audits] =
            await db.execute(
                `SELECT
                    id,
                    project_id,
                    score,
                    pages_crawled,
                    issues_count,
                    warnings_count,
                    audit_status,
                    started_at,
                    completed_at,
                    created_at
                 FROM seo_audits
                 WHERE project_id = ?
                 ORDER BY created_at DESC`,
                [
                    project_id
                ]
            );


        return res.status(200).json({

            success: true,

            count:
                audits.length,

            audits

        });


    } catch (error) {

        console.error(
            "Get audits error:",
            error
        );


        return res.status(500).json({

            success: false,

            message:
                "Internal server error"

        });

    }

};


// =====================================================
// GET SINGLE AUDIT
// =====================================================

const getAuditById = async (req, res) => {

    try {

        const user_id =
            req.user.userId;

        const audit_id =
            req.params.id;


        const [audits] =
            await db.execute(
                `SELECT
                    a.id,
                    a.project_id,
                    a.score,
                    a.pages_crawled,
                    a.issues_count,
                    a.warnings_count,
                    a.audit_status,
                    a.started_at,
                    a.completed_at,
                    a.created_at
                 FROM seo_audits a
                 INNER JOIN seo_projects p
                     ON a.project_id = p.id
                 WHERE a.id = ?
                   AND p.user_id = ?`,
                [
                    audit_id,
                    user_id
                ]
            );


        if (audits.length === 0) {

            return res.status(404).json({

                success: false,

                message:
                    "Audit not found"

            });

        }


        return res.status(200).json({

            success: true,

            audit:
                audits[0]

        });


    } catch (error) {

        console.error(
            "Get audit error:",
            error
        );


        return res.status(500).json({

            success: false,

            message:
                "Internal server error"

        });

    }

};


// =====================================================
// UPDATE AUDIT
// =====================================================

const updateAudit = async (req, res) => {

    try {

        const user_id =
            req.user.userId;

        const audit_id =
            req.params.id;


        const {
            score,
            pages_crawled,
            issues_count,
            warnings_count,
            audit_status,
            started_at,
            completed_at
        } = req.body;


        const [result] =
            await db.execute(
                `UPDATE seo_audits a
                 INNER JOIN seo_projects p
                     ON a.project_id = p.id
                 SET
                    a.score = ?,
                    a.pages_crawled = ?,
                    a.issues_count = ?,
                    a.warnings_count = ?,
                    a.audit_status = ?,
                    a.started_at = ?,
                    a.completed_at = ?
                 WHERE a.id = ?
                   AND p.user_id = ?`,
                [
                    score ?? 0,

                    pages_crawled ?? 0,

                    issues_count ?? 0,

                    warnings_count ?? 0,

                    audit_status || "pending",

                    started_at || null,

                    completed_at || null,

                    audit_id,

                    user_id
                ]
            );


        if (
            result.affectedRows === 0
        ) {

            return res.status(404).json({

                success: false,

                message:
                    "Audit not found"

            });

        }


        return res.status(200).json({

            success: true,

            message:
                "Audit updated successfully"

        });


    } catch (error) {

        console.error(
            "Update audit error:",
            error
        );


        return res.status(500).json({

            success: false,

            message:
                "Internal server error"

        });

    }

};


// =====================================================
// DELETE AUDIT
// =====================================================

const deleteAudit = async (req, res) => {

    try {

        const user_id =
            req.user.userId;

        const audit_id =
            req.params.id;


        const [result] =
            await db.execute(
                `DELETE a
                 FROM seo_audits a
                 INNER JOIN seo_projects p
                     ON a.project_id = p.id
                 WHERE a.id = ?
                   AND p.user_id = ?`,
                [
                    audit_id,
                    user_id
                ]
            );


        if (
            result.affectedRows === 0
        ) {

            return res.status(404).json({

                success: false,

                message:
                    "Audit not found"

            });

        }


        return res.status(200).json({

            success: true,

            message:
                "Audit deleted successfully"

        });


    } catch (error) {

        console.error(
            "Delete audit error:",
            error
        );


        return res.status(500).json({

            success: false,

            message:
                "Internal server error"

        });

    }

};


module.exports = {

    createAudit,

    getAudits,

    getAuditById,

    updateAudit,

    deleteAudit

};