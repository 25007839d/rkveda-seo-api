require('dotenv').config();
const db=require('./config/database');
const social=require('./services/socialIntelligence.service');

(async()=>{
  try{
    await social.ensureTables();
    const [rows]=await db.execute(`SELECT c.project_id,c.platform,p.user_id,c.account_name FROM social_connections c JOIN seo_projects p ON p.id=c.project_id WHERE c.status='connected' AND c.platform IN ('facebook','instagram','youtube') ORDER BY c.project_id,c.platform`);
    console.log(`Social sync: ${rows.length} connection(s)`);
    for(const row of rows){
      try{await social.syncPlatform(row.project_id,row.user_id,row.platform);console.log(`OK project=${row.project_id} platform=${row.platform} account=${row.account_name||''}`)}
      catch(e){console.error(`FAILED project=${row.project_id} platform=${row.platform}:`,e.response?.data||e.message)}
    }
  }catch(e){console.error('SOCIAL WORKER FAILED',e);process.exitCode=1}
  finally{await db.end?.();}
})();
