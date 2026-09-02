const db = require("../config/database");

async function ensureCompetitorIntelligenceTables() {
  // Safe idempotent bootstrap for installations where the v3 migration
  // has not yet been applied. This prevents the whole intelligence page
  // from failing simply because one additive table is missing.
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
      CONSTRAINT fk_comp_keyword_competitor
        FOREIGN KEY (competitor_id) REFERENCES competitors(id) ON DELETE CASCADE,
      UNIQUE KEY uq_competitor_keyword (competitor_id,keyword),
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
      CONSTRAINT fk_comp_backlink_competitor
        FOREIGN KEY (competitor_id) REFERENCES competitors(id) ON DELETE CASCADE,
      KEY idx_comp_backlink_status (competitor_id,status)
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
      CONSTRAINT fk_backlink_opp_project
        FOREIGN KEY (project_id) REFERENCES seo_projects(id) ON DELETE CASCADE,
      KEY idx_backlink_opp_project_status (project_id,status),
      KEY idx_backlink_opp_project_priority (project_id,priority)
    ) ENGINE=InnoDB
  `);
}


async function verifyProject(userId, projectId) {
  const [rows] = await db.execute(
    `SELECT id, project_name, website_url, domain FROM seo_projects WHERE id = ? AND user_id = ?`,
    [projectId, userId]
  );
  return rows[0] || null;
}

async function verifyCompetitor(userId, competitorId) {
  const [rows] = await db.execute(
    `SELECT c.*, p.project_name, p.website_url, p.domain
     FROM competitors c INNER JOIN seo_projects p ON p.id=c.project_id
     WHERE c.id=? AND p.user_id=?`, [competitorId, userId]
  );
  return rows[0] || null;
}

const createCompetitor = async (req, res) => {
  try {
    const project_id = req.params.projectId;
    const project = await verifyProject(req.user.userId, project_id);
    if (!project) return res.status(404).json({success:false,message:"Project not found"});
    let { competitor_domain, competitor_url } = req.body || {};
    competitor_domain = String(competitor_domain || '').trim().replace(/^https?:\/\//,'').replace(/\/$/,'');
    if (!competitor_domain) return res.status(400).json({success:false,message:"Competitor domain is required"});
    const [result] = await db.execute(
      `INSERT INTO competitors(project_id,competitor_domain,competitor_url) VALUES(?,?,?)`,
      [project_id, competitor_domain, competitor_url || `https://${competitor_domain}`]
    );
    res.status(201).json({success:true,competitor:{id:result.insertId,project_id,competitor_domain,competitor_url:competitor_url || `https://${competitor_domain}`}});
  } catch (error) { console.error("Create competitor error:",error); res.status(500).json({success:false,message:"Internal server error"}); }
};

const getCompetitors = async (req,res) => {
  try {
    const project_id=req.params.projectId;
    if (!await verifyProject(req.user.userId,project_id)) return res.status(404).json({success:false,message:"Project not found"});
    const [competitors]=await db.execute(
      `SELECT c.id,c.project_id,c.competitor_domain,c.competitor_url,c.created_at,
              (SELECT COUNT(*) FROM competitor_keywords ck WHERE ck.competitor_id=c.id) keyword_count,
              (SELECT COUNT(*) FROM competitor_backlinks cb WHERE cb.competitor_id=c.id) backlink_count,
              (SELECT COUNT(*) FROM competitor_backlinks cb WHERE cb.competitor_id=c.id AND cb.status='active') active_backlink_count
       FROM competitors c WHERE c.project_id=? ORDER BY c.created_at DESC`,[project_id]);
    res.json({success:true,count:competitors.length,competitors});
  } catch(error){console.error("Get competitors error:",error);res.status(500).json({success:false,message:"Internal server error"});}
};

const getCompetitorById = async (req,res) => {
  try { const c=await verifyCompetitor(req.user.userId,req.params.id); if(!c)return res.status(404).json({success:false,message:"Competitor not found"}); res.json({success:true,competitor:c}); }
  catch(error){console.error(error);res.status(500).json({success:false,message:"Internal server error"});}
};

