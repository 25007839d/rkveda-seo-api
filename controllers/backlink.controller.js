const db = require("../config/database");


// Ensure the additive v3 opportunity table exists. This makes the API resilient
// when the v3 SQL migration was not applied before backend deployment.
const ensureBacklinkOpportunitiesTable = async () => {
    await db.execute(`
        CREATE TABLE IF NOT EXISTS backlink_opportunities (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            project_id BIGINT UNSIGNED NOT NULL,
            referring_domain VARCHAR(255) NOT NULL,
            source_url VARCHAR(1000) NULL,
            target_url VARCHAR(1000) NULL,
            anchor_text VARCHAR(500) NULL,
            opportunity_type ENUM('competitor_link','lost_link','resource','guest_post','directory','other') DEFAULT 'competitor_link',
            priority ENUM('low','medium','high','critical') DEFAULT 'medium',
            status ENUM('open','contacted','won','rejected') DEFAULT 'open',
            authority DECIMAL(6,2) NULL,
            notes TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT fk_backlink_opp_project FOREIGN KEY (project_id) REFERENCES seo_projects(id) ON DELETE CASCADE,
            KEY idx_backlink_opp_project_status (project_id,status),
            KEY idx_backlink_opp_project_priority (project_id,priority)
        ) ENGINE=InnoDB
    `);
};


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
        await ensureBacklinkOpportunitiesTable();
        const user_id = req.user.userId;
        const project_id = req.params.projectId;
        const [projects] = await db.execute(`SELECT id FROM seo_projects WHERE id=? AND user_id=?`, [project_id,user_id]);
        if (!projects.length) return res.status(404).json({success:false,message:'Project not found'});
        const [rows] = await db.execute(`SELECT * FROM backlink_opportunities WHERE project_id=? ORDER BY FIELD(priority,'critical','high','medium','low'), created_at DESC`, [project_id]);

        // Generate unsaved opportunities from competitor backlink observations and
        // lost owned backlinks. These are suggestions only; they are not claimed
        // as independently discovered backlinks.
        const [competitorLinks] = await db.execute(`
            SELECT cb.source_url, cb.target_url, cb.anchor_text, cb.domain_authority,
                   c.competitor_domain
            FROM competitor_backlinks cb
            INNER JOIN competitors c ON c.id = cb.competitor_id
            WHERE c.project_id=?
        `, [project_id]);
        const [ownedLinks] = await db.execute(`SELECT source_url FROM backlinks WHERE project_id=?`, [project_id]);
        const ownHosts = new Set(ownedLinks.map(x => { try { return new URL(x.source_url).hostname.toLowerCase(); } catch { return String(x.source_url||'').toLowerCase(); } }));
        const savedHosts = new Set(rows.map(x => String(x.referring_domain||'').toLowerCase()));
        const generatedMap = new Map();
        for (const link of competitorLinks) {
            let host=''; try { host=new URL(link.source_url).hostname.toLowerCase(); } catch {}
            if (!host || ownHosts.has(host) || savedHosts.has(host)) continue;
            generatedMap.set(host, {
                id: null,
                referring_domain: host,
                source_url: link.source_url,
                target_url: null,
                anchor_text: link.anchor_text || null,
                opportunity_type: 'competitor_link',
                priority: Number(link.domain_authority||0) >= 70 ? 'high' : 'medium',
                status: 'open',
                authority: link.domain_authority == null ? null : Number(link.domain_authority),
                notes: `Observed on competitor ${link.competitor_domain}`
            });
        }
        const [lostLinks] = await db.execute(`SELECT source_url,target_url,anchor_text,domain_authority FROM backlinks WHERE project_id=? AND status='lost'`, [project_id]);
        for (const link of lostLinks) {
            let host=''; try { host=new URL(link.source_url).hostname.toLowerCase(); } catch {}
            if (!host || savedHosts.has(host) || generatedMap.has(host)) continue;
            generatedMap.set(host, {
                id: null,
                referring_domain: host,
                source_url: link.source_url,
                target_url: link.target_url || null,
                anchor_text: link.anchor_text || null,
                opportunity_type: 'lost_link',
                priority: Number(link.domain_authority||0) >= 70 ? 'high' : 'medium',
                status: 'open',
                authority: link.domain_authority == null ? null : Number(link.domain_authority),
                notes: 'Recovery candidate from a lost backlink'
            });
        }
        const opportunities=[...rows,...generatedMap.values()];
        res.json({success:true,count:opportunities.length,savedCount:rows.length,generatedCount:generatedMap.size,opportunities});
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