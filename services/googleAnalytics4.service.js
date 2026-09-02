const { google } = require('googleapis');
const pool = require('../config/database');

const SCOPES = [
  'https://www.googleapis.com/auth/analytics.readonly',
  'openid',
  'email'
];

function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_GA4_REDIRECT_URI || process.env.GOOGLE_REDIRECT_URI
  );
}

function getAuthorizationUrl(state) {
  return createOAuthClient().generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    include_granted_scopes: true,
    prompt: 'consent',
    state
  });
}

async function exchangeCode(code) {
  const { tokens } = await createOAuthClient().getToken(code);
  return tokens;
}

async function getOAuthClientFromTokens(tokens) {
  const client = createOAuthClient();
  client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || undefined,
    expiry_date: tokens.expiry_date || undefined
  });
  return client;
}

async function getUserEmail(tokens) {
  try {
    const client = await getOAuthClientFromTokens(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data } = await oauth2.userinfo.get();
    return data.email || null;
  } catch (_) {
    return null;
  }
}

async function listProperties(tokens) {
  const client = await getOAuthClientFromTokens(tokens);
  const admin = google.analyticsadmin({ version: 'v1beta', auth: client });
  const properties = [];
  let pageToken;
  do {
    const { data } = await admin.accountSummaries.list({ pageSize: 200, pageToken });
    for (const account of data.accountSummaries || []) {
      for (const property of account.propertySummaries || []) {
        properties.push({
          property_id: String(property.property || '').replace(/^properties\//, ''),
          property_name: property.displayName || property.property || '',
          account_name: account.displayName || account.account || '',
          account_id: String(account.account || '').replace(/^accounts\//, ''),
          parent: property.parent || null
        });
      }
    }
    pageToken = data.nextPageToken || null;
  } while (pageToken);
  return properties;
}

function normalizeHost(value) {
  if (!value) return '';
  let raw = String(value).trim().toLowerCase();
  if (!raw.includes('://')) raw = `https://${raw}`;
  try { return new URL(raw).hostname.replace(/^www\./, ''); } catch { return raw.replace(/^https?:\/\//, '').split('/')[0].replace(/^www\./, ''); }
}

function propertyMatchesProject(property, project) {
  const target = normalizeHost(project?.domain || project?.website_url);
  const websiteUrl = normalizeHost(project?.website_url);
  const candidate = normalizeHost(property?.website_url || property?.property_name || '');
  return !!target && !!candidate && (candidate === target || candidate === websiteUrl || candidate.endsWith(`.${target}`));
}

async function ensureTable() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS ga4_connections (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      project_id BIGINT UNSIGNED NOT NULL,
      account_id VARCHAR(255) NULL,
      property_id VARCHAR(100) NULL,
      property_name VARCHAR(255) NULL,
      google_email VARCHAR(255) NULL,
      access_token TEXT NULL,
      refresh_token TEXT NULL,
      token_expiry DATETIME NULL,
      status ENUM('connected','needs_property','disconnected','error') NOT NULL DEFAULT 'connected',
      last_synced_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_ga4_project (project_id),
      KEY idx_ga4_project_status (project_id, status)
    )
  `);
  // Existing installations may already have the table from the foundation SQL.
  const additions = [
    ['account_id', 'VARCHAR(255) NULL AFTER project_id'],
    ['google_email', 'VARCHAR(255) NULL AFTER property_name'],
    ['last_synced_at', 'DATETIME NULL AFTER status']
  ];
  for (const [column, definition] of additions) {
    const [rows] = await pool.execute(`SELECT COUNT(*) AS c FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='ga4_connections' AND column_name=?`, [column]);
    if (!rows[0].c) await pool.execute(`ALTER TABLE ga4_connections ADD COLUMN ${column} ${definition}`);
  }
}

async function saveConnection({ projectId, accountId = null, propertyId = null, propertyName = null, googleEmail = null, accessToken, refreshToken = null, tokenExpiry = null, status = 'connected' }) {
  await ensureTable();
  const [result] = await pool.execute(`
    INSERT INTO ga4_connections
      (project_id, account_id, property_id, property_name, google_email, access_token, refresh_token, token_expiry, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      account_id=COALESCE(VALUES(account_id), account_id),
      property_id=COALESCE(VALUES(property_id), property_id),
      property_name=COALESCE(VALUES(property_name), property_name),
      google_email=COALESCE(VALUES(google_email), google_email),
      access_token=COALESCE(VALUES(access_token), access_token),
      refresh_token=COALESCE(VALUES(refresh_token), refresh_token),
      token_expiry=VALUES(token_expiry),
      status=VALUES(status),
      updated_at=CURRENT_TIMESTAMP
  `, [projectId, accountId, propertyId, propertyName, googleEmail, accessToken, refreshToken, tokenExpiry, status]);
  return result;
}

async function getConnection(projectId, includeTokens = false) {
  await ensureTable();
  const columns = includeTokens
    ? 'id, project_id, account_id, property_id, property_name, google_email, access_token, refresh_token, token_expiry, status, last_synced_at, created_at, updated_at'
    : 'id, project_id, account_id, property_id, property_name, google_email, token_expiry, status, last_synced_at, created_at, updated_at';
  const [rows] = await pool.execute(`SELECT ${columns} FROM ga4_connections WHERE project_id=? LIMIT 1`, [projectId]);
  return rows[0] || null;
}

async function refreshIfNeeded(connection) {
  const client = createOAuthClient();
  client.setCredentials({
    access_token: connection.access_token,
    refresh_token: connection.refresh_token || undefined,
    expiry_date: connection.token_expiry ? new Date(connection.token_expiry).getTime() : undefined
  });
  if (connection.refresh_token && (!connection.token_expiry || new Date(connection.token_expiry).getTime() <= Date.now() + 60 * 1000)) {
    const { credentials } = await client.refreshAccessToken();
    await pool.execute('UPDATE ga4_connections SET access_token=?, token_expiry=?, status=\'connected\', updated_at=CURRENT_TIMESTAMP WHERE id=?', [credentials.access_token || connection.access_token, credentials.expiry_date ? new Date(credentials.expiry_date) : null, connection.id]);
    client.setCredentials(credentials);
  }
  return client;
}

async function runReport(projectId, { startDate, endDate, limit = 100 }) {
  const connection = await getConnection(projectId, true);
  if (!connection || connection.status !== 'connected' || !connection.property_id) throw new Error('Google Analytics 4 is not connected for this project');
  const client = await refreshIfNeeded(connection);
  const analyticsdata = google.analyticsdata({ version: 'v1beta', auth: client });
  const property = `properties/${connection.property_id}`;
  const metrics = [
    { name: 'activeUsers' },
    { name: 'newUsers' },
    { name: 'sessions' },
    { name: 'engagedSessions' },
    { name: 'engagementRate' },
    { name: 'screenPageViews' },
    { name: 'averageSessionDuration' },
    { name: 'conversions' }
  ];
  const [dailyResponse, totalResponse] = await Promise.all([
    analyticsdata.properties.runReport({
      property,
      requestBody: {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'date' }],
        metrics,
        limit: String(Math.min(Math.max(Number(limit) || 100, 1), 10000)),
        orderBys: [{ dimension: { dimensionName: 'date', orderType: 'NUMERIC' } }]
      }
    }),
    analyticsdata.properties.runReport({
      property,
      requestBody: { dateRanges: [{ startDate, endDate }], metrics }
    })
  ]);
  const data = dailyResponse.data;
  const totalData = totalResponse.data;
  await pool.execute('UPDATE ga4_connections SET last_synced_at=CURRENT_TIMESTAMP, status=\'connected\', updated_at=CURRENT_TIMESTAMP WHERE id=?', [connection.id]);
  const rows = (data.rows || []).map(row => {
    const values = row.metricValues || [];
    const v = i => Number(values[i]?.value || 0);
    return { date: row.dimensionValues?.[0]?.value || '', activeUsers: v(0), newUsers: v(1), sessions: v(2), engagedSessions: v(3), engagementRate: v(4), screenPageViews: v(5), averageSessionDuration: v(6), conversions: v(7) };
  });
  const tv = totalData.rows?.[0]?.metricValues || [];
  const value = i => Number(tv[i]?.value || 0);
  const totals = { activeUsers:value(0), newUsers:value(1), sessions:value(2), engagedSessions:value(3), engagementRate:value(4), screenPageViews:value(5), averageSessionDuration:value(6), conversions:value(7) };
  return { rows, totals, propertyId: connection.property_id, propertyName: connection.property_name, startDate, endDate };
}
module.exports = { SCOPES, createOAuthClient, getAuthorizationUrl, exchangeCode, getUserEmail, listProperties, propertyMatchesProject, saveConnection, getConnection, runReport, ensureTable };
