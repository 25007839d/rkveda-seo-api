const express = require("express");

const router = express.Router();

const {
    createCompetitor,
    getCompetitors,
    getCompetitorById,
    updateCompetitor,
    deleteCompetitor
} = require("../controllers/competitor.controller");

const authMiddleware = require("../middleware/auth.middleware");

// Create competitor
router.post(
    "/projects/:projectId/competitors",
    authMiddleware,
    createCompetitor
);

// Get all competitors for project
router.get(
    "/projects/:projectId/competitors",
    authMiddleware,
    getCompetitors
);

// Get single competitor
router.get(
    "/competitors/:id",
    authMiddleware,
    getCompetitorById
);

// Update competitor
router.put(
    "/competitors/:id",
    authMiddleware,
    updateCompetitor
);

// Delete competitor
router.delete(
    "/competitors/:id",
    authMiddleware,
    deleteCompetitor
);

module.exports = router;