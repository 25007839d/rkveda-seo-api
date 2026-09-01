const { google } = require("googleapis");
const pool = require("../config/database");

const SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"];
const ALLOWED_DIMENSIONS = new Set([
    "date",
    "query",
    "page",
    "country",
    "device",
    "searchAppearance"
]);
const ALLOWED_SEARCH_TYPES = new Set([
    "web",
    "image",
    "video",
    "news",
    "discover",
    "googleNews"
]);
const ALLOWED_OPERATORS = new Set([
    "equals",
    "notEquals",
    "contains",
    "notContains",
    "includingRegex",
    "excludingRegex"
]);

function createOAuthClient() {
    return new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );
}

function getAuthorizationUrl(state) {
    return createOAuthClient().generateAuthUrl({
        access_type: "offline",
        scope: SCOPES,
        include_granted_scopes: true,
        prompt: "consent",
        state
    });
}

async function exchangeCode(code) {
    const { tokens } = await createOAuthClient().getToken(code);
    return tokens;
}

async function getSearchConsoleClient(tokens) {
    const oauth2Client = createOAuthClient();
    oauth2Client.setCredentials(tokens);
    return google.searchconsole({ version: "v1", auth: oauth2Client });
}

async function listProperties(tokens) {
    const searchconsole = await getSearchConsoleClient(tokens);
    const response = await searchconsole.sites.list();
    return response.data.siteEntry || [];
}

