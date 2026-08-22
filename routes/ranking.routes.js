const express = require("express");

const router = express.Router();

const {
    createRanking,
    getRankings,
    getRankingById,
    updateRanking,
    deleteRanking
} = require("../controllers/ranking.controller");

const authMiddleware = require("../middleware/auth.middleware");

// Create ranking for a keyword
router.post(
    "/keywords/:keywordId/rankings",
    authMiddleware,
    createRanking
);

// Get all rankings for a keyword
router.get(
    "/keywords/:keywordId/rankings",
    authMiddleware,
    getRankings
);

// Get single ranking
router.get(
    "/rankings/:id",
    authMiddleware,
    getRankingById
);

// Update ranking
router.put(
    "/rankings/:id",
    authMiddleware,
    updateRanking
);

// Delete ranking
router.delete(
    "/rankings/:id",
    authMiddleware,
    deleteRanking
);

module.exports = router;