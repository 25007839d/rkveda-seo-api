const db = require("../config/database");


// CREATE RANKING
const createRanking = async (req, res) => {
    try {
        const user_id = req.user.userId;
        const keyword_id = req.params.keywordId;

        const {
            ranking_position,
            ranking_url,
            search_volume
        } = req.body;

        // Verify keyword belongs to logged-in user's project
        const [keywords] = await db.execute(
            `SELECT k.id
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

        const [result] = await db.execute(
            `INSERT INTO keyword_rankings
            (
                keyword_id,
                ranking_position,
                ranking_url,
                search_volume
            )
            VALUES (?, ?, ?, ?)`,
            [
                keyword_id,
                ranking_position || null,
                ranking_url || null,
                search_volume || 0
            ]
        );

        res.status(201).json({
            success: true,
            message: "Ranking added successfully",
            ranking: {
                id: result.insertId,
                keyword_id,
                ranking_position: ranking_position || null,
                ranking_url: ranking_url || null,
                search_volume: search_volume || 0
            }
        });

    } catch (error) {
        console.error("Create ranking error:", error);

        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};


// GET ALL RANKINGS FOR KEYWORD
const getRankings = async (req, res) => {
    try {
        const user_id = req.user.userId;
        const keyword_id = req.params.keywordId;

        // Verify keyword ownership
        const [keywords] = await db.execute(
            `SELECT k.id
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

        const [rankings] = await db.execute(
            `SELECT
                id,
                keyword_id,
                ranking_position,
                ranking_url,
                search_volume,
                checked_at
             FROM keyword_rankings
             WHERE keyword_id = ?
             ORDER BY checked_at DESC`,
            [keyword_id]
        );

        res.status(200).json({
            success: true,
            count: rankings.length,
            rankings
        });

    } catch (error) {
        console.error("Get rankings error:", error);

        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};


// GET SINGLE RANKING
const getRankingById = async (req, res) => {
    try {
        const user_id = req.user.userId;
        const ranking_id = req.params.id;

        const [rankings] = await db.execute(
            `SELECT
                r.id,
                r.keyword_id,
                r.ranking_position,
                r.ranking_url,
                r.search_volume,
                r.checked_at
             FROM keyword_rankings r
             INNER JOIN keywords k
                 ON r.keyword_id = k.id
             INNER JOIN seo_projects p
                 ON k.project_id = p.id
             WHERE r.id = ?
               AND p.user_id = ?`,
            [ranking_id, user_id]
        );

        if (rankings.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Ranking not found"
            });
        }

        res.status(200).json({
            success: true,
            ranking: rankings[0]
        });

    } catch (error) {
        console.error("Get ranking error:", error);

        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};


// UPDATE RANKING
const updateRanking = async (req, res) => {
    try {
        const user_id = req.user.userId;
        const ranking_id = req.params.id;

        const {
            ranking_position,
            ranking_url,
            search_volume
        } = req.body;

        const [result] = await db.execute(
            `UPDATE keyword_rankings r
             INNER JOIN keywords k
                 ON r.keyword_id = k.id
             INNER JOIN seo_projects p
                 ON k.project_id = p.id
             SET
                r.ranking_position = ?,
                r.ranking_url = ?,
                r.search_volume = ?
             WHERE r.id = ?
               AND p.user_id = ?`,
            [
                ranking_position || null,
                ranking_url || null,
                search_volume || 0,
                ranking_id,
                user_id
            ]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Ranking not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Ranking updated successfully"
        });

    } catch (error) {
        console.error("Update ranking error:", error);

        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};


// DELETE RANKING
const deleteRanking = async (req, res) => {
    try {
        const user_id = req.user.userId;
        const ranking_id = req.params.id;

        const [result] = await db.execute(
            `DELETE r
             FROM keyword_rankings r
             INNER JOIN keywords k
                 ON r.keyword_id = k.id
             INNER JOIN seo_projects p
                 ON k.project_id = p.id
             WHERE r.id = ?
               AND p.user_id = ?`,
            [ranking_id, user_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Ranking not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Ranking deleted successfully"
        });

    } catch (error) {
        console.error("Delete ranking error:", error);

        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};


module.exports = {
    createRanking,
    getRankings,
    getRankingById,
    updateRanking,
    deleteRanking
};