async function saveConnection({
    projectId,
    googleEmail = null,
    googleAccountId = null,
    accessToken,
    refreshToken = null,
    tokenExpiry = null,
    propertyUrl = null
}) {
    if (!projectId) throw new Error("Project ID is required");
    if (!accessToken) throw new Error("Google access token is required");

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
            google_email = COALESCE(VALUES(google_email), google_email),
            google_account_id = COALESCE(VALUES(google_account_id), google_account_id),
            access_token = VALUES(access_token),
            refresh_token = COALESCE(VALUES(refresh_token), refresh_token),
            token_expiry = VALUES(token_expiry),
            property_url = COALESCE(VALUES(property_url), property_url),
            status = 'connected',
            updated_at = CURRENT_TIMESTAMP
    `;

    const [result] = await pool.execute(sql, [
        projectId,
        googleEmail,
        googleAccountId,
        accessToken,
        refreshToken,
        tokenExpiry,
        propertyUrl
    ]);

    return result;
}

async function getConnection(projectId) {
    if (!projectId) throw new Error("Project ID is required");

    const [rows] = await pool.execute(
        `SELECT
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
         LIMIT 1`,
        [projectId]
    );

    return rows[0] || null;
}

async function getGSCConnection(projectId) {
    if (!projectId) throw new Error("Project ID is required");

    const [rows] = await pool.execute(
        `SELECT
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
         LIMIT 1`,
        [projectId]
    );

    if (!rows.length) {
        throw new Error(`Google Search Console is not connected for project ${projectId}`);
    }

    return rows[0];
}

function normalizeFilters(filters = []) {
    if (!Array.isArray(filters)) return [];

    return filters
        .filter((filter) => filter && ALLOWED_DIMENSIONS.has(filter.dimension))
        .map((filter) => ({
            dimension: filter.dimension,
            operator: ALLOWED_OPERATORS.has(filter.operator) ? filter.operator : "equals",
            expression: String(filter.expression || "").trim()
        }))
        .filter((filter) => filter.expression.length > 0);
}

function buildRequestBody({
    startDate,
    endDate,
    dimension,
    searchType,
    dataState,
    rowLimit,
    startRow,
    filters
}) {
    const body = {
        startDate,
        endDate,
        rowLimit,
        startRow,
        type: searchType,
        dataState
    };

    if (dimension) {
        body.dimensions = [dimension];
    }

    const normalized = normalizeFilters(filters);
    if (normalized.length) {
        body.dimensionFilterGroups = [{
            groupType: "and",
            filters: normalized
        }];
    }

    return body;
}

function summarizeRows(rows) {
    let clicks = 0;
    let impressions = 0;
    let positionWeightedSum = 0;

    for (const row of rows || []) {
        const rowClicks = Number(row.clicks || 0);
        const rowImpressions = Number(row.impressions || 0);
        const rowPosition = Number(row.position || 0);
        clicks += rowClicks;
        impressions += rowImpressions;
        positionWeightedSum += rowPosition * rowImpressions;
    }

    return {
        clicks,
        impressions,
        ctr: impressions > 0 ? clicks / impressions : 0,
        ctrPercent: impressions > 0 ? (clicks / impressions) * 100 : 0,
        position: impressions > 0 ? positionWeightedSum / impressions : 0
    };
}

/**
 * Fetch Search Console performance for one project/property.
 * A separate aggregate query is used for the KPI summary so the cards
 * remain correct regardless of the selected breakdown dimension.
 */
async function getPerformanceData(
    projectId,
    startDate,
    endDate,
    dimension = "date",
    options = {}
) {
    const connection = await getGSCConnection(projectId);

    if (!connection.property_url) {
        throw new Error("Google Search Console property is not configured");
    }

    const searchType = ALLOWED_SEARCH_TYPES.has(options.searchType)
        ? options.searchType
        : "web";
    const dataState = options.dataState === "all" ? "all" : "final";
    const safeDimension = ALLOWED_DIMENSIONS.has(dimension) ? dimension : "date";
    const rowLimit = Math.min(Math.max(Number(options.rowLimit) || 1000, 1), 25000);
    const startRow = Math.max(Number(options.startRow) || 0, 0);
    const filters = normalizeFilters(options.filters);

    const oauth2Client = createOAuthClient();
    oauth2Client.setCredentials({
        access_token: connection.access_token,
        refresh_token: connection.refresh_token || undefined
    });

    // Refresh an expired/near-expiry access token when a refresh token exists.
    if (connection.refresh_token) {
        const expiry = connection.token_expiry
            ? new Date(connection.token_expiry).getTime()
            : 0;

        if (!expiry || expiry <= Date.now() + 60 * 1000) {
            const refreshed = await oauth2Client.getAccessToken();
            if (refreshed?.token) {
                await pool.execute(
                    `UPDATE google_search_console_connections
                     SET access_token = ?,
                         token_expiry = COALESCE(?, token_expiry),
                         updated_at = CURRENT_TIMESTAMP
                     WHERE project_id = ?`,
                    [
                        refreshed.token,
                        oauth2Client.credentials.expiry_date
                            ? new Date(oauth2Client.credentials.expiry_date)
                            : null,
                        projectId
                    ]
                );
            }
        }
    }

    const searchconsole = google.searchconsole({
        version: "v1",
        auth: oauth2Client
    });

    const requestBase = {
        startDate,
        endDate,
        searchType,
        dataState,
        rowLimit,
        startRow,
        filters
    };

    const [breakdownResponse, summaryResponse] = await Promise.all([
        searchconsole.searchanalytics.query({
            siteUrl: connection.property_url,
            requestBody: buildRequestBody({
                ...requestBase,
                dimension: safeDimension
            })
        }),
        searchconsole.searchanalytics.query({
            siteUrl: connection.property_url,
            requestBody: buildRequestBody({
                ...requestBase,
                dimension: null,
                rowLimit: 1,
                startRow: 0
            })
        })
    ]);

    const rows = breakdownResponse.data.rows || [];
    const summaryRows = summaryResponse.data.rows || [];
    const summary = summaryRows.length
        ? summarizeRows(summaryRows)
        : summarizeRows(rows);

    return {
        projectId: Number(projectId),
        propertyUrl: connection.property_url,
        startDate,
        endDate,
        dimension: safeDimension,
        searchType,
        dataState,
        rows,
        summary,
        rowCount: rows.length,
        totalRows: Number(breakdownResponse.data.rows?.length || 0)
    };
}

module.exports = {
    getAuthorizationUrl,
    exchangeCode,
    listProperties,
    saveConnection,
    getConnection,
    getPerformanceData
};
