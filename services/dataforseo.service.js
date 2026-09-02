const axios = require('axios');

const BASE_URL = 'https://api.dataforseo.com/v3';

function credentialsConfigured() {
  return Boolean(String(process.env.DATAFORSEO_LOGIN || '').trim() && String(process.env.DATAFORSEO_PASSWORD || '').trim());
}

function authConfig() {
  if (!credentialsConfigured()) {
    const err = new Error('DataForSEO credentials are not configured');
    err.code = 'DATAFORSEO_NOT_CONFIGURED';
    throw err;
  }
  return {
    auth: {
      username: process.env.DATAFORSEO_LOGIN,
      password: process.env.DATAFORSEO_PASSWORD,
    },
    headers: { 'Content-Type': 'application/json' },
    timeout: Number(process.env.DATAFORSEO_TIMEOUT_MS || 60000),
  };
}

async function post(path, task) {
  const response = await axios.post(`${BASE_URL}${path}`, [task], authConfig());
  const body = response.data;
  if (body?.status_code !== 20000) {
    const error = new Error(body?.status_message || 'DataForSEO request failed');
    error.providerStatusCode = body?.status_code;
    throw error;
  }
  const taskResult = body?.tasks?.[0];
  if (!taskResult || taskResult.status_code !== 20000) {
    const error = new Error(taskResult?.status_message || 'DataForSEO task failed');
    error.providerStatusCode = taskResult?.status_code;
    throw error;
  }
  return taskResult;
}

function normalizeDomain(value) {
  return String(value || '').trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].toLowerCase();
}

function extractUrl(item) {
  return item?.ranked_serp_element?.serp_item?.url ||
    item?.ranked_serp_element?.serp_item?.relative_url ||
    item?.first_domain_serp_element?.url || null;
}

function extractPosition(item) {
  const s = item?.ranked_serp_element?.serp_item;
  return s?.rank_absolute ?? s?.rank_group ?? item?.ranked_serp_element?.rank_absolute ?? null;
}

async function getRankedKeywords(domain, options = {}) {
  const task = {
    target: normalizeDomain(domain),
    location_name: options.location_name || 'India',
    language_name: options.language_name || 'English',
    item_types: ['organic'],
    limit: Math.min(Number(options.limit || 100), 1000),
    offset: 0,
    order_by: ['keyword_data.keyword_info.search_volume,desc'],
    filters: [['ranked_serp_element.serp_item.type', '=', 'organic']],
    tag: `rkveda-${normalizeDomain(domain)}`,
  };
  const result = await post('/dataforseo_labs/google/ranked_keywords/live', task);
  const container = result.result?.[0] || {};
  const items = container.items || [];
  return {
    cost: Number(result.cost || 0),
    total: Number(container.total_count || items.length),
    items: items.map((item) => {
      const info = item.keyword_data?.keyword_info || {};
      const serp = item.ranked_serp_element?.serp_item || {};
      return {
        keyword: item.keyword_data?.keyword || '',
        ranking_position: extractPosition(item),
        search_volume: info.search_volume ?? null,
        ranking_url: extractUrl(item),
        traffic_estimate: item.ranked_serp_element?.etv ?? serp.etv ?? null,
        difficulty: item.keyword_data?.keyword_properties?.keyword_difficulty ?? info.keyword_difficulty ?? null,
        checked_at: item.keyword_data?.keyword_info?.last_updated_time || new Date().toISOString(),
      };
    }).filter(x => x.keyword),
  };
}

async function getBacklinks(domain, options = {}) {
  const task = {
    target: normalizeDomain(domain),
    mode: options.mode || 'one_per_domain',
    backlinks_status_type: options.backlinks_status_type || 'live',
    exclude_internal_backlinks: true,
    rank_scale: 'one_hundred',
    limit: Math.min(Number(options.limit || 100), 1000),
    order_by: ['rank,desc'],
    tag: `rkveda-${normalizeDomain(domain)}`,
  };
  const result = await post('/backlinks/backlinks/live', task);
  const container = result.result?.[0] || {};
  const items = container.items || [];
  return {
    cost: Number(result.cost || 0),
    total: Number(container.total_count || items.length),
    items: items.map((item) => ({
      source_url: item.url_from || item.url_from_https || '',
      target_url: item.url_to || item.url_to_https || null,
      anchor_text: item.anchor || item.alt || null,
      domain_authority: item.domain_from_rank ?? null,
      status: item.is_lost ? 'lost' : (item.is_new ? 'new' : 'active'),
      first_seen_at: item.first_seen || null,
      last_seen_at: item.last_seen || null,
      provider_rank: item.rank ?? null,
      referring_domain: normalizeDomain(item.domain_from || ''),
      dofollow: Boolean(item.dofollow),
      spam_score: item.backlink_spam_score ?? null,
    })).filter(x => x.source_url),
  };
}

async function getDomainIntersection(target1, target2, options = {}) {
  const task = {
    target1: normalizeDomain(target1),
    target2: normalizeDomain(target2),
    location_name: options.location_name || 'India',
    language_name: options.language_name || 'English',
    intersections: true,
    item_types: ['organic'],
    limit: Math.min(Number(options.limit || 100), 1000),
    order_by: ['keyword_data.keyword_info.search_volume,desc'],
  };
  const result = await post('/dataforseo_labs/google/domain_intersection/live', task);
  const container = result.result?.[0] || {};
  return {
    cost: Number(result.cost || 0),
    total: Number(container.total_count || 0),
    items: container.items || [],
  };
}

module.exports = { credentialsConfigured, getRankedKeywords, getBacklinks, getDomainIntersection, normalizeDomain };
