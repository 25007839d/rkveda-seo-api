const crypto = require("crypto");

const {
    getAuthorizationUrl,
    exchangeCode,
    listProperties,
    saveConnection,
    getConnection,
    getPerformanceData
} = require("../services/googleSearchConsole.service");



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
            message: "Failed to create Google authorization URL"
        });
    }
}


async function callback(req, res) {
    try {
        const { code, state, error } = req.query;

        // Google returned an error
        if (error) {
            return res.status(400).json({
                success: false,
                message: `Google authorization failed: ${error}`
            });
        }

        // Authorization code missing
        if (!code) {
            return res.status(400).json({
                success: false,
                message: "Authorization code missing"
            });
        }

        // State missing
        if (!state) {
            return res.status(400).json({
                success: false,
                message: "OAuth state missing"
            });
        }

        // Decode state
        let stateData;

        try {
            stateData = JSON.parse(
                Buffer.from(state, "base64url").toString("utf8")
            );
        } catch (err) {
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

        // Exchange Google authorization code for tokens
        const tokens = await exchangeCode(code);

        console.log("GSC TOKENS RECEIVED");

        // Get Search Console properties
        const properties = await listProperties(tokens);

        console.log("GSC PROPERTIES:", properties);

        // Select first available property
        const property = properties.length > 0
            ? properties[0]
            : null;

        const propertyUrl = property
            ? property.siteUrl
            : null;

        // Google expiry_date is milliseconds
        let tokenExpiry = null;

        if (tokens.expiry_date) {
            tokenExpiry = new Date(tokens.expiry_date);
        }

        /*
         * Save / update GSC connection
         */
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

        await pool.execute(sql, [
            projectId,
            null,
            null,
            tokens.access_token,
            tokens.refresh_token || null,
            tokenExpiry,
            propertyUrl
        ]);

        console.log(
            `GSC connection saved for project ${projectId}`
        );

        return res.json({
            success: true,
            message: "Google Search Console connected successfully",
            projectId,
            propertyUrl,
            properties
        });

    } catch (error) {

        console.error("GSC CALLBACK ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Google Search Console connection failed",
            error: error.message
        });
    }
}

async function performance(req, res) {

    try {

        const projectId = req.params.projectId;

        /*
         * Default:
         * Last 30 days
         */
        const endDate = new Date();

        const startDate = new Date();

        startDate.setDate(
            startDate.getDate() - 30
        );

        const formatDate = (date) => {

            return date
                .toISOString()
                .split("T")[0];

        };

        const result = await getPerformanceData(
            projectId,
            formatDate(startDate),
            formatDate(endDate)
        );

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
 * Get GSC connection status
 */
async function getStatus(req, res) {
    try {
        const projectId = req.params.projectId;

        const connection = await getConnection(projectId);

        if (!connection) {
            return res.json({
                success: true,
                connected: false,
                connection: null
            });
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
            message: "Failed to get GSC connection status"
        });
    }
}


module.exports = {
    connectGoogle,
    callback,
    getStatus,
    performance
};