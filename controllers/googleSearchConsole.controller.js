const crypto = require("crypto");

const {
    getAuthorizationUrl,
    exchangeCode,
    listProperties,
    saveConnection,
    getConnection
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
        const {
            code,
            state,
            error
        } = req.query;

        if (error) {
            return res.status(400).json({
                success: false,
                message: `Google authorization failed: ${error}`
            });
        }

        if (!code) {
            return res.status(400).json({
                success: false,
                message: "Authorization code missing"
            });
        }

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

        // Exchange authorization code for tokens
        const tokens = await exchangeCode(code);

        console.log("GSC TOKENS RECEIVED");

        // Get user's Search Console properties
        const properties = await listProperties(tokens);

        console.log("GSC PROPERTIES:", properties);

        /*
         * For now we automatically save the first available property.
         *
         * Later we will allow the frontend user to select
         * which GSC property belongs to the project.
         */
        const propertyUrl =
            properties.length > 0
                ? properties[0].siteUrl
                : null;

        // Save connection into database
        await saveConnection({
            projectId,
            tokens,
            propertyUrl
        });

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
    getStatus
};