const express = require("express");

const router = express.Router();

const {
    createKeyword,
    getKeywords,
    getKeywordById,
    updateKeyword,
    deleteKeyword
} = require("../controllers/keyword.controller");

const authMiddleware = require("../middleware/auth.middleware");

// Create keyword for a project
router.post(
    "/projects/:projectId/keywords",
    authMiddleware,
    createKeyword
);

// Get all keywords for a project
router.get(
    "/projects/:projectId/keywords",
    authMiddleware,
    getKeywords
);

// Get single keyword
router.get(
    "/keywords/:id",
    authMiddleware,
    getKeywordById
);

// Update keyword
router.put(
    "/keywords/:id",
    authMiddleware,
    updateKeyword
);

// Delete keyword
router.delete(
    "/keywords/:id",
    authMiddleware,
    deleteKeyword
);

module.exports = router;