
const express=require('express');
const auth=require('../middleware/auth.middleware');
const c=require('../controllers/socialPublishing.controller');
const router=express.Router();

router.get('/projects/:projectId/social/publishing',auth,c.list);
router.post('/projects/:projectId/social/publishing',auth,c.create);
router.get('/projects/:projectId/social/publishing/:jobId',auth,c.get);
router.post('/projects/:projectId/social/publishing/:jobId/publish',auth,c.publish);
router.post('/projects/:projectId/social/publishing/:jobId/cancel',auth,c.cancel);

module.exports=router;
