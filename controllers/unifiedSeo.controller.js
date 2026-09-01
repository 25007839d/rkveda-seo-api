const db = require('../config/database');
const { getPerformanceData } = require('../services/googleSearchConsole.service');

async function getOwnedProject(projectId, userId) {
  const [rows] = await db.execute(
    'SELECT id, project_name, website_url, domain, status FROM seo_projects WHERE id = ? AND user_id = ?',
    [projectId, userId]
  );
  return rows[0] || null;
}

function fail(res, status, message) {
  return res.status(status).json({ success: false, message });
}



function parseKeywordDateRange(req) {
  const end = req.query.endDate ? new Date(`${req.query.endDate}T00:00:00Z`) : new Date(Date.now() - 24 * 60 * 60 * 1000);
  const start = req.query.startDate ? new Date(`${req.query.startDate}T00:00:00Z`) : new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    throw new Error('Invalid startDate or endDate');
  }
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

function previousPeriod({ startDate, endDate }) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const days = Math.round((end - start) / 86400000) + 1;
  const previousEnd = new Date(start.getTime() - 86400000);
  const previousStart = new Date(previousEnd.getTime() - (days - 1) * 86400000);
  return { startDate: previousStart.toISOString().slice(0, 10), endDate: previousEnd.toISOString().slice(0, 10) };
}

function mapKeywordRows(rows = []) {
  return rows.map((row) => ({
    keyword: row?.keys?.[0] || '',
    clicks: Number(row.clicks || 0),
    impressions: Number(row.impressions || 0),
    ctr: Number(row.ctr || 0),
    ctrPercent: Number(row.ctr || 0) * 100,
    position: Number(row.position || 0),
  })).filter((row) => row.keyword);
}

