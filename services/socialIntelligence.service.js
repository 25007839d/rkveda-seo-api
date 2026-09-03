const { google } = require('googleapis');
const axios = require('axios');
const crypto = require('crypto');
const db = require('../config/database');

const META_VERSION = process.env.META_GRAPH_VERSION || 'v26.0';
const PLATFORMS = ['facebook','instagram','linkedin','youtube','x','tiktok','other'];

async function ensureTables() {
  await db.query(`CREATE TABLE IF NOT EXISTS social_connections (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    project_id BIGINT UNSIGNED NOT NULL,
    platform ENUM('facebook','instagram','linkedin','youtube','x','tiktok','other') NOT NULL,
    account_id VARCHAR(255) NULL,
    account_name VARCHAR(255) NULL,
    access_token TEXT NULL,
    refresh_token TEXT NULL,
    token_expiry DATETIME NULL,
    status ENUM('connected','disconnected','error') NOT NULL DEFAULT 'connected',
    last_synced_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_social_project_platform (project_id, platform),
    CONSTRAINT fk_social_project FOREIGN KEY (project_id) REFERENCES seo_projects(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
}

function frontendUrl(projectId, params = {}) {
  const base = process.env.FRONTEND_URL || 'http://localhost:5173';
  const url = new URL(`/projects/${projectId}/seo/social`, base);
  Object.entries(params).forEach(([k,v]) => { if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v)); });
  return url.toString();
}

function state(projectId, userId, platform) {
  const payload = Buffer.from(JSON.stringify({ projectId: String(projectId), userId: String(userId), platform, ts: Date.now(), nonce: crypto.randomBytes(16).toString('hex') })).toString('base64url');
  const secret = process.env.JWT_SECRET || process.env.GOOGLE_CLIENT_SECRET || process.env.SOCIAL_OAUTH_SECRET;
  if (!secret) throw new Error('JWT_SECRET or SOCIAL_OAUTH_SECRET is required for social OAuth.');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function parseState(raw) {
  const [payload, sig] = String(raw || '').split('.');
  if (!payload || !sig) throw new Error('Invalid social OAuth state');
  const secret = process.env.JWT_SECRET || process.env.GOOGLE_CLIENT_SECRET || process.env.SOCIAL_OAUTH_SECRET;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new Error('Invalid social OAuth state signature');
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
  if (!data.projectId || !data.userId || !data.platform || Date.now() - Number(data.ts) > 10 * 60 * 1000) throw new Error('Social OAuth state expired');
  return data;
}

function googleClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_SOCIAL_REDIRECT_URI || process.env.GOOGLE_YOUTUBE_REDIRECT_URI || process.env.GOOGLE_REDIRECT_URI
  );
}

function providerConfig(platform) {
  const configs = {
    facebook: { label:'Facebook', provider:'meta', enabled:true, configured:!!(process.env.META_APP_ID && process.env.META_APP_SECRET && process.env.META_REDIRECT_URI) },
    instagram: { label:'Instagram', provider:'meta', enabled:true, configured:!!(process.env.META_APP_ID && process.env.META_APP_SECRET && process.env.META_REDIRECT_URI) },
    youtube: { label:'YouTube', provider:'google', enabled:true, configured:!!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && (process.env.GOOGLE_SOCIAL_REDIRECT_URI || process.env.GOOGLE_YOUTUBE_REDIRECT_URI || process.env.GOOGLE_REDIRECT_URI)) },
    linkedin: { label:'LinkedIn', provider:'linkedin', enabled:false, configured:!!(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET && process.env.LINKEDIN_REDIRECT_URI) },
    x: { label:'X', provider:'x', enabled:false, configured:!!(process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET && process.env.X_REDIRECT_URI) },
    tiktok: { label:'TikTok', provider:'tiktok', enabled:false, configured:!!(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET && process.env.TIKTOK_REDIRECT_URI) },
    other: { label:'Other', provider:'none', enabled:false, configured:false },
  };
  return configs[platform];
}

function authorizationUrl(platform, projectId, userId) {
  const cfg = providerConfig(platform);
  if (!cfg) throw new Error('Invalid platform');
  if (!cfg.configured) throw new Error(`${cfg.label} API is not configured. Add the provider OAuth environment variables first.`);
  const s = state(projectId, userId, platform);

  if (cfg.provider === 'meta') {
    const scopes = [
      'pages_show_list','pages_read_engagement','read_insights',
      'instagram_basic','instagram_manage_insights'
    ].join(',');
    const u = new URL(`https://www.facebook.com/${META_VERSION}/dialog/oauth`);
    u.searchParams.set('client_id', process.env.META_APP_ID);
    u.searchParams.set('redirect_uri', process.env.META_REDIRECT_URI);
    u.searchParams.set('state', s);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', scopes);
    return u.toString();
  }

  if (cfg.provider === 'google') {
    const c = googleClient();
    return c.generateAuthUrl({
      access_type:'offline', prompt:'consent', include_granted_scopes:true,
      scope:['https://www.googleapis.com/auth/youtube.readonly','https://www.googleapis.com/auth/yt-analytics.readonly'], state:s
    });
  }

  if (cfg.provider === 'tiktok') {
    const u = new URL('https://www.tiktok.com/v2/auth/authorize/');
    u.searchParams.set('client_key', process.env.TIKTOK_CLIENT_KEY);
    u.searchParams.set('redirect_uri', process.env.TIKTOK_REDIRECT_URI);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', 'user.info.basic,user.info.profile,user.info.stats,video.list');
    u.searchParams.set('state', s);
    return u.toString();
  }

  if (cfg.provider === 'linkedin') {
    const u = new URL('https://www.linkedin.com/oauth/v2/authorization');
    u.searchParams.set('response_type','code'); u.searchParams.set('client_id',process.env.LINKEDIN_CLIENT_ID);
    u.searchParams.set('redirect_uri',process.env.LINKEDIN_REDIRECT_URI);
    u.searchParams.set('scope','openid profile email r_organization_admin'); u.searchParams.set('state',s);
    return u.toString();
  }

  if (cfg.provider === 'x') {
    const u = new URL('https://twitter.com/i/oauth2/authorize');
    u.searchParams.set('response_type','code'); u.searchParams.set('client_id',process.env.X_CLIENT_ID);
    u.searchParams.set('redirect_uri',process.env.X_REDIRECT_URI);
    u.searchParams.set('scope','users.read tweet.read offline.access');
    u.searchParams.set('state',s); u.searchParams.set('code_challenge','challenge'); u.searchParams.set('code_challenge_method','plain');
    return u.toString();
  }
  throw new Error(`${cfg.label} connector is not enabled in this release.`);
}

