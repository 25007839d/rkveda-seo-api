const express = require("express");

const router = express.Router();

const {
    createAudit,
    getAudits,
    getAuditById,
    updateAudit,
    deleteAudit,

    getAuditForWorker,
    updateAuditStatus,
    updateAuditResult

} = require("../controllers/audit.controller");

const authMiddleware =
    require("../middleware/auth.middleware");

const workerAuthMiddleware =
    require("../middleware/workerAuth.middleware");


// =====================================================
// USER APIs
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
// WORKER APIs
// =====================================================

router.get(
    "/worker/audits/:id",
    workerAuthMiddleware,
    getAuditForWorker
);

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