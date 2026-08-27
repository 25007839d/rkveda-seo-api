const db = require("../config/database");


// =====================================================
// CREATE PROJECT
// =====================================================

const createProject = async (req, res) => {

    try {

        const userId =
            req.user.userId;

        const {
            website_url
        } = req.body;


        if (!website_url) {

            return res.status(400).json({

                success: false,

                message:
                    "Website URL is required"

            });

        }


        const [result] =
            await db.execute(
                `INSERT INTO seo_projects
                (
                    user_id,
                    website_url
                )
                VALUES (?, ?)`,
                [
                    userId,
                    website_url
                ]
            );


        return res.status(201).json({

            success: true,

            message:
                "Project created successfully",

            project: {

                id:
                    result.insertId,

                website_url

            }

        });


    } catch (error) {

        console.error(
            "Create project error:",
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
// GET ALL PROJECTS
// =====================================================

const getProjects = async (req, res) => {

    try {

        const userId =
            req.user.userId;


        const [projects] =
            await db.execute(
                `SELECT
                    id,
                    website_url,
                    created_at
                 FROM seo_projects
                 WHERE user_id = ?
                 ORDER BY created_at DESC`,
                [
                    userId
                ]
            );


        return res.status(200).json({

            success: true,

            projects

        });


    } catch (error) {

        console.error(
            "Get projects error:",
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
// GET SINGLE PROJECT
// =====================================================

const getProjectById = async (req, res) => {

    try {

        const userId =
            req.user.userId;

        const projectId =
            req.params.id;


        const [projects] =
            await db.execute(
                `SELECT
                    id,
                    website_url,
                    created_at
                 FROM seo_projects
                 WHERE id = ?
                   AND user_id = ?`,
                [
                    projectId,
                    userId
                ]
            );


        if (projects.length === 0) {

            return res.status(404).json({

                success: false,

                message:
                    "Project not found"

            });

        }


        return res.status(200).json({

            success: true,

            project:
                projects[0]

        });


    } catch (error) {

        console.error(
            "Get project error:",
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
// UPDATE PROJECT
// =====================================================

const updateProject = async (req, res) => {

    try {

        const userId =
            req.user.userId;

        const projectId =
            req.params.id;

        const {
            website_url
        } = req.body;


        if (!website_url) {

            return res.status(400).json({

                success: false,

                message:
                    "Website URL is required"

            });

        }


        const [result] =
            await db.execute(
                `UPDATE seo_projects
                 SET website_url = ?
                 WHERE id = ?
                   AND user_id = ?`,
                [
                    website_url,
                    projectId,
                    userId
                ]
            );


        if (
            result.affectedRows === 0
        ) {

            return res.status(404).json({

                success: false,

                message:
                    "Project not found"

            });

        }


        return res.status(200).json({

            success: true,

            message:
                "Project updated successfully"

        });


    } catch (error) {

        console.error(
            "Update project error:",
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
// DELETE PROJECT
// =====================================================

const deleteProject = async (req, res) => {

    try {

        const userId =
            req.user.userId;

        const projectId =
            req.params.id;


        const [result] =
            await db.execute(
                `DELETE FROM seo_projects
                 WHERE id = ?
                   AND user_id = ?`,
                [
                    projectId,
                    userId
                ]
            );


        if (
            result.affectedRows === 0
        ) {

            return res.status(404).json({

                success: false,

                message:
                    "Project not found"

            });

        }


        return res.status(200).json({

            success: true,

            message:
                "Project deleted successfully"

        });


    } catch (error) {

        console.error(
            "Delete project error:",
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
// PROJECT DASHBOARD
// =====================================================

const getProjectDashboard = async (
    req,
    res
) => {

    try {

        const userId =
            req.user.userId;

        const projectId =
            req.params.id;


        // -------------------------------------------------
        // 1. Get project
        // -------------------------------------------------

        const [projects] =
            await db.execute(
                `SELECT
                    id,
                    website_url,
                    created_at
                 FROM seo_projects
                 WHERE id = ?
                   AND user_id = ?`,
                [
                    projectId,
                    userId
                ]
            );


        if (projects.length === 0) {

            return res.status(404).json({

                success: false,

                message:
                    "Project not found"

            });

        }


        // -------------------------------------------------
        // 2. Get audit summary
        // -------------------------------------------------

        const [summary] =
            await db.execute(
                `SELECT

                    COUNT(*) AS total_audits,

                    SUM(
                        CASE
                            WHEN audit_status = 'completed'
                            THEN 1
                            ELSE 0
                        END
                    ) AS completed_audits,

                    SUM(
                        CASE
                            WHEN audit_status = 'pending'
                            THEN 1
                            ELSE 0
                        END
                    ) AS pending_audits,

                    SUM(
                        CASE
                            WHEN audit_status = 'running'
                            THEN 1
                            ELSE 0
                        END
                    ) AS running_audits,

                    SUM(
                        CASE
                            WHEN audit_status = 'failed'
                            THEN 1
                            ELSE 0
                        END
                    ) AS failed_audits

                 FROM seo_audits
                 WHERE project_id = ?`,
                [
                    projectId
                ]
            );


        // -------------------------------------------------
        // 3. Get latest audit
        // -------------------------------------------------

        const [audits] =
            await db.execute(
                `SELECT
                    id,
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
                 ORDER BY created_at DESC
                 LIMIT 1`,
                [
                    projectId
                ]
            );


        // -------------------------------------------------
        // 4. Response
        // -------------------------------------------------

        const auditSummary =
            summary[0];


        return res.status(200).json({

            success: true,

            dashboard: {

                project:
                    projects[0],

                latest_audit:
                    audits.length > 0
                        ? audits[0]
                        : null,

                summary: {

                    total_audits:
                        Number(
                            auditSummary.total_audits
                        ) || 0,

                    completed_audits:
                        Number(
                            auditSummary.completed_audits
                        ) || 0,

                    pending_audits:
                        Number(
                            auditSummary.pending_audits
                        ) || 0,

                    running_audits:
                        Number(
                            auditSummary.running_audits
                        ) || 0,

                    failed_audits:
                        Number(
                            auditSummary.failed_audits
                        ) || 0

                }

            }

        });


    } catch (error) {

        console.error(
            "Get project dashboard error:",
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

    createProject,

    getProjects,

    getProjectById,

    updateProject,

    deleteProject,

    getProjectDashboard

};