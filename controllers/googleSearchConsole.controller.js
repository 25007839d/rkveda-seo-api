const crypto = require("crypto");

const pool = require("../config/database");

const {
    getAuthorizationUrl,
    exchangeCode,
    listProperties,
    getConnection,
    getPerformanceData
} = require("../services/googleSearchConsole.service");


// ======================================================
// MATCH PROJECT WEBSITE TO A SEARCH CONSOLE PROPERTY
// ======================================================
function normalizeHost(value) {
    if (!value) return null;

    const raw = String(value).trim();

    if (raw.toLowerCase().startsWith("sc-domain:")) {
        return raw
            .slice("sc-domain:".length)
            .replace(/^www\./i, "")
            .replace(/\/$/, "")
            .toLowerCase();
    }

    try {
        const url = new URL(
            /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
        );
        return url.hostname
            .replace(/^www\./i, "")
            .toLowerCase();
    } catch (err) {
        return raw
            .replace(/^https?:\/\//i, "")
            .replace(/^www\./i, "")
            .split("/")[0]
            .toLowerCase();
    }
}

function propertyMatchesProject(propertyUrl, project) {
    const propertyHost = normalizeHost(propertyUrl);
    const projectHost = normalizeHost(project?.website_url || project?.domain);
    return Boolean(propertyHost && projectHost && propertyHost === projectHost);
}


/**
 * Start Google Search Console OAuth
 *
 * GET:
 * /api/projects/:projectId/gsc/connect
 */
async function connectGoogle(req, res) {
    try {
        const projectId = req.params.projectId;

        if (!projectId) {
            return res.status(400).json({
                success: false,
                message: "Project ID is required"
            });
        }

        const state = Buffer.from(
            JSON.stringify({
                projectId,
                nonce: crypto.randomBytes(16).toString("hex")
            })
        ).toString("base64url");

        const authUrl = getAuthorizationUrl(state);

        return res.json({
            success: true,
            authorizationUrl: authUrl
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


/**
 * Google OAuth Callback
 *
 * GET:
 * /api/gsc/callback
 */
async function callback(req, res) {
    try {
        const {
            code,
            state,
            error
        } = req.query;


        // -----------------------------------------
        // Google returned an OAuth error
        // -----------------------------------------

        if (error) {
            return res.status(400).json({
                success: false,
                message: `Google authorization failed: ${error}`
            });
        }


        // -----------------------------------------
        // Authorization code validation
        // -----------------------------------------

        if (!code) {
            return res.status(400).json({
                success: false,
                message: "Authorization code missing"
            });
        }


        // -----------------------------------------
        // State validation
        // -----------------------------------------

        if (!state) {
            return res.status(400).json({
                success: false,
                message: "OAuth state missing"
            });
        }


        // -----------------------------------------
        // Decode OAuth state
        // -----------------------------------------

        let stateData;

        try {
            stateData = JSON.parse(
                Buffer.from(
                    state,
                    "base64url"
                ).toString("utf8")
            );

        } catch (err) {

            console.error(
                "INVALID GSC STATE:",
                err
            );

            return res.status(400).json({
                success: false,
                message: "Invalid OAuth state"
            });
        }


        const projectId = stateData.projectId;


        if (!projectId) {
            return res.status(400).json({
                success: false,
                message: "Project ID missing from OAuth state"
            });
        }


        // -----------------------------------------
        // Exchange authorization code for tokens
        // -----------------------------------------

        const tokens = await exchangeCode(code);

        console.log(
            "GSC TOKENS RECEIVED"
        );


        // -----------------------------------------
        // Get Search Console properties
        // -----------------------------------------
        const properties = await listProperties(
            tokens
        );

        console.log(
            "GSC PROPERTIES:",
            properties
        );

        // -----------------------------------------
        // Load the RKVeda project website
        // -----------------------------------------
        const [projectRows] = await pool.execute(
            `
            SELECT id, website_url, domain
            FROM seo_projects
            WHERE id = ?
            LIMIT 1
            `,
            [projectId]
        );

        const project = projectRows[0];

        if (!project) {
            return res.status(404).json({
                success: false,
                message: "SEO project not found"
            });
        }

        // -----------------------------------------
        // Select ONLY the Search Console property
        // that belongs to this RKVeda project.
        // Never use properties[0] because one Google
        // account can have multiple properties.
        // -----------------------------------------
        const matchingProperty = properties.find(
            (item) =>
                item?.siteUrl &&
                propertyMatchesProject(
                    item.siteUrl,
                    project
                )
        );

        if (!matchingProperty) {
            const availableProperties = properties
                .map((item) => item?.siteUrl)
                .filter(Boolean);

            return res.status(400).json({
                success: false,
                message:
                    `No matching Google Search Console property was found for ${project.website_url || project.domain}.`,
                projectId,
                websiteUrl: project.website_url,
                availableProperties
            });
        }

        const propertyUrl = matchingProperty.siteUrl;

        // -----------------------------------------
        // Token expiry
        // Google expiry_date is milliseconds
        // -----------------------------------------

        let tokenExpiry = null;

        if (tokens.expiry_date) {
            tokenExpiry = new Date(
                tokens.expiry_date
            );
        }


        // -----------------------------------------
        // Save / update connection
        // -----------------------------------------

        const sql = `
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

                refresh_token = COALESCE(
                    VALUES(refresh_token),
                    refresh_token
                ),

                token_expiry = VALUES(token_expiry),

                property_url = VALUES(property_url),

                status = 'connected',

                updated_at = CURRENT_TIMESTAMP
        `;


        await pool.execute(
            sql,
            [
                projectId,

                // We are not currently requesting
                // email/account-id from Google.
                null,
                null,

                tokens.access_token,

                tokens.refresh_token || null,

                tokenExpiry,

                propertyUrl
            ]
        );


        console.log(
            `GSC connection saved for project ${projectId}`
        );


        // -----------------------------------------
        // Success response
        // -----------------------------------------

        return res.json({
            success: true,

            message:
                "Google Search Console connected successfully",

            projectId,

            propertyUrl,

            properties
        });


    } catch (error) {

        console.error(
            "GSC CALLBACK ERROR:",
            error
        );

        return res.status(500).json({
            success: false,

            message:
                "Google Search Console connection failed",

            error: error.message
        });
    }
}


/**
 * Get GSC Connection Status
 *
 * GET:
 * /api/projects/:projectId/gsc/status
 */
async function getStatus(req, res) {

    try {

        const projectId =
            req.params.projectId;


        if (!projectId) {

            return res.status(400).json({
                success: false,
                message: "Project ID is required"
            });
        }


        const connection =
            await getConnection(projectId);


        // -----------------------------------------
        // No connection
        // -----------------------------------------

        if (!connection) {

            return res.json({

                success: true,

                connected: false,

                connection: null
            });
        }


        // -----------------------------------------
        // Connection exists
        // -----------------------------------------

        return res.json({

            success: true,

            connected:
                connection.status === "connected",

            connection
        });


    } catch (error) {

        console.error(
            "GSC STATUS ERROR:",
            error
        );


        return res.status(500).json({

            success: false,

            message:
                "Failed to get GSC connection status",

            error: error.message
        });
    }
}


/**
 * Get GSC Performance
 *
 * GET:
 * /api/projects/:projectId/gsc/performance
 */
async function performance(req, res) {

    try {

        const projectId =
            req.params.projectId;


        if (!projectId) {

            return res.status(400).json({

                success: false,

                message:
                    "Project ID is required"
            });
        }


        // -----------------------------------------
        // Last 30 days
        // -----------------------------------------

        const endDate =
            new Date();


        const startDate =
            new Date();


        startDate.setDate(
            startDate.getDate() - 30
        );


        // -----------------------------------------
        // Format date as YYYY-MM-DD
        // -----------------------------------------

        const formatDate = (date) => {

            return date
                .toISOString()
                .split("T")[0];
        };


        const formattedStartDate =
            formatDate(startDate);


        const formattedEndDate =
            formatDate(endDate);


        console.log(
            "GSC PERFORMANCE REQUEST:",
            {
                projectId,
                startDate: formattedStartDate,
                endDate: formattedEndDate
            }
        );


        // -----------------------------------------
        // Get performance data
        // -----------------------------------------

        const result =
            await getPerformanceData(
                projectId,
                formattedStartDate,
                formattedEndDate
            );


        // -----------------------------------------
        // Success
        // -----------------------------------------

        return res.json({

            success: true,

            ...result
        });


    } catch (error) {

        console.error(
            "GSC PERFORMANCE ERROR:",
            error
        );


        return res.status(500).json({

            success: false,

            message:
                "Failed to fetch Google Search Console performance data",

            error: error.message
        });
    }
}


/**
 * Routes exported
 */
module.exports = {

    connectGoogle,

    callback,

    getStatus,

    performance
};