const express=require('express');const auth=require('../middleware/auth.middleware');const c=require('../controllers/socialIntelligence.controller');const router=express.Router();
router.get('/projects/:projectId/seo/social-intelligence',auth,c.overview);
router.get('/projects/:projectId/seo/social-intelligence/:platform/connect',auth,c.connect);
router.get('/projects/:projectId/seo/social-intelligence/:platform/status',auth,c.status);
router.post('/projects/:projectId/seo/social-intelligence/:platform/sync',auth,c.sync);
router.post('/projects/:projectId/seo/social-intelligence/:platform/disconnect',auth,c.disconnect);
router.get('/social/callback',c.callback);
module.exports=router;
