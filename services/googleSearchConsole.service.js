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
// GSC PERFORMANCE CACHE / HISTORY
// ======================================================

async function ensurePerformanceCacheTable() {
    await pool.execute(`
        CREATE TABLE IF NOT EXISTS google_search_console_daily_performance (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            project_id BIGINT UNSIGNED NOT NULL,
            property_url VARCHAR(500) NOT NULL,
            report_date DATE NOT NULL,
            clicks BIGINT UNSIGNED NOT NULL DEFAULT 0,
            impressions BIGINT UNSIGNED NOT NULL DEFAULT 0,
            ctr DECIMAL(12,8) NOT NULL DEFAULT 0,
            position DECIMAL(12,4) NOT NULL DEFAULT 0,
            synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_gsc_daily_project FOREIGN KEY (project_id)
                REFERENCES seo_projects(id) ON DELETE CASCADE,
            UNIQUE KEY uq_gsc_daily_project_date (project_id, report_date),
            KEY idx_gsc_daily_project_date (project_id, report_date)
        )
    `);
}

function summarizeRows(rows = []) {
    const clicks = rows.reduce((sum, row) => sum + Number(row.clicks || 0), 0);
    const impressions = rows.reduce((sum, row) => sum + Number(row.impressions || 0), 0);
    const weightedCtr = impressions > 0 ? clicks / impressions : 0;
    const positionWeight = rows.reduce((sum, row) => sum + Number(row.impressions || 0), 0);
    const position = positionWeight > 0
        ? rows.reduce((sum, row) => sum + Number(row.position || 0) * Number(row.impressions || 0), 0) / positionWeight
        : 0;

    return {
        clicks,
        impressions,
        ctr: weightedCtr,
        ctrPercent: weightedCtr * 100,
        position
    };
}

async function queryPerformance(connection, startDate, endDate, dimensions, dataState = "final", rowLimit = 25000) {
    const oauth2Client = createOAuthClient();
    oauth2Client.setCredentials({
        access_token: connection.access_token,
        refresh_token: connection.refresh_token || undefined,
        expiry_date: connection.token_expiry ? new Date(connection.token_expiry).getTime() : undefined
    });

    if (connection.refresh_token) {
        const expiry = connection.token_expiry ? new Date(connection.token_expiry).getTime() : 0;
        if (!expiry || expiry <= Date.now() + 60 * 1000) {
            const refreshed = await oauth2Client.getAccessToken();
            if (refreshed?.token) {
                const expiryDate = oauth2Client.credentials.expiry_date
                    ? new Date(oauth2Client.credentials.expiry_date)
                    : null;
                await pool.execute(
                    `UPDATE google_search_console_connections
                     SET access_token = ?, token_expiry = COALESCE(?, token_expiry), updated_at = CURRENT_TIMESTAMP
                     WHERE project_id = ?`,
                    [refreshed.token, expiryDate, connection.project_id]
                );
                connection.access_token = refreshed.token;
                connection.token_expiry = expiryDate;
            }
        }
    }

    const searchconsole = google.searchconsole({ version: "v1", auth: oauth2Client });
    const response = await searchconsole.searchanalytics.query({
        siteUrl: connection.property_url,
        requestBody: {
            startDate,
            endDate,
            dimensions,
            rowLimit,
            dataState
        }
    });

    return response.data.rows || [];
}

async function cacheDailyRows(projectId, propertyUrl, rows) {
    await ensurePerformanceCacheTable();
    if (!rows.length) return 0;

    let saved = 0;
    for (const row of rows) {
        const reportDate = row?.keys?.[0];
        if (!reportDate) continue;
        await pool.execute(`
            INSERT INTO google_search_console_daily_performance
                (project_id, property_url, report_date, clicks, impressions, ctr, position, synced_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON DUPLICATE KEY UPDATE
                property_url = VALUES(property_url),
                clicks = VALUES(clicks),
                impressions = VALUES(impressions),
                ctr = VALUES(ctr),
                position = VALUES(position),
                synced_at = CURRENT_TIMESTAMP
        `, [
            projectId,
            propertyUrl,
            reportDate,
            Math.max(0, Math.round(Number(row.clicks || 0))),
            Math.max(0, Math.round(Number(row.impressions || 0))),
            Number(row.ctr || 0),
            Number(row.position || 0)
        ]);
        saved += 1;
    }
    return saved;
}

async function getCachedDailyPerformance(projectId, startDate, endDate) {
    await ensurePerformanceCacheTable();
    const [rows] = await pool.execute(`
        SELECT report_date, clicks, impressions, ctr, position, synced_at
        FROM google_search_console_daily_performance
        WHERE project_id = ? AND report_date BETWEEN ? AND ?
        ORDER BY report_date ASC
    `, [projectId, startDate, endDate]);

    return rows.map(row => ({
        keys: [new Date(row.report_date).toISOString().slice(0, 10)],
        clicks: Number(row.clicks || 0),
        impressions: Number(row.impressions || 0),
        ctr: Number(row.ctr || 0),
        position: Number(row.position || 0),
        cached: true,
        syncedAt: row.synced_at
    }));
}

async function getLastHistorySync(projectId) {
    await ensurePerformanceCacheTable();
    const [rows] = await pool.execute(`
        SELECT MAX(synced_at) AS last_synced_at,
               COUNT(*) AS cached_days
        FROM google_search_console_daily_performance
        WHERE project_id = ?
    `, [projectId]);
    return rows[0] || { last_synced_at: null, cached_days: 0 };
}

async function syncPerformanceHistory(projectId, startDate, endDate, dataState = "final") {
    const connection = await getGSCConnection(projectId);
    const rows = await queryPerformance(connection, startDate, endDate, ["date"], dataState, 25000);
    const savedDays = await cacheDailyRows(projectId, connection.property_url, rows);
    const summary = summarizeRows(rows);

    return {
        projectId: Number(projectId),
        propertyUrl: connection.property_url,
        startDate,
        endDate,
        dataState,
        savedDays,
        rows,
        summary,
        lastSync: await getLastHistorySync(projectId)
    };
}

async function getPerformanceHistory(projectId, startDate, endDate) {
    const connection = await getGSCConnection(projectId);
    const rows = await getCachedDailyPerformance(projectId, startDate, endDate);
    return {
        projectId: Number(projectId),
        propertyUrl: connection.property_url,
        startDate,
        endDate,
        source: "cache",
        rows,
        summary: summarizeRows(rows),
        lastSync: await getLastHistorySync(projectId)
    };
}

// ======================================================
// GET GSC PERFORMANCE DATA
// ======================================================

async function getPerformanceData(
    projectId,
    startDate,
    endDate,
    dimension = "date",
    dataState = "final"
) {
    const connection = await getGSCConnection(projectId);

    if (!connection.property_url) {
        throw new Error("Google Search Console property is not configured");
    }

    if (!connection.refresh_token && !connection.access_token) {
        throw new Error("Google authentication tokens are missing");
    }

    const rows = await queryPerformance(
        connection,
        startDate,
        endDate,
        [dimension],
        dataState,
        25000
    );

    // Keep daily history automatically whenever the main performance endpoint is used.
    if (dimension === "date") {
        try {
            await cacheDailyRows(projectId, connection.property_url, rows);
        } catch (cacheError) {
            console.warn("GSC HISTORY CACHE WARNING:", cacheError.message);
        }
    }

    return {
        projectId: Number(projectId),
        propertyUrl: connection.property_url,
        startDate,
        endDate,
        dimension,
        dataState,
        rows,
        summary: summarizeRows(rows),
        lastSync: dimension === "date" ? await getLastHistorySync(projectId) : undefined
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