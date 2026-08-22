const express = require("express");

const router = express.Router();

const {
    createProject,
    getProjects,
    getProjectById,
    updateProject,
    deleteProject
} = require("../controllers/project.controller");

const authMiddleware = require("../middleware/auth.middleware");

// Create project
router.post("/", authMiddleware, createProject);

// Get all projects
router.get("/", authMiddleware, getProjects);

// Get single project
router.get("/:id", authMiddleware, getProjectById);

// Update project
router.put("/:id", authMiddleware, updateProject);

// Delete project
router.delete("/:id", authMiddleware, deleteProject);

module.exports = router;