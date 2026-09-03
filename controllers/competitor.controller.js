const db = require("../config/database");

async function ensureCompetitorIntelligenceTables() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS competitor_keywords (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      competitor_id BIGINT UNSIGNED NOT NULL,
      keyword VARCHAR(255) NOT NULL,
      ranking_position DECIMAL(8,2) NULL,
      search_volume INT NULL,
      ranking_url VARCHAR(1000) NULL,
      traffic_estimate INT NULL,
      difficulty DECIMAL(6,2) NULL,
      source VARCHAR(50) DEFAULT 'manual',
      checked_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_comp_keyword_competitor FOREIGN KEY (competitor_id) REFERENCES competitors(id) ON DELETE CASCADE,
      UNIQUE KEY uq_competitor_keyword_source (competitor_id,keyword,source),
      KEY idx_comp_keyword_position (competitor_id,ranking_position)
    ) ENGINE=InnoDB
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS competitor_backlinks (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      competitor_id BIGINT UNSIGNED NOT NULL,
      source_url VARCHAR(1000) NOT NULL,
      target_url VARCHAR(1000) NULL,
      anchor_text VARCHAR(500) NULL,
      domain_authority DECIMAL(6,2) NULL,
      status ENUM('active','lost','new') DEFAULT 'active',
      first_seen_at DATETIME NULL,
      last_seen_at DATETIME NULL,
      source VARCHAR(50) DEFAULT 'manual',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_comp_backlink_competitor FOREIGN KEY (competitor_id) REFERENCES competitors(id) ON DELETE CASCADE,
      KEY idx_comp_backlink_status (competitor_id,status),
      KEY idx_comp_backlink_source (competitor_id,source_url(191))
    ) ENGINE=InnoDB
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS backlink_opportunities (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      project_id BIGINT UNSIGNED NOT NULL,
      referring_domain VARCHAR(255) NOT NULL,
      source_url VARCHAR(1000) NULL,
      target_url VARCHAR(1000) NULL,
      anchor_text VARCHAR(500) NULL,
      opportunity_type ENUM('competitor_link','lost_link','resource','guest_post','directory','other') DEFAULT 'competitor_link',
      priority ENUM('low','medium','high','critical') DEFAULT 'medium',
      status ENUM('open','contacted','won','rejected') DEFAULT 'open',
      authority DECIMAL(6,2) NULL,
      notes TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_backlink_opp_project FOREIGN KEY (project_id) REFERENCES seo_projects(id) ON DELETE CASCADE,
      KEY idx_backlink_opp_project_status (project_id,status),
      KEY idx_backlink_opp_project_priority (project_id,priority)
    ) ENGINE=InnoDB
  `);
  // Upgrade older installations that used the legacy keyword uniqueness key.
  try { await db.query(`ALTER TABLE competitor_keywords DROP INDEX uq_competitor_keyword`); } catch (_) {}
  try { await db.query(`ALTER TABLE competitor_keywords ADD UNIQUE KEY uq_competitor_keyword_source (competitor_id,keyword,source)`); } catch (_) {}

}

async function verifyProject(userId, projectId) {
  const [rows] = await db.execute(`SELECT id,project_name,website_url,domain FROM seo_projects WHERE id=? AND user_id=?`, [projectId,userId]);
  return rows[0] || null;
}
async function verifyCompetitor(userId, competitorId) {
  const [rows] = await db.execute(`SELECT c.*,p.project_name,p.website_url,p.domain FROM competitors c JOIN seo_projects p ON p.id=c.project_id WHERE c.id=? AND p.user_id=?`, [competitorId,userId]);
  return rows[0] || null;
}
function hostOf(value) { try { return new URL(String(value||'')).hostname.toLowerCase().replace(/^www\./,''); } catch { return String(value||'').trim().toLowerCase().replace(/^www\./,''); } }
function cleanDomain(value) { return String(value||'').trim().replace(/^https?:\/\//i,'').replace(/\/.*$/,'').replace(/^www\./i,'').toLowerCase(); }

const createCompetitor = async (req,res) => {
  try {
    const projectId=req.params.projectId; const project=await verifyProject(req.user.userId,projectId);
    if(!project)return res.status(404).json({success:false,message:'Project not found'});
    const domain=cleanDomain(req.body?.competitor_domain);
    if(!domain)return res.status(400).json({success:false,message:'Competitor domain is required'});
    if(domain===cleanDomain(project.domain||hostOf(project.website_url)))return res.status(400).json({success:false,message:'Project domain cannot be added as its own competitor'});
    const [existing]=await db.execute(`SELECT id FROM competitors WHERE project_id=? AND LOWER(competitor_domain)=? LIMIT 1`,[projectId,domain]);
    if(existing.length)return res.status(409).json({success:false,message:'This competitor is already tracked'});
    const url=String(req.body?.competitor_url||`https://${domain}`).trim();
    const [r]=await db.execute(`INSERT INTO competitors(project_id,competitor_domain,competitor_url) VALUES(?,?,?)`,[projectId,domain,url]);
    res.status(201).json({success:true,competitor:{id:r.insertId,project_id:Number(projectId),competitor_domain:domain,competitor_url:url}});
  } catch(e){console.error('Create competitor error:',e);res.status(500).json({success:false,message:'Unable to add competitor'});}
};

