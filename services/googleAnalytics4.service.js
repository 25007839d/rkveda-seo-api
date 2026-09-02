const { google } = require('googleapis');
const db = require('../config/database');

const SCOPES = ['https://www.googleapis.com/auth/analytics.readonly'];

function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

function getAuthorizationUrl(state) {
  return createOAuthClient().generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    include_granted_scopes: true,
    prompt: 'consent',
    state,
  });
}

async function exchangeCode(code) {
  const { tokens } = await createOAuthClient().getToken(code);
  return tokens;
}

function createClients(tokens) {
  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials(tokens);
  return {
    auth: oauth2Client,
    admin: google.analyticsadmin({ version: 'v1beta', auth: oauth2Client }),
    data: google.analyticsdata({ version: 'v1beta', auth: oauth2Client }),
  };
}

async function listProperties(tokens) {
  const { admin } = createClients(tokens);
  const properties = [];
  let pageToken;
  do {
    const response = await admin.accountSummaries.list({ pageSize: 200, pageToken });
    for (const account of response.data.accountSummaries || []) {
      for (const property of account.propertySummaries || []) {
        properties.push({
          propertyId: String(property.property || '').replace(/^properties\//, ''),
          propertyName: property.displayName || property.property,
          accountId: String(account.account || '').replace(/^accounts\//, ''),
          accountName: account.displayName || account.account,
          propertyType: property.propertyType || null,
        });
      }
    }
    pageToken = response.data.nextPageToken;
  } while (pageToken);
  return properties;
}

async function getWebStreams(tokens, propertyId) {
  const { admin } = createClients(tokens);
  const response = await admin.properties.dataStreams.list({ parent: `properties/${propertyId}` });
  return (response.data.dataStreams || []).filter((s) => s.webStreamData);
}

function normalizeHost(value) {
  if (!value) return '';
  let raw = String(value).trim().toLowerCase();
  if (!raw.includes('://')) raw = `https://${raw}`;
  try { return new URL(raw).hostname.replace(/^www\./, ''); } catch { return raw.replace(/^https?:\/\//, '').split('/')[0].split(':')[0].replace(/^www\./, ''); }
}

async function findPropertyForProject(tokens, project) {
  const candidates = await listProperties(tokens);
  const projectHost = normalizeHost(project.domain || project.website_url);
  const matched = [];
  for (const candidate of candidates) {
    try {
      const streams = await getWebStreams(tokens, candidate.propertyId);
      for (const stream of streams) {
        const uri = stream.webStreamData?.defaultUri;
        if (normalizeHost(uri) === projectHost) {
          matched.push({ ...candidate, streamId: stream.name, streamName: stream.displayName, defaultUri: uri });
          break;
        }
      }
    } catch (error) {
      console.warn('GA4 stream lookup skipped:', candidate.propertyId, error.message);
    }
  }
  return { matched, candidates };
}

function parseMetric(row, index) {
  return Number(row?.metricValues?.[index]?.value || 0);
}

function mapRows(response, dimensions, metrics) {
  return (response?.data?.rows || []).map((row) => {
    const item = {};
    dimensions.forEach((name, i) => { item[name] = row.dimensionValues?.[i]?.value ?? ''; });
    metrics.forEach((name, i) => { item[name] = parseMetric(row, i); });
    return item;
  });
}

async function runReport(tokens, propertyId, request) {
  const { data } = createClients(tokens);
  return data.properties.runReport({ property: `properties/${propertyId}`, requestBody: request });
}

async function getOverviewReport(tokens, propertyId, startDate, endDate) {
  const dimensions = ['date'];
  const metrics = ['activeUsers','sessions','engagedSessions','engagementRate','bounceRate','screenPageViews','eventCount','keyEvents','totalRevenue'];
  const response = await runReport(tokens, propertyId, {
    dateRanges: [{ startDate, endDate }],
    dimensions: dimensions.map((name) => ({ name })),
    metrics: metrics.map((name) => ({ name })),
    orderBys: [{ dimension: { dimensionName: 'date', orderType: 'NUMERIC' } }],
  });
  return { rows: mapRows(response, dimensions, metrics), metadata: response.data.metadata || null, propertyQuota: response.data.propertyQuota || null };
}


async function getSummaryReport(tokens, propertyId, startDate, endDate) {
  const metrics = ['activeUsers','sessions','engagedSessions','engagementRate','bounceRate','screenPageViews','eventCount','keyEvents','totalRevenue'];
  const response = await runReport(tokens, propertyId, {
    dateRanges: [{ startDate, endDate }],
    metrics: metrics.map((name) => ({ name })),
  });
  const row = response.data.rows?.[0];
  const out = {};
  metrics.forEach((name, i) => { out[name] = parseMetric(row, i); });
  return out;
}

async function getBreakdownReport(tokens, propertyId, startDate, endDate, dimension, metrics, limit = 100) {
  const response = await runReport(tokens, propertyId, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: dimension }],
    metrics: metrics.map((name) => ({ name })),
    limit,
    orderBys: [{ metric: { metricName: metrics[0], desc: true } }],
  });
  return mapRows(response, [dimension], metrics);
}

async function getRealtime(tokens, propertyId) {
  const { data } = createClients(tokens);
  const response = await data.properties.runRealtimeReport({
    property: `properties/${propertyId}`,
    requestBody: {
      metrics: [{ name: 'activeUsers' }, { name: 'eventCount' }, { name: 'screenPageViews' }, { name: 'keyEvents' }],
    },
  });
  const row = response.data.rows?.[0];
  return {
    activeUsers: parseMetric(row, 0),
    eventCount: parseMetric(row, 1),
    screenPageViews: parseMetric(row, 2),
    keyEvents: parseMetric(row, 3),
  };
}

async function refreshTokensIfNeeded(connection) {
  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials({
    access_token: connection.access_token,
    refresh_token: connection.refresh_token,
    expiry_date: connection.token_expiry ? new Date(connection.token_expiry).getTime() : undefined,
  });
  if (!connection.refresh_token) return { oauth2Client, tokens: null };
  const expiry = connection.token_expiry ? new Date(connection.token_expiry).getTime() : 0;
  if (expiry && expiry > Date.now() + 60_000) return { oauth2Client, tokens: null };
  const { credentials } = await oauth2Client.refreshAccessToken();
  await db.execute(
    'UPDATE ga4_connections SET access_token = ?, token_expiry = ?, status = \'connected\', updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [credentials.access_token, credentials.expiry_date ? new Date(credentials.expiry_date) : null, connection.id]
  );
  return { oauth2Client, tokens: credentials };
}

async function getConnection(projectId) {
  const [rows] = await db.execute('SELECT * FROM ga4_connections WHERE project_id = ? LIMIT 1', [projectId]);
  return rows[0] || null;
}

async function getConnectionTokens(projectId) {
  const connection = await getConnection(projectId);
  if (!connection || connection.status !== 'connected') return null;
  const refreshed = await refreshTokensIfNeeded(connection);
  return {
    connection,
    tokens: {
      access_token: refreshed.oauth2Client.credentials.access_token,
      refresh_token: refreshed.oauth2Client.credentials.refresh_token || connection.refresh_token,
      expiry_date: refreshed.oauth2Client.credentials.expiry_date || (connection.token_expiry ? new Date(connection.token_expiry).getTime() : undefined),
    },
  };
}

async function saveConnection({ projectId, propertyId, propertyName, accountId, accountName, accessToken, refreshToken, tokenExpiry }) {
  await db.execute(`
    INSERT INTO ga4_connections
      (project_id, property_id, property_name, account_id, account_name, access_token, refresh_token, token_expiry, status, last_synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'connected', NULL)
    ON DUPLICATE KEY UPDATE
      property_id = VALUES(property_id), property_name = VALUES(property_name),
      account_id = VALUES(account_id), account_name = VALUES(account_name),
      access_token = VALUES(access_token), refresh_token = COALESCE(VALUES(refresh_token), refresh_token),
      token_expiry = VALUES(token_expiry), status = 'connected', updated_at = CURRENT_TIMESTAMP
  `, [projectId, propertyId, propertyName, accountId || null, accountName || null, accessToken, refreshToken || null, tokenExpiry || null]);
}

async function syncDailyHistory(projectId, startDate, endDate) {
  const result = await getConnectionTokens(projectId);
  if (!result) throw new Error('Google Analytics 4 is not connected');
  const { connection, tokens } = result;
  const report = await getOverviewReport(tokens, connection.property_id, startDate, endDate);
  let savedDays = 0;
  for (const row of report.rows) {
    const date = row.date;
    if (!/^\d{8}$/.test(date)) continue;
    const iso = `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`;
    await db.execute(`
      INSERT INTO ga4_daily_metrics
        (project_id, property_id, metric_date, active_users, sessions, engaged_sessions, engagement_rate, bounce_rate, screen_page_views, event_count, key_events, total_revenue)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        active_users=VALUES(active_users), sessions=VALUES(sessions), engaged_sessions=VALUES(engaged_sessions),
        engagement_rate=VALUES(engagement_rate), bounce_rate=VALUES(bounce_rate), screen_page_views=VALUES(screen_page_views),
        event_count=VALUES(event_count), key_events=VALUES(key_events), total_revenue=VALUES(total_revenue), updated_at=CURRENT_TIMESTAMP
    `, [projectId, connection.property_id, iso, row.activeUsers, row.sessions, row.engagedSessions, row.engagementRate, row.bounceRate, row.screenPageViews, row.eventCount, row.keyEvents, row.totalRevenue]);
    savedDays += 1;
  }
  await db.execute('UPDATE ga4_connections SET last_synced_at = CURRENT_TIMESTAMP, status = \'connected\' WHERE id = ?', [connection.id]);
  return { savedDays, rows: report.rows };
}

module.exports = {
  SCOPES, createOAuthClient, getAuthorizationUrl, exchangeCode, listProperties,
  findPropertyForProject, getConnection, getConnectionTokens, saveConnection,
  getOverviewReport, getSummaryReport, getBreakdownReport, getRealtime, syncDailyHistory,
};
