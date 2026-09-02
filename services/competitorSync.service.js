const db = require('../config/database');
const dataForSeo = require('./dataforseo.service');

async function ensureSyncTable() {
  await db.query(`CREATE TABLE IF NOT EXISTS competitor_data_syncs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    project_id BIGINT UNSIGNED NOT NULL,
    competitor_id BIGINT UNSIGNED NULL,
    provider VARCHAR(50) NOT NULL,
    sync_type ENUM('keywords','backlinks','all') NOT NULL,
    status ENUM('running','success','failed') NOT NULL,
    items_synced INT DEFAULT 0,
    api_cost DECIMAL(12,6) DEFAULT 0,
    message VARCHAR(1000) NULL,
    started_at DATETIME NOT NULL,
    finished_at DATETIME NULL,
    INDEX idx_comp_sync_project (project_id, started_at),
    INDEX idx_comp_sync_competitor (competitor_id, started_at)
  ) ENGINE=InnoDB`);
}

function parseLimit(value, fallback = 100) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(1, Math.min(Math.floor(n), 1000)) : fallback;
}

async function syncCompetitor({ userId, projectId, competitorId, type = 'all', locationName = 'India', languageName = 'English', limit = 100 }) {
  if (!dataForSeo.credentialsConfigured()) {
    const e = new Error('DataForSEO is not configured. Add DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD to the backend environment.');
    e.code = 'DATAFORSEO_NOT_CONFIGURED';
    throw e;
  }
  await ensureSyncTable();
  const [projects] = await db.execute('SELECT id,website_url,domain FROM seo_projects WHERE id=? AND user_id=?', [projectId, userId]);
  if (!projects.length) { const e = new Error('Project not found'); e.statusCode = 404; throw e; }
  const project = projects[0];
  let sql = 'SELECT id,competitor_domain FROM competitors WHERE project_id=?';
  const params = [projectId];
  if (competitorId) { sql += ' AND id=?'; params.push(competitorId); }
  const [competitors] = await db.execute(sql, params);
  if (!competitors.length) { const e = new Error('No tracked competitor found'); e.statusCode = 404; throw e; }

  const results = [];
  for (const competitor of competitors) {
    const started = new Date();
    const [run] = await db.execute(`INSERT INTO competitor_data_syncs(project_id,competitor_id,provider,sync_type,status,started_at) VALUES(?,?,?,?,?,?)`, [projectId, competitor.id, 'dataforseo', type, 'running', started]);
    let synced = 0; let cost = 0;
    try {
      if (type === 'keywords' || type === 'all') {
        const data = await dataForSeo.getRankedKeywords(competitor.competitor_domain, { location_name: locationName, language_name: languageName, limit: parseLimit(limit) });
        await db.execute('DELETE FROM competitor_keywords WHERE competitor_id=? AND source=?', [competitor.id, 'dataforseo']);
        for (const item of data.items) {
          await db.execute(`INSERT INTO competitor_keywords(competitor_id,keyword,ranking_position,search_volume,ranking_url,traffic_estimate,difficulty,source,checked_at) VALUES(?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE ranking_position=VALUES(ranking_position),search_volume=VALUES(search_volume),ranking_url=VALUES(ranking_url),traffic_estimate=VALUES(traffic_estimate),difficulty=VALUES(difficulty),source=VALUES(source),checked_at=VALUES(checked_at)`, [competitor.id, item.keyword, item.ranking_position, item.search_volume, item.ranking_url, item.traffic_estimate, item.difficulty, 'dataforseo', item.checked_at]);
        }
        synced += data.items.length; cost += data.cost;
      }
      if (type === 'backlinks' || type === 'all') {
        const data = await dataForSeo.getBacklinks(competitor.competitor_domain, { limit: parseLimit(limit) });
        await db.execute('DELETE FROM competitor_backlinks WHERE competitor_id=? AND source=?', [competitor.id, 'dataforseo']);
        for (const item of data.items) {
          await db.execute(`INSERT INTO competitor_backlinks(competitor_id,source_url,target_url,anchor_text,domain_authority,status,first_seen_at,last_seen_at,source) VALUES(?,?,?,?,?,?,?,?,?)`, [competitor.id, item.source_url, item.target_url, item.anchor_text, item.domain_authority, item.status, item.first_seen_at, item.last_seen_at, 'dataforseo']);
        }
        synced += data.items.length; cost += data.cost;
      }
      await db.execute(`UPDATE competitor_data_syncs SET status='success',items_synced=?,api_cost=?,message=?,finished_at=? WHERE id=?`, [synced, cost, `Synced ${synced} items from DataForSEO`, new Date(), run.insertId]);
      results.push({ competitor_id: competitor.id, domain: competitor.competitor_domain, status: 'success', items_synced: synced, api_cost: cost });
    } catch (error) {
      await db.execute(`UPDATE competitor_data_syncs SET status='failed',items_synced=?,api_cost=?,message=?,finished_at=? WHERE id=?`, [synced, cost, String(error.message || 'Provider error').slice(0, 1000), new Date(), run.insertId]);
      results.push({ competitor_id: competitor.id, domain: competitor.competitor_domain, status: 'failed', items_synced: synced, api_cost: cost, message: error.message });
    }
  }
  return { provider: 'dataforseo', type, results, success: results.some(x => x.status === 'success'), total_items: results.reduce((a,x)=>a+x.items_synced,0), total_cost: results.reduce((a,x)=>a+x.api_cost,0) };
}

async function getProviderStatus(projectId, userId) {
  await ensureSyncTable();
  const [rows] = await db.execute(`SELECT s.* FROM competitor_data_syncs s JOIN seo_projects p ON p.id=s.project_id WHERE s.project_id=? AND p.user_id=? ORDER BY s.started_at DESC LIMIT 20`, [projectId, userId]);
  return { configured: dataForSeo.credentialsConfigured(), provider: 'dataforseo', runs: rows };
}

module.exports = { syncCompetitor, getProviderStatus, ensureSyncTable };
