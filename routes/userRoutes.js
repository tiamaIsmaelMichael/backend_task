// backend/routes/userRoutes.js
import express from "express";
import { registerUser, loginUser, adminListUsers, adminDeleteUser, adminResetPassword, updateProfile, listAllUsersBasic } from "../controllers/userController.js";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { authMiddleware, requireRole } from "../middleware/auth.js";

const router = express.Router();

// Route POST pour l'inscription
router.post("/register", registerUser);

// Route POST pour la connexion
router.post("/login", loginUser);

// Profil utilisateur (auth)
router.put("/me", authMiddleware, updateProfile);

// Nouvelle route: liste simple des utilisateurs (sélection collaborateur)
router.get("/list-basic", authMiddleware, listAllUsersBasic);

// Upload avatar (auth)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (_req, file, cb) {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || ".png";
    cb(null, `avatar-${unique}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Format d'image non supporté"));
    }
    cb(null, true);
  },
});

router.post(
  "/me/avatar",
  authMiddleware,
  (req, res, next) => {
    upload.single("avatar")(req, res, function (err) {
      if (err) {
        const message = err.message || "Erreur lors de l'upload";
        return res.status(400).json({ message });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "Aucun fichier reçu." });
      }
      const publicUrl = `/uploads/${req.file.filename}`;
      res.status(201).json({ url: publicUrl });
    } catch (error) {
      console.error("Erreur upload avatar:", error);
      res.status(500).json({ message: "Erreur serveur." });
    }
  }
);

// Admin users
router.get("/admin", authMiddleware, requireRole("admin"), adminListUsers);
router.delete("/admin/:id", authMiddleware, requireRole("admin"), adminDeleteUser);
router.post("/admin/:id/reset-password", authMiddleware, requireRole("admin"), adminResetPassword);

export default router;
