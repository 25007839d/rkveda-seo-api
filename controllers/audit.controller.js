const db = require("../config/database");


// CREATE AUDIT
const createAudit = async (req, res) => {
    try {
        const user_id = req.user.userId;
        const project_id = req.params.projectId;

        // Verify project belongs to logged-in user
        const [projects] = await db.execute(
            `SELECT id
             FROM seo_projects
             WHERE id = ? AND user_id = ?`,
            [project_id, user_id]
        );

        if (projects.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Project not found"
            });
        }

        const [result] = await db.execute(
            `INSERT INTO seo_audits
             (project_id, audit_status)
             VALUES (?, 'pending')`,
            [project_id]
        );

        res.status(201).json({
            success: true,
            message: "SEO audit created successfully",
            audit: {
                id: result.insertId,
                project_id,
                score: 0,
                pages_crawled: 0,
                issues_count: 0,
                warnings_count: 0,
                audit_status: "pending"
            }
        });

    } catch (error) {
        console.error("Create audit error:", error);

        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};


// GET ALL AUDITS FOR PROJECT
const getAudits = async (req, res) => {
    try {
        const user_id = req.user.userId;
        const project_id = req.params.projectId;

        // Verify project ownership
        const [projects] = await db.execute(
            `SELECT id
             FROM seo_projects
             WHERE id = ? AND user_id = ?`,
            [project_id, user_id]
        );

        if (projects.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Project not found"
            });
        }

        const [audits] = await db.execute(
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
            [project_id]
        );

        res.status(200).json({
            success: true,
            count: audits.length,
            audits
        });

    } catch (error) {
        console.error("Get audits error:", error);

        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};


// GET SINGLE AUDIT
const getAuditById = async (req, res) => {
    try {
        const user_id = req.user.userId;
        const audit_id = req.params.id;

        const [audits] = await db.execute(
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
            [audit_id, user_id]
        );

        if (audits.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Audit not found"
            });
        }

        res.status(200).json({
            success: true,
            audit: audits[0]
        });

    } catch (error) {
        console.error("Get audit error:", error);

        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};


// UPDATE AUDIT
const updateAudit = async (req, res) => {
    try {
        const user_id = req.user.userId;
        const audit_id = req.params.id;

        const {
            score,
            pages_crawled,
            issues_count,
            warnings_count,
            audit_status,
            started_at,
            completed_at
        } = req.body;

        const [result] = await db.execute(
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

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Audit not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Audit updated successfully"
        });

    } catch (error) {
        console.error("Update audit error:", error);

        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};


// DELETE AUDIT
const deleteAudit = async (req, res) => {
    try {
        const user_id = req.user.userId;
        const audit_id = req.params.id;

        const [result] = await db.execute(
            `DELETE a
             FROM seo_audits a
             INNER JOIN seo_projects p
                 ON a.project_id = p.id
             WHERE a.id = ?
               AND p.user_id = ?`,
            [audit_id, user_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Audit not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Audit deleted successfully"
        });

    } catch (error) {
        console.error("Delete audit error:", error);

        res.status(500).json({
            success: false,
            message: "Internal server error"
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