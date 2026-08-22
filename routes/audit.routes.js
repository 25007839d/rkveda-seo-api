const express = require("express");

const router = express.Router();

const {
    createAudit,
    getAudits,
    getAuditById,
    updateAudit,
    deleteAudit
} = require("../controllers/audit.controller");

const authMiddleware = require("../middleware/auth.middleware");

// Create audit for a project
router.post(
    "/projects/:projectId/audits",
    authMiddleware,
    createAudit
);

// Get all audits for a project
router.get(
    "/projects/:projectId/audits",
    authMiddleware,
    getAudits
);

// Get single audit
router.get(
    "/audits/:id",
    authMiddleware,
    getAuditById
);

// Update audit
router.put(
    "/audits/:id",
    authMiddleware,
    updateAudit
);

// Delete audit
router.delete(
    "/audits/:id",
    authMiddleware,
    deleteAudit
);

module.exports = router;