async function keywords(req, res) {
  try {
    const projectId = Number(req.params.projectId);
    const project = await getOwnedProject(projectId, req.user.userId);
    if (!project) return fail(res, 404, 'Project not found');

    const range = parseKeywordDateRange(req);
    const previous = previousPeriod(range);
    const dataState = req.query.dataState === 'all' ? 'all' : 'final';

    // Tracked keywords are the source of truth for the number of keywords a
    // project manages. GSC query rows are enrichment data and may legitimately
    // be empty (new site, no impressions, delayed GSC data, etc.).
    const [trackedRows] = await db.execute(
      `SELECT id, keyword, search_engine, country, language, target_url, created_at
       FROM keywords
       WHERE project_id = ?
       ORDER BY created_at DESC`,
      [projectId]
    );

    let currentResult = { rows: [], propertyUrl: null };
    let previousResult = { rows: [], propertyUrl: null };
    let gscError = null;

    try {
      [currentResult, previousResult] = await Promise.all([
        getPerformanceData(projectId, range.startDate, range.endDate, 'query', dataState),
        getPerformanceData(projectId, previous.startDate, previous.endDate, 'query', dataState),
      ]);
    } catch (error) {
      gscError = error.message || 'Google Search Console data unavailable';
      console.warn('SEO KEYWORDS GSC WARNING:', gscError);
    }

    const currentRows = mapKeywordRows(currentResult.rows);
    const previousRows = mapKeywordRows(previousResult.rows);
    const currentMap = new Map(currentRows.map((row) => [row.keyword.toLowerCase(), row]));
    const previousMap = new Map(previousRows.map((row) => [row.keyword.toLowerCase(), row]));
    const resultMap = new Map();

    // Start with tracked keywords so they are visible even when GSC has no row.
    for (const tracked of trackedRows) {
      const key = String(tracked.keyword || '').trim().toLowerCase();
      if (!key) continue;
      const row = currentMap.get(key);
      const old = previousMap.get(key);
      const hasGsc = Boolean(row);
      let trend = 'no_data';
      let positionChange = null;
      let clicksChange = null;
      let impressionsChange = null;
      if (row && old) {
        positionChange = Number(old.position - row.position);
        clicksChange = Number(row.clicks - old.clicks);
        impressionsChange = Number(row.impressions - old.impressions);
        if (positionChange > 0.5) trend = 'improving';
        else if (positionChange < -0.5) trend = 'declining';
        else trend = 'stable';
      } else if (row) {
        trend = 'new';
      }
      resultMap.set(key, {
        ...row,
        keyword: tracked.keyword,
        keywordId: tracked.id,
        targetUrl: tracked.target_url,
        searchEngine: tracked.search_engine,
        country: tracked.country,
        language: tracked.language,
        tracked: true,
        hasGscData: hasGsc,
        clicks: row?.clicks ?? 0,
        impressions: row?.impressions ?? 0,
        ctr: row?.ctr ?? 0,
        ctrPercent: row?.ctrPercent ?? 0,
        position: row?.position ?? null,
        previousPosition: old?.position ?? null,
        positionChange,
        clicksChange,
        impressionsChange,
        trend,
      });
    }

    // Also show GSC queries that are not manually tracked.
    for (const row of currentRows) {
      const key = row.keyword.toLowerCase();
      if (resultMap.has(key)) continue;
      const old = previousMap.get(key);
      const positionChange = old ? Number(old.position - row.position) : null;
      const clicksChange = old ? Number(row.clicks - old.clicks) : null;
      const impressionsChange = old ? Number(row.impressions - old.impressions) : null;
      let trend = 'new';
      if (old) {
        if (positionChange > 0.5) trend = 'improving';
        else if (positionChange < -0.5) trend = 'declining';
        else trend = 'stable';
      }
      resultMap.set(key, {
        ...row,
        keywordId: null,
        targetUrl: null,
        searchEngine: 'google',
        country: null,
        language: null,
        tracked: false,
        hasGscData: true,
        previousPosition: old?.position ?? null,
        positionChange,
        clicksChange,
        impressionsChange,
        trend,
      });
    }

    const result = Array.from(resultMap.values());
    result.sort((a, b) => b.impressions - a.impressions || (a.position ?? 9999) - (b.position ?? 9999) || a.keyword.localeCompare(b.keyword));

    const gscRows = currentRows;
    const summary = gscRows.reduce((acc, row) => {
      acc.clicks += row.clicks;
      acc.impressions += row.impressions;
      acc.weightedPosition += row.position * row.impressions;
      return acc;
    }, { clicks: 0, impressions: 0, weightedPosition: 0 });

    const totalCtr = summary.impressions ? (summary.clicks / summary.impressions) * 100 : 0;
    const averagePosition = summary.impressions ? summary.weightedPosition / summary.impressions : 0;

    return res.json({
      success: true,
      projectId,
      propertyUrl: currentResult.propertyUrl || null,
      startDate: range.startDate,
      endDate: range.endDate,
      previousStartDate: previous.startDate,
      previousEndDate: previous.endDate,
      dataState,
      source: 'tracked_keywords_plus_google_search_console',
      gscAvailable: !gscError,
      gscError,
      count: result.length,
      trackedCount: trackedRows.length,
      gscKeywordCount: currentRows.length,
      summary: {
        keywords: trackedRows.length,
        visibleKeywords: result.length,
        clicks: summary.clicks,
        impressions: summary.impressions,
        ctr: totalCtr,
        averagePosition,
        improving: result.filter((r) => r.trend === 'improving').length,
        declining: result.filter((r) => r.trend === 'declining').length,
        new: result.filter((r) => r.trend === 'new').length,
        noData: result.filter((r) => r.trend === 'no_data').length,
      },
      keywords: result,
    });
  } catch (error) {
    console.error('SEO KEYWORDS ERROR:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to load keyword intelligence',
      errorCode: error.code || error.response?.status || null,
      googleReason: error.errors?.[0]?.reason || error.response?.data?.error?.errors?.[0]?.reason || null,
    });
  }
}

async function overview(req, res) {
  try {
    const projectId = Number(req.params.projectId);
    const project = await getOwnedProject(projectId, req.user.userId);
    if (!project) return fail(res, 404, 'Project not found');

    const [[keywords]] = await db.execute('SELECT COUNT(*) AS count FROM keywords WHERE project_id = ?', [projectId]);
    const [[backlinks]] = await db.execute('SELECT COUNT(*) AS count FROM backlinks WHERE project_id = ?', [projectId]);
    const [[competitors]] = await db.execute('SELECT COUNT(*) AS count FROM competitors WHERE project_id = ?', [projectId]);
    const [[content]] = await db.execute('SELECT COUNT(*) AS count FROM content_plans WHERE project_id = ?', [projectId]);
    const [[recommendations]] = await db.execute("SELECT COUNT(*) AS count FROM seo_ai_recommendations WHERE project_id = ? AND status IN ('open','in_progress')", [projectId]);
    const [[gsc]] = await db.execute('SELECT status, property_url, updated_at AS last_synced_at FROM google_search_console_connections WHERE project_id = ?', [projectId]);
    const [[ga4]] = await db.execute('SELECT status, property_name, last_synced_at FROM ga4_connections WHERE project_id = ?', [projectId]);
    const [[gbp]] = await db.execute('SELECT status, location_name, last_synced_at FROM gbp_connections WHERE project_id = ?', [projectId]);
    const [social] = await db.execute('SELECT platform, status, account_name, last_synced_at FROM social_connections WHERE project_id = ? ORDER BY platform', [projectId]);

    return res.json({
      success: true,
      project,
      counts: {
        keywords: Number(keywords.count), backlinks: Number(backlinks.count), competitors: Number(competitors.count),
        content: Number(content.count), recommendations: Number(recommendations.count)
      },
      integrations: { gsc: gsc || null, ga4: ga4 || null, gbp: gbp || null, social }
    });
  } catch (error) {
    console.error('Unified SEO overview error:', error);
    return fail(res, 500, 'Failed to load SEO overview');
  }
}

