const express = require("express");

const {
    connectGoogle,
    callback,
    getStatus,
    performance
} = require("../controllers/googleSearchConsole.controller");

const router = express.Router();


// ==========================================
// GOOGLE SEARCH CONSOLE CONNECT
// ==========================================

router.get(
    "/projects/:projectId/gsc/connect",
    connectGoogle
);


// ==========================================
// GOOGLE OAUTH CALLBACK
// ==========================================

router.get(
    "/gsc/callback",
    callback
);


// ==========================================
// GSC CONNECTION STATUS
// ==========================================

router.get(
    "/projects/:projectId/gsc/status",
    getStatus
);


// ==========================================
// GSC PERFORMANCE
// ==========================================

router.get(
    "/projects/:projectId/gsc/performance",
    performance
);


module.exports = router;