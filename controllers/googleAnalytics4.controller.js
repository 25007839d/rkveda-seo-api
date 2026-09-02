const crypto = require('crypto');
const pool = require('../config/database');
const ga4 = require('../services/googleAnalytics4.service');

async function getProject(projectId, userId) {
  const [rows] = await pool.execute('SELECT id, website_url, domain, project_name FROM seo_projects WHERE id=? AND user_id=? LIMIT 1', [projectId, userId]);
  return rows[0] || null;
}
function state(projectId, userId) {
  const payload = Buffer.from(JSON.stringify({ projectId:String(projectId), userId:String(userId), ts:Date.now(), nonce:crypto.randomBytes(16).toString('hex') })).toString('base64url');
  const secret = process.env.JWT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
function parseState(value) {
  const [payload, sig] = String(value||'').split('.');
  if (!payload || !sig) throw new Error('Invalid GA4 OAuth state');
  const secret = process.env.JWT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const a=Buffer.from(sig), b=Buffer.from(expected);
  if(a.length!==b.length || !crypto.timingSafeEqual(a,b)) throw new Error('Invalid GA4 OAuth state signature');
  const data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
  if(!data.projectId||!data.userId||!data.ts||Date.now()-Number(data.ts)>10*60*1000) throw new Error('GA4 OAuth state expired');
  return data;
}
function redirect(projectId, params={}) {
  const base=process.env.FRONTEND_URL || 'https://seo.rkveda.in';
  const u=new URL(`/projects/${projectId}/ga4`,base); Object.entries(params).forEach(([k,v])=>{if(v!==undefined&&v!==null&&v!=='')u.searchParams.set(k,String(v));}); return u.toString();
}

async function connect(req,res){
  try{const projectId=Number(req.params.projectId); const userId=req.user?.userId; if(!userId)return res.status(401).json({success:false,message:'Authenticated user is required'}); if(!await getProject(projectId,userId))return res.status(404).json({success:false,message:'Project not found'}); return res.json({success:true,authorizationUrl:ga4.getAuthorizationUrl(state(projectId,userId))});}
  catch(e){console.error('GA4 CONNECT ERROR',e);return res.status(500).json({success:false,message:'Failed to create GA4 authorization URL',error:e.message});}
}
async function callback(req,res){let projectId=null;try{const {code,state:oauthState,error}=req.query; if(oauthState){const s=parseState(oauthState);projectId=Number(s.projectId);const project=await getProject(projectId,Number(s.userId));if(!project)return res.status(404).json({success:false,message:'Project not found'}); if(error)return res.redirect(redirect(projectId,{ga4_error:`Google authorization failed: ${error}`})); if(!code)return res.redirect(redirect(projectId,{ga4_error:'Authorization code missing'})); const tokens=await ga4.exchangeCode(code); const properties=await ga4.listProperties(tokens); const property=properties.find(p=>ga4.propertyMatchesProject(p,project)); const email=await ga4.getUserEmail(tokens); const expiry=tokens.expiry_date?new Date(tokens.expiry_date):null; if(property){await ga4.saveConnection({projectId,accountId:property.account_id,propertyId:property.property_id,propertyName:property.property_name,googleEmail:email,accessToken:tokens.access_token,refreshToken:tokens.refresh_token||null,tokenExpiry:expiry,status:'connected'});return res.redirect(redirect(projectId,{ga4_connected:'1'}));} await ga4.saveConnection({projectId,googleEmail:email,accessToken:tokens.access_token,refreshToken:tokens.refresh_token||null,tokenExpiry:expiry,status:'needs_property'}); return res.redirect(redirect(projectId,{ga4_property:'1'}));}
    if(error)return res.status(400).json({success:false,message:`Google authorization failed: ${error}`});
    return res.status(400).json({success:false,message:'GA4 OAuth state missing'});
  }catch(e){console.error('GA4 CALLBACK ERROR',e);if(projectId)return res.redirect(redirect(projectId,{ga4_error:e.message||'Google Analytics 4 connection failed'}));return res.status(400).json({success:false,message:e.message||'Google Analytics 4 connection failed'});}}
async function status(req,res){try{const projectId=Number(req.params.projectId);if(!await getProject(projectId,req.user?.userId))return res.status(404).json({success:false,message:'Project not found'});const c=await ga4.getConnection(projectId,false);return res.json({success:true,connected:c?.status==='connected'&&!!c?.property_id,connection:c});}catch(e){console.error(e);return res.status(500).json({success:false,message:'Failed to get GA4 status',error:e.message});}}
async function properties(req,res){try{const projectId=Number(req.params.projectId);if(!await getProject(projectId,req.user?.userId))return res.status(404).json({success:false,message:'Project not found'});const c=await ga4.getConnection(projectId,true);if(!c)return res.status(404).json({success:false,message:'GA4 connection not found'});const list=await ga4.listProperties({access_token:c.access_token,refresh_token:c.refresh_token,expiry_date:c.token_expiry?new Date(c.token_expiry).getTime():undefined});return res.json({success:true,properties:list});}catch(e){console.error('GA4 PROPERTIES ERROR',e);return res.status(500).json({success:false,message:'Failed to list GA4 properties',error:e.message});}}
async function selectProperty(req,res){try{const projectId=Number(req.params.projectId);if(!await getProject(projectId,req.user?.userId))return res.status(404).json({success:false,message:'Project not found'});const {property_id,property_name,account_id}=req.body||{};if(!property_id)return res.status(400).json({success:false,message:'property_id is required'});const c=await ga4.getConnection(projectId,true);if(!c)return res.status(404).json({success:false,message:'GA4 connection not found'});const list=await ga4.listProperties({access_token:c.access_token,refresh_token:c.refresh_token,expiry_date:c.token_expiry?new Date(c.token_expiry).getTime():undefined});const p=list.find(x=>String(x.property_id)===String(property_id));if(!p)return res.status(400).json({success:false,message:'Selected GA4 property is not available to this Google account'});await ga4.saveConnection({projectId,accountId:account_id||p.account_id,propertyId:p.property_id,propertyName:property_name||p.property_name,googleEmail:c.google_email,accessToken:c.access_token,refreshToken:c.refresh_token,tokenExpiry:c.token_expiry,status:'connected'});return res.json({success:true,message:'Google Analytics 4 property connected',property:p});}catch(e){console.error('GA4 PROPERTY SELECT ERROR',e);return res.status(500).json({success:false,message:'Failed to connect GA4 property',error:e.message});}}
async function report(req,res){try{const projectId=Number(req.params.projectId);if(!await getProject(projectId,req.user?.userId))return res.status(404).json({success:false,message:'Project not found'});const end=req.query.endDate||new Date(Date.now()-86400000).toISOString().slice(0,10);const start=req.query.startDate||new Date(Date.parse(end+'T00:00:00Z')-29*86400000).toISOString().slice(0,10);const result=await ga4.runReport(projectId,{startDate:start,endDate:end,limit:Number(req.query.limit)||100});return res.json({success:true,...result});}catch(e){console.error('GA4 REPORT ERROR',e);return res.status(500).json({success:false,message:'Failed to fetch Google Analytics 4 report',error:e.message});}}
module.exports={connect,callback,status,properties,selectProperty,report};