async function listConnections(req, res) {
  try {
    const projectId = Number(req.params.projectId);
    if (!await getOwnedProject(projectId, req.user.userId)) return fail(res, 404, 'Project not found');
    const [ga4] = await db.execute('SELECT id, property_id, property_name, status, last_synced_at FROM ga4_connections WHERE project_id = ?', [projectId]);
    const [gbp] = await db.execute('SELECT id, account_id, location_id, location_name, status, last_synced_at FROM gbp_connections WHERE project_id = ?', [projectId]);
    const [social] = await db.execute('SELECT id, platform, account_id, account_name, status, last_synced_at FROM social_connections WHERE project_id = ? ORDER BY platform', [projectId]);
    return res.json({ success: true, ga4: ga4[0] || null, gbp: gbp[0] || null, social });
  } catch (error) { console.error(error); return fail(res, 500, 'Failed to load integrations'); }
}

async function upsertIntegration(req, res) {
  try {
    const projectId = Number(req.params.projectId);
    if (!await getOwnedProject(projectId, req.user.userId)) return fail(res, 404, 'Project not found');
    const type = req.params.type;
    const body = req.body || {};
    if (!['ga4','gbp'].includes(type)) return fail(res, 400, 'Unsupported integration');

    const table = type === 'ga4' ? 'ga4_connections' : 'gbp_connections';
    const fields = type === 'ga4'
      ? ['property_id','property_name','access_token','refresh_token','token_expiry','status']
      : ['account_id','location_id','location_name','access_token','refresh_token','token_expiry','status'];
    const values = fields.map(f => body[f] ?? null);
    values[values.length - 1] = body.status || 'connected';
    const placeholders = fields.map(() => '?').join(',');
    const updates = fields.filter(f => f !== 'access_token').map(f => `${f}=VALUES(${f})`).join(',');
    await db.execute(`INSERT INTO ${table} (project_id, ${fields.join(',')}) VALUES (?, ${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`, [projectId, ...values]);
    return res.json({ success: true, message: `${type.toUpperCase()} connection saved` });
  } catch (error) { console.error(error); return fail(res, 500, 'Failed to save integration'); }
}

async function upsertSocial(req, res) {
  try {
    const projectId = Number(req.params.projectId);
    if (!await getOwnedProject(projectId, req.user.userId)) return fail(res, 404, 'Project not found');
    const { platform, account_id, account_name, access_token, refresh_token, token_expiry, status } = req.body || {};
    const allowed = ['facebook','instagram','linkedin','youtube','x','tiktok','other'];
    if (!allowed.includes(platform)) return fail(res, 400, 'Invalid social platform');
    await db.execute(`INSERT INTO social_connections (project_id,platform,account_id,account_name,access_token,refresh_token,token_expiry,status) VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE account_id=VALUES(account_id),account_name=VALUES(account_name),access_token=COALESCE(VALUES(access_token),access_token),refresh_token=COALESCE(VALUES(refresh_token),refresh_token),token_expiry=VALUES(token_expiry),status=VALUES(status)`, [projectId, platform, account_id || null, account_name || null, access_token || null, refresh_token || null, token_expiry || null, status || 'connected']);
    return res.json({ success: true, message: 'Social connection saved' });
  } catch (error) { console.error(error); return fail(res, 500, 'Failed to save social connection'); }
}

