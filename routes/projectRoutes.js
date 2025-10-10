import express from "express";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import { createProject, listProjects, deleteProject, updateProjectMembers, updateProject } from "../controllers/projectController.js";

const router = express.Router();

router.use(authMiddleware, requireRole("admin"));

router.post("/", createProject);
router.get("/", listProjects);
router.delete("/:id", deleteProject);
router.put("/:id/members", updateProjectMembers);
router.put("/:id", updateProject);

export default router;


