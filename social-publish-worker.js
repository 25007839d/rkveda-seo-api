
require('dotenv').config();
const publisher=require('./services/socialPublishing.service');

(async()=>{
 try{
   await publisher.ensureTables();
   await publisher.processDueJobs();
   console.log('Social publishing worker completed.');
 }catch(e){
   console.error('SOCIAL PUBLISH WORKER FAILED',e.response?.data||e);
   process.exitCode=1;
 }
})();
