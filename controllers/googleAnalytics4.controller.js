const crypto = require('crypto');
const db = require('../config/database');
const {
  getAuthorizationUrl, exchangeCode, findPropertyForProject, saveConnection,
  getConnection, getConnectionTokens, getOverviewReport, getSummaryReport, getBreakdownReport,
  getRealtime, syncDailyHistory,
} = require('../services/googleAnalytics4.service');

function getProject(projectId, userId) {
  return db.execute('SELECT id, project_name, website_url, domain FROM seo_projects WHERE id = ? AND user_id = ? LIMIT 1', [projectId, userId]).then(([rows]) => rows[0] || null);
}
function state(projectId, userId) {
  const payload = Buffer.from(JSON.stringify({ type: 'ga4', projectId: String(projectId), userId: String(userId), ts: Date.now(), nonce: crypto.randomBytes(16).toString('hex') })).toString('base64url');
  const secret = process.env.JWT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  return `${payload}.${crypto.createHmac('sha256', secret).update(payload).digest('base64url')}`;
}
function redirect(projectId, params = {}) {
  const base = process.env.FRONTEND_URL || 'https://seo.rkveda.in';
  const url = new URL(`/projects/${projectId}/ga4`, base);
  Object.entries(params).forEach(([k,v]) => { if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v)); });
  return url.toString();
}

async function connect(req, res) {
  try {
    const projectId = Number(req.params.projectId);
    const project = await getProject(projectId, req.user.userId);
    if (!project) return res.status(404).json({ success:false, message:'Project not found' });
    return res.json({ success:true, authorizationUrl:getAuthorizationUrl(state(projectId, req.user.userId)) });
  } catch (error) {
    console.error('GA4 CONNECT ERROR:', error);
    return res.status(500).json({ success:false, message:'Failed to create Google Analytics authorization URL', error:error.message });
  }
}

async function callback(req, res, stateData) {
  const projectId = Number(stateData?.projectId);
  try {
    const project = await getProject(projectId, stateData.userId);
    if (!project) return res.redirect(redirect(projectId, { ga4_error:'Project not found' }));
    if (req.query.error) return res.redirect(redirect(projectId, { ga4_error:`Google authorization failed: ${req.query.error}` }));
    if (!req.query.code) return res.redirect(redirect(projectId, { ga4_error:'Authorization code missing' }));

    const tokens = await exchangeCode(req.query.code);
    const { matched } = await findPropertyForProject(tokens, project);
    if (matched.length === 0) {
      return res.redirect(redirect(projectId, { ga4_error:`No Google Analytics 4 property matched ${project.website_url}. Make sure this Google account has access and the GA4 web stream URL matches the project domain.` }));
    }
    if (matched.length > 1) {
      // Exact domain matching should normally yield one property. Do not silently choose an ambiguous property.
      return res.redirect(redirect(projectId, { ga4_error:`Multiple GA4 properties match ${project.website_url}. Please keep one matching web stream or select the property manually in Google Analytics.` }));
    }
    const property = matched[0];
    await saveConnection({ projectId, propertyId:property.propertyId, propertyName:property.propertyName, accountId:property.accountId, accountName:property.accountName, accessToken:tokens.access_token, refreshToken:tokens.refresh_token || null, tokenExpiry:tokens.expiry_date ? new Date(tokens.expiry_date) : null });
    return res.redirect(redirect(projectId, { ga4_connected:'1' }));
  } catch (error) {
    console.error('GA4 CALLBACK ERROR:', error);
    return res.redirect(redirect(projectId, { ga4_error:error.message || 'Google Analytics 4 connection failed' }));
  }
}

async function status(req,res) {
  try {
    const projectId = Number(req.params.projectId);
    if (!await getProject(projectId, req.user.userId)) return res.status(404).json({success:false,message:'Project not found'});
    const connection = await getConnection(projectId);
    return res.json({ success:true, connected:connection?.status === 'connected', connection: connection ? { id:connection.id, project_id:connection.project_id, property_id:connection.property_id, property_name:connection.property_name, account_name:connection.account_name, status:connection.status, last_synced_at:connection.last_synced_at } : null });
  } catch(error) { console.error('GA4 STATUS ERROR:',error); return res.status(500).json({success:false,message:'Unable to load GA4 status'}); }
}

function range(req) {
  const end = req.query.endDate || new Date(Date.now() - 86400000).toISOString().slice(0,10);
  const start = req.query.startDate || new Date(new Date(`${end}T00:00:00Z`).getTime() - 29*86400000).toISOString().slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) throw new Error('Invalid startDate or endDate');
  return {startDate:start,endDate:end};
}

