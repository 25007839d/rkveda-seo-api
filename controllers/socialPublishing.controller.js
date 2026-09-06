
const db=require('../config/database');
const publisher=require('../services/socialPublishing.service');

async function owned(projectId,userId){
  const [r]=await db.execute('SELECT id FROM seo_projects WHERE id=? AND user_id=? LIMIT 1',[projectId,userId]);
  return !!r[0];
}

async function create(req,res){
  try{
    const projectId=Number(req.params.projectId);
    const job=await publisher.createJob({projectId,userId:req.user.userId,body:req.body||{}});
    res.status(201).json({success:true,job});
  }catch(e){res.status(400).json({success:false,message:e.message||'Unable to create publishing job'});}
}
async function list(req,res){
  try{
    const projectId=Number(req.params.projectId);
    if(!await owned(projectId,req.user.userId)) return res.status(404).json({success:false,message:'Project not found'});
    res.json({success:true,jobs:await publisher.listJobs(projectId,req.user.userId)});
  }catch(e){res.status(500).json({success:false,message:e.message});}
}
async function get(req,res){
  try{
    const projectId=Number(req.params.projectId);
    res.json({success:true,job:await publisher.getJob(Number(req.params.jobId),projectId,req.user.userId)});
  }catch(e){res.status(404).json({success:false,message:e.message});}
}
async function publish(req,res){
  try{
    const projectId=Number(req.params.projectId);
    const job=await publisher.publishNow(Number(req.params.jobId),projectId,req.user.userId);
    res.json({success:true,job});
  }catch(e){res.status(400).json({success:false,message:e.message});}
}
async function cancel(req,res){
  try{
    const projectId=Number(req.params.projectId);
    const job=await publisher.cancel(Number(req.params.jobId),projectId,req.user.userId);
    res.json({success:true,job});
  }catch(e){res.status(400).json({success:false,message:e.message});}
}
module.exports={create,list,get,publish,cancel};
