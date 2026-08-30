const { google } = require("googleapis");
const pool = require("../config/database");

const SCOPES = [
    "https://www.googleapis.com/auth/webmasters.readonly"
];


function createOAuthClient() {
    return new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );
}


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


async function exchangeCode(code) {

    const oauth2Client = createOAuthClient();

    const { tokens } = await oauth2Client.getToken(code);

    return tokens;
}


async function getSearchConsoleClient(tokens) {

    const oauth2Client = createOAuthClient();

    oauth2Client.setCredentials(tokens);

    return google.searchconsole({
        version: "v1",
        auth: oauth2Client
    });
}


async function listProperties(tokens) {

    const searchconsole = await getSearchConsoleClient(tokens);

    const response = await searchconsole.sites.list();

    return response.data.siteEntry || [];
}


/*
 * Get GSC connection from database
 */
async function getGSCConnection(projectId) {

    const [rows] = await pool.execute(
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


/*
 * Get actual GSC performance data
 */
async function getPerformanceData(
    projectId,
    startDate,
    endDate
) {

    const connection = await getGSCConnection(projectId);

    const tokens = {
        access_token: connection.access_token,
        refresh_token: connection.refresh_token
    };

    const searchconsole = await getSearchConsoleClient(tokens);

    const response =
        await searchconsole.searchanalytics.query({
            siteUrl: connection.property_url,

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

    const rows = response.data.rows || [];

    return {
        projectId,
        propertyUrl: connection.property_url,
        startDate,
        endDate,
        rows
    };
}


module.exports = {
    getAuthorizationUrl,
    exchangeCode,
    listProperties,
    getPerformanceData
};