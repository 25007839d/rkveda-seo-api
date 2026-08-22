const db = require("../config/database");


// CREATE COMPETITOR
const createCompetitor = async (req, res) => {
    try {
        const user_id = req.user.userId;
        const project_id = req.params.projectId;

        const {
            competitor_domain,
            competitor_url
        } = req.body;

        // Validate required field
        if (!competitor_domain) {
            return res.status(400).json({
                success: false,
                message: "Competitor domain is required"
            });
        }

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
            `INSERT INTO competitors
             (
                project_id,
                competitor_domain,
                competitor_url
             )
             VALUES (?, ?, ?)`,
            [
                project_id,
                competitor_domain,
                competitor_url || null
            ]
        );

        res.status(201).json({
            success: true,
            message: "Competitor added successfully",
            competitor: {
                id: result.insertId,
                project_id,
                competitor_domain,
                competitor_url: competitor_url || null
            }
        });

    } catch (error) {
        console.error("Create competitor error:", error);

        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};


// GET ALL COMPETITORS FOR PROJECT
const getCompetitors = async (req, res) => {
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

        const [competitors] = await db.execute(
            `SELECT
                id,
                project_id,
                competitor_domain,
                competitor_url,
                created_at
             FROM competitors
             WHERE project_id = ?
             ORDER BY created_at DESC`,
            [project_id]
        );

        res.status(200).json({
            success: true,
            count: competitors.length,
            competitors
        });

    } catch (error) {
        console.error("Get competitors error:", error);

        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};


// GET SINGLE COMPETITOR
const getCompetitorById = async (req, res) => {
    try {
        const user_id = req.user.userId;
        const competitor_id = req.params.id;

        const [competitors] = await db.execute(
            `SELECT
                c.id,
                c.project_id,
                c.competitor_domain,
                c.competitor_url,
                c.created_at
             FROM competitors c
             INNER JOIN seo_projects p
                 ON c.project_id = p.id
             WHERE c.id = ?
               AND p.user_id = ?`,
            [competitor_id, user_id]
        );

        if (competitors.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Competitor not found"
            });
        }

        res.status(200).json({
            success: true,
            competitor: competitors[0]
        });

    } catch (error) {
        console.error("Get competitor error:", error);

        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};


// UPDATE COMPETITOR
const updateCompetitor = async (req, res) => {
    try {
        const user_id = req.user.userId;
        const competitor_id = req.params.id;

        const {
            competitor_domain,
            competitor_url
        } = req.body;

        if (!competitor_domain) {
            return res.status(400).json({
                success: false,
                message: "Competitor domain is required"
            });
        }

        const [result] = await db.execute(
            `UPDATE competitors c
             INNER JOIN seo_projects p
                 ON c.project_id = p.id
             SET
                c.competitor_domain = ?,
                c.competitor_url = ?
             WHERE c.id = ?
               AND p.user_id = ?`,
            [
                competitor_domain,
                competitor_url || null,
                competitor_id,
                user_id
            ]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Competitor not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Competitor updated successfully"
        });

    } catch (error) {
        console.error("Update competitor error:", error);

        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};


// DELETE COMPETITOR
const deleteCompetitor = async (req, res) => {
    try {
        const user_id = req.user.userId;
        const competitor_id = req.params.id;

        const [result] = await db.execute(
            `DELETE c
             FROM competitors c
             INNER JOIN seo_projects p
                 ON c.project_id = p.id
             WHERE c.id = ?
               AND p.user_id = ?`,
            [competitor_id, user_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Competitor not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Competitor deleted successfully"
        });

    } catch (error) {
        console.error("Delete competitor error:", error);

        res.status(500).json({
            success: false,
            message: "Competitor deleted successfully"
        });
    }
};


module.exports = {
    createCompetitor,
    getCompetitors,
    getCompetitorById,
    updateCompetitor,
    deleteCompetitor
};