const getCompetitors = async(req,res)=>{
  try{const projectId=req.params.projectId;if(!await verifyProject(req.user.userId,projectId))return res.status(404).json({success:false,message:'Project not found'});
    const [rows]=await db.execute(`SELECT c.id,c.project_id,c.competitor_domain,c.competitor_url,c.created_at,(SELECT COUNT(*) FROM competitor_keywords k WHERE k.competitor_id=c.id) keyword_count,(SELECT COUNT(*) FROM competitor_backlinks b WHERE b.competitor_id=c.id) backlink_count,(SELECT COUNT(*) FROM competitor_backlinks b WHERE b.competitor_id=c.id AND b.status='active') active_backlink_count FROM competitors c WHERE c.project_id=? ORDER BY c.created_at DESC`,[projectId]);
    res.json({success:true,count:rows.length,competitors:rows});
  }catch(e){console.error('Get competitors error:',e);res.status(500).json({success:false,message:'Unable to load competitors'});}
};
const getCompetitorById=async(req,res)=>{try{const c=await verifyCompetitor(req.user.userId,req.params.id);if(!c)return res.status(404).json({success:false,message:'Competitor not found'});res.json({success:true,competitor:c});}catch(e){res.status(500).json({success:false,message:'Unable to load competitor'});}};
const updateCompetitor=async(req,res)=>{try{const c=await verifyCompetitor(req.user.userId,req.params.id);if(!c)return res.status(404).json({success:false,message:'Competitor not found'});const domain=cleanDomain(req.body?.competitor_domain);if(!domain)return res.status(400).json({success:false,message:'Competitor domain is required'});const [dupe]=await db.execute(`SELECT id FROM competitors WHERE project_id=? AND LOWER(competitor_domain)=? AND id<>? LIMIT 1`,[c.project_id,domain,c.id]);if(dupe.length)return res.status(409).json({success:false,message:'This competitor is already tracked'});await db.execute(`UPDATE competitors SET competitor_domain=?,competitor_url=? WHERE id=?`,[domain,String(req.body?.competitor_url||`https://${domain}`).trim(),c.id]);res.json({success:true,message:'Competitor updated successfully'});}catch(e){console.error(e);res.status(500).json({success:false,message:'Unable to update competitor'});}};
const deleteCompetitor=async(req,res)=>{try{const c=await verifyCompetitor(req.user.userId,req.params.id);if(!c)return res.status(404).json({success:false,message:'Competitor not found'});await db.execute(`DELETE FROM competitors WHERE id=?`,[c.id]);res.json({success:true,message:'Competitor deleted successfully'});}catch(e){console.error(e);res.status(500).json({success:false,message:'Unable to delete competitor'});}};

