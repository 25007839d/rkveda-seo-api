const crypto = require("crypto");
const pool = require("../config/database");

const {
    getAuthorizationUrl,
    exchangeCode,
    listProperties,
    getConnection,
    getPerformanceData,
    saveConnection
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

async function getProjectWebsite(projectId, userId = null) {
    const [rows] = await pool.execute(
        userId
            ? `SELECT id, website_url, domain FROM seo_projects WHERE id = ? AND user_id = ? LIMIT 1`
            : `SELECT id, website_url, domain FROM seo_projects WHERE id = ? LIMIT 1`,
        userId ? [projectId, userId] : [projectId]
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

function createOAuthState(projectId, userId) {
    const payload = Buffer.from(JSON.stringify({
        projectId: String(projectId),
        userId: String(userId),
        nonce: crypto.randomBytes(16).toString("hex"),
        ts: Date.now()
    })).toString("base64url");

    const secret = process.env.JWT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
    const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
    return `${payload}.${signature}`;
}

function parseOAuthState(state) {
    const [payload, signature] = String(state || "").split(".");
    if (!payload || !signature) throw new Error("Invalid OAuth state");

    const secret = process.env.JWT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
    const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        throw new Error("Invalid OAuth state signature");
    }

    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data.projectId || !data.userId || !data.ts || Date.now() - Number(data.ts) > 10 * 60 * 1000) {
        throw new Error("OAuth state expired");
    }
    return data;
}

function normalizedWebsiteUrl(value) {
    if (!value) return "";
    let raw = String(value).trim().toLowerCase();
    if (!raw.includes("://")) raw = `https://${raw}`;
    try {
        const url = new URL(raw);
        return `${url.protocol}//${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/$/, "")}`;
    } catch {
        return raw.replace(/\/$/, "");
    }
}

function propertyMatchesProject(propertyUrl, project) {
    const property = String(propertyUrl || "").trim().toLowerCase();
    const website = normalizedWebsiteUrl(project?.website_url);
    const domain = normalizeHost(project?.domain || project?.website_url);

    // Prefer an exact URL-prefix property when one exists.
    if (!property.startsWith("sc-domain:")) {
        return normalizedWebsiteUrl(property) === website;
    }

    return normalizeHost(property) === domain;
}

/** Start Google Search Console OAuth. */
async function connectGoogle(req, res) {
    try {
        const projectId = req.params.projectId;
        if (!projectId) {
            return res.status(400).json({ success: false, message: "Project ID is required" });
        }

        const project = await getProjectWebsite(projectId, req.user?.userId);
        if (!project) {
            return res.status(404).json({ success: false, message: "Project not found" });
        }

        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Authenticated user is required" });
        }

        const state = createOAuthState(projectId, userId);

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
    let userId = null;

    try {
        const { code, state, error } = req.query;

        if (state) {
            try {
                const stateData = parseOAuthState(state);
                projectId = stateData.projectId;
                userId = stateData.userId;
            } catch (stateError) {
                console.error("INVALID GSC STATE:", stateError);
                return res.status(400).json({ success: false, message: stateError.message });
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
        if (!userId) {
            return res.status(400).json({ success: false, message: "User ID missing from OAuth state" });
        }

        const project = await getProjectWebsite(projectId, userId);
        if (!project) {
            return res.status(404).json({ success: false, message: "Project not found" });
        }

        const tokens = await exchangeCode(code);
        const properties = await listProperties(tokens);

        // IMPORTANT: never attach the first Google property to the project.
        // Match the Google Search Console property to this project's website.
        const property = properties.find((item) =>
            propertyMatchesProject(item?.siteUrl, project)
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

        await saveConnection({
            projectId,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token || null,
            tokenExpiry,
            propertyUrl: property.siteUrl,
        });

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

        const project = await getProjectWebsite(projectId, req.user?.userId);
        if (!project) {
            return res.status(404).json({ success: false, message: "Project not found" });
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

        const project = await getProjectWebsite(projectId, req.user?.userId);
        if (!project) {
            return res.status(404).json({ success: false, message: "Project not found" });
        }

        const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
        if ((req.query.startDate && !isIsoDate(req.query.startDate)) ||
            (req.query.endDate && !isIsoDate(req.query.endDate))) {
            return res.status(400).json({ success: false, message: "Dates must use YYYY-MM-DD format" });
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
        const allowedDimensions = ["date", "query", "page", "country", "device", "searchAppearance"];
        const allowedSearchTypes = ["web", "image", "video", "news", "discover", "googleNews"];

        if (!allowedDimensions.includes(dimension)) {
            return res.status(400).json({ success: false, message: "Unsupported GSC dimension" });
        }

        if (start > end) {
            return res.status(400).json({ success: false, message: "startDate must be before or equal to endDate" });
        }

        const searchType = req.query.searchType || "web";
        if (!allowedSearchTypes.includes(searchType)) {
            return res.status(400).json({ success: false, message: "Unsupported GSC search type" });
        }

        const connection = await getConnection(projectId);
        if (!connection || Number(connection.project_id) !== Number(projectId)) {
            return res.status(404).json({ success: false, message: "Google Search Console is not connected for this project" });
        }

        let filters = [];
        if (req.query.filters) {
            try {
                filters = JSON.parse(req.query.filters);
            } catch {
                return res.status(400).json({ success: false, message: "Invalid GSC filters JSON" });
            }
        }

        const simpleFilters = ["query", "page", "country", "device", "searchAppearance"];
        simpleFilters.forEach((filterDimension) => {
            const expression = req.query[filterDimension];
            if (expression) {
                filters.push({ dimension: filterDimension, operator: "contains", expression });
            }
        });

        const result = await getPerformanceData(
            projectId,
            formatDate(start),
            formatDate(end),
            dimension,
            {
                searchType,
                dataState: req.query.dataState === "all" ? "all" : "final",
                rowLimit: req.query.rowLimit,
                startRow: req.query.startRow,
                filters
            }
        );

        return res.json({ success: true, ...result });
    } catch (error) {
        console.error("GSC PERFORMANCE ERROR:", error);

        const googleStatus = Number(error?.response?.status || error?.code || 0);
        let statusCode = 500;
        let message = "Failed to fetch Google Search Console performance data";

        if (googleStatus === 400) {
            statusCode = 400;
            message = "Google Search Console rejected the performance request";
        } else if (googleStatus === 401) {
            statusCode = 401;
            message = "Google authorization expired. Please reconnect Search Console.";
        } else if (googleStatus === 403) {
            statusCode = 403;
            message = "This Google account does not have access to the connected Search Console property.";
        } else if (googleStatus === 429) {
            statusCode = 429;
            message = "Google Search Console rate limit reached. Please try again shortly.";
        }

        return res.status(statusCode).json({
            success: false,
            message,
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