async function listContent(req, res) {
  try {
    const projectId = Number(req.params.projectId);
    if (!await getOwnedProject(projectId, req.user.userId)) return fail(res, 404, 'Project not found');
    const [rows] = await db.execute('SELECT id, keyword_id, title, search_intent, target_url, status, priority, notes, created_at, updated_at FROM content_plans WHERE project_id = ? ORDER BY FIELD(priority,\'critical\',\'high\',\'medium\',\'low\'), created_at DESC', [projectId]);
    return res.json({ success: true, count: rows.length, content: rows });
  } catch (error) { console.error(error); return fail(res, 500, 'Failed to load content plans'); }
}

async function createContent(req, res) {
  try {
    const projectId = Number(req.params.projectId);
    if (!await getOwnedProject(projectId, req.user.userId)) return fail(res, 404, 'Project not found');
    const { title, keyword_id, search_intent, target_url, status, priority, notes } = req.body || {};
    if (!title) return fail(res, 400, 'Title is required');
    const [result] = await db.execute('INSERT INTO content_plans (project_id,keyword_id,title,search_intent,target_url,status,priority,notes) VALUES (?,?,?,?,?,?,?,?)', [projectId, keyword_id || null, title, search_intent || 'unknown', target_url || null, status || 'idea', priority || 'medium', notes || null]);
    return res.status(201).json({ success: true, id: result.insertId });
  } catch (error) { console.error(error); return fail(res, 500, 'Failed to create content plan'); }
}

async function listRecommendations(req, res) {
  try {
    const projectId = Number(req.params.projectId);
    if (!await getOwnedProject(projectId, req.user.userId)) return fail(res, 404, 'Project not found');
    const [rows] = await db.execute('SELECT id, source_type, category, title, recommendation, priority, status, evidence_json, created_at FROM seo_ai_recommendations WHERE project_id = ? ORDER BY FIELD(priority,\'critical\',\'high\',\'medium\',\'low\'), created_at DESC', [projectId]);
    return res.json({ success: true, count: rows.length, recommendations: rows });
  } catch (error) { console.error(error); return fail(res, 500, 'Failed to load recommendations'); }
}

async function createRecommendation(req, res) {
  try {
    const projectId = Number(req.params.projectId);
    if (!await getOwnedProject(projectId, req.user.userId)) return fail(res, 404, 'Project not found');
    const { source_type, category, title, recommendation, priority, evidence_json } = req.body || {};
    if (!category || !title || !recommendation) return fail(res, 400, 'category, title and recommendation are required');
    const [result] = await db.execute('INSERT INTO seo_ai_recommendations (project_id,source_type,category,title,recommendation,priority,evidence_json) VALUES (?,?,?,?,?,?,?)', [projectId, source_type || 'manual', category, title, recommendation, priority || 'medium', evidence_json ? JSON.stringify(evidence_json) : null]);
    return res.status(201).json({ success: true, id: result.insertId });
  } catch (error) { console.error(error); return fail(res, 500, 'Failed to create recommendation'); }
}

async function listReports(req, res) {
  try {
    const projectId = Number(req.params.projectId);
    if (!await getOwnedProject(projectId, req.user.userId)) return fail(res, 404, 'Project not found');
    const [rows] = await db.execute('SELECT id, report_name, report_type, date_from, date_to, status, file_path, created_at FROM seo_reports WHERE project_id = ? ORDER BY created_at DESC', [projectId]);
    return res.json({ success: true, count: rows.length, reports: rows });
  } catch (error) { console.error(error); return fail(res, 500, 'Failed to load reports'); }
}

async function createReport(req, res) {
  try {
    const projectId = Number(req.params.projectId);
    if (!await getOwnedProject(projectId, req.user.userId)) return fail(res, 404, 'Project not found');
    const { report_name, report_type, date_from, date_to } = req.body || {};
    if (!report_name) return fail(res, 400, 'report_name is required');
    const [result] = await db.execute('INSERT INTO seo_reports (project_id,report_name,report_type,date_from,date_to,status) VALUES (?,?,?,?,?,\'queued\')', [projectId, report_name, report_type || 'overview', date_from || null, date_to || null]);
    return res.status(201).json({ success: true, id: result.insertId, status: 'queued', message: 'Report queued for generation' });
  } catch (error) { console.error(error); return fail(res, 500, 'Failed to queue report'); }
}

module.exports = {
  keywords, overview, listConnections, upsertIntegration, upsertSocial, listContent, createContent, listRecommendations, createRecommendation, listReports, createReport };
