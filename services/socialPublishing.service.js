
const axios = require('axios');
const db = require('../config/database');
const social = require('./socialIntelligence.service');
const gbp = require('./googleBusinessProfile.service');

const META_VERSION = process.env.META_GRAPH_VERSION || 'v26.0';

async function ensureTables() {
  await db.query(`CREATE TABLE IF NOT EXISTS social_publish_jobs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    project_id BIGINT UNSIGNED NOT NULL,
    created_by BIGINT UNSIGNED NULL,
    caption TEXT NULL,
    link_url VARCHAR(2000) NULL,
    media_url VARCHAR(2000) NULL,
    media_type ENUM('none','image','video') NOT NULL DEFAULT 'none',
    scheduled_at DATETIME NULL,
    status ENUM('draft','scheduled','publishing','published','partial','failed','cancelled') NOT NULL DEFAULT 'draft',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    published_at DATETIME NULL,
    error_message TEXT NULL,
    KEY idx_publish_jobs_due(status,scheduled_at),
    KEY idx_publish_jobs_project(project_id),
    CONSTRAINT fk_publish_jobs_project FOREIGN KEY(project_id) REFERENCES seo_projects(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
  await db.query(`CREATE TABLE IF NOT EXISTS social_publish_targets (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    job_id BIGINT UNSIGNED NOT NULL,
    platform ENUM('facebook','instagram','gbp') NOT NULL,
    location_id VARCHAR(255) NULL,
    status ENUM('pending','publishing','published','failed','cancelled') NOT NULL DEFAULT 'pending',
    external_id VARCHAR(1000) NULL,
    external_url VARCHAR(2000) NULL,
    error_message TEXT NULL,
    published_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_publish_target(job_id,platform,location_id),
    KEY idx_publish_targets_job(job_id),
    CONSTRAINT fk_publish_target_job FOREIGN KEY(job_id) REFERENCES social_publish_jobs(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
}

async function owned(projectId,userId){
  const [r]=await db.execute('SELECT id FROM seo_projects WHERE id=? AND user_id=? LIMIT 1',[projectId,userId]);
  return !!r[0];
}

function validateInput(body){
  const caption=String(body.caption||'').trim();
  const linkUrl=String(body.linkUrl||'').trim() || null;
  const mediaUrl=String(body.mediaUrl||'').trim() || null;
  const mediaType=['none','image','video'].includes(body.mediaType)?body.mediaType:(mediaUrl?'image':'none');
  const platforms=Array.isArray(body.platforms)?body.platforms.filter(x=>['facebook','instagram','gbp'].includes(x)): [];
  if(!caption) throw new Error('Caption/message is required.');
  if(!platforms.length) throw new Error('Select at least one publishing destination.');
  if(mediaType!=='none'&&!mediaUrl) throw new Error('A public media URL is required for image/video publishing.');
  if(mediaUrl && !/^https?:\/\//i.test(mediaUrl)) throw new Error('Media URL must be a public http(s) URL.');
  if(linkUrl && !/^https?:\/\//i.test(linkUrl)) throw new Error('Link URL must be a public http(s) URL.');
  return {caption,linkUrl,mediaUrl,mediaType,platforms};
}

async function createJob({projectId,userId,body}){
  if(!await owned(projectId,userId)) throw new Error('Project not found');
  await ensureTables();
  const v=validateInput(body);
  let scheduledAt=body.scheduledAt?new Date(body.scheduledAt):null;
  if(scheduledAt && Number.isNaN(scheduledAt.getTime())) throw new Error('Invalid scheduledAt.');
  const now=new Date();
  const status=scheduledAt && scheduledAt>now?'scheduled':'draft';
  if(v.platforms.includes('gbp') && scheduledAt && scheduledAt-now>30*86400000) throw new Error('Google Business Profile scheduled content must be published within 30 days.');
  const [r]=await db.execute(`INSERT INTO social_publish_jobs(project_id,created_by,caption,link_url,media_url,media_type,scheduled_at,status) VALUES(?,?,?,?,?,?,?,?)`,
    [projectId,userId,v.caption,v.linkUrl,v.mediaUrl,v.mediaType,scheduledAt,status]);
  const jobId=r.insertId;
  for(const platform of v.platforms){
    await db.execute(`INSERT INTO social_publish_targets(job_id,platform,location_id) VALUES(?,?,?)`,[jobId,platform,null]);
  }
  return getJob(jobId,projectId,userId);
}

async function getJob(id,projectId,userId){
  if(!await owned(projectId,userId)) throw new Error('Project not found');
  const [[job]]=await db.execute('SELECT * FROM social_publish_jobs WHERE id=? AND project_id=?',[id,projectId]);
  if(!job) throw new Error('Publish job not found');
  const [targets]=await db.execute('SELECT * FROM social_publish_targets WHERE job_id=? ORDER BY platform',[id]);
  return {...job,targets};
}

async function listJobs(projectId,userId){
  if(!await owned(projectId,userId)) throw new Error('Project not found');
  await ensureTables();
  const [rows]=await db.execute(`SELECT j.*, GROUP_CONCAT(t.platform ORDER BY t.platform) platforms,
      SUM(t.status='published') published_targets, SUM(t.status='failed') failed_targets
      FROM social_publish_jobs j LEFT JOIN social_publish_targets t ON t.job_id=j.id
      WHERE j.project_id=? GROUP BY j.id ORDER BY COALESCE(j.scheduled_at,j.created_at) DESC LIMIT 100`,[projectId]);
  return rows;
}

async function getConnection(projectId,platform){
  const [rows]=await db.execute('SELECT * FROM social_connections WHERE project_id=? AND platform=? AND status=\'connected\' LIMIT 1',[projectId,platform]);
  return rows[0]||null;
}

async function publishFacebook(job,target){
  const c=await getConnection(job.project_id,'facebook');
  if(!c?.account_id||!c.access_token) throw new Error('Facebook Page is not connected. Reconnect Facebook after enabling publishing permissions.');
  let endpoint=`https://graph.facebook.com/${META_VERSION}/${c.account_id}/feed`;
  const body={message:job.caption};
  if(job.link_url) body.link=job.link_url;
  if(job.media_url && job.media_type==='image'){
    endpoint=`https://graph.facebook.com/${META_VERSION}/${c.account_id}/photos`;
    body.url=job.media_url;
  }
  const r=await axios.post(endpoint,body,{params:{access_token:c.access_token}});
  return {externalId:r.data.id,externalUrl:null};
}

async function publishInstagram(job,target){
  const c=await getConnection(job.project_id,'instagram');
  if(!c?.account_id||!c.access_token) throw new Error('Instagram Professional account is not connected. Reconnect Instagram after enabling content publishing.');
  if(!job.media_url) throw new Error('Instagram publishing requires a public image/video URL.');
  const createBody={caption:job.caption};
  if(job.media_type==='video'){ createBody.media_type='REELS'; createBody.video_url=job.media_url; }
  else { createBody.image_url=job.media_url; createBody.media_type='IMAGE'; }
  const container=await axios.post(`https://graph.facebook.com/${META_VERSION}/${c.account_id}/media`,createBody,{params:{access_token:c.access_token}});
  const creationId=container.data.id;
  if(job.media_type==='video'){
    let ready=false;
    for(let i=0;i<12;i++){
      await new Promise(r=>setTimeout(r,5000));
      const status=await axios.get(`https://graph.facebook.com/${META_VERSION}/${creationId}`,{params:{fields:'status_code,status',access_token:c.access_token}});
      const code=status.data.status_code;
      if(code==='FINISHED'){ready=true;break;}
      if(code==='ERROR'||code==='EXPIRED') throw new Error(`Instagram media processing failed (${code}).`);
    }
    if(!ready) throw new Error('Instagram video is still processing. Retry the publishing job after processing completes.');
  }
  const published=await axios.post(`https://graph.facebook.com/${META_VERSION}/${c.account_id}/media_publish`,{creation_id:creationId},{params:{access_token:c.access_token}});
  return {externalId:published.data.id,externalUrl:null};
}

async function publishGbp(job,target){
  const c=await gbp.getConnectionByProject(job.project_id);
  if(!c?.account_id||!c?.location_id) throw new Error('Google Business Profile is not connected or no location is selected.');
  const locationId=target.location_id||c.location_id;
  const accountId=c.account_id;
  const post={
    languageCode: process.env.GBP_POST_LANGUAGE_CODE || 'en-US',
    summary:job.caption,
    topicType:'STANDARD'
  };
  if(job.link_url) post.callToAction={actionType:'LEARN_MORE',url:job.link_url};
  if(job.media_url) post.media=[{mediaFormat:job.media_type==='video'?'VIDEO':'PHOTO',sourceUrl:job.media_url}];
  const access=await (async()=>{ 
    const client = require('googleapis').google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID,process.env.GOOGLE_CLIENT_SECRET,process.env.GOOGLE_GBP_REDIRECT_URI);
    client.setCredentials({access_token:c.access_token,refresh_token:c.refresh_token||undefined,expiry_date:c.token_expiry?new Date(c.token_expiry).getTime():undefined});
    const t=await client.getAccessToken(); return t.token||c.access_token;
  })();
  const url=`https://mybusiness.googleapis.com/v4/accounts/${encodeURIComponent(accountId)}/locations/${encodeURIComponent(locationId)}/localPosts`;
  const r=await axios.post(url,post,{headers:{Authorization:`Bearer ${access}`}});
  return {externalId:r.data.name||r.data.localPostId||null,externalUrl:null};
}

async function publishTarget(job,target){
  if(target.platform==='facebook') return publishFacebook(job,target);
  if(target.platform==='instagram') return publishInstagram(job,target);
  if(target.platform==='gbp') return publishGbp(job,target);
  throw new Error(`Publishing for ${target.platform} is not enabled.`);
}

async function processJob(jobId){
  await ensureTables();
  const [[job]]=await db.execute(`SELECT * FROM social_publish_jobs WHERE id=? FOR UPDATE`,[jobId]);
  if(!job) throw new Error('Publish job not found.');
  if(['published','cancelled'].includes(job.status)) return job;
  if(job.scheduled_at && new Date(job.scheduled_at)>new Date()) return job;
  await db.execute(`UPDATE social_publish_jobs SET status='publishing',error_message=NULL WHERE id=?`,[jobId]);
  const [targets]=await db.execute(`SELECT * FROM social_publish_targets WHERE job_id=? AND status IN ('pending','failed') ORDER BY platform`,[jobId]);
  let success=0, failed=0;
  for(const target of targets){
    await db.execute(`UPDATE social_publish_targets SET status='publishing',error_message=NULL WHERE id=?`,[target.id]);
    try{
      const result=await publishTarget(job,target);
      await db.execute(`UPDATE social_publish_targets SET status='published',external_id=?,external_url=?,published_at=CURRENT_TIMESTAMP WHERE id=?`,
        [result.externalId||null,result.externalUrl||null,target.id]);
      success++;
      if(target.platform!=='gbp'){
        await db.execute(`INSERT INTO social_posts(project_id,platform,post_url,published_at,caption,source) VALUES(?,?,?,?,?,'api-published')`,
          [job.project_id,target.platform,result.externalUrl||result.externalId||null,new Date(),job.caption]);
      }
    }catch(e){
      failed++;
      const msg=e.response?.data?.error?.message||e.response?.data?.error_description||e.message||'Publishing failed';
      await db.execute(`UPDATE social_publish_targets SET status='failed',error_message=? WHERE id=?`,[msg,target.id]);
    }
  }
  const status=success && !failed?'published':success?'partial':'failed';
  await db.execute(`UPDATE social_publish_jobs SET status=?,published_at=?,error_message=? WHERE id=?`,
    [status,success?new Date():null,failed?`${failed} destination(s) failed.`:null,jobId]);
  return getJobById(jobId);
}

async function getJobById(id){
  const [[job]]=await db.execute('SELECT * FROM social_publish_jobs WHERE id=?',[id]);
  if(!job)return null;
  const [targets]=await db.execute('SELECT * FROM social_publish_targets WHERE job_id=? ORDER BY platform',[id]);
  return {...job,targets};
}

async function publishNow(jobId,projectId,userId){
  if(!await owned(projectId,userId)) throw new Error('Project not found');
  const [[j]]=await db.execute('SELECT id FROM social_publish_jobs WHERE id=? AND project_id=?',[jobId,projectId]);
  if(!j) throw new Error('Publish job not found');
  return processJob(jobId);
}

async function cancel(jobId,projectId,userId){
  if(!await owned(projectId,userId)) throw new Error('Project not found');
  await db.execute(`UPDATE social_publish_jobs SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=? AND project_id=? AND status IN ('draft','scheduled','failed')`,[jobId,projectId]);
  await db.execute(`UPDATE social_publish_targets SET status='cancelled' WHERE job_id=? AND status='pending'`,[jobId]);
  return getJob(jobId,projectId,userId);
}

async function processDueJobs(){
  await ensureTables();
  const [jobs]=await db.execute(`SELECT id FROM social_publish_jobs WHERE status IN ('scheduled','failed','partial') AND (scheduled_at IS NULL OR scheduled_at<=CURRENT_TIMESTAMP) ORDER BY COALESCE(scheduled_at,created_at) ASC LIMIT 20`);
  for(const j of jobs){ try{await processJob(j.id);}catch(e){console.error('PUBLISH JOB',j.id,e.message);} }
}

module.exports={ensureTables,createJob,getJob,listJobs,publishNow,cancel,processDueJobs};
