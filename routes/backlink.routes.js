const express = require("express");

const router = express.Router();

const {
    createBacklink,
    getBacklinks,
    getBacklinkById,
    updateBacklink,
    deleteBacklink,
    getBacklinkOpportunities
} = require("../controllers/backlink.controller");

const authMiddleware = require("../middleware/auth.middleware");

// Create backlink
router.post(
    "/projects/:projectId/backlinks",
    authMiddleware,
    createBacklink
);

// Get all backlinks for project
router.get(
    "/projects/:projectId/backlinks",
    authMiddleware,
    getBacklinks
);

router.get(
    "/projects/:projectId/backlink-opportunities",
    authMiddleware,
    getBacklinkOpportunities
);

// Get single backlink
router.get(
    "/backlinks/:id",
    authMiddleware,
    getBacklinkById
);

// Update backlink
router.put(
    "/backlinks/:id",
    authMiddleware,
    updateBacklink
);

// Delete backlink
router.delete(
    "/backlinks/:id",
    authMiddleware,
    deleteBacklink
);

module.exports = router;