const getCompetitorIntelligence=async(req,res)=>{
  try{
    await ensureCompetitorIntelligenceTables();
    const projectId=req.params.projectId;const project=await verifyProject(req.user.userId,projectId);if(!project)return res.status(404).json({success:false,message:'Project not found'});
    const [competitors]=await db.execute(`SELECT c.id,c.competitor_domain,c.competitor_url,c.created_at,(SELECT COUNT(*) FROM competitor_keywords k WHERE k.competitor_id=c.id) keyword_count,(SELECT COUNT(*) FROM competitor_backlinks b WHERE b.competitor_id=c.id) backlink_count,(SELECT COUNT(*) FROM competitor_backlinks b WHERE b.competitor_id=c.id AND b.status='active') active_backlink_count FROM competitors c WHERE c.project_id=? ORDER BY c.created_at DESC`,[projectId]);
    const [keywords]=await db.execute(`SELECT k.*,c.competitor_domain FROM competitor_keywords k JOIN competitors c ON c.id=k.competitor_id WHERE c.project_id=? ORDER BY COALESCE(k.ranking_position,999999),k.search_volume DESC,k.keyword`,[projectId]);
    const [backlinks]=await db.execute(`SELECT b.*,c.competitor_domain FROM competitor_backlinks b JOIN competitors c ON c.id=b.competitor_id WHERE c.project_id=? ORDER BY b.created_at DESC`,[projectId]);
    const [ownKeywords]=await db.execute(`SELECT keyword,target_url FROM keywords WHERE project_id=? ORDER BY keyword`,[projectId]);
    const [ownBacklinks]=await db.execute(`SELECT source_url,target_url,anchor_text,domain_authority,status FROM backlinks WHERE project_id=?`,[projectId]);
    const ownKeywordSet=new Set(ownKeywords.map(x=>String(x.keyword||'').trim().toLowerCase()).filter(Boolean));
    const ownHosts=new Set(ownBacklinks.map(x=>hostOf(x.source_url)).filter(Boolean));
    const gapMap=new Map();
    for(const k of keywords){const key=String(k.keyword||'').trim().toLowerCase();if(!key||ownKeywordSet.has(key))continue;const existing=gapMap.get(key);if(!existing||((k.ranking_position??999999)<(existing.ranking_position??999999))){gapMap.set(key,{...k,competitors:[k.competitor_domain]});}else if(!existing.competitors.includes(k.competitor_domain)){existing.competitors.push(k.competitor_domain);}}
    const keywordGaps=[...gapMap.values()].sort((a,b)=>(a.ranking_position??999999)-(b.ranking_position??999999)||(b.search_volume??0)-(a.search_volume??0));
    const domainMap=new Map();
    for(const b of backlinks){const host=hostOf(b.source_url);if(!host||ownHosts.has(host))continue;const x=domainMap.get(host)||{referring_domain:host,source_url:b.source_url,target_url:project.website_url,anchor_text:b.anchor_text||null,authority:b.domain_authority==null?null:Number(b.domain_authority),competitor_count:0,competitors:[],opportunity_type:'competitor_link',status:'open'};if(b.domain_authority!=null&&Number(b.domain_authority)>(x.authority??-1))x.authority=Number(b.domain_authority);if(!x.source_url)x.source_url=b.source_url;if(!x.competitors.includes(b.competitor_domain)){x.competitors.push(b.competitor_domain);x.competitor_count=x.competitors.length;}domainMap.set(host,x);}
    const [savedOpps]=await db.execute(`SELECT * FROM backlink_opportunities WHERE project_id=? ORDER BY FIELD(priority,'critical','high','medium','low'),created_at DESC`,[projectId]);
    const savedHosts=new Set(savedOpps.map(o=>cleanDomain(o.referring_domain)));
    const generated=[...domainMap.values()].filter(o=>!savedHosts.has(cleanDomain(o.referring_domain))).map(o=>({...o,priority:o.competitor_count>=2?'critical':Number(o.authority||0)>=80?'critical':Number(o.authority||0)>=60?'high':'medium',notes:`Observed linking to ${o.competitor_count} tracked competitor${o.competitor_count===1?'':'s'}.`}));
    const savedLostHosts=new Set(savedOpps.map(o=>cleanDomain(o.referring_domain)));
    for(const link of ownBacklinks.filter(x=>x.status==='lost')){const host=hostOf(link.source_url);if(!host||savedLostHosts.has(host)||generated.some(o=>o.referring_domain===host))continue;generated.push({id:null,referring_domain:host,source_url:link.source_url,target_url:link.target_url||project.website_url,anchor_text:link.anchor_text||null,authority:link.domain_authority==null?null:Number(link.domain_authority),opportunity_type:'lost_link',priority:Number(link.domain_authority||0)>=80?'high':'medium',status:'open',competitor_count:0,competitors:[],notes:'Recovery candidate from a lost owned backlink'});}
    const competitorSummary=competitors.map(c=>({id:c.id,domain:c.competitor_domain,keywords:Number(c.keyword_count||0),backlinks:Number(c.backlink_count||0),activeBacklinks:Number(c.active_backlink_count||0)}));
    const opportunities=[...savedOpps,...generated];
    res.json({success:true,project,summary:{competitors:competitors.length,competitorKeywords:keywords.length,competitorBacklinks:backlinks.length,uniqueReferringDomains:domainMap.size,keywordGaps:keywordGaps.length,backlinkOpportunities:opportunities.length},competitors,competitorSummary,keywords,backlinks,ownKeywords,ownBacklinks,keywordGaps,backlinkOpportunities:opportunities});
  }catch(e){console.error('Competitor intelligence error:',e);res.status(500).json({success:false,message:'Unable to load competitor intelligence'});}
};

