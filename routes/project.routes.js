const express = require("express");

const router = express.Router();


const {

    createProject,

    getProjects,

    getProjectById,

    updateProject,

    deleteProject,

    getProjectDashboard

} = require("../controllers/project.controller");


const authMiddleware =
    require("../middleware/auth.middleware");


// =====================================================
// PROJECT CRUD
// =====================================================


// Create project

router.post(
    "/",
    authMiddleware,
    createProject
);


// Get all projects

router.get(
    "/",
    authMiddleware,
    getProjects
);


// Get project dashboard
// IMPORTANT:
// Keep this BEFORE /:id

router.get(
    "/:id/dashboard",
    authMiddleware,
    getProjectDashboard
);


// Get single project

router.get(
    "/:id",
    authMiddleware,
    getProjectById
);


// Update project

router.put(
    "/:id",
    authMiddleware,
    updateProject
);


// Delete project

router.delete(
    "/:id",
    authMiddleware,
    deleteProject
);


module.exports = router;