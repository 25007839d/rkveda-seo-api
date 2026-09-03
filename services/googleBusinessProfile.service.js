const axios = require('axios');
const { google } = require('googleapis');
const db = require('../config/database');

const SCOPE = 'https://www.googleapis.com/auth/business.manage';
const ACCOUNT_API = 'https://mybusinessaccountmanagement.googleapis.com/v1';
const INFO_API = 'https://mybusinessbusinessinformation.googleapis.com/v1';
const PERF_API = 'https://businessprofileperformance.googleapis.com/v1';
const REVIEWS_API = 'https://mybusiness.googleapis.com/v4';

async function ensureTables() {
  await db.query(`CREATE TABLE IF NOT EXISTS gbp_locations (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    project_id BIGINT UNSIGNED NOT NULL,
    account_id VARCHAR(255) NOT NULL,
    location_id VARCHAR(255) NOT NULL,
    location_name VARCHAR(255) NULL,
    title VARCHAR(255) NULL,
    website_uri VARCHAR(1000) NULL,
    phone VARCHAR(100) NULL,
    address_text TEXT NULL,
    category VARCHAR(255) NULL,
    status VARCHAR(100) NULL,
    metadata_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_gbp_location_project (project_id, location_id),
    KEY idx_gbp_project (project_id),
    CONSTRAINT fk_gbp_locations_project FOREIGN KEY (project_id) REFERENCES seo_projects(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
  await db.query(`CREATE TABLE IF NOT EXISTS gbp_reviews (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    project_id BIGINT UNSIGNED NOT NULL,
    location_id VARCHAR(255) NOT NULL,
    review_id VARCHAR(255) NOT NULL,
    reviewer_name VARCHAR(255) NULL,
    star_rating VARCHAR(30) NULL,
    comment TEXT NULL,
    create_time DATETIME NULL,
    update_time DATETIME NULL,
    has_reply TINYINT(1) NOT NULL DEFAULT 0,
    raw_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_gbp_review_project (project_id, review_id),
    KEY idx_gbp_reviews_location (project_id, location_id),
    CONSTRAINT fk_gbp_reviews_project FOREIGN KEY (project_id) REFERENCES seo_projects(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
  await db.query(`CREATE TABLE IF NOT EXISTS gbp_metrics_daily (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    project_id BIGINT UNSIGNED NOT NULL,
    location_id VARCHAR(255) NOT NULL,
    metric_date DATE NOT NULL,
    metric VARCHAR(100) NOT NULL,
    value DECIMAL(20,4) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_gbp_metric (project_id,location_id,metric_date,metric),
    KEY idx_gbp_metrics_project_date (project_id,metric_date),
    CONSTRAINT fk_gbp_metrics_project FOREIGN KEY (project_id) REFERENCES seo_projects(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
}

function oauthClient() {
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_GBP_REDIRECT_URI || process.env.GOOGLE_REDIRECT_URI);
}
function authorizationUrl(state) {
  return oauthClient().generateAuthUrl({ access_type:'offline', prompt:'consent', include_granted_scopes:true, scope:[SCOPE], state });
}
async function exchangeCode(code) { const { tokens } = await oauthClient().getToken(code); return tokens; }
function client(connection) {
  const c=oauthClient(); c.setCredentials({access_token:connection.access_token,refresh_token:connection.refresh_token||undefined,expiry_date:connection.token_expiry?new Date(connection.token_expiry).getTime():undefined}); return c;
}
async function token(connection) { const c=client(connection); const r=await c.getAccessToken(); return r.token || connection.access_token; }
async function request(connection, base, path, params={}) { const access=await token(connection); const qs=new URLSearchParams(); Object.entries(params||{}).forEach(([k,v])=>{ if(v===undefined||v===null||v==='') return; if(Array.isArray(v)) v.forEach(item=>qs.append(k,item)); else qs.append(k,String(v)); }); const url=`${base}/${path.replace(/^\//,'')}${qs.toString()?`?${qs.toString()}`:''}`; return axios.get(url,{headers:{Authorization:`Bearer ${access}`},timeout:30000}); }

async function saveConnection({projectId,accessToken,refreshToken=null,tokenExpiry=null,accountId=null,locationId=null,locationName=null,status='connected'}) {
  await db.query(`CREATE TABLE IF NOT EXISTS gbp_connections (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, project_id BIGINT UNSIGNED NOT NULL, account_id VARCHAR(255) NULL, location_id VARCHAR(255) NULL, location_name VARCHAR(255) NULL, access_token TEXT NULL, refresh_token TEXT NULL, token_expiry DATETIME NULL, status ENUM('connected','disconnected','error','pending') NOT NULL DEFAULT 'pending', last_synced_at DATETIME NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY uq_gbp_project(project_id), CONSTRAINT fk_gbp_project FOREIGN KEY(project_id) REFERENCES seo_projects(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
  await db.execute(`INSERT INTO gbp_connections (project_id,account_id,location_id,location_name,access_token,refresh_token,token_expiry,status) VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE account_id=COALESCE(VALUES(account_id),account_id),location_id=COALESCE(VALUES(location_id),location_id),location_name=COALESCE(VALUES(location_name),location_name),access_token=VALUES(access_token),refresh_token=COALESCE(VALUES(refresh_token),refresh_token),token_expiry=VALUES(token_expiry),status=VALUES(status),updated_at=CURRENT_TIMESTAMP`, [projectId,accountId,locationId,locationName,accessToken,refreshToken,tokenExpiry,status]);
}
async function getConnection(projectId,userId){ await db.query(`CREATE TABLE IF NOT EXISTS gbp_connections (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, project_id BIGINT UNSIGNED NOT NULL, account_id VARCHAR(255) NULL, location_id VARCHAR(255) NULL, location_name VARCHAR(255) NULL, access_token TEXT NULL, refresh_token TEXT NULL, token_expiry DATETIME NULL, status ENUM('connected','disconnected','error','pending') NOT NULL DEFAULT 'pending', last_synced_at DATETIME NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY uq_gbp_project(project_id), CONSTRAINT fk_gbp_project FOREIGN KEY(project_id) REFERENCES seo_projects(id) ON DELETE CASCADE) ENGINE=InnoDB`); const [rows]=await db.execute(`SELECT c.* FROM gbp_connections c JOIN seo_projects p ON p.id=c.project_id WHERE c.project_id=? AND p.user_id=? LIMIT 1`,[projectId,userId]); return rows[0]||null; }
async function listAccounts(connection){ let out=[], pageToken=''; do { const r=await request(connection,ACCOUNT_API,'accounts',{pageSize:100,pageToken:pageToken||undefined}); out.push(...(r.data.accounts||[])); pageToken=r.data.nextPageToken||''; } while(pageToken); return out; }
async function listLocations(connection,accountName){ let out=[], pageToken=''; do { const r=await request(connection,INFO_API,`${accountName}/locations`,{pageSize:100,pageToken:pageToken||undefined,readMask:'name,title,websiteUri,phoneNumbers,categories,storefrontAddress,openInfo,metadata'}); out.push(...(r.data.locations||[])); pageToken=r.data.nextPageToken||''; } while(pageToken); return out; }
async function getLocation(connection,locationName){ const r=await request(connection,INFO_API,locationName,{readMask:'name,title,websiteUri,phoneNumbers,categories,storefrontAddress,regularHours,openInfo,metadata,profile'}); return r.data; }
function dateObj(s){return {year:Number(s.slice(0,4)),month:Number(s.slice(5,7)),day:Number(s.slice(8,10))};}
async function performance(connection,locationName,startDate,endDate){ const metrics=['WEBSITE_CLICKS','CALL_CLICKS','BUSINESS_DIRECTION_REQUESTS','BUSINESS_IMPRESSIONS_DESKTOP_MAPS','BUSINESS_IMPRESSIONS_DESKTOP_SEARCH','BUSINESS_IMPRESSIONS_MOBILE_MAPS','BUSINESS_IMPRESSIONS_MOBILE_SEARCH']; const params={dailyMetrics:metrics}; metrics.forEach((m)=>{}); params['dailyRange.start_date.year']=dateObj(startDate).year; params['dailyRange.start_date.month']=dateObj(startDate).month; params['dailyRange.start_date.day']=dateObj(startDate).day; params['dailyRange.end_date.year']=dateObj(endDate).year; params['dailyRange.end_date.month']=dateObj(endDate).month; params['dailyRange.end_date.day']=dateObj(endDate).day; const r=await request(connection,PERF_API,`${locationName}:fetchMultiDailyMetricsTimeSeries`,params); return r.data; }
async function reviews(connection,accountId,locationId){ let out=[],pageToken=''; do { const r=await request(connection,REVIEWS_API,`accounts/${accountId}/locations/${locationId}/reviews`,{pageSize:50,pageToken:pageToken||undefined,orderBy:'updateTime desc'}); out.push(...(r.data.reviews||[])); pageToken=r.data.nextPageToken||''; } while(pageToken); return out; }
async function selectLocation(projectId,userId,location){ const c=await getConnection(projectId,userId); if(!c) throw new Error('Google Business Profile is not connected.'); await db.execute(`UPDATE gbp_connections SET account_id=?,location_id=?,location_name=?,status='connected',updated_at=CURRENT_TIMESTAMP WHERE project_id=?`,[location.accountId,location.locationId,location.title||location.locationName,projectId]); }
async function syncLocation(projectId,userId,connection,location,startDate,endDate){ await ensureTables(); const loc=await getLocation(connection,location.name); const address=(loc.storefrontAddress?.addressLines||[]).join(', '); const category=loc.categories?.primaryCategory?.displayName||''; await db.execute(`INSERT INTO gbp_locations(project_id,account_id,location_id,location_name,title,website_uri,phone,address_text,category,status,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE location_name=VALUES(location_name),title=VALUES(title),website_uri=VALUES(website_uri),phone=VALUES(phone),address_text=VALUES(address_text),category=VALUES(category),status=VALUES(status),metadata_json=VALUES(metadata_json)`,[projectId,connection.account_id,location.name.replace(/^locations\//,''),location.name,loc.title||'',loc.websiteUri||'',loc.phoneNumbers?.primaryPhone||'',address,category,loc.openInfo?.status||'',JSON.stringify(loc.metadata||{})]); const p=await performance(connection,location.name,startDate,endDate); const series=p.multiDailyMetricTimeSeries?.[0]?.dailyMetricTimeSeries||[]; for(const item of series){ const metric=item.dailyMetric; for(const point of item.timeSeries?.datedValues||[]){ const d=point.date; const date=`${d.year}-${String(d.month).padStart(2,'0')}-${String(d.day).padStart(2,'0')}`; await db.execute(`INSERT INTO gbp_metrics_daily(project_id,location_id,metric_date,metric,value) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE value=VALUES(value)`,[projectId,location.name.replace(/^locations\//,''),date,metric,Number(point.value||0)]); } } try { const rs=await reviews(connection,connection.account_id,connection.location_id); for(const rv of rs){ const reviewId=rv.reviewId||rv.name?.split('/').pop(); if(!reviewId) continue; await db.execute(`INSERT INTO gbp_reviews(project_id,location_id,review_id,reviewer_name,star_rating,comment,create_time,update_time,has_reply,raw_json) VALUES(?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE reviewer_name=VALUES(reviewer_name),star_rating=VALUES(star_rating),comment=VALUES(comment),create_time=VALUES(create_time),update_time=VALUES(update_time),has_reply=VALUES(has_reply),raw_json=VALUES(raw_json)`,[projectId,connection.location_id,reviewId,rv.reviewer?.displayName||'',rv.starRating||'',rv.comment||'',rv.createTime?new Date(rv.createTime):null,rv.updateTime?new Date(rv.updateTime):null,rv.reviewReply?1:0,JSON.stringify(rv)]); } } catch(e){ console.warn('GBP reviews sync:',e.message); } await db.execute(`UPDATE gbp_connections SET last_synced_at=CURRENT_TIMESTAMP,status='connected' WHERE project_id=?`,[projectId]); return {location:loc,performance:p}; }
module.exports={SCOPE,ensureTables,authorizationUrl,exchangeCode,saveConnection,getConnection,listAccounts,listLocations,getLocation,selectLocation,performance,reviews,syncLocation};
