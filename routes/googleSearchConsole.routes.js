const express = require("express");

const {
    connectGoogle,
    callback,
    getStatus,
    performance
} = require("../controllers/googleSearchConsole.controller");

const router = express.Router();


// Start Google OAuth
router.get(
    "/projects/:projectId/gsc/connect",
    connectGoogle
);


// Google OAuth callback
router.get(
    "/gsc/callback",
    callback
);


// Check GSC connection
router.get(
    "/projects/:projectId/gsc",
    getStatus
);

router.get(
    "/projects/:projectId/gsc/performance",
    performance
);

module.exports = router;