async function getConnection(projectId, userId, platform) {
  await ensureTables();
  const [rows] = await db.execute(`SELECT c.* FROM social_connections c JOIN seo_projects p ON p.id=c.project_id WHERE c.project_id=? AND p.user_id=? AND c.platform=? LIMIT 1`, [projectId,userId,platform]);
  return rows[0] || null;
}

async function upsertConnection(data) {
  await ensureTables();
  await db.execute(`INSERT INTO social_connections(project_id,platform,account_id,account_name,access_token,refresh_token,token_expiry,status,last_synced_at)
    VALUES(?,?,?,?,?,?,?,'connected',NULL)
    ON DUPLICATE KEY UPDATE account_id=VALUES(account_id),account_name=VALUES(account_name),access_token=VALUES(access_token),refresh_token=COALESCE(VALUES(refresh_token),refresh_token),token_expiry=VALUES(token_expiry),status='connected',updated_at=CURRENT_TIMESTAMP`,
    [data.projectId,data.platform,data.accountId||null,data.accountName||null,data.accessToken||null,data.refreshToken||null,data.tokenExpiry||null]);
}

async function exchangeMetaCode(code) {
  const token = await axios.get(`https://graph.facebook.com/${META_VERSION}/oauth/access_token`, { params:{client_id:process.env.META_APP_ID,client_secret:process.env.META_APP_SECRET,redirect_uri:process.env.META_REDIRECT_URI,code} });
  const shortToken = token.data.access_token;
  const long = await axios.get(`https://graph.facebook.com/${META_VERSION}/oauth/access_token`, { params:{grant_type:'fb_exchange_token',client_id:process.env.META_APP_ID,client_secret:process.env.META_APP_SECRET,fb_exchange_token:shortToken} });
  return { accessToken: long.data.access_token || shortToken, expiresIn: Number(long.data.expires_in || 0) };
}

