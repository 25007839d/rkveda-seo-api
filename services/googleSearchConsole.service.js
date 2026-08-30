const { google } = require("googleapis");
const db = require("../config/database");

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


/**
 * Save Google Search Console connection
 */
async function saveConnection({
    projectId,
    tokens,
    propertyUrl
}) {
    const tokenExpiry = tokens.expiry_date
        ? new Date(tokens.expiry_date)
        : null;

    const accessToken = tokens.access_token || null;
    const refreshToken = tokens.refresh_token || null;

    const sql = `
        INSERT INTO google_search_console_connections
        (
            project_id,
            access_token,
            refresh_token,
            token_expiry,
            property_url,
            status
        )
        VALUES (?, ?, ?, ?, ?, 'connected')
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

    await db.execute(sql, [
        projectId,
        accessToken,
        refreshToken,
        tokenExpiry,
        propertyUrl || null
    ]);

    return {
        projectId,
        propertyUrl,
        status: "connected"
    };
}


/**
 * Get saved GSC connection for project
 */
async function getConnection(projectId) {
    const [rows] = await db.execute(
        `
        SELECT
            id,
            project_id,
            google_email,
            google_account_id,
            property_url,
            status,
            token_expiry,
            created_at,
            updated_at
        FROM google_search_console_connections
        WHERE project_id = ?
        LIMIT 1
        `,
        [projectId]
    );

    return rows[0] || null;
}


module.exports = {
    getAuthorizationUrl,
    exchangeCode,
    listProperties,
    saveConnection,
    getConnection
};