const express = require("express");

const router = express.Router();

const {
    createAudit,
    getAudits,
    getAuditById,
    updateAudit,
    deleteAudit,
    updateAuditStatus,
    updateAuditResult
} = require("../controllers/audit.controller");

const authMiddleware =
    require("../middleware/auth.middleware");

const workerAuthMiddleware =
    require("../middleware/workerAuth.middleware");


// =====================================================
// USER / PROJECT AUDITS
// =====================================================

router.post(
    "/projects/:projectId/audits",
    authMiddleware,
    createAudit
);

router.get(
    "/projects/:projectId/audits",
    authMiddleware,
    getAudits
);


// =====================================================
// USER SINGLE AUDIT
// =====================================================

router.get(
    "/audits/:id",
    authMiddleware,
    getAuditById
);

router.put(
    "/audits/:id",
    authMiddleware,
    updateAudit
);

router.delete(
    "/audits/:id",
    authMiddleware,
    deleteAudit
);


// =====================================================
// WORKER AUDIT ENDPOINTS
// =====================================================

router.get(
    "/worker/audits/:id",
    workerAuthMiddleware,
    getAuditById
);

router.put(
    "/worker/audits/:id/status",
    workerAuthMiddleware,
    updateAuditStatus
);

router.put(
    "/worker/audits/:id/result",
    workerAuthMiddleware,
    updateAuditResult
);


module.exports = router;