async function callback(code, data) {
  if (data.platform === 'youtube') {
    const c = googleClient(); const {tokens}=await c.getToken(code);
    await upsertConnection({projectId:data.projectId,platform:'youtube',accountId:null,accountName:null,accessToken:tokens.access_token,refreshToken:tokens.refresh_token,tokenExpiry:tokens.expiry_date ? new Date(tokens.expiry_date) : null});
    await syncYoutube(data.projectId,data.userId);
    return;
  }
  if (data.platform === 'facebook' || data.platform === 'instagram') {
    const t=await exchangeMetaCode(code);
    const r=await axios.get(`https://graph.facebook.com/${META_VERSION}/me/accounts`,{params:{fields:'id,name,access_token,instagram_business_account{id,username,name,followers_count,follows_count,media_count}',access_token:t.accessToken,limit:100}});
    const pages=r.data.data||[];
    if (!pages.length) throw new Error('No Facebook Pages were returned. The connected Meta account must manage a Facebook Page.');
    let selected=pages[0];
    if (data.platform==='instagram') {
      selected=pages.find(p=>p.instagram_business_account) || selected;
      if (!selected.instagram_business_account) throw new Error('No Instagram professional account linked to the managed Facebook Pages was found.');
    }
    const pageToken=selected.access_token || t.accessToken;
    await upsertConnection({projectId:data.projectId,platform:'facebook',accountId:selected.id,accountName:selected.name,accessToken:pageToken,tokenExpiry:t.expiresIn?new Date(Date.now()+t.expiresIn*1000):null});
    if(selected.instagram_business_account){
      const ig=selected.instagram_business_account;
      await upsertConnection({projectId:data.projectId,platform:'instagram',accountId:ig.id,accountName:ig.username||ig.name||'Instagram',accessToken:pageToken,tokenExpiry:t.expiresIn?new Date(Date.now()+t.expiresIn*1000):null});
    }
    await syncPlatform(data.projectId,data.userId,data.platform);
    return;
  }
  throw new Error(`${data.platform} callback is not implemented in this release.`);
}

async function saveProfile(projectId, platform, profile) {
  await db.execute(`INSERT INTO social_profiles(project_id,platform,handle,profile_url,followers,following,posts_count,verified,notes) VALUES(?,?,?,?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE handle=VALUES(handle),profile_url=VALUES(profile_url),followers=VALUES(followers),following=VALUES(following),posts_count=VALUES(posts_count),verified=VALUES(verified),notes=VALUES(notes)`,
    [projectId,platform,profile.handle||null,profile.profile_url||null,Number(profile.followers||0),Number(profile.following||0),Number(profile.posts_count||0),profile.verified?1:0,profile.notes||null]);
}

async function saveMetric(projectId, platform, metric) {
  await db.execute(`INSERT INTO social_metrics_daily(project_id,platform,metric_date,followers,posts,reach,impressions,likes,comments,shares,video_views,clicks,engagement_rate)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE followers=VALUES(followers),posts=VALUES(posts),reach=VALUES(reach),impressions=VALUES(impressions),likes=VALUES(likes),comments=VALUES(comments),shares=VALUES(shares),video_views=VALUES(video_views),clicks=VALUES(clicks),engagement_rate=VALUES(engagement_rate)`,
    [projectId,platform,metric.metric_date,...['followers','posts','reach','impressions','likes','comments','shares','video_views','clicks'].map(k=>Number(metric[k]||0)),Number(metric.engagement_rate||0)]);
}

