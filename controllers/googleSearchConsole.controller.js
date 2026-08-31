const crypto = require("crypto");

const {

    getAuthorizationUrl,

    exchangeCode,

    listProperties,

    saveConnection,

    getConnection,

    getPerformanceData

} = require("../services/googleSearchConsole.service");


// ======================================================
// CONNECT GOOGLE
// ======================================================

async function connectGoogle(req, res) {

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


        const state =
            Buffer.from(

                JSON.stringify({

                    projectId,

                    nonce:
                        crypto
                            .randomBytes(16)
                            .toString("hex")

                })

            ).toString("base64url");


        const authUrl =
            getAuthorizationUrl(state);


        return res.json({

            success: true,

            authorizationUrl:
                authUrl

        });


    } catch (error) {

        console.error(
            "GSC CONNECT ERROR:",
            error
        );


        return res.status(500).json({

            success: false,

            message:
                "Failed to create Google authorization URL",

            error:
                error.message

        });
    }
}


// ======================================================
// GOOGLE OAUTH CALLBACK
// ======================================================

async function callback(req, res) {

    try {

        const {
            code,
            state,
            error
        } = req.query;


        // ==================================================
        // GOOGLE OAUTH ERROR
        // ==================================================

        if (error) {

            return res.status(400).json({

                success: false,

                message:
                    `Google authorization failed: ${error}`

            });

        }


        // ==================================================
        // CODE VALIDATION
        // ==================================================

        if (!code) {

            return res.status(400).json({

                success: false,

                message:
                    "Authorization code missing"

            });

        }


        // ==================================================
        // STATE VALIDATION
        // ==================================================

        if (!state) {

            return res.status(400).json({

                success: false,

                message:
                    "OAuth state missing"

            });

        }


        // ==================================================
        // DECODE STATE
        // ==================================================

        let stateData;

        try {

            stateData =
                JSON.parse(

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

                message:
                    "Invalid OAuth state"

            });

        }


        const projectId =
            stateData.projectId;


        if (!projectId) {

            return res.status(400).json({

                success: false,

                message:
                    "Project ID missing from OAuth state"

            });

        }


        // ==================================================
        // EXCHANGE GOOGLE CODE
        // ==================================================

        const tokens =
            await exchangeCode(code);


        console.log(
            "GSC TOKENS RECEIVED"
        );


        if (!tokens.access_token) {

            throw new Error(
                "Google access token was not returned"
            );

        }


        // ==================================================
        // GET GSC PROPERTIES
        // ==================================================

        const properties =
            await listProperties(tokens);


        console.log(
            "GSC PROPERTIES:",
            properties
        );


        // ==================================================
        // SELECT PROPERTY
        // ==================================================

        const property =
            properties.length > 0
                ? properties[0]
                : null;


        const propertyUrl =
            property
                ? property.siteUrl
                : null;


        // ==================================================
        // TOKEN EXPIRY
        // ==================================================

        let tokenExpiry = null;


        if (tokens.expiry_date) {

            tokenExpiry =
                new Date(
                    tokens.expiry_date
                );

        }


        // ==================================================
        // SAVE CONNECTION
        // ==================================================

        await saveConnection({

            projectId,

            googleEmail: null,

            googleAccountId: null,

            accessToken:
                tokens.access_token,

            refreshToken:
                tokens.refresh_token || null,

            tokenExpiry,

            propertyUrl

        });


        console.log(
            `GSC connection saved for project ${projectId}`
        );


        // ==================================================
        // REDIRECT FRONTEND
        // ==================================================

        const frontendUrl =
            process.env.FRONTEND_URL ||
            "http://localhost:5173";


        return res.redirect(

            `${frontendUrl}/projects/${projectId}/gsc?gsc=connected`

        );


    } catch (error) {

        console.error(
            "GSC CALLBACK ERROR:",
            error
        );


        // ==================================================
        // ERROR REDIRECT
        // ==================================================

        const frontendUrl =
            process.env.FRONTEND_URL ||
            "http://localhost:5173";


        const projectId =
            req.query.state
                ? (() => {

                    try {

                        const stateData =
                            JSON.parse(

                                Buffer.from(
                                    req.query.state,
                                    "base64url"
                                ).toString("utf8")

                            );

                        return stateData.projectId;

                    } catch {

                        return null;

                    }

                })()
                : null;


        if (projectId) {

            return res.redirect(

                `${frontendUrl}/projects/${projectId}/gsc?gsc=error`

            );

        }


        return res.status(500).json({

            success: false,

            message:
                "Google Search Console connection failed",

            error:
                error.message

        });

    }

}
// ======================================================
// GSC CONNECTION STATUS
// ======================================================

async function getStatus(req, res) {

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


        const connection =
            await getConnection(projectId);


        // ------------------------------------------------
        // NOT CONNECTED
        // ------------------------------------------------

        if (!connection) {

            return res.json({

                success: true,

                connected: false,

                connection: null

            });
        }


        // ------------------------------------------------
        // CONNECTED
        // ------------------------------------------------

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

            error:
                error.message

        });
    }
}


// ======================================================
// GSC PERFORMANCE
// ======================================================

async function performance(req, res) {

    try {

        const projectId =
            req.params.projectId;

        if (!projectId) {
            return res.status(400).json({
                success: false,
                message: "Project ID is required"
            });
        }

        // --------------------------------------------------
        // Date parameters
        // --------------------------------------------------

        const today = new Date();

        const defaultEndDate =
            today.toISOString().split("T")[0];

        const defaultStart =
            new Date();

        defaultStart.setDate(
            defaultStart.getDate() - 30
        );

        const defaultStartDate =
            defaultStart
                .toISOString()
                .split("T")[0];

        const startDate =
            req.query.startDate ||
            defaultStartDate;

        const endDate =
            req.query.endDate ||
            defaultEndDate;

        // --------------------------------------------------
        // Dimension
        // --------------------------------------------------

        let dimensions = ["date"];

        if (req.query.dimension) {

            dimensions =
                req.query.dimension
                    .split(",")
                    .map(
                        item => item.trim()
                    )
                    .filter(Boolean);
        }

        // --------------------------------------------------
        // Get performance
        // --------------------------------------------------

        const result =
            await getPerformanceData(
                projectId,
                startDate,
                endDate,
                dimensions
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

            error:
                error.message
        });
    }
}


// ======================================================
// EXPORT
// ======================================================

module.exports = {

    connectGoogle,

    callback,

    getStatus,

    performance

};