const db = require("../config/database");


// CREATE PROJECT
const createProject = async (req, res) => {
    try {
        const { project_name, website_url, domain, status } = req.body;

        if (!project_name || !website_url || !domain) {
            return res.status(400).json({
                success: false,
                message: "project_name, website_url and domain are required"
            });
        }

        const user_id = req.user.userId;

        const [result] = await db.execute(
            `INSERT INTO seo_projects
            (user_id, project_name, website_url, domain, status)
            VALUES (?, ?, ?, ?, ?)`,
            [
                user_id,
                project_name,
                website_url,
                domain,
                status || "active"
            ]
        );

        res.status(201).json({
            success: true,
            message: "Project created successfully",
            project: {
                id: result.insertId,
                user_id,
                project_name,
                website_url,
                domain,
                status: status || "active"
            }
        });

    } catch (error) {
        console.error("Create project error:", error);

        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};


// GET ALL PROJECTS FOR LOGGED-IN USER
const getProjects = async (req, res) => {
    try {
        const user_id = req.user.userId;

        const [projects] = await db.execute(
            `SELECT
                id,
                project_name,
                website_url,
                domain,
                status,
                created_at,
                updated_at
             FROM seo_projects
             WHERE user_id = ?
             ORDER BY created_at DESC`,
            [user_id]
        );

        res.status(200).json({
            success: true,
            count: projects.length,
            projects
        });

    } catch (error) {
        console.error("Get projects error:", error);

        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};


// GET SINGLE PROJECT
const getProjectById = async (req, res) => {
    try {
        const user_id = req.user.userId;
        const project_id = req.params.id;

        const [projects] = await db.execute(
            `SELECT
                id,
                project_name,
                website_url,
                domain,
                status,
                created_at,
                updated_at
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

        res.status(200).json({
            success: true,
            project: projects[0]
        });

    } catch (error) {
        console.error("Get project error:", error);

        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};


// UPDATE PROJECT
const updateProject = async (req, res) => {
    try {
        const user_id = req.user.userId;
        const project_id = req.params.id;

        const {
            project_name,
            website_url,
            domain,
            status
        } = req.body;

        const [result] = await db.execute(
            `UPDATE seo_projects
             SET
                project_name = ?,
                website_url = ?,
                domain = ?,
                status = ?
             WHERE id = ? AND user_id = ?`,
            [
                project_name,
                website_url,
                domain,
                status,
                project_id,
                user_id
            ]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Project not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Project updated successfully"
        });

    } catch (error) {
        console.error("Update project error:", error);

        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};


// DELETE PROJECT
const deleteProject = async (req, res) => {
    try {
        const user_id = req.user.userId;
        const project_id = req.params.id;

        const [result] = await db.execute(
            `DELETE FROM seo_projects
             WHERE id = ? AND user_id = ?`,
            [project_id, user_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Project not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Project deleted successfully"
        });

    } catch (error) {
        console.error("Delete project error:", error);

        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};


module.exports = {
    createProject,
    getProjects,
    getProjectById,
    updateProject,
    deleteProject
};