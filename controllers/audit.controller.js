const db = require("../config/database");

// =====================================================
// GITHUB ACTIONS CONFIG
// =====================================================

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;

const GITHUB_WORKFLOW =
    process.env.GITHUB_WORKFLOW || "seo-audit-worker.yml";

const GITHUB_REF =
    process.env.GITHUB_REF || "main";


// =====================================================
// JSON FIELD HELPER
// =====================================================

function parseJsonField(value, fallback = []) {

    if (value === null || value === undefined) {
        return fallback;
    }

    // MySQL JSON column can already be returned
    // as an Array/Object depending on mysql2 configuration.
    if (typeof value !== "string") {
        return value;
    }

    try {
        return JSON.parse(value);
    } catch (error) {

        console.error(
            "JSON parse error:",
            error
        );

        return fallback;
    }
}


// =====================================================
// DISPATCH SEO AUDIT WORKER
// =====================================================

const dispatchAuditWorker = async (auditId) => {

    if (!GITHUB_TOKEN) {
        throw new Error(
            "GITHUB_TOKEN is not configured"
        );
    }

    if (!GITHUB_OWNER) {
        throw new Error(
            "GITHUB_OWNER is not configured"
        );
    }

    if (!GITHUB_REPO) {
        throw new Error(
            "GITHUB_REPO is not configured"
        );
    }

    const url =
        `https://api.github.com/repos/` +
        `${GITHUB_OWNER}/` +
        `${GITHUB_REPO}/actions/workflows/` +
        `${GITHUB_WORKFLOW}/dispatches`;

    console.log(
        `Dispatching SEO worker for audit ${auditId}...`
    );

    const response = await fetch(url, {

        method: "POST",

        headers: {
            "Accept":
                "application/vnd.github+json",

            "Authorization":
                `Bearer ${GITHUB_TOKEN}`,

            "X-GitHub-Api-Version":
                "2022-11-28",

            "Content-Type":
                "application/json"
        },

        body: JSON.stringify({

            ref: GITHUB_REF,

            inputs: {
                audit_id:
                    String(auditId)
            }

        })
    });


    if (!response.ok) {

        const errorText =
            await response.text();

        throw new Error(
            `GitHub Actions dispatch failed: ` +
            `${response.status} ${errorText}`
        );
    }


    console.log(
        `SEO worker dispatched successfully for audit ${auditId}.`
    );


    return {
        success: true,
        audit_id: auditId
    };
};


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
        // 1. VERIFY PROJECT OWNERSHIP
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
        // 2. CREATE PENDING AUDIT
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
        // 3. DISPATCH GITHUB ACTIONS WORKER
        // ---------------------------------------------

        try {

            await dispatchAuditWorker(
                auditId
            );

        } catch (workerError) {

            console.error(
                `Failed to dispatch worker for audit ${auditId}:`,
                workerError
            );


            // -----------------------------------------
            // MARK AUDIT FAILED
            // -----------------------------------------

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


            return res.status(500).json({

                success: false,

                message:
                    "Audit created but SEO worker could not be started",

                audit: {

                    id:
                        auditId,

                    project_id:
                        project_id,

                    website_url:
                        project.website_url,

                    audit_status:
                        "failed"

                },

                error:
                    workerError.message

            });
        }


        // ---------------------------------------------
        // 4. RETURN QUEUED AUDIT
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

                score:
                    0,

                pages_crawled:
                    0,

                issues_count:
                    0,

                warnings_count:
                    0,

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
        // MARK AUDIT FAILED IF CREATED
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
        // VERIFY PROJECT OWNERSHIP
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


        // ---------------------------------------------
        // GET AUDITS
        // ---------------------------------------------

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


        console.log(
            "===================================="
        );

        console.log(
            "GET AUDIT"
        );

        console.log(
            "Audit ID:",
            audit_id
        );

        console.log(
            "User ID:",
            user_id
        );


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
                   AND p.user_id = ?
                 LIMIT 1`,

                [
                    audit_id,
                    user_id
                ]
            );


        // =====================================================
        // AUDIT NOT FOUND
        // =====================================================

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
                 WHERE audit_id = ?
                 LIMIT 1`,

                [
                    audit_id
                ]
            );


        // =====================================================
        // 3. DEFAULT DETAILS
        // =====================================================

        let issues = [];

        let warnings = [];

        let passed = [];

        let pageResults = [];

        let resultCreatedAt = null;

        let resultUpdatedAt = null;


        // =====================================================
        // 4. READ DETAILED RESULT
        // =====================================================

        if (results.length > 0) {

            const result =
                results[0];


            console.log(
                "Detailed result found for audit:",
                audit_id
            );


            // ---------------------------------------------
            // ISSUES
            // ---------------------------------------------

            issues =
                parseJsonField(
                    result.issues,
                    []
                );


            // ---------------------------------------------
            // WARNINGS
            // ---------------------------------------------

            warnings =
                parseJsonField(
                    result.warnings,
                    []
                );


            // ---------------------------------------------
            // PASSED
            // ---------------------------------------------

            passed =
                parseJsonField(
                    result.passed,
                    []
                );


            // ---------------------------------------------
            // PAGE RESULTS
            // ---------------------------------------------

            pageResults =
                parseJsonField(
                    result.page_results,
                    []
                );


            // ---------------------------------------------
            // RESULT DATES
            // ---------------------------------------------

            resultCreatedAt =
                result.created_at || null;

            resultUpdatedAt =
                result.updated_at || null;


        } else {

            console.log(
                "No detailed result found for audit:",
                audit_id
            );
        }


        // =====================================================
        // 5. SAFETY CHECK
        // =====================================================

        if (!Array.isArray(issues)) {
            issues = [];
        }

        if (!Array.isArray(warnings)) {
            warnings = [];
        }

        if (!Array.isArray(passed)) {
            passed = [];
        }

        if (!Array.isArray(pageResults)) {
            pageResults = [];
        }


        // =====================================================
        // 6. LOG COUNTS
        // =====================================================

        console.log(
            "Issues:",
            issues.length
        );

        console.log(
            "Warnings:",
            warnings.length
        );

        console.log(
            "Passed:",
            passed.length
        );

        console.log(
            "Page Results:",
            pageResults.length
        );


        // =====================================================
        // 7. FINAL RESPONSE
        // =====================================================

        return res.status(200).json({

            success: true,

            audit: {

                ...audit,

                issues:
                    issues,

                warnings:
                    warnings,

                passed:
                    passed,

                pageResults:
                    pageResults,

                result_created_at:
                    resultCreatedAt,

                result_updated_at:
                    resultUpdatedAt

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
                "Internal server error",

            error:
                error.message

        });
    }
};


