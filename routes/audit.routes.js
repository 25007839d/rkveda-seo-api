const workerAuthMiddleware = require("../middleware/workerAuth.middleware");
const express = require("express");

const router = express.Router();

const {
    createAudit,
    getAudits,
    getAuditById,
    updateAudit,
    deleteAudit,

    // Worker functions
    updateAuditStatus,
    updateAuditResult

} = require("../controllers/audit.controller");

const authMiddleware = require("../middleware/auth.middleware");


// =====================================================
// PROJECT AUDITS
// =====================================================

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


// =====================================================
// SINGLE AUDIT
// =====================================================

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


// =====================================================
// SEO WORKER ENDPOINTS
// =====================================================

// Mark audit as running
router.put(
    "/audits/:id/status",
    workerAuthMiddleware,
    updateAuditStatus
);

router.put(
    "/audits/:id/result",
    workerAuthMiddleware,
    updateAuditResult
);


module.exports = router;