async function savePost(projectId, platform, post) {
  if(!post.post_url) return;
  await db.execute(`DELETE FROM social_posts WHERE project_id=? AND platform=? AND post_url=?`,[projectId,platform,post.post_url]);
  await db.execute(`INSERT INTO social_posts(project_id,platform,post_url,published_at,caption,likes,comments,shares,views,clicks,engagement_rate,source) VALUES(?,?,?,?,?,?,?,?,?,?,?,'api')`,
    [projectId,platform,post.post_url,post.published_at?new Date(post.published_at):null,post.caption||null,Number(post.likes||0),Number(post.comments||0),Number(post.shares||0),Number(post.views||0),Number(post.clicks||0),Number(post.engagement_rate||0)]);
}

async function syncFacebook(projectId,userId){
  const c=await getConnection(projectId,userId,'facebook'); if(!c?.account_id||!c.access_token) throw new Error('Facebook is not connected.');
  const pageId=c.account_id;
  const page=await axios.get(`https://graph.facebook.com/${META_VERSION}/${pageId}`,{params:{fields:'id,name,link,fan_count',access_token:c.access_token}});
  await saveProfile(projectId,'facebook',{handle:page.data.name,profile_url:page.data.link,followers:page.data.fan_count});
  const end=new Date(Date.now()-86400000); const start=new Date(end); start.setDate(start.getDate()-29);
  const iso=d=>d.toISOString().slice(0,10);
  try{
    const insights=await axios.get(`https://graph.facebook.com/${META_VERSION}/${pageId}/insights`,{params:{metric:'page_impressions,page_post_engagements',period:'day',since:iso(start),until:iso(end),access_token:c.access_token}});
    const byDate={};
    for(const row of insights.data.data||[]){for(const v of row.values||[]){const d=String(v.end_time||'').slice(0,10);(byDate[d] ||= {})[row.name]=Number(v.value||0);}}
    for(const [d,v] of Object.entries(byDate)) await saveMetric(projectId,'facebook',{metric_date:d,followers:page.data.fan_count,reach:0,impressions:v.page_impressions||0,likes:v.page_post_engagements||0});
  }catch(e){console.warn('Facebook insights unavailable:',e.response?.data||e.message); await saveMetric(projectId,'facebook',{metric_date:iso(end),followers:page.data.fan_count});}
  await db.execute(`UPDATE social_connections SET last_synced_at=CURRENT_TIMESTAMP,status='connected' WHERE project_id=? AND platform='facebook'`,[projectId]);
}

async function syncInstagram(projectId,userId){
  const c=await getConnection(projectId,userId,'instagram'); if(!c?.account_id||!c.access_token) throw new Error('Instagram is not connected.');
  const ig=await axios.get(`https://graph.facebook.com/${META_VERSION}/${c.account_id}`,{params:{fields:'id,username,name,profile_picture_url,followers_count,follows_count,media_count',access_token:c.access_token}});
  const u=ig.data; await saveProfile(projectId,'instagram',{handle:u.username||u.name,profile_url:u.username?`https://www.instagram.com/${u.username}/`:null,followers:u.followers_count,following:u.follows_count,posts_count:u.media_count});
  const media=await axios.get(`https://graph.facebook.com/${META_VERSION}/${c.account_id}/media`,{params:{fields:'id,caption,permalink,timestamp,like_count,comments_count',limit:50,access_token:c.access_token}});
  let likes=0,comments=0;
  for(const m of media.data.data||[]){likes+=Number(m.like_count||0);comments+=Number(m.comments_count||0);await savePost(projectId,'instagram',{post_url:m.permalink,published_at:m.timestamp,caption:m.caption,likes:m.like_count,comments:m.comments_count});}
  const d=new Date(Date.now()-86400000).toISOString().slice(0,10);
  await saveMetric(projectId,'instagram',{metric_date:d,followers:u.followers_count,posts:(media.data.data||[]).length,likes,comments,engagement_rate:u.followers_count?((likes+comments)/u.followers_count)*100:0});
  await db.execute(`UPDATE social_connections SET last_synced_at=CURRENT_TIMESTAMP,status='connected' WHERE project_id=? AND platform='instagram'`,[projectId]);
}