// =====================================================
// WORKER - GET AUDIT
// =====================================================

const getAuditForWorker = async (req, res) => {

    try {

        const audit_id =
            req.params.id;


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
                 LIMIT 1`,

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


        return res.status(200).json({

            success: true,

            audit:
                audits[0]

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

const updateAuditStatus = async (req, res) => {

    try {

        const audit_id =
            req.params.id;


        const {
            audit_status,
            started_at

        } = req.body;


        // ---------------------------------------------
        // VALIDATE STATUS
        // ---------------------------------------------

        const allowedStatuses = [

            "pending",

            "running",

            "completed",

            "failed"

        ];


        if (
            !allowedStatuses.includes(
                audit_status
            )
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "Invalid audit status"

            });
        }


        // ---------------------------------------------
        // UPDATE AUDIT
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

                    started_at ||
                        new Date(),

                    audit_id

                ]
            );


        // ---------------------------------------------
        // AUDIT NOT FOUND
        // ---------------------------------------------

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
            error,

            // Support direct result payload also
            issues,
            warnings,
            passed,
            pageResults,
            page_results
        } = req.body;

        console.log("====================================");
        console.log("UPDATE AUDIT RESULT");
        console.log("Audit ID:", auditId);
        console.log("Body keys:", Object.keys(req.body || {}));
        console.log("====================================");

        // =====================================================
        // 1. UPDATE AUDIT SUMMARY
        // =====================================================

        const [updateResult] = await db.execute(
            `
            UPDATE seo_audits
            SET
                score = ?,
                pages_crawled = ?,
                issues_count = ?,
                warnings_count = ?,
                audit_status = ?,
                started_at = ?,
                completed_at = ?
            WHERE id = ?
            `,
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
        // AUDIT NOT FOUND
        // =====================================================

        if (updateResult.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Audit not found"
            });
        }

        // =====================================================
        // 2. NORMALIZE RESULT
        // =====================================================

        /*
         * Worker may send:
         *
         * {
         *   audit_result: {
         *      issues: [],
         *      warnings: [],
         *      passed: [],
         *      pageResults: []
         *   }
         * }
         *
         * OR directly:
         *
         * {
         *   issues: [],
         *   warnings: [],
         *   passed: [],
         *   pageResults: []
         * }
         */

        const result =
            audit_result &&
            typeof audit_result === "object"
                ? audit_result
                : {};

        const finalIssues =
            Array.isArray(result.issues)
                ? result.issues
                : Array.isArray(issues)
                    ? issues
                    : [];

        const finalWarnings =
            Array.isArray(result.warnings)
                ? result.warnings
                : Array.isArray(warnings)
                    ? warnings
                    : [];

        const finalPassed =
            Array.isArray(result.passed)
                ? result.passed
                : Array.isArray(passed)
                    ? passed
                    : [];

        const finalPageResults =
            Array.isArray(result.pageResults)
                ? result.pageResults
                : Array.isArray(pageResults)
                    ? pageResults
                    : Array.isArray(page_results)
                        ? page_results
                        : [];

        console.log("Result details:");
        console.log("Issues:", finalIssues.length);
        console.log("Warnings:", finalWarnings.length);
        console.log("Passed:", finalPassed.length);
        console.log("Page Results:", finalPageResults.length);

        // =====================================================
        // 3. SAVE DETAILED AUDIT RESULT
        // =====================================================

        await db.execute(
            `
            INSERT INTO seo_audit_results
            (
                audit_id,
                issues,
                warnings,
                passed,
                page_results
            )
            VALUES
            (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                issues = VALUES(issues),
                warnings = VALUES(warnings),
                passed = VALUES(passed),
                page_results = VALUES(page_results),
                updated_at = CURRENT_TIMESTAMP
            `,
            [
                auditId,

                JSON.stringify(finalIssues),

                JSON.stringify(finalWarnings),

                JSON.stringify(finalPassed),

                JSON.stringify(finalPageResults)
            ]
        );

        // =====================================================
        // 4. RESPONSE
        // =====================================================

        return res.status(200).json({
            success: true,

            message:
                "Audit result updated successfully",

            audit_id:
                auditId,

            audit_status:
                audit_status || "completed",

            issues_count:
                finalIssues.length,

            warnings_count:
                finalWarnings.length,

            passed_count:
                finalPassed.length,

            pages_count:
                finalPageResults.length
        });

    } catch (error) {

        console.error(
            "Update audit result error:",
            error
        );

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