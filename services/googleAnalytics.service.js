const { google } = require('googleapis');
const db = require('../config/database');

const SCOPES = ['https://www.googleapis.com/auth/analytics.readonly'];

async function ensureTable() {
  await db.query(`CREATE TABLE IF NOT EXISTS google_analytics_connections (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    project_id BIGINT UNSIGNED NOT NULL,
    account_id VARCHAR(100) NULL,
    account_name VARCHAR(255) NULL,
    property_id VARCHAR(100) NULL,
    property_name VARCHAR(255) NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT NULL,
    token_expiry DATETIME NULL,
    status ENUM('pending','connected','error','disconnected') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_ga4_project (project_id),
    KEY idx_ga4_property (property_id),
    CONSTRAINT fk_ga4_project FOREIGN KEY (project_id) REFERENCES seo_projects(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
}


function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_GA4_REDIRECT_URI || process.env.GOOGLE_REDIRECT_URI
  );
}

function getAuthorizationUrl(state) {
  const oauth2Client = createOAuthClient();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    include_granted_scopes: true,
    prompt: 'consent',
    state,
  });
}

async function exchangeCode(code) {
  const oauth2Client = createOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

async function saveConnection({ projectId, accessToken, refreshToken = null, tokenExpiry = null, propertyId = null, propertyName = null, accountId = null, accountName = null, status = 'pending' }) {
  await ensureTable();
  await db.execute(`
    INSERT INTO google_analytics_connections
      (project_id, account_id, account_name, property_id, property_name, access_token, refresh_token, token_expiry, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      account_id=COALESCE(VALUES(account_id), account_id),
      account_name=COALESCE(VALUES(account_name), account_name),
      property_id=COALESCE(VALUES(property_id), property_id),
      property_name=COALESCE(VALUES(property_name), property_name),
      access_token=VALUES(access_token),
      refresh_token=COALESCE(VALUES(refresh_token), refresh_token),
      token_expiry=VALUES(token_expiry),
      status=VALUES(status),
      updated_at=CURRENT_TIMESTAMP
  `, [projectId, accountId, accountName, propertyId, propertyName, accessToken, refreshToken, tokenExpiry, status]);
}

async function getConnection(projectId, userId) {
  await ensureTable();
  const [rows] = await db.execute(`
    SELECT c.* FROM google_analytics_connections c
    JOIN seo_projects p ON p.id=c.project_id
    WHERE c.project_id=? AND p.user_id=? LIMIT 1
  `, [projectId, userId]);
  return rows[0] || null;
}

function clientFromConnection(connection) {
  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials({
    access_token: connection.access_token,
    refresh_token: connection.refresh_token || undefined,
    expiry_date: connection.token_expiry ? new Date(connection.token_expiry).getTime() : undefined,
  });
  return oauth2Client;
}

async function listProperties(connection) {
  const auth = clientFromConnection(connection);
  const admin = google.analyticsadmin({ version: 'v1beta', auth });
  const properties = [];
  let pageToken;
  do {
    const response = await admin.accountSummaries.list({ pageSize: 200, pageToken });
    for (const account of response.data.accountSummaries || []) {
      for (const property of account.propertySummaries || []) {
        properties.push({
          propertyId: String(property.property || '').replace(/^properties\//, ''),
          propertyName: property.displayName || '',
          accountId: String(account.account || '').replace(/^accounts\//, ''),
          accountName: account.displayName || '',
          propertyResource: property.property || null,
        });
      }
    }
    pageToken = response.data.nextPageToken || null;
  } while (pageToken);
  return properties;
}

async function selectProperty(projectId, userId, property) {
  await ensureTable();
  const connection = await getConnection(projectId, userId);
  if (!connection) throw new Error('Google Analytics is not connected.');
  await db.execute(`UPDATE google_analytics_connections SET account_id=?,account_name=?,property_id=?,property_name=?,status='connected',updated_at=CURRENT_TIMESTAMP WHERE project_id=?`, [property.accountId, property.accountName, property.propertyId, property.propertyName, projectId]);
}

async function runReport(connection, { startDate, endDate }) {
  if (!connection?.property_id) throw new Error('Select a Google Analytics 4 property first.');
  const auth = clientFromConnection(connection);
  const analyticsdata = google.analyticsdata({ version: 'v1beta', auth });
  const property = `properties/${connection.property_id}`;

  const summaryResponse = await analyticsdata.properties.runReport({
    property,
    requestBody: {
      dateRanges: [{ startDate, endDate }],
      metrics: [
        { name: 'activeUsers' },
        { name: 'newUsers' },
        { name: 'sessions' },
        { name: 'screenPageViews' },
        { name: 'engagementRate' },
        { name: 'averageSessionDuration' },
        { name: 'bounceRate' },
      ],
    },
  });

  const topPagesResponse = await analyticsdata.properties.runReport({
    property,
    requestBody: {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }, { name: 'averageSessionDuration' }],
      limit: 20,
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    },
  });

  const channelsResponse = await analyticsdata.properties.runReport({
    property,
    requestBody: {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'sessionDefaultChannelGroup' }],
      metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'engagementRate' }],
      limit: 20,
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    },
  });

  const trendResponse = await analyticsdata.properties.runReport({
    property,
    requestBody: {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'date' }],
      metrics: [{ name: 'activeUsers' }, { name: 'sessions' }, { name: 'screenPageViews' }],
      limit: 400,
      orderBys: [{ dimension: { dimensionName: 'date' } }],
    },
  });

  return {
    summary: mapSummary(summaryResponse.data),
    topPages: mapRows(topPagesResponse.data, ['pagePath'], ['screenPageViews', 'activeUsers', 'averageSessionDuration']),
    channels: mapRows(channelsResponse.data, ['sessionDefaultChannelGroup'], ['sessions', 'activeUsers', 'engagementRate']),
    trend: mapRows(trendResponse.data, ['date'], ['activeUsers', 'sessions', 'screenPageViews']),
  };
}

function metricValue(row, index) {
  const raw = row?.metricValues?.[index]?.value;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function mapRows(data, dimensions, metrics) {
  return (data.rows || []).map((row) => {
    const out = {};
    dimensions.forEach((name, i) => { out[name] = row.dimensionValues?.[i]?.value || ''; });
    metrics.forEach((name, i) => { out[name] = metricValue(row, i); });
    return out;
  });
}

function mapSummary(data) {
  const row = data.rows?.[0];
  const metrics = data.metricHeaders || [];
  const values = {};
  metrics.forEach((header, i) => { values[header.name] = metricValue(row, i); });
  return values;
}

module.exports = { SCOPES, ensureTable, getAuthorizationUrl, exchangeCode, saveConnection, getConnection, listProperties, selectProperty, runReport };