async function syncYoutube(projectId,userId){
  const c=await getConnection(projectId,userId,'youtube'); if(!c?.access_token) throw new Error('YouTube is not connected.');
  const auth=googleClient(); auth.setCredentials({access_token:c.access_token,refresh_token:c.refresh_token||undefined,expiry_date:c.token_expiry?new Date(c.token_expiry).getTime():undefined});
  const yt=google.youtube({version:'v3',auth});
  const ch=await yt.channels.list({part:'snippet,statistics,contentDetails',mine:true});
  const channel=ch.data.items?.[0]; if(!channel) throw new Error('No YouTube channel was found for the connected Google account.');
  const s=channel.statistics||{}; const uploads=channel.contentDetails?.relatedPlaylists?.uploads;
  await saveProfile(projectId,'youtube',{handle:channel.snippet?.customUrl||channel.snippet?.title,profile_url:channel.snippet?.customUrl?`https://www.youtube.com/${channel.snippet.customUrl}`:`https://www.youtube.com/channel/${channel.id}`,followers:s.subscriberCount,posts_count:s.videoCount});
  if(uploads){const pl=await yt.playlistItems.list({part:'contentDetails',playlistId:uploads,maxResults:25}); const ids=(pl.data.items||[]).map(x=>x.contentDetails?.videoId).filter(Boolean); if(ids.length){const vids=await yt.videos.list({part:'snippet,statistics',id:ids.join(',')}); for(const v of vids.data.items||[]){const vs=v.statistics||{}; await savePost(projectId,'youtube',{post_url:`https://www.youtube.com/watch?v=${v.id}`,published_at:v.snippet?.publishedAt,caption:v.snippet?.title,likes:vs.likeCount,comments:vs.commentCount,views:vs.viewCount});}}
  }
  const end=new Date(Date.now()-86400000); const start=new Date(end); start.setDate(start.getDate()-29); const iso=d=>d.toISOString().slice(0,10);
  try{
    const ya=google.youtubeAnalytics({version:'v2',auth});
    const report=await ya.reports.query({ids:'channel==MINE',startDate:iso(start),endDate:iso(end),metrics:'views,likes,comments,subscribersGained',dimensions:'day',sort:'day',maxResults:50});
    for(const row of report.data.rows||[]){await saveMetric(projectId,'youtube',{metric_date:row[0],followers:Number(s.subscriberCount||0),reach:Number(row[1]||0),video_views:Number(row[1]||0),likes:Number(row[2]||0),comments:Number(row[3]||0)});}
  }catch(e){console.warn('YouTube Analytics unavailable:',e.response?.data||e.message); await saveMetric(projectId,'youtube',{metric_date:iso(end),followers:s.subscriberCount,video_views:0});}
  const tokens=auth.credentials; await db.execute(`UPDATE social_connections SET access_token=?,token_expiry=?,last_synced_at=CURRENT_TIMESTAMP,status='connected' WHERE project_id=? AND platform='youtube'`,[tokens.access_token||c.access_token,tokens.expiry_date?new Date(tokens.expiry_date):c.token_expiry,projectId]);
}

async function syncPlatform(projectId,userId,platform){
  if(platform==='facebook') return syncFacebook(projectId,userId);
  if(platform==='instagram') return syncInstagram(projectId,userId);
  if(platform==='youtube') return syncYoutube(projectId,userId);
  throw new Error(`${providerConfig(platform)?.label||platform} sync is not enabled in this release.`);
}

async function disconnect(projectId,userId,platform){
  await ensureTables();
  const c=await getConnection(projectId,userId,platform); if(!c) return;
  await db.execute('DELETE FROM social_connections WHERE project_id=? AND platform=?',[projectId,platform]);
}

module.exports={PLATFORMS,providerConfig,authorizationUrl,parseState,callback,getConnection,syncPlatform,disconnect,frontendUrl,ensureTables};
