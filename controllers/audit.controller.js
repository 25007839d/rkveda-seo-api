const db = require("../config/database");


// =====================================================
// CREATE AUDIT
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
        // 3. Do NOT run Playwright here
        //
        // The actual SEO audit will be executed
        // by GitHub Actions.
        // ---------------------------------------------

        return res.status(201).json({

            success: true,

            message:
                "SEO audit queued successfully",

            audit: {

                id:
                    auditId,

                project_id:
                    project_id,

                website_url:
                    project.website_url,

                score: 0,

                pages_crawled: 0,

                issues_count: 0,

                warnings_count: 0,

                audit_status:
                    "pending"

            }

        });


    } catch (error) {

        console.error(
            "Create audit error:",
            error
        );


        // ---------------------------------------------
        // Mark audit failed if DB record was created
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

            error:
                error.message

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


        // ---------------------------------------------
        // Verify project ownership
        // ---------------------------------------------

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


        // =====================================================
        // 1. GET AUDIT SUMMARY
        // =====================================================

        const [audits] =
            await db.execute(
                `SELECT
                    a.id,
                    a.project_id,
                    p.website_url,
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


        const audit =
            audits[0];


        // =====================================================
        // 2. GET DETAILED AUDIT RESULT
        // =====================================================

        const [results] =
            await db.execute(
                `SELECT
                    issues,
                    warnings,
                    passed,
                    page_results,
                    created_at,
                    updated_at
                 FROM seo_audit_results
                 WHERE audit_id = ?`,
                [
                    audit_id
                ]
            );


        // =====================================================
        // 3. PARSE JSON STRINGS
        // =====================================================

        let details = {

            issues: [],

            warnings: [],

            passed: [],

            pageResults: []

        };


        if (results.length > 0) {

            const result =
                results[0];


            try {

                details.issues =
                    result.issues
                        ? JSON.parse(result.issues)
                        : [];

            } catch (error) {

                console.error(
                    "Failed to parse issues:",
                    error
                );

            }


            try {

                details.warnings =
                    result.warnings
                        ? JSON.parse(result.warnings)
                        : [];

            } catch (error) {

                console.error(
                    "Failed to parse warnings:",
                    error
                );

            }


            try {

                details.passed =
                    result.passed
                        ? JSON.parse(result.passed)
                        : [];

            } catch (error) {

                console.error(
                    "Failed to parse passed:",
                    error
                );

            }


            try {

                details.pageResults =
                    result.page_results
                        ? JSON.parse(result.page_results)
                        : [];

            } catch (error) {

                console.error(
                    "Failed to parse page_results:",
                    error
                );

            }


            details.created_at =
                result.created_at;

            details.updated_at =
                result.updated_at;

        }


        // =====================================================
        // 4. COMBINE SUMMARY + DETAILS
        // =====================================================

        return res.status(200).json({

            success: true,

            audit: {

                ...audit,

                issues:
                    details.issues,

                warnings:
                    details.warnings,

                passed:
                    details.passed,

                pageResults:
                    details.pageResults,

                result_created_at:
                    details.created_at || null,

                result_updated_at:
                    details.updated_at || null

            }

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
// WORKER - GET AUDIT
// =====================================================

const getAuditForWorker = async (req, res) => {

    try {

        const audit_id = req.params.id;


        // =====================================================
        // 1. GET AUDIT SUMMARY
        // =====================================================

        const [audits] =
            await db.execute(
                `SELECT
                    a.id,
                    a.project_id,
                    p.website_url,
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
                 WHERE a.id = ?`,
                [
                    audit_id
                ]
            );


        if (audits.length === 0) {

            return res.status(404).json({

                success: false,

                message:
                    "Audit not found"

            });

        }


        const audit = audits[0];


        // =====================================================
        // 2. GET DETAILED AUDIT RESULT
        // =====================================================

        const [results] =
            await db.execute(
                `SELECT
                    issues,
                    warnings,
                    passed,
                    page_results,
                    created_at AS result_created_at,
                    updated_at AS result_updated_at
                 FROM seo_audit_results
                 WHERE audit_id = ?`,
                [
                    audit_id
                ]
            );


        // =====================================================
        // 3. DEFAULT EMPTY RESULT
        // =====================================================

        let detailedResult = {

            issues: [],

            warnings: [],

            passed: [],

            pageResults: []

        };


        // =====================================================
        // 4. PARSE SAVED JSON
        // =====================================================

        if (results.length > 0) {

            const result = results[0];


            const parseJson = (value) => {

                if (!value) {
                    return [];
                }


                if (typeof value === "object") {
                    return value;
                }


                try {

                    return JSON.parse(value);

                } catch (error) {

                    console.error(
                        "JSON parse error:",
                        error
                    );

                    return [];

                }

            };


            detailedResult = {

                issues:
                    parseJson(result.issues),

                warnings:
                    parseJson(result.warnings),

                passed:
                    parseJson(result.passed),

                pageResults:
                    parseJson(result.page_results),

                result_created_at:
                    result.result_created_at,

                result_updated_at:
                    result.result_updated_at

            };

        }


        // =====================================================
        // 5. COMBINE SUMMARY + DETAILS
        // =====================================================

        return res.status(200).json({

            success: true,

            audit: {

                ...audit,

                issues:
                    detailedResult.issues,

                warnings:
                    detailedResult.warnings,

                passed:
                    detailedResult.passed,

                pageResults:
                    detailedResult.pageResults,

                result_created_at:
                    detailedResult.result_created_at || null,

                result_updated_at:
                    detailedResult.result_updated_at || null

            }

        });


    } catch (error) {

        console.error(
            "Get worker audit error:",
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

                    audit_status ||
                        "pending",

                    started_at ||
                        null,

                    completed_at ||
                        null,

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

// =====================================================
// WORKER - UPDATE AUDIT STATUS
// =====================================================

// =====================================================
// WORKER - UPDATE AUDIT STATUS
// =====================================================

const updateAuditStatus = async (req, res) => {

    try {

        const audit_id = req.params.id;

        const {
            audit_status,
            started_at
        } = req.body;


        // ---------------------------------------------
        // Validate status
        // ---------------------------------------------

        const allowedStatuses = [
            "pending",
            "running",
            "completed",
            "failed"
        ];


        if (!allowedStatuses.includes(audit_status)) {

            return res.status(400).json({

                success: false,

                message:
                    "Invalid audit status"

            });

        }


        // ---------------------------------------------
        // Update audit
        // ---------------------------------------------

        const [result] =
            await db.execute(
                `UPDATE seo_audits
                 SET
                    audit_status = ?,
                    started_at = ?
                 WHERE id = ?`,
                [
                    audit_status,
                    started_at || new Date(),
                    audit_id
                ]
            );


        // ---------------------------------------------
        // Audit not found
        // ---------------------------------------------

        if (result.affectedRows === 0) {

            return res.status(404).json({

                success: false,

                message:
                    "Audit not found"

            });

        }


        return res.status(200).json({

            success: true,

            message:
                "Audit status updated successfully",

            audit_id,

            audit_status

        });


    } catch (error) {

        console.error(
            "Update audit status error:",
            error
        );


        return res.status(500).json({

            success: false,

            message:
                "Failed to update audit status",

            error:
                error.message

        });

    }

};
// =====================================================
// WORKER - UPDATE AUDIT RESULT
// =====================================================

const updateAuditResult = async (req, res) => {

    try {

        const auditId = req.params.id;

        const {
            score,
            pages_crawled,
            issues_count,
            warnings_count,
            audit_status,
            started_at,
            completed_at,
            audit_result,
            error
        } = req.body;


        // =====================================================
        // 1. UPDATE AUDIT SUMMARY
        // =====================================================

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
                score ?? 0,
                pages_crawled ?? 0,
                issues_count ?? 0,
                warnings_count ?? 0,
                audit_status || "completed",
                started_at || null,
                completed_at || null,
                auditId
            ]
        );


        // =====================================================
        // 2. SAVE DETAILED AUDIT RESULT
        // =====================================================

        if (audit_result) {

            const issues =
                audit_result.issues || [];

            const warnings =
                audit_result.warnings || [];

            const passed =
                audit_result.passed || [];

            const pageResults =
                audit_result.pageResults || [];


            await db.execute(
                `INSERT INTO seo_audit_results
                (
                    audit_id,
                    issues,
                    warnings,
                    passed,
                    page_results
                )
                VALUES (?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    issues = VALUES(issues),
                    warnings = VALUES(warnings),
                    passed = VALUES(passed),
                    page_results = VALUES(page_results),
                    updated_at = CURRENT_TIMESTAMP`,
                [
                    auditId,

                    JSON.stringify(issues),

                    JSON.stringify(warnings),

                    JSON.stringify(passed),

                    JSON.stringify(pageResults)
                ]
            );

        }


        // =====================================================
        // 3. RESPONSE
        // =====================================================

        return res.status(200).json({

            success: true,

            message:
                "Audit result updated successfully",

            audit_id:
                auditId,

            audit_status:
                audit_status || "completed"

        });


    } catch (error) {

        console.error(
            "Update audit result error:",
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
// EXPORT
// =====================================================

module.exports = {
    createAudit,
    getAudits,
    getAuditById,
    updateAudit,
    deleteAudit,

    updateAuditStatus,
    updateAuditResult,

    getAuditForWorker
};