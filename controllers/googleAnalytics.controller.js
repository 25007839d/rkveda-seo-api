const crypto = require('crypto');
const db = require('../config/database');
const ga4 = require('../services/googleAnalytics.service');

function createOAuthState(projectId, userId) {
  const payload = Buffer.from(JSON.stringify({ projectId: String(projectId), userId: String(userId), nonce: crypto.randomBytes(16).toString('hex'), ts: Date.now() })).toString('base64url');
  const secret = process.env.JWT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function parseOAuthState(state) {
  const [payload, signature] = String(state || '').split('.');
  if (!payload || !signature) throw new Error('Invalid OAuth state');
  const secret = process.env.JWT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error('Invalid OAuth state signature');
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (!data.projectId || !data.userId || !data.ts || Date.now() - Number(data.ts) > 10 * 60 * 1000) throw new Error('OAuth state expired');
  return data;
}

async function projectOwned(projectId, userId) {
  const [rows] = await db.execute('SELECT id,project_name,website_url,domain FROM seo_projects WHERE id=? AND user_id=? LIMIT 1', [projectId, userId]);
  return rows[0] || null;
}

function redirect(projectId, params = {}) {
  const base = process.env.FRONTEND_URL || 'https://seo.rkveda.in';
  const url = new URL(`/projects/${projectId}/ga4`, base);
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v)); });
  return url.toString();
}

async function connect(req, res) {
  try {
    const projectId = req.params.projectId;
    if (!(await projectOwned(projectId, req.user.userId))) return res.status(404).json({ success: false, message: 'Project not found' });
    return res.json({ success: true, authorizationUrl: ga4.getAuthorizationUrl(createOAuthState(projectId, req.user.userId)) });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
}

async function callback(req, res) {
  let projectId = null;
  try {
    const stateData = parseOAuthState(req.query.state);
    projectId = stateData.projectId;
    if (req.query.error) return res.redirect(redirect(projectId, { ga4_error: `Google authorization failed: ${req.query.error}` }));
    if (!req.query.code) throw new Error('Authorization code missing');
    if (!(await projectOwned(projectId, stateData.userId))) throw new Error('Project not found');
    const tokens = await ga4.exchangeCode(req.query.code);
    await ga4.saveConnection({ projectId, accessToken: tokens.access_token, refreshToken: tokens.refresh_token || null, tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null, status: 'pending' });
    const connection = await ga4.getConnection(projectId, stateData.userId);
    let properties = [];
    try { properties = await ga4.listProperties(connection); } catch (e) { console.error('GA4 PROPERTY LIST ERROR:', e.message); }
    if (properties.length === 1) {
      await ga4.selectProperty(projectId, stateData.userId, properties[0]);
      return res.redirect(redirect(projectId, { ga4_connected: '1' }));
    }
    return res.redirect(redirect(projectId, { ga4_connected: '1', ga4_select: '1' }));
  } catch (e) {
    console.error('GA4 CALLBACK ERROR:', e);
    if (projectId) return res.redirect(redirect(projectId, { ga4_error: e.message || 'Google Analytics connection failed' }));
    return res.status(400).json({ success: false, message: e.message });
  }
}

async function status(req, res) {
  try {
    if (!(await projectOwned(req.params.projectId, req.user.userId))) return res.status(404).json({ success: false, message: 'Project not found' });
    const connection = await ga4.getConnection(req.params.projectId, req.user.userId);
    return res.json({ success: true, connected: Boolean(connection), propertySelected: Boolean(connection?.property_id), connection: connection ? { project_id: connection.project_id, account_id: connection.account_id, account_name: connection.account_name, property_id: connection.property_id, property_name: connection.property_name, status: connection.status, updated_at: connection.updated_at } : null });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
}

async function properties(req, res) {
  try {
    if (!(await projectOwned(req.params.projectId, req.user.userId))) return res.status(404).json({ success: false, message: 'Project not found' });
    const connection = await ga4.getConnection(req.params.projectId, req.user.userId);
    if (!connection) return res.status(400).json({ success: false, message: 'Connect Google Analytics first.' });
    const list = await ga4.listProperties(connection);
    return res.json({ success: true, properties: list });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
}

async function selectProperty(req, res) {
  try {
    const projectId = req.params.projectId;
    if (!(await projectOwned(projectId, req.user.userId))) return res.status(404).json({ success: false, message: 'Project not found' });
    const propertyId = String(req.body.propertyId || '').trim();
    if (!propertyId) return res.status(400).json({ success: false, message: 'Property ID is required' });
    const connection = await ga4.getConnection(projectId, req.user.userId);
    const propertiesList = await ga4.listProperties(connection);
    const property = propertiesList.find((x) => x.propertyId === propertyId);
    if (!property) return res.status(403).json({ success: false, message: 'Selected GA4 property is not available to this Google account.' });
    await ga4.selectProperty(projectId, req.user.userId, property);
    return res.json({ success: true, property });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
}

function dates(req) {
  const endDate = req.query.endDate || new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const startDate = req.query.startDate || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) throw new Error('Invalid startDate or endDate');
  return { startDate, endDate };
}

async function report(req, res) {
  try {
    if (!(await projectOwned(req.params.projectId, req.user.userId))) return res.status(404).json({ success: false, message: 'Project not found' });
    const connection = await ga4.getConnection(req.params.projectId, req.user.userId);
    if (!connection?.property_id) return res.status(400).json({ success: false, message: 'Connect GA4 and select a property first.' });
    const data = await ga4.runReport(connection, dates(req));
    return res.json({ success: true, ...data, dateRange: dates(req), property: { id: connection.property_id, name: connection.property_name } });
  } catch (e) { console.error('GA4 REPORT ERROR:', e); return res.status(500).json({ success: false, message: e.message || 'Unable to load GA4 data' }); }
}

module.exports = { connect, callback, status, properties, selectProperty, report };
