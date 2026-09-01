const db = require("../config/database");


// CREATE BACKLINK
const createBacklink = async (req, res) => {
    try {
        const user_id = req.user.userId;
        const project_id = req.params.projectId;

        const {
            source_url,
            target_url,
            anchor_text,
            domain_authority,
            status,
            first_seen_at,
            last_seen_at
        } = req.body;

        // Validate required field
        if (!source_url) {
            return res.status(400).json({
                success: false,
                message: "Source URL is required"
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
            `INSERT INTO backlinks
            (
                project_id,
                source_url,
                target_url,
                anchor_text,
                domain_authority,
                status,
                first_seen_at,
                last_seen_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                project_id,
                source_url,
                target_url || null,
                anchor_text || null,
                domain_authority ?? null,
                status || "new",
                first_seen_at || null,
                last_seen_at || null
            ]
        );

        res.status(201).json({
            success: true,
            message: "Backlink added successfully",
            backlink: {
                id: result.insertId,
                project_id,
                source_url,
                target_url: target_url || null,
                anchor_text: anchor_text || null,
                domain_authority: domain_authority ?? null,
                status: status || "new"
            }
        });

    } catch (error) {
        console.error("Create backlink error:", error);

        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};


// GET ALL BACKLINKS FOR PROJECT
const getBacklinks = async (req, res) => {
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

        const [backlinks] = await db.execute(
            `SELECT
                id,
                project_id,
                source_url,
                target_url,
                anchor_text,
                domain_authority,
                status,
                first_seen_at,
                last_seen_at,
                created_at
             FROM backlinks
             WHERE project_id = ?
             ORDER BY created_at DESC`,
            [project_id]
        );

        res.status(200).json({
            success: true,
            count: backlinks.length,
            backlinks
        });

    } catch (error) {
        console.error("Get backlinks error:", error);

        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};


// GET SINGLE BACKLINK
const getBacklinkById = async (req, res) => {
    try {
        const user_id = req.user.userId;
        const backlink_id = req.params.id;

        const [backlinks] = await db.execute(
            `SELECT
                b.id,
                b.project_id,
                b.source_url,
                b.target_url,
                b.anchor_text,
                b.domain_authority,
                b.status,
                b.first_seen_at,
                b.last_seen_at,
                b.created_at
             FROM backlinks b
             INNER JOIN seo_projects p
                 ON b.project_id = p.id
             WHERE b.id = ?
               AND p.user_id = ?`,
            [backlink_id, user_id]
        );

        if (backlinks.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Backlink not found"
            });
        }

        res.status(200).json({
            success: true,
            backlink: backlinks[0]
        });

    } catch (error) {
        console.error("Get backlink error:", error);

        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};


// UPDATE BACKLINK
const updateBacklink = async (req, res) => {
    try {
        const user_id = req.user.userId;
        const backlink_id = req.params.id;

        const {
            source_url,
            target_url,
            anchor_text,
            domain_authority,
            status,
            first_seen_at,
            last_seen_at
        } = req.body;

        if (!source_url) {
            return res.status(400).json({
                success: false,
                message: "Source URL is required"
            });
        }

        const [result] = await db.execute(
            `UPDATE backlinks b
             INNER JOIN seo_projects p
                 ON b.project_id = p.id
             SET
                b.source_url = ?,
                b.target_url = ?,
                b.anchor_text = ?,
                b.domain_authority = ?,
                b.status = ?,
                b.first_seen_at = ?,
                b.last_seen_at = ?
             WHERE b.id = ?
               AND p.user_id = ?`,
            [
                source_url,
                target_url || null,
                anchor_text || null,
                domain_authority ?? null,
                status || "new",
                first_seen_at || null,
                last_seen_at || null,
                backlink_id,
                user_id
            ]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Backlink not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Backlink updated successfully"
        });

    } catch (error) {
        console.error("Update backlink error:", error);

        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};


// DELETE BACKLINK
const deleteBacklink = async (req, res) => {
    try {
        const user_id = req.user.userId;
        const backlink_id = req.params.id;

        const [result] = await db.execute(
            `DELETE b
             FROM backlinks b
             INNER JOIN seo_projects p
                 ON b.project_id = p.id
             WHERE b.id = ?
               AND p.user_id = ?`,
            [backlink_id, user_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: "Backlink not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Backlink deleted successfully"
        });

    } catch (error) {
        console.error("Delete backlink error:", error);

        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
};



const getBacklinkOpportunities = async (req, res) => {
    try {
        const user_id = req.user.userId;
        const project_id = req.params.projectId;
        const [projects] = await db.execute(`SELECT id FROM seo_projects WHERE id=? AND user_id=?`, [project_id,user_id]);
        if (!projects.length) return res.status(404).json({success:false,message:'Project not found'});
        const [rows] = await db.execute(`SELECT * FROM backlink_opportunities WHERE project_id=? ORDER BY FIELD(priority,'critical','high','medium','low'), created_at DESC`, [project_id]);
        res.json({success:true,count:rows.length,opportunities:rows});
    } catch(error){ console.error('Get backlink opportunities error:',error); res.status(500).json({success:false,message:'Unable to load backlink opportunities'}); }
};

module.exports = {
    createBacklink,
    getBacklinks,
    getBacklinkById,
    updateBacklink,
    deleteBacklink,
    getBacklinkOpportunities
};