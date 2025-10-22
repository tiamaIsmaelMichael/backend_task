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
const allowedOrigins = [
  "http://localhost:3002",
  "http://localhost:3000",
  process.env.FRONTEND_ORIGIN,
  process.env.FRONTEND_ORIGIN_2,
  "https://frontend-task-app-lake.vercel.app"
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (/^https?:\/\/[^/]*vercel\.app$/i.test(origin)) return callback(null, true);
    return callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "Accept",
    "X-Requested-With"
  ],
  credentials: true,
  maxAge: 86400,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// Middleware pour parser le JSON
app.use(express.json());

// Fichiers statiques pour les uploads (avatars)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ✅ Montage de la route
app.use("/api/users", userRoutes); // très important
app.use("/api/tasks", taskRoutes); // Montage des routes de tâches
app.use("/api/projects", projectRoutes);
app.use("/api/notifications", notificationRoutes);

// Middleware pour gérer les erreurs de promesses non gérées (après les routes)
app.use((err, req, res, next) => {
  console.error("Erreur non gérée:", err);
  res.status(500).json({
    message: "Une erreur est survenue sur le serveur",
    error: process.env.NODE_ENV === "development" ? err.message : undefined
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Serveur démarré sur le port ${PORT}`));
