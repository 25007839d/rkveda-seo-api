const crypto = require("crypto");
const pool = require("../config/database");

const {
    getAuthorizationUrl,
    exchangeCode,
    listProperties,
    getConnection,
    getPerformanceData
} = require("../services/googleSearchConsole.service");

function normalizeHost(value) {
    if (!value) return "";

    let raw = String(value).trim().toLowerCase();

    if (raw.startsWith("sc-domain:")) {
        raw = raw.slice("sc-domain:".length);
    }

    try {
        if (!raw.includes("://")) raw = `https://${raw}`;
        const url = new URL(raw);
        return url.hostname.replace(/^www\./, "");
    } catch {
        return raw
            .replace(/^https?:\/\//, "")
            .split("/")[0]
            .split(":")[0]
            .replace(/^www\./, "");
    }
}

function propertyMatchesProject(propertyUrl, websiteUrl) {
    return normalizeHost(propertyUrl) !== "" &&
        normalizeHost(propertyUrl) === normalizeHost(websiteUrl);
}

async function getProjectWebsite(projectId) {
    const [rows] = await pool.execute(
        `SELECT id, website_url, domain FROM projects WHERE id = ? LIMIT 1`,
        [projectId]
    );

    return rows[0] || null;
}

function frontendRedirect(projectId, params = {}) {
    const base = process.env.FRONTEND_URL || "https://seo.rkveda.in";
    const url = new URL(`/projects/${projectId}/gsc`, base);

    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
            url.searchParams.set(key, String(value));
        }
    });

    return url.toString();
}

/** Start Google Search Console OAuth. */
async function connectGoogle(req, res) {
    try {
        const projectId = req.params.projectId;
        if (!projectId) {
            return res.status(400).json({ success: false, message: "Project ID is required" });
        }

        const project = await getProjectWebsite(projectId);
        if (!project) {
            return res.status(404).json({ success: false, message: "Project not found" });
        }

        const state = Buffer.from(JSON.stringify({
            projectId: String(projectId),
            nonce: crypto.randomBytes(16).toString("hex")
        })).toString("base64url");

        return res.json({
            success: true,
            authorizationUrl: getAuthorizationUrl(state)
        });
    } catch (error) {
        console.error("GSC CONNECT ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to create Google authorization URL",
            error: error.message
        });
    }
}

/** Google OAuth callback. */
async function callback(req, res) {
    let projectId = null;

    try {
        const { code, state, error } = req.query;

        if (state) {
            try {
                const stateData = JSON.parse(
                    Buffer.from(state, "base64url").toString("utf8")
                );
                projectId = stateData.projectId;
            } catch (stateError) {
                console.error("INVALID GSC STATE:", stateError);
            }
        }

        if (error) {
            if (projectId) {
                return res.redirect(frontendRedirect(projectId, {
                    gsc_error: `Google authorization failed: ${error}`
                }));
            }
            return res.status(400).json({
                success: false,
                message: `Google authorization failed: ${error}`
            });
        }

        if (!code) {
            return res.status(400).json({ success: false, message: "Authorization code missing" });
        }
        if (!state) {
            return res.status(400).json({ success: false, message: "OAuth state missing" });
        }
        if (!projectId) {
            return res.status(400).json({ success: false, message: "Project ID missing from OAuth state" });
        }

        const project = await getProjectWebsite(projectId);
        if (!project) {
            return res.status(404).json({ success: false, message: "Project not found" });
        }

        const tokens = await exchangeCode(code);
        const properties = await listProperties(tokens);

        // IMPORTANT: never attach the first Google property to the project.
        // Match the Google Search Console property to this project's website.
        const property = properties.find((item) =>
            propertyMatchesProject(item?.siteUrl, project.website_url || project.domain)
        );

        if (!property) {
            const available = properties.map((item) => item?.siteUrl).filter(Boolean);
            const message = `No Google Search Console property matches ${project.website_url}.`;

            console.error("GSC PROPERTY MISMATCH:", {
                projectId,
                website: project.website_url,
                available
            });

            return res.redirect(frontendRedirect(projectId, {
                gsc_error: message,
                gsc_available: available.join(", ")
            }));
        }

        const tokenExpiry = tokens.expiry_date ? new Date(tokens.expiry_date) : null;

        await pool.execute(
            `
            INSERT INTO google_search_console_connections
            (
                project_id,
                google_email,
                google_account_id,
                access_token,
                refresh_token,
                token_expiry,
                property_url,
                status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, 'connected')
            ON DUPLICATE KEY UPDATE
                access_token = VALUES(access_token),
                refresh_token = COALESCE(VALUES(refresh_token), refresh_token),
                token_expiry = VALUES(token_expiry),
                property_url = VALUES(property_url),
                status = 'connected',
                updated_at = CURRENT_TIMESTAMP
            `,
            [
                projectId,
                null,
                null,
                tokens.access_token,
                tokens.refresh_token || null,
                tokenExpiry,
                property.siteUrl
            ]
        );

        console.log("GSC connection saved", {
            projectId,
            website: project.website_url,
            property: property.siteUrl
        });

        // OAuth callback should return the user to the application, not a raw JSON page.
        return res.redirect(frontendRedirect(projectId, { gsc_connected: "1" }));
    } catch (error) {
        console.error("GSC CALLBACK ERROR:", error);

        if (projectId) {
            return res.redirect(frontendRedirect(projectId, {
                gsc_error: error.message || "Google Search Console connection failed"
            }));
        }

        return res.status(500).json({
            success: false,
            message: "Google Search Console connection failed",
            error: error.message
        });
    }
}

async function getStatus(req, res) {
    try {
        const projectId = req.params.projectId;
        if (!projectId) {
            return res.status(400).json({ success: false, message: "Project ID is required" });
        }

        const connection = await getConnection(projectId);
        if (!connection) {
            return res.json({ success: true, connected: false, connection: null });
        }

        return res.json({
            success: true,
            connected: connection.status === "connected",
            connection
        });
    } catch (error) {
        console.error("GSC STATUS ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to get GSC connection status",
            error: error.message
        });
    }
}

async function performance(req, res) {
    try {
        const projectId = req.params.projectId;
        if (!projectId) {
            return res.status(400).json({ success: false, message: "Project ID is required" });
        }

        const end = req.query.endDate ? new Date(`${req.query.endDate}T00:00:00Z`) : new Date();
        const start = req.query.startDate
            ? new Date(`${req.query.startDate}T00:00:00Z`)
            : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            return res.status(400).json({ success: false, message: "Invalid startDate or endDate" });
        }

        const formatDate = (date) => date.toISOString().slice(0, 10);
        const dimension = req.query.dimension || "date";

        if (!["date", "query", "page", "country", "device"].includes(dimension)) {
            return res.status(400).json({ success: false, message: "Unsupported GSC dimension" });
        }

        const result = await getPerformanceData(
            projectId,
            formatDate(start),
            formatDate(end),
            dimension
        );

        return res.json({ success: true, ...result });
    } catch (error) {
        console.error("GSC PERFORMANCE ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch Google Search Console performance data",
            error: error.message
        });
    }
}

module.exports = {
    connectGoogle,
    callback,
    getStatus,
    performance
};
