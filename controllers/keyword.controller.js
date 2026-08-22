const db = require("../config/database");


// CREATE KEYWORD
const createKeyword = async (req, res) => {
    try {
        const user_id = req.user.userId;
        const project_id = req.params.projectId;

        const {
            keyword,
            search_engine,
            country,
            language,
            target_url
        } = req.body;

        if (!keyword) {
            return res.status(400).json({
                success: false,
                message: "keyword is required"
            });
        }

        // Verify that the project belongs to logged-in user
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
            `INSERT INTO keywords
            (
                project_id,
                keyword,
                search_engine,
                country,
                language,
                target_url
            )
            VALUES (?, ?, ?, ?, ?, ?)`,
            [
                project_id,
                keyword,
                search_engine || "google",
                country || "India",
                language || "en",
                target_url || null
            ]
        );

        res.status(201).json({
            success: true,
            message: "Keyword added successfully",
            keyword: {
                id: result.insertId,
                project_id,
                keyword,
                search_engine: search_engine || "google",
                country: country || "India",
                language: language || "en",
                target_url: target_url || null
            }
        });

    } catch (error) {
        console.error("Create keyword error:", error);

        // Duplicate keyword for same project
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                success: false,
                message: "Keyword already exists for this project"
            });
        }

        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};


// GET ALL KEYWORDS FOR PROJECT
const getKeywords = async (req, res) => {
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

        const [keywords] = await db.execute(
            `SELECT
                id,
                project_id,
                keyword,
                search_engine,
                country,
                language,
                target_url,
                created_at
             FROM keywords
             WHERE project_id = ?
             ORDER BY created_at DESC`,
            [project_id]
        );

        res.status(200).json({
            success: true,
            count: keywords.length,
            keywords
        });

    } catch (error) {
        console.error("Get keywords error:", error);

        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};


// GET SINGLE KEYWORD
const getKeywordById = async (req, res) => {
    try {
        const user_id = req.user.userId;
        const keyword_id = req.params.id;

        const [keywords] = await db.execute(
            `SELECT
                k.id,
                k.project_id,
                k.keyword,
                k.search_engine,
                k.country,
                k.language,
                k.target_url,
                k.created_at
             FROM keywords k
             INNER JOIN seo_projects p
                 ON k.project_id = p.id
             WHERE k.id = ?
               AND p.user_id = ?`,
            [keyword_id, user_id]
        );

        if (keywords.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Keyword not found"
            });
        }

        res.status(200).json({
            success: true,
            keyword: keywords[0]
        });

    } catch (error) {
        console.error("Get keyword error:", error);

        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};


// UPDATE KEYWORD
const updateKeyword = async (req, res) => {
    try {
        const user_id = req.user.userId;
        const keyword_id = req.params.id;

        const {
            keyword,
            search_engine,
            country,
            language,
            target_url
        } = req.body;

        const [result] = await db.execute(
            `UPDATE keywords k
             INNER JOIN seo_projects p
                 ON k.project_id = p.id
             SET
                k.keyword = ?,
                k.search_engine = ?,
                k.country = ?,
                k.language = ?,
                k.target_url = ?
             WHERE k.id = ?
               AND p.user_id = ?`,
            [
                keyword,
                search_engine,
                country,
                language,
                target_url || null,
                keyword_id,
                user_id
            ]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Keyword not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Keyword updated successfully"
        });

    } catch (error) {
        console.error("Update keyword error:", error);

        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                success: false,
                message: "Keyword already exists for this project"
            });
        }

        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};


// DELETE KEYWORD
const deleteKeyword = async (req, res) => {
    try {
        const user_id = req.user.userId;
        const keyword_id = req.params.id;

        const [result] = await db.execute(
            `DELETE k
             FROM keywords k
             INNER JOIN seo_projects p
                 ON k.project_id = p.id
             WHERE k.id = ?
               AND p.user_id = ?`,
            [keyword_id, user_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Keyword not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Keyword deleted successfully"
        });

    } catch (error) {
        console.error("Delete keyword error:", error);

        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};


module.exports = {
    createKeyword,
    getKeywords,
    getKeywordById,
    updateKeyword,
    deleteKeyword
};