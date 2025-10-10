import express from "express";
import {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  adminListAllTasks,
  adminAssignTask,
  adminValidateTask,
  adminMarkDone,
  adminTeamStats,
  acceptTask,
  declineTask,
  submitProgress,
  reviewProgress,
  getTaskReports,
  adminCreateTaskWithAttachments
} from "../controllers/taskController.js";
import { authMiddleware, requireRole } from "../middleware/auth.js";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const router = express.Router();

// Toutes les routes nécessitent un token valide (authMiddleware)
router.use(authMiddleware);

// GET /api/tasks - récupère toutes les tâches de l'utilisateur connecté
router.get("/", getTasks);

// POST /api/tasks - crée une nouvelle tâche liée à l'utilisateur connecté
router.post("/", createTask);

// PUT /api/tasks/:id - met à jour la tâche
router.put("/:id", updateTask);

// DELETE /api/tasks/:id - supprime la tâche
router.delete("/:id", deleteTask);

// Actions utilisateur sur tâches
router.post("/:id/accept", acceptTask);
router.post("/:id/decline", declineTask);
// Upload multiples pour les rapports d'avancement
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `progress-${unique}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

router.post("/:id/progress", upload.array("files", 5), submitProgress);

// Consulter les soumissions d'une tâche
router.get("/:id/progress", getTaskReports);

// Admin routes
router.get("/admin/all", requireRole("admin"), adminListAllTasks);
router.post("/admin/:id/assign", requireRole("admin"), adminAssignTask);
router.post("/admin/:id/validate", requireRole("admin"), adminValidateTask);
router.post("/admin/:id/done", requireRole("admin"), adminMarkDone);
router.get("/admin/stats", requireRole("admin"), adminTeamStats);
router.post("/admin/:id/progress/:reportId/review", requireRole("admin"), reviewProgress);

// Création de tâche projet (avec fichiers)
router.post("/admin/project-task", requireRole("admin"), upload.array("files", 5), adminCreateTaskWithAttachments);

export default router;