const createCompetitorKeyword=async(req,res)=>{try{await ensureCompetitorIntelligenceTables();const c=await verifyCompetitor(req.user.userId,req.params.competitorId);if(!c)return res.status(404).json({success:false,message:'Competitor not found'});const b=req.body||{};const keyword=String(b.keyword||'').trim();if(!keyword)return res.status(400).json({success:false,message:'Keyword is required'});const position=b.ranking_position===''?null:b.ranking_position??null;const volume=b.search_volume===''?null:b.search_volume??null;const traffic=b.traffic_estimate===''?null:b.traffic_estimate??null;const difficulty=b.difficulty===''?null:b.difficulty??null;const checked=b.checked_at||new Date();const [r]=await db.execute(`INSERT INTO competitor_keywords(competitor_id,keyword,ranking_position,search_volume,ranking_url,traffic_estimate,difficulty,source,checked_at) VALUES(?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE ranking_position=VALUES(ranking_position),search_volume=VALUES(search_volume),ranking_url=VALUES(ranking_url),traffic_estimate=VALUES(traffic_estimate),difficulty=VALUES(difficulty),source=VALUES(source),checked_at=VALUES(checked_at)`,[c.id,keyword,position,volume,b.ranking_url||null,traffic,difficulty,b.source||'manual',checked]);res.status(201).json({success:true,id:r.insertId||null,message:'Competitor keyword saved'});}catch(e){console.error(e);res.status(500).json({success:false,message:'Unable to save competitor keyword'});}};
const updateCompetitorKeyword=async(req,res)=>{try{await ensureCompetitorIntelligenceTables();const c=await verifyCompetitor(req.user.userId,req.params.competitorId);if(!c)return res.status(404).json({success:false,message:'Competitor not found'});const b=req.body||{};const keyword=String(b.keyword||'').trim();if(!keyword)return res.status(400).json({success:false,message:'Keyword is required'});const [r]=await db.execute(`UPDATE competitor_keywords SET keyword=?,ranking_position=?,search_volume=?,ranking_url=?,traffic_estimate=?,difficulty=?,source=?,checked_at=? WHERE id=? AND competitor_id=?`,[keyword,b.ranking_position??null,b.search_volume??null,b.ranking_url||null,b.traffic_estimate??null,b.difficulty??null,b.source||'manual',b.checked_at||new Date(),req.params.id,c.id]);if(!r.affectedRows)return res.status(404).json({success:false,message:'Competitor keyword not found'});res.json({success:true,message:'Competitor keyword updated'});}catch(e){console.error(e);res.status(500).json({success:false,message:'Unable to update competitor keyword'});}};
const deleteCompetitorKeyword=async(req,res)=>{try{const c=await verifyCompetitor(req.user.userId,req.params.competitorId);if(!c)return res.status(404).json({success:false,message:'Competitor not found'});const [r]=await db.execute(`DELETE FROM competitor_keywords WHERE id=? AND competitor_id=?`,[req.params.id,c.id]);if(!r.affectedRows)return res.status(404).json({success:false,message:'Competitor keyword not found'});res.json({success:true,message:'Competitor keyword deleted'});}catch(e){res.status(500).json({success:false,message:'Unable to delete competitor keyword'});}};

