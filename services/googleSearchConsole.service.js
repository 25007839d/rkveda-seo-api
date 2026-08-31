const { google } = require("googleapis");
const pool = require("../config/database");


// ======================================================
// GOOGLE SEARCH CONSOLE SCOPE
// ======================================================

const SCOPES = [
    "https://www.googleapis.com/auth/webmasters.readonly"
];


// ======================================================
// CREATE GOOGLE OAUTH CLIENT
// ======================================================

function createOAuthClient() {

    return new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );
}


// ======================================================
// GENERATE GOOGLE AUTHORIZATION URL
// ======================================================

function getAuthorizationUrl(state) {

    const oauth2Client = createOAuthClient();

    return oauth2Client.generateAuthUrl({

        access_type: "offline",

        scope: SCOPES,

        include_granted_scopes: true,

        prompt: "consent",

        state
    });
}


// ======================================================
// EXCHANGE AUTHORIZATION CODE FOR TOKENS
// ======================================================

async function exchangeCode(code) {

    const oauth2Client = createOAuthClient();

    const { tokens } =
        await oauth2Client.getToken(code);

    return tokens;
}


// ======================================================
// CREATE SEARCH CONSOLE CLIENT
// ======================================================

async function getSearchConsoleClient(tokens) {

    const oauth2Client = createOAuthClient();

    oauth2Client.setCredentials(tokens);

    return google.searchconsole({

        version: "v1",

        auth: oauth2Client

    });
}


// ======================================================
// LIST SEARCH CONSOLE PROPERTIES
// ======================================================

async function listProperties(tokens) {

    const searchconsole =
        await getSearchConsoleClient(tokens);

    const response =
        await searchconsole.sites.list();

    return response.data.siteEntry || [];
}


// ======================================================
// SAVE / UPDATE GSC CONNECTION
// ======================================================

async function saveConnection({

    projectId,

    googleEmail = null,

    googleAccountId = null,

    accessToken,

    refreshToken = null,

    tokenExpiry = null,

    propertyUrl = null

}) {

    if (!projectId) {

        throw new Error(
            "Project ID is required"
        );
    }

    if (!accessToken) {

        throw new Error(
            "Google access token is required"
        );
    }


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

            google_email =
                COALESCE(
                    VALUES(google_email),
                    google_email
                ),

            google_account_id =
                COALESCE(
                    VALUES(google_account_id),
                    google_account_id
                ),

            access_token =
                VALUES(access_token),

            refresh_token =
                COALESCE(
                    VALUES(refresh_token),
                    refresh_token
                ),

            token_expiry =
                VALUES(token_expiry),

            property_url =
                COALESCE(
                    VALUES(property_url),
                    property_url
                ),

            status =
                'connected',

            updated_at =
                CURRENT_TIMESTAMP
    `;


    const [result] =
        await pool.execute(
            sql,
            [
                projectId,
                googleEmail,
                googleAccountId,
                accessToken,
                refreshToken,
                tokenExpiry,
                propertyUrl
            ]
        );


    return result;
}


// ======================================================
// GET GSC CONNECTION
// ======================================================

async function getConnection(projectId) {

    if (!projectId) {

        throw new Error(
            "Project ID is required"
        );
    }


    const [rows] =
        await pool.execute(

            `
            SELECT

                id,

                project_id,

                google_email,

                google_account_id,

                token_expiry,

                property_url,

                status,

                created_at,

                updated_at

            FROM google_search_console_connections

            WHERE project_id = ?

            LIMIT 1
            `,

            [projectId]
        );


    return rows.length > 0
        ? rows[0]
        : null;
}


// ======================================================
// GET CONNECTION WITH TOKENS
// INTERNAL USE
// ======================================================

async function getGSCConnection(projectId) {

    if (!projectId) {

        throw new Error(
            "Project ID is required"
        );
    }


    const [rows] =
        await pool.execute(

            `
            SELECT

                id,

                project_id,

                property_url,

                access_token,

                refresh_token,

                token_expiry,

                status

            FROM google_search_console_connections

            WHERE project_id = ?

              AND status = 'connected'

            LIMIT 1
            `,

            [projectId]
        );


    if (rows.length === 0) {

        throw new Error(
            `Google Search Console is not connected for project ${projectId}`
        );
    }


    return rows[0];
}


// ======================================================
// GET GSC PERFORMANCE DATA
// ======================================================

async function getPerformanceData(
    projectId,
    startDate,
    endDate
) {

    const connection =
        await getGSCConnection(projectId);


    if (!connection.property_url) {

        throw new Error(
            "Google Search Console property is not configured"
        );
    }


    if (!connection.refresh_token &&
        !connection.access_token) {

        throw new Error(
            "Google authentication tokens are missing"
        );
    }


    const tokens = {

        access_token:
            connection.access_token,

        refresh_token:
            connection.refresh_token
    };


    const searchconsole =
        await getSearchConsoleClient(tokens);


    const response =
        await searchconsole.searchanalytics.query({

            siteUrl:
                connection.property_url,

            requestBody: {

                startDate,

                endDate,

                dimensions: [
                    "date"
                ],

                rowLimit: 25000,

                dataState: "final"
            }
        });


    const rows =
        response.data.rows || [];


    return {

        projectId,

        propertyUrl:
            connection.property_url,

        startDate,

        endDate,

        rows
    };
}


// ======================================================
// EXPORT
// ======================================================

module.exports = {

    getAuthorizationUrl,

    exchangeCode,

    listProperties,

    saveConnection,

    getConnection,

    getPerformanceData

};