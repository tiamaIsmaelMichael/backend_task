import Project from "../models/Project.js";
import Task from "../models/Task.js";
import Notification from "../models/Notification.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Admin: créer un projet
export const createProject = async (req, res) => {
  try {
    const { name, description, members, maxMembers, startDate, endDate } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Le nom du projet est requis." });
    }

    const normalizedMembers = Array.isArray(members) ? members.filter(Boolean) : [];
    if (maxMembers && normalizedMembers.length > maxMembers) {
      return res.status(400).json({ message: "Le nombre de membres dépasse la capacité." });
    }

    const project = await Project.create({
      name: name.trim(),
      description: description?.trim() || "",
      ownerId: req.userId,
      members: normalizedMembers,
      maxMembers: maxMembers || 10,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    // Créer automatiquement une tâche d'accueil pour chaque membre ajouté
    if (normalizedMembers.length > 0) {
      const welcomeTasks = normalizedMembers.map((memberId) => ({
        title: `Bienvenue sur le projet ${project.name}`,
        description: description?.trim() || "",
        completed: false,
        status: "todo",
        userId: req.userId, // créateur = admin/owner
        assignedTo: memberId,
        projectId: project._id,
        participationStatus: "pending",
        priority: "medium",
        progress: 0,
      }));
      try {
        await Task.insertMany(welcomeTasks);
      } catch (e) {
        console.error("Erreur création tâches d'accueil:", e);
      }
    }

    res.status(201).json(project);
  } catch (error) {
    console.error("Erreur création projet:", error);
    res.status(500).json({ message: "Erreur serveur lors de la création du projet." });
  }
};

// Admin: lister tous les projets
export const listProjects = async (_req, res) => {
  try {
    const projects = await Project.find().sort({ createdAt: -1 });
    res.json(projects);
  } catch (error) {
    console.error("Erreur listage projets:", error);
    res.status(500).json({ message: "Erreur serveur lors de la récupération des projets." });
  }
};

// Admin: supprimer un projet
export const deleteProject = async (req, res) => {
  try {
    const { id } = req.params;
    const project = await Project.findById(id);
    if (!project) {
      return res.status(404).json({ message: "Projet non trouvé." });
    }

    // 1) Nettoyage des fichiers d'uploads référencés par des rapports d'avancement liés aux tâches du projet
    try {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const rootDir = path.join(__dirname, ".."); // dossier backend/

      // Récupérer uniquement les champs nécessaires pour limiter la charge
      const tasksWithReports = await Task.find({ projectId: project._id }, { progressReports: 1 }).lean();
      for (const t of tasksWithReports) {
        const reports = Array.isArray(t.progressReports) ? t.progressReports : [];
        for (const r of reports) {
          const attachments = Array.isArray(r.attachments) ? r.attachments : [];
          for (const a of attachments) {
            const url = a?.url || ""; // ex: /uploads/file-xyz.ext
            if (!url || typeof url !== "string") continue;
            const rel = url.replace(/^\//, "");
            const filePath = path.join(rootDir, rel);
            // Supprimer le fichier si présent sur le disque
            try {
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
              }
            } catch (e) {
              // ne bloque pas la suppression globale si un fichier manque ou est verrouillé
              console.warn("Suppression fichier échouée:", filePath, e?.message);
            }
          }
        }
      }
    } catch (e) {
      // Log non bloquant
      console.warn("Nettoyage fichiers (uploads) partiel/échoué:", e?.message);
    }

    // 2) Suppressions en base au sein d'une transaction pour l'atomicité
    // Suppression en cascade avec transaction pour garantir l'atomicité
    const session = await Project.startSession();
    let deletedTasks = 0;
    let deletedNotifications = 0;
    try {
      await session.withTransaction(async () => {
        const taskDel = await Task.deleteMany({ projectId: project._id }).session(session);
        deletedTasks = taskDel?.deletedCount || 0;

        // Supprimer les notifications liées à ce projet si vous stockez l'id dans data.projectId
        const notifDel = await Notification.deleteMany({ "data.projectId": project._id }).session(session);
        deletedNotifications = notifDel?.deletedCount || 0;

        await Project.deleteOne({ _id: project._id }).session(session);
      });
    } finally {
      session.endSession();
    }

    res.json({
      message: "Projet supprimé avec succès.",
      deleted: { tasks: deletedTasks, notifications: deletedNotifications },
    });
  } catch (error) {
    console.error("Erreur suppression projet:", error);
    res.status(500).json({ message: "Erreur serveur lors de la suppression du projet." });
  }
};

// Admin: mise à jour des membres d'un projet
export const updateProjectMembers = async (req, res) => {
  try {
    const { id } = req.params;
    const { members, maxMembers } = req.body;
    const project = await Project.findById(id);
    if (!project) return res.status(404).json({ message: 'Projet non trouvé.' });

    const normalizedMembers = Array.isArray(members) ? members.filter(Boolean) : [];
    const capacity = typeof maxMembers === 'number' ? maxMembers : project.maxMembers;
    if (normalizedMembers.length > capacity) {
      return res.status(400).json({ message: 'Nombre de membres dépasse la capacité.' });
    }

    const previousMembers = (project.members || []).map((m) => m.toString());
    const nextMembers = normalizedMembers.map(String);

    // Màj des membres du projet
    project.members = normalizedMembers;
    project.maxMembers = capacity;
    await project.save();

    // Désassigner les tâches dont l'assigné ne fait plus partie du projet
    await Task.updateMany(
      { projectId: project._id, assignedTo: { $nin: project.members } },
      { $unset: { assignedTo: "" } }
    );

    // Créer une tâche d'accueil pour les nouveaux membres ajoutés
    const addedMembers = nextMembers.filter((m) => !previousMembers.includes(m));
    if (addedMembers.length > 0) {
      const welcomeTasks = addedMembers.map((memberId) => ({
        title: `Bienvenue sur le projet ${project.name}`,
        description: project.description || "",
        completed: false,
        status: "todo",
        userId: req.userId,
        assignedTo: memberId,
        projectId: project._id,
        participationStatus: "pending",
        priority: "medium",
        progress: 0,
      }));
      try {
        await Task.insertMany(welcomeTasks);
      } catch (e) {
        console.error("Erreur création tâches d'accueil (maj membres):", e);
      }
    }

    res.json(project);
  } catch (error) {
    console.error('Erreur maj membres projet:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// Admin: mise à jour complète d'un projet
export const updateProject = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, members, maxMembers } = req.body;
    const project = await Project.findById(id);
    if (!project) return res.status(404).json({ message: 'Projet non trouvé.' });

    if (typeof name === 'string') project.name = name.trim() || project.name;
    if (typeof description === 'string') project.description = description.trim();

    if (typeof maxMembers === 'number' && maxMembers >= 1) {
      project.maxMembers = maxMembers;
    }

    if (Array.isArray(members)) {
      const normalized = members.filter(Boolean);
      if (normalized.length > project.maxMembers) {
        return res.status(400).json({ message: 'Nombre de membres dépasse la capacité.' });
      }
      project.members = normalized;
    }

    await project.save();

    // Nettoyage des assignations de tâches si nécessaire
    await Task.updateMany(
      { projectId: project._id, assignedTo: { $nin: project.members } },
      { $unset: { assignedTo: "" } }
    );

    res.json(project);
  } catch (error) {
    console.error('Erreur update projet:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};