const createCompetitorBacklink=async(req,res)=>{try{await ensureCompetitorIntelligenceTables();const c=await verifyCompetitor(req.user.userId,req.params.competitorId);if(!c)return res.status(404).json({success:false,message:'Competitor not found'});const b=req.body||{};const sourceUrl=String(b.source_url||'').trim();if(!sourceUrl)return res.status(400).json({success:false,message:'Source URL is required'});const [r]=await db.execute(`INSERT INTO competitor_backlinks(competitor_id,source_url,target_url,anchor_text,domain_authority,status,first_seen_at,last_seen_at,source) VALUES(?,?,?,?,?,?,?,?,?)`,[c.id,sourceUrl,b.target_url||null,b.anchor_text||null,b.domain_authority===''?null:b.domain_authority??null,b.status||'active',b.first_seen_at||null,b.last_seen_at||null,b.source||'manual']);res.status(201).json({success:true,id:r.insertId,message:'Competitor backlink saved'});}catch(e){console.error(e);res.status(500).json({success:false,message:'Unable to save competitor backlink'});}};
const updateCompetitorBacklink=async(req,res)=>{try{const c=await verifyCompetitor(req.user.userId,req.params.competitorId);if(!c)return res.status(404).json({success:false,message:'Competitor not found'});const b=req.body||{};const sourceUrl=String(b.source_url||'').trim();if(!sourceUrl)return res.status(400).json({success:false,message:'Source URL is required'});const [r]=await db.execute(`UPDATE competitor_backlinks SET source_url=?,target_url=?,anchor_text=?,domain_authority=?,status=?,first_seen_at=?,last_seen_at=?,source=? WHERE id=? AND competitor_id=?`,[sourceUrl,b.target_url||null,b.anchor_text||null,b.domain_authority===''?null:b.domain_authority??null,b.status||'active',b.first_seen_at||null,b.last_seen_at||null,b.source||'manual',req.params.id,c.id]);if(!r.affectedRows)return res.status(404).json({success:false,message:'Competitor backlink not found'});res.json({success:true,message:'Competitor backlink updated'});}catch(e){console.error(e);res.status(500).json({success:false,message:'Unable to update competitor backlink'});}};
const deleteCompetitorBacklink=async(req,res)=>{try{const c=await verifyCompetitor(req.user.userId,req.params.competitorId);if(!c)return res.status(404).json({success:false,message:'Competitor not found'});const [r]=await db.execute(`DELETE FROM competitor_backlinks WHERE id=? AND competitor_id=?`,[req.params.id,c.id]);if(!r.affectedRows)return res.status(404).json({success:false,message:'Competitor backlink not found'});res.json({success:true,message:'Competitor backlink deleted'});}catch(e){res.status(500).json({success:false,message:'Unable to delete competitor backlink'});}};

const createOpportunity=async(req,res)=>{try{await ensureCompetitorIntelligenceTables();const p=await verifyProject(req.user.userId,req.params.projectId);if(!p)return res.status(404).json({success:false,message:'Project not found'});const b=req.body||{};const domain=cleanDomain(b.referring_domain);if(!domain)return res.status(400).json({success:false,message:'Referring domain is required'});const [r]=await db.execute(`INSERT INTO backlink_opportunities(project_id,referring_domain,source_url,target_url,anchor_text,opportunity_type,priority,status,authority,notes) VALUES(?,?,?,?,?,?,?,?,?,?)`,[p.id,domain,b.source_url||null,b.target_url||p.website_url,b.anchor_text||null,b.opportunity_type||'other',b.priority||'medium',b.status||'open',b.authority===''?null:b.authority??null,b.notes||null]);res.status(201).json({success:true,id:r.insertId,message:'Backlink opportunity saved'});}catch(e){console.error(e);res.status(500).json({success:false,message:'Unable to save opportunity'});}};
const updateOpportunity=async(req,res)=>{try{const p=await verifyProject(req.user.userId,req.params.projectId);if(!p)return res.status(404).json({success:false,message:'Project not found'});const b=req.body||{};const domain=cleanDomain(b.referring_domain);if(!domain)return res.status(400).json({success:false,message:'Referring domain is required'});const [r]=await db.execute(`UPDATE backlink_opportunities SET referring_domain=?,source_url=?,target_url=?,anchor_text=?,opportunity_type=?,priority=?,status=?,authority=?,notes=? WHERE id=? AND project_id=?`,[domain,b.source_url||null,b.target_url||p.website_url,b.anchor_text||null,b.opportunity_type||'other',b.priority||'medium',b.status||'open',b.authority===''?null:b.authority??null,b.notes||null,req.params.id,p.id]);if(!r.affectedRows)return res.status(404).json({success:false,message:'Opportunity not found'});res.json({success:true,message:'Opportunity updated'});}catch(e){console.error(e);res.status(500).json({success:false,message:'Unable to update opportunity'});}};
const deleteOpportunity=async(req,res)=>{try{const p=await verifyProject(req.user.userId,req.params.projectId);if(!p)return res.status(404).json({success:false,message:'Project not found'});const [r]=await db.execute(`DELETE FROM backlink_opportunities WHERE id=? AND project_id=?`,[req.params.id,p.id]);if(!r.affectedRows)return res.status(404).json({success:false,message:'Opportunity not found'});res.json({success:true,message:'Opportunity deleted'});}catch(e){res.status(500).json({success:false,message:'Unable to delete opportunity'});}};

