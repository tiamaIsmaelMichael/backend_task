import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import connectDB from "./config/db.js";
import userRoutes from "./routes/userRoutes.js"; // ✅ cette ligne est importante
import taskRoutes from "./routes/taskRoutes.js"; // Ajout de l'import des routes de tâches
import projectRoutes from "./routes/projectRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
connectDB();

// Configuration CORS plus détaillée
app.use(
  cors({
    // Autoriser les origines front utilisées en développement
    origin: ["http://localhost:3002", "http://localhost:3000"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    maxAge: 86400 // Cache préflight pour 24 heures
  })
);

// Middleware pour parser le JSON
app.use(express.json());

// Fichiers statiques pour les uploads (avatars)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Middleware pour gérer les erreurs de promesses non gérées
app.use((err, req, res, next) => {
  console.error("Erreur non gérée:", err);
  res.status(500).json({
    message: "Une erreur est survenue sur le serveur",
    error: process.env.NODE_ENV === "development" ? err.message : undefined
  });
});

// ✅ Montage de la route
app.use("/api/users", userRoutes); // très important
app.use("/api/tasks", taskRoutes); // Montage des routes de tâches
app.use("/api/projects", projectRoutes);
app.use("/api/notifications", notificationRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Serveur démarré sur le port ${PORT}`));