const updateCompetitor = async (req,res) => {
  try {
    if(!await verifyCompetitor(req.user.userId,req.params.id)) return res.status(404).json({success:false,message:"Competitor not found"});
    let {competitor_domain,competitor_url}=req.body||{};
    competitor_domain=String(competitor_domain||'').trim().replace(/^https?:\/\//,'').replace(/\/$/,'');
    if(!competitor_domain)return res.status(400).json({success:false,message:"Competitor domain is required"});
    await db.execute(`UPDATE competitors SET competitor_domain=?,competitor_url=? WHERE id=?`,[competitor_domain,competitor_url||`https://${competitor_domain}`,req.params.id]);
    res.json({success:true,message:"Competitor updated successfully"});
  } catch(error){console.error(error);res.status(500).json({success:false,message:"Internal server error"});}
};

const deleteCompetitor = async (req,res) => {
  try { if(!await verifyCompetitor(req.user.userId,req.params.id))return res.status(404).json({success:false,message:"Competitor not found"}); await db.execute(`DELETE FROM competitors WHERE id=?`,[req.params.id]); res.json({success:true,message:"Competitor deleted successfully"}); }
  catch(error){console.error(error);res.status(500).json({success:false,message:"Internal server error"});}
};

const getCompetitorIntelligence = async (req,res) => {
  try {
    await ensureCompetitorIntelligenceTables();
    const projectId=req.params.projectId;
    const project=await verifyProject(req.user.userId,projectId);
    if(!project)return res.status(404).json({success:false,message:"Project not found"});
    const [competitors]=await db.execute(`SELECT c.id,c.competitor_domain,c.competitor_url,c.created_at,
      (SELECT COUNT(*) FROM competitor_keywords k WHERE k.competitor_id=c.id) keyword_count,
      (SELECT COUNT(*) FROM competitor_backlinks b WHERE b.competitor_id=c.id) backlink_count,
      (SELECT COUNT(*) FROM competitor_backlinks b WHERE b.competitor_id=c.id AND b.status='active') active_backlink_count
      FROM competitors c WHERE c.project_id=? ORDER BY c.created_at DESC`,[projectId]);
    const [keywords]=await db.execute(`SELECT k.*,c.competitor_domain FROM competitor_keywords k JOIN competitors c ON c.id=k.competitor_id WHERE c.project_id=? ORDER BY COALESCE(k.ranking_position,999999),k.search_volume DESC,k.keyword`,[projectId]);
    const [backlinks]=await db.execute(`SELECT b.*,c.competitor_domain FROM competitor_backlinks b JOIN competitors c ON c.id=b.competitor_id WHERE c.project_id=? ORDER BY b.created_at DESC`,[projectId]);
    const [ownKeywords]=await db.execute(`SELECT keyword,target_url FROM keywords WHERE project_id=? ORDER BY keyword`,[projectId]);
    const [ownBacklinks]=await db.execute(`SELECT source_url,target_url,anchor_text,domain_authority,status FROM backlinks WHERE project_id=?`,[projectId]);
    const ownDomains=new Set(ownBacklinks.map(x=>{try{return new URL(x.source_url).hostname.toLowerCase()}catch{return String(x.source_url||'').toLowerCase()}}));
    const opportunityMap=new Map();
    for(const b of backlinks){
      let host=''; try{host=new URL(b.source_url).hostname.toLowerCase()}catch{}
      if(host && !ownDomains.has(host)) opportunityMap.set(host,{referring_domain:host,source_url:b.source_url,target_url:project.website_url,anchor_text:b.anchor_text,authority:b.domain_authority,opportunity_type:'competitor_link',priority:Number(b.domain_authority||0)>=70?'high':'medium',status:'open'});
    }
    const [savedOpps]=await db.execute(`SELECT * FROM backlink_opportunities WHERE project_id=? ORDER BY FIELD(priority,'critical','high','medium','low'),created_at DESC`,[projectId]);
    const savedHosts=new Set(savedOpps.map(o=>o.referring_domain.toLowerCase()));
    const generated=[...opportunityMap.values()].filter(o=>!savedHosts.has(o.referring_domain));
    const ownKeywordSet=new Set(ownKeywords.map(x=>x.keyword.trim().toLowerCase()));
    const keywordGaps=keywords.filter(k=>!ownKeywordSet.has(k.keyword.trim().toLowerCase()));
    res.json({success:true,project,summary:{competitors:competitors.length,competitorKeywords:keywords.length,competitorBacklinks:backlinks.length,uniqueReferringDomains:new Set(backlinks.map(b=>b.competitor_domain+'|'+String(b.source_url).split('/')[2])).size,keywordGaps:keywordGaps.length,backlinkOpportunities:savedOpps.length+generated.length},competitors,keywords,backlinks,ownKeywords,ownBacklinks,keywordGaps,backlinkOpportunities:[...savedOpps,...generated]});
  } catch(error){console.error("Competitor intelligence error:",error);res.status(500).json({success:false,message:"Unable to load competitor intelligence"});}
};

const createCompetitorKeyword = async(req,res)=>{
 try{
    await ensureCompetitorIntelligenceTables();const c=await verifyCompetitor(req.user.userId,req.params.competitorId);if(!c)return res.status(404).json({success:false,message:'Competitor not found'});const b=req.body||{};if(!String(b.keyword||'').trim())return res.status(400).json({success:false,message:'Keyword is required'});const [r]=await db.execute(`INSERT INTO competitor_keywords(competitor_id,keyword,ranking_position,search_volume,ranking_url,traffic_estimate,difficulty,source,checked_at) VALUES(?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE ranking_position=VALUES(ranking_position),search_volume=VALUES(search_volume),ranking_url=VALUES(ranking_url),traffic_estimate=VALUES(traffic_estimate),difficulty=VALUES(difficulty),source=VALUES(source),checked_at=VALUES(checked_at)`,[c.id,String(b.keyword).trim(),b.ranking_position??null,b.search_volume??null,b.ranking_url||null,b.traffic_estimate??null,b.difficulty??null,b.source||'manual',b.checked_at||new Date()]);res.status(201).json({success:true,id:r.insertId||null,message:'Competitor keyword saved'});}catch(e){console.error(e);res.status(500).json({success:false,message:'Unable to save competitor keyword'});}
};

const createCompetitorBacklink = async(req,res)=>{
 try{
    await ensureCompetitorIntelligenceTables();const c=await verifyCompetitor(req.user.userId,req.params.competitorId);if(!c)return res.status(404).json({success:false,message:'Competitor not found'});const b=req.body||{};if(!String(b.source_url||'').trim())return res.status(400).json({success:false,message:'Source URL is required'});const [r]=await db.execute(`INSERT INTO competitor_backlinks(competitor_id,source_url,target_url,anchor_text,domain_authority,status,first_seen_at,last_seen_at,source) VALUES(?,?,?,?,?,?,?,?,?)`,[c.id,b.source_url,b.target_url||null,b.anchor_text||null,b.domain_authority??null,b.status||'active',b.first_seen_at||null,b.last_seen_at||null,b.source||'manual']);res.status(201).json({success:true,id:r.insertId,message:'Competitor backlink saved'});}catch(e){console.error(e);res.status(500).json({success:false,message:'Unable to save competitor backlink'});}
};

const createOpportunity = async(req,res)=>{
 try{
    await ensureCompetitorIntelligenceTables();const p=await verifyProject(req.user.userId,req.params.projectId);if(!p)return res.status(404).json({success:false,message:'Project not found'});const b=req.body||{};if(!String(b.referring_domain||'').trim())return res.status(400).json({success:false,message:'Referring domain is required'});const [r]=await db.execute(`INSERT INTO backlink_opportunities(project_id,referring_domain,source_url,target_url,anchor_text,opportunity_type,priority,status,authority,notes) VALUES(?,?,?,?,?,?,?,?,?,?)`,[p.id,b.referring_domain,b.source_url||null,b.target_url||p.website_url,b.anchor_text||null,b.opportunity_type||'other',b.priority||'medium',b.status||'open',b.authority??null,b.notes||null]);res.status(201).json({success:true,id:r.insertId,message:'Backlink opportunity saved'});}catch(e){console.error(e);res.status(500).json({success:false,message:'Unable to save opportunity'});}
};

module.exports={createCompetitor,getCompetitors,getCompetitorById,updateCompetitor,deleteCompetitor,getCompetitorIntelligence,createCompetitorKeyword,createCompetitorBacklink,createOpportunity};
