const express = require("express");
const authMiddleware = require("../middleware/auth.middleware");

const {
    connectGoogle,
    callback,
    getStatus,
    performance,
    syncHistory,
    history,
    disconnect
} = require("../controllers/googleSearchConsole.controller");

const router = express.Router();

// Project-scoped GSC operations require the logged-in user.
router.get("/projects/:projectId/gsc/connect", authMiddleware, connectGoogle);
router.get("/projects/:projectId/gsc/status", authMiddleware, getStatus);
router.post("/projects/:projectId/gsc/disconnect", authMiddleware, disconnect);
router.get("/projects/:projectId/gsc/performance", authMiddleware, performance);
router.post("/projects/:projectId/gsc/history/sync", authMiddleware, syncHistory);
router.get("/projects/:projectId/gsc/history", authMiddleware, history);

// OAuth callback is public because Google redirects the browser here.
router.get("/gsc/callback", callback);

module.exports = router;