async function performance(req,res) {
  try {
    const projectId = Number(req.params.projectId);
    if (!await getProject(projectId, req.user.userId)) return res.status(404).json({success:false,message:'Project not found'});
    const connection = await getConnection(projectId);
    if (!connection || connection.status !== 'connected') return res.status(400).json({success:false,message:'Google Analytics 4 is not connected'});
    const {startDate,endDate}=range(req);
    const {tokens}=await getConnectionTokens(projectId);
    const overview=await getOverviewReport(tokens,connection.property_id,startDate,endDate);
    const summary=overview.rows.reduce((a,r)=>{ for(const k of ['activeUsers','sessions','engagedSessions','screenPageViews','eventCount','keyEvents','totalRevenue']) a[k]+=Number(r[k]||0); a.engagementRateWeighted += Number(r.engagementRate||0)*Number(r.sessions||0); a.bounceRateWeighted += Number(r.bounceRate||0)*Number(r.sessions||0); a.sessionWeight+=Number(r.sessions||0); return a; },{activeUsers:0,sessions:0,engagedSessions:0,screenPageViews:0,eventCount:0,keyEvents:0,totalRevenue:0,engagementRateWeighted:0,bounceRateWeighted:0,sessionWeight:0});
    const daily=overview.rows.map(r=>({...r,date:r.date.replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3')}));
    const pages=await getBreakdownReport(tokens,connection.property_id,startDate,endDate,'pagePath',['sessions','activeUsers','screenPageViews','engagementRate'],100);
    const channels=await getBreakdownReport(tokens,connection.property_id,startDate,endDate,'sessionDefaultChannelGroup',['sessions','activeUsers','engagementRate'],50);
    const countries=await getBreakdownReport(tokens,connection.property_id,startDate,endDate,'country',['sessions','activeUsers','engagementRate'],50);
    const devices=await getBreakdownReport(tokens,connection.property_id,startDate,endDate,'deviceCategory',['sessions','activeUsers','engagementRate'],20);
    let realtime=null; try { realtime=await getRealtime(tokens,connection.property_id); } catch(e) { console.warn('GA4 realtime unavailable:',e.message); }
    return res.json({success:true,projectId,propertyId:connection.property_id,propertyName:connection.property_name,startDate,endDate,summary:{activeUsers:summary.activeUsers,sessions:summary.sessions,engagedSessions:summary.engagedSessions,engagementRate:summary.engagementRate,bounceRate:summary.bounceRate,screenPageViews:summary.screenPageViews,eventCount:summary.eventCount,keyEvents:summary.keyEvents,totalRevenue:summary.totalRevenue},daily,pages,channels,countries,devices,realtime});
  } catch(error) { console.error('GA4 PERFORMANCE ERROR:',error); return res.status(500).json({success:false,message:error.message||'Unable to load GA4 performance data',googleReason:error.errors?.[0]?.reason||error.response?.data?.error?.status||null}); }
}

async function sync(req,res) {
  try {
    const projectId=Number(req.params.projectId); if(!await getProject(projectId,req.user.userId)) return res.status(404).json({success:false,message:'Project not found'});
    const {startDate,endDate}=range(req); const result=await syncDailyHistory(projectId,startDate,endDate); return res.json({success:true,startDate,endDate,savedDays:result.savedDays});
  } catch(error){console.error('GA4 SYNC ERROR:',error);return res.status(500).json({success:false,message:error.message||'Unable to sync GA4 history',googleReason:error.errors?.[0]?.reason||error.response?.data?.error?.status||null});}
}

async function history(req,res){
  try { const projectId=Number(req.params.projectId); if(!await getProject(projectId,req.user.userId))return res.status(404).json({success:false,message:'Project not found'}); const {startDate,endDate}=range(req); const [rows]=await db.execute('SELECT metric_date,active_users,sessions,engaged_sessions,engagement_rate,bounce_rate,screen_page_views,event_count,key_events,total_revenue FROM ga4_daily_metrics WHERE project_id = ? AND metric_date BETWEEN ? AND ? ORDER BY metric_date',[projectId,startDate,endDate]); return res.json({success:true,startDate,endDate,rows}); }
  catch(error){console.error('GA4 HISTORY ERROR:',error);return res.status(500).json({success:false,message:'Unable to load GA4 history'});}
}

module.exports={connect,callback,status,performance,sync,history};
