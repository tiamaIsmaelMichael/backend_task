// backend/controllers/taskController.js
import Task from "../models/Task.js";
import Project from "../models/Project.js";
import Notification from "../models/Notification.js";
import User from "../models/User.js";

// ✅ Récupérer toutes les tâches de l'utilisateur connecté
export const getTasks = async (req, res) => {
  try {
    // Voir ses propres tâches + celles qui lui sont assignées
    const docs = await Task.find({
      $or: [
        { userId: req.userId },
        { assignedTo: req.userId }
      ]
    })
      .sort({ createdAt: -1 })
      .lean();

    const tasks = docs.map((t) => ({
      ...t,
      _id: t._id?.toString?.() || t._id,
      userId: t.userId?.toString?.() || t.userId,
      assignedTo: t.assignedTo?.toString?.() || t.assignedTo,
      projectId: t.projectId?.toString?.() || t.projectId,
      validatedBy: t.validatedBy?.toString?.() || t.validatedBy,
      progressReports: Array.isArray(t.progressReports)
        ? t.progressReports.map((r) => ({
            ...r,
            _id: r._id?.toString?.() || r._id,
            userId: r.userId?.toString?.() || r.userId,
            reviewedBy: r.reviewedBy?.toString?.() || r.reviewedBy,
          }))
        : [],
      participationLogs: Array.isArray(t.participationLogs)
        ? t.participationLogs.map((p) => ({
            ...p,
            userId: p.userId?.toString?.() || p.userId,
            at: p.at,
          }))
        : [],
    }));

    res.json(tasks);
  } catch (error) {
    console.error("Erreur lors de la récupération des tâches :", error);
    res.status(500).json({
      message: "Erreur serveur lors de la récupération des tâches.",
    });
  }
};

// ✅ Créer une nouvelle tâche
export const createTask = async (req, res) => {
  console.log("⭐ Création d'une nouvelle tâche");
  console.log("Body reçu:", req.body);
  console.log("userId:", req.userId);

  const { title, description, dueDate, priority, projectId } = req.body;
  let { assignedTo, visibility } = req.body;

  if (!title || typeof title !== "string" || title.trim() === "") {
    console.log("❌ Titre manquant ou invalide");
    return res.status(400).json({ message: "Le titre est requis." });
  }

  try {
    // Normaliser assignedTo en tableau si visibilité partagée
    visibility = visibility || 'personal';
    let assignedArray = [];
    if (visibility === 'shared') {
      if (Array.isArray(assignedTo)) {
        assignedArray = assignedTo.filter(Boolean);
      } else if (assignedTo) {
        assignedArray = [assignedTo];
      }
      // Empêcher de s'auto-assigner
      assignedArray = assignedArray.filter((u) => String(u) !== String(req.userId));
    }

    // Si une tâche est liée à un projet et assignée, vérifier que tous les assignés sont membres du projet
    if (projectId && assignedArray.length > 0) {
      const proj = await Project.findById(projectId).select('members');
      if (!proj) return res.status(400).json({ message: 'Projet invalide.' });
      const members = (proj.members || []).map(String);
      for (const uid of assignedArray) {
        if (!members.includes(String(uid))) {
          return res.status(400).json({ message: "Un collaborateur sélectionné n'appartient pas au projet." });
        }
      }
    }

    const taskData = {
      title: title.trim(),
      description: description?.trim() || "",
      dueDate: dueDate ? new Date(dueDate) : null,
      // Forcer la progression initiale à 0 (le client ne peut plus la définir)
      progress: 0,
      priority: priority || "medium",
      userId: req.userId,
      completed: false,
      projectId: projectId || undefined,
      // Pour compat compatibilité schéma actuel, on met le premier dans assignedTo et on stocke aussi tous dans assignedToMany si présent
      assignedTo: assignedArray[0] || undefined,
      visibility,
    };

    console.log("📦 Données de la tâche à créer:", taskData);

    const newTask = new Task(taskData);
    const savedTask = await newTask.save();

    // Notifications aux collaborateurs sélectionnés
    try {
      if (assignedArray.length > 0) {
        for (const uid of assignedArray) {
          await Notification.create({
            recipientId: uid,
            type: 'task_assignment',
            title: 'Nouvelle tâche partagée',
            message: `${req.user?.firstName || 'Un utilisateur'} ${req.user?.lastName || ''} vous a sélectionné comme collaborateur sur "${taskData.title}"`,
            data: {
              taskId: savedTask._id,
              projectId: savedTask.projectId,
              assignedBy: req.userId,
              userName: `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim(),
              at: new Date().toISOString()
            }
          });
        }
      }
    } catch (notifyErr) {
      console.warn('Notification assignation échouée', notifyErr?.message);
    }

    console.log("✅ Tâche créée avec succès:", savedTask);
    res.status(201).json(savedTask);
  } catch (error) {
    console.error("❌ Erreur lors de la création de la tâche :", error);
    res
      .status(500)
      .json({ 
        message: "Erreur serveur lors de la création de la tâche.",
        error: error.message 
      });
  }
};

// ✅ Mettre à jour une tâche existante
export const updateTask = async (req, res) => {
  const { id } = req.params;
  const { title, description, dueDate, completed, progress, priority, status, projectId, assignedTo, visibility } = req.body;

  try {
    const task = await Task.findById(id);

    if (!task) {
      return res.status(404).json({ message: "Tâche non trouvée." });
    }

    const isAdmin = req.user?.role === 'admin';
    const isOwner = String(task.userId) === String(req.userId);
    const isAssignee = String(task.assignedTo) === String(req.userId) || (Array.isArray(task.assignedTo) && task.assignedTo.map(String).includes(String(req.userId)));
    // Règles d'édition
    if (task.projectId) {
      // Tâche liée à un projet: seul l'admin peut modifier
      if (!isAdmin) return res.status(403).json({ message: "Seul l'administrateur peut modifier une tâche de projet." });
    } else {
      // Tâche hors projet: seul le créateur (ou admin) peut modifier
      if (!isOwner && !isAdmin) return res.status(403).json({ message: "Vous ne pouvez modifier que vos propres tâches." });
    }

    task.title = title?.trim() ?? task.title;
    task.description = description?.trim() ?? task.description;
    task.dueDate = dueDate ? new Date(dueDate) : task.dueDate;

    // Sur une tâche de projet, empêcher un non-admin (déjà bloqué plus haut) de piloter l'état de complétion
    if (typeof completed === "boolean") {
      if (task.projectId && !isAdmin) {
        // sécurité supplémentaire
      } else {
        task.completed = completed;
      }
    }

    if (typeof progress === "number") {
      if (task.projectId && !isAdmin) {
        // progression sur projet pilotée via reviewProgress par l'admin
      } else {
        task.progress = Math.max(0, Math.min(100, progress));
      }
    }

    if (status) {
      if (task.projectId && !isAdmin) {
        // statut projet piloté par admin uniquement
      } else {
        task.status = status;
      }
    }

    // Ne pas permettre de déplacer une tâche vers/depuis un projet via update standard
    if (!task.projectId) {
      // hors projet, possibilité d'ajuster meta
      task.assignedTo = assignedTo ?? task.assignedTo;
      task.visibility = visibility ?? task.visibility;
    }

    await task.save();
    res.json(task);
  } catch (error) {
    console.error("Erreur lors de la mise à jour de la tâche :", error);
    res
      .status(500)
      .json({ message: "Erreur serveur lors de la mise à jour de la tâche." });
  }
};

// ✅ Supprimer une tâche
export const deleteTask = async (req, res) => {
  try {
    const { id } = req.params;
    const task = await Task.findById(id);
    if (!task) return res.status(404).json({ message: "Tâche non trouvée." });

    // Règles:
    // - Tâche de projet (projectId défini): seul un admin peut supprimer
    // - Tâche hors projet: seul le créateur (ou admin) peut supprimer
    const isAdmin = req.user?.role === 'admin';
    const isOwner = String(task.userId) === String(req.userId);

    if (task.projectId) {
      if (!isAdmin) {
        return res.status(403).json({ message: "Seul l'administrateur peut supprimer une tâche de projet." });
      }
    } else {
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ message: "Vous ne pouvez supprimer que vos propres tâches." });
      }
    }

    await task.deleteOne();
    return res.json({ message: "Tâche supprimée." });
  } catch (error) {
    console.error("Erreur suppression tâche:", error);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// User: accepter une tâche
export const acceptTask = async (req, res) => {
  try {
    const { id } = req.params;
    const task = await Task.findById(id);
    if (!task) return res.status(404).json({ message: 'Tâche non trouvée.' });
    // Autoriser si l'utilisateur courant est dans la liste d'assignation (support mono/array)
    const isAssignee = String(task.assignedTo) === req.userId || (Array.isArray(task.assignedTo) && task.assignedTo.map(String).includes(String(req.userId)));
    if (!isAssignee) return res.status(403).json({ message: 'Non autorisé.' });
    task.participationStatus = 'accepted';
    task.participationLogs = task.participationLogs || [];
    task.participationLogs.push({ userId: req.userId, userName: `${req.user.firstName} ${req.user.lastName}`, status: 'accepted', at: new Date() });
    await task.save();
    // notifier l'owner du projet ou l'auteur
    const recipient = task.userId;
    await Notification.create({
      recipientId: recipient,
      type: 'task_participation',
      title: 'Participation acceptée',
      message: `${req.user.firstName} ${req.user.lastName} a accepté la tâche.`,
      data: { taskId: task._id, assignedTo: req.userId, projectId: task.projectId, status: 'accepted', userName: `${req.user.firstName} ${req.user.lastName}`, at: new Date().toISOString() }
    });
    res.json(task);
  } catch (e) {
    console.error('acceptTask error', e);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// User: refuser une tâche
export const declineTask = async (req, res) => {
  try {
    const { id } = req.params;
    const task = await Task.findById(id);
    if (!task) return res.status(404).json({ message: 'Tâche non trouvée.' });
    const isAssignee = String(task.assignedTo) === req.userId || (Array.isArray(task.assignedTo) && task.assignedTo.map(String).includes(String(req.userId)));
    if (!isAssignee) return res.status(403).json({ message: 'Non autorisé.' });
    task.participationStatus = 'declined';
    task.participationLogs = task.participationLogs || [];
    task.participationLogs.push({ userId: req.userId, userName: `${req.user.firstName} ${req.user.lastName}`, status: 'declined', at: new Date() });
    await task.save();
    const recipient = task.userId;
    await Notification.create({
      recipientId: recipient,
      type: 'task_participation',
      title: 'Participation refusée',
      message: `${req.user.firstName} ${req.user.lastName} a refusé la tâche.`,
      data: { taskId: task._id, assignedTo: req.userId, projectId: task.projectId, status: 'declined', userName: `${req.user.firstName} ${req.user.lastName}`, at: new Date().toISOString() }
    });
    res.json(task);
  } catch (e) {
    console.error('declineTask error', e);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// User: soumettre un compte-rendu d'avancement
export const submitProgress = async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const task = await Task.findById(id);
    if (!task) return res.status(404).json({ message: 'Tâche non trouvée.' });
    // Autoriser le collaborateur assigné (mono/array) OU le créateur à soumettre un avancement (utile pour les tâches partagées)
    const isAssignee = String(task.assignedTo) === req.userId || (Array.isArray(task.assignedTo) && task.assignedTo.map(String).includes(String(req.userId)));
    if (!isAssignee && String(task.userId) !== req.userId) {
      return res.status(403).json({ message: 'Non autorisé.' });
    }
    if (!content || !content.trim()) return res.status(400).json({ message: 'Contenu requis.' });
    const attachments = Array.isArray(req.files) ? req.files.map(f => ({
      filename: f.filename,
      originalname: f.originalname,
      size: f.size,
      url: `/uploads/${f.filename}`,
      mimetype: f.mimetype,
    })) : [];

    const report = { userId: req.userId, content: content.trim(), status: 'submitted', attachments };
    task.progressReports.push(report);
    await task.save();

    // Notifier l'autre partie (créateur ↔ collaborateur) s'il existe
    try {
      const isAuthor = String(task.userId) === String(req.userId);
      let recipients = [];
      if (isAuthor) {
        // notifier tous les collaborateurs s'il y en a plusieurs
        if (Array.isArray(task.assignedTo)) recipients = task.assignedTo;
        else if (task.assignedTo) recipients = [task.assignedTo];
      } else {
        recipients = [task.userId];
      }
      // Exclure les administrateurs des destinataires (soumissions entre collaborateurs uniquement)
      if (recipients.length > 0) {
        const users = await User.find({ _id: { $in: recipients } }, 'role').lean();
        const nonAdminSet = new Set(users.filter(u => u.role !== 'admin').map(u => String(u._id)));
        recipients = recipients.filter(id => nonAdminSet.has(String(id)));
      }
      for (const recipientId of recipients) {
        if (!recipientId) continue;
        await Notification.create({
          recipientId,
          type: 'progress_submitted',
          title: 'Nouveau compte-rendu d\'avancement',
          message: `${req.user?.firstName || 'Un utilisateur'} ${req.user?.lastName || ''} a soumis un avancement sur "${task.title}"`,
          data: {
            taskId: task._id,
            projectId: task.projectId,
            reportId: task.progressReports[task.progressReports.length - 1]?._id,
            byUserId: req.userId,
            byUserName: `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim(),
            at: new Date().toISOString()
          }
        });
      }
    } catch (notifyErr) {
      console.warn('Notification submitProgress échouée', notifyErr?.message);
    }

    res.status(201).json(task);
  } catch (e) {
    console.error('submitProgress error', e);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// Admin: voir toutes les tâches
export const adminListAllTasks = async (req, res) => {
  try {
    const docs = await Task.find().sort({ createdAt: -1 }).lean();
    const adminId = String(req.userId);
    const tasks = docs.map((t) => {
      const isOwner = String(t.userId) === adminId;
      const isAssignee = Array.isArray(t.assignedTo)
        ? t.assignedTo.map(String).includes(adminId)
        : String(t.assignedTo) === adminId;
      const canSeeReports = isOwner || isAssignee;
      return ({
        ...t,
        _id: t._id?.toString?.() || t._id,
        userId: t.userId?.toString?.() || t.userId,
        // normaliser en tableau de strings
        assignedTo: Array.isArray(t.assignedTo)
          ? t.assignedTo.map((x) => x?.toString?.() || x)
          : t.assignedTo
          ? [t.assignedTo?.toString?.() || t.assignedTo]
          : [],
        projectId: t.projectId?.toString?.() || t.projectId,
        validatedBy: t.validatedBy?.toString?.() || t.validatedBy,
        participationLogs: Array.isArray(t.participationLogs)
          ? t.participationLogs.map((p) => ({
              ...p,
              userId: p.userId?.toString?.() || p.userId,
              at: p.at,
            }))
          : [],
        // N'exposer les progressReports à l'admin que s'il est créateur ou collaborateur
        progressReports: canSeeReports && Array.isArray(t.progressReports)
          ? t.progressReports.map((r) => ({
              ...r,
              _id: r._id?.toString?.() || r._id,
              userId: r.userId?.toString?.() || r.userId,
              reviewedBy: r.reviewedBy?.toString?.() || r.reviewedBy,
            }))
          : [],
      });
    });
    res.json(tasks);
  } catch (error) {
    console.error("Erreur admin list tasks:", error);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// Admin: assigner une tâche à un utilisateur
export const adminAssignTask = async (req, res) => {
  try {
    const { id } = req.params; // task id
    const { userId } = req.body; // assignee id
    const task = await Task.findById(id);
    if (!task) return res.status(404).json({ message: "Tâche non trouvée." });
    // Support multi-collaborateurs: ajouter sans duplique
    if (Array.isArray(task.assignedTo)) {
      const set = new Set(task.assignedTo.map(String));
      if (!set.has(String(userId))) task.assignedTo.push(userId);
    } else if (task.assignedTo) {
      if (String(task.assignedTo) !== String(userId)) task.assignedTo = [task.assignedTo, userId];
    } else {
      task.assignedTo = [userId];
    }
    // remettre le cycle de participation à "pending" lors d'une (ré)assignation
    task.participationStatus = 'pending';
    await task.save();
    res.json(task);
  } catch (error) {
    console.error("Erreur assignation:", error);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// Admin: marquer comme validée
export const adminValidateTask = async (req, res) => {
  try {
    const { id } = req.params;
    const task = await Task.findById(id);
    if (!task) return res.status(404).json({ message: "Tâche non trouvée." });
    task.status = "validated";
    task.validatedBy = req.userId;
    task.completed = true;
    task.progress = 100;
    await task.save();
    res.json(task);
  } catch (error) {
    console.error("Erreur validation:", error);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// Admin: marquer comme terminé
export const adminMarkDone = async (req, res) => {
  try {
    const { id } = req.params;
    const task = await Task.findById(id);
    if (!task) return res.status(404).json({ message: "Tâche non trouvée." });
    task.status = "done";
    task.completed = true;
    task.progress = 100;
    await task.save();
    res.json(task);
  } catch (error) {
    console.error("Erreur terminer:", error);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// Admin: statistiques globales
export const adminTeamStats = async (_req, res) => {
  try {
    const total = await Task.countDocuments();
    const completed = await Task.countDocuments({ completed: true });
    const validated = await Task.countDocuments({ status: 'validated' });
    const inProgress = await Task.countDocuments({ status: 'in_progress' });
    const todo = await Task.countDocuments({ status: 'todo' });

    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    res.json({
      total,
      completed,
      validated,
      inProgress,
      todo,
      completionRate,
    });
  } catch (error) {
    console.error('Erreur stats équipe:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// Admin: valider/rejeter un compte-rendu
export const reviewProgress = async (req, res) => {
  try {
    const { id, reportId } = req.params;
    const { decision, comment, progress } = req.body; // decision: 'approved' | 'rejected', optional progress 0-100
    const task = await Task.findById(id);
    if (!task) return res.status(404).json({ message: 'Tâche non trouvée.' });
    const report = task.progressReports.id(reportId);
    if (!report) return res.status(404).json({ message: 'Compte-rendu non trouvé.' });
    if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ message: 'Decision invalide.' });

    // Exiger un commentaire lors d'un rejet
    if (decision === 'rejected') {
      if (!comment || !String(comment).trim()) {
        return res.status(400).json({ message: 'Un commentaire est requis pour refuser un compte-rendu.' });
      }
    }

    report.status = decision;
    report.reviewedBy = req.userId;
    report.reviewedAt = new Date();
    report.reviewComment = comment || '';

    // Si un pourcentage est fourni, mettre à jour la progression de la tâche
    if (decision === 'approved' && progress !== undefined) {
      const pct = Math.max(0, Math.min(100, Number(progress)));
      if (!Number.isNaN(pct)) {
        task.progress = pct;
        if (pct >= 100) {
          task.completed = true;
          if (!['validated', 'done'].includes(task.status)) {
            task.status = 'done';
          }
        } else if (pct > 0 && task.status === 'todo') {
          task.status = 'in_progress';
        }
      }
    }
    await task.save();

    // Notifier l'utilisateur ayant soumis le compte-rendu
    try {
      const recipientId = report.userId;
      const isApproved = decision === 'approved';
      const title = isApproved ? 'Soumission d\'avancement approuvée' : 'Soumission d\'avancement refusée';
      const baseMsg = `Votre soumission sur la tâche "${task.title}" a été ${isApproved ? 'approuvée' : 'refusée'}.`;
      const progressPart = isApproved && typeof task.progress === 'number' ? ` Progression fixée à ${task.progress}%.` : '';
      const commentPart = !isApproved && report.reviewComment ? ` Motif: ${report.reviewComment}` : '';
      await Notification.create({
        recipientId,
        type: 'progress_review',
        title,
        message: `${baseMsg}${progressPart}${commentPart}`.trim(),
        data: {
          taskId: task._id,
          reportId: report._id,
          projectId: task.projectId,
          decision,
          progress: task.progress,
          comment: report.reviewComment,
          at: new Date().toISOString()
        }
      });
    } catch (notifyErr) {
      console.error('Notification (progress review) failed:', notifyErr);
    }

    res.json(task);
  } catch (e) {
    console.error('reviewProgress error', e);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// ✅ Consulter les soumissions d'avancement d'une tâche (créateur et collaborateurs)
export const getTaskReports = async (req, res) => {
  try {
    const { id } = req.params; // task id
    const task = await Task.findById(id).lean();
    if (!task) return res.status(404).json({ message: 'Tâche non trouvée.' });

    // Autorisation: auteur ou collaborateur (support mono/array)
    const isOwner = String(task.userId) === String(req.userId);
    const isAssignee = Array.isArray(task.assignedTo)
      ? task.assignedTo.map(String).includes(String(req.userId))
      : String(task.assignedTo) === String(req.userId);
    if (!isOwner && !isAssignee) {
      return res.status(403).json({ message: 'Non autorisé.' });
    }

    const reports = Array.isArray(task.progressReports) ? task.progressReports : [];

    // Normaliser et enrichir légèrement
    const normalized = reports.map(r => ({
      _id: r._id?.toString?.() || r._id,
      userId: r.userId?.toString?.() || r.userId,
      content: r.content,
      status: r.status,
      createdAt: r.createdAt,
      reviewedBy: r.reviewedBy?.toString?.() || r.reviewedBy || null,
      reviewedAt: r.reviewedAt || null,
      reviewComment: r.reviewComment || '',
      attachments: Array.isArray(r.attachments) ? r.attachments.map(a => ({
        filename: a.filename,
        originalname: a.originalname,
        size: a.size,
        url: a.url,
        mimetype: a.mimetype,
      })) : []
    })).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      task: {
        id: task._id?.toString?.() || task._id,
        title: task.title,
        assignedTo: Array.isArray(task.assignedTo) ? task.assignedTo.map(x => x?.toString?.() || x) : task.assignedTo ? [task.assignedTo?.toString?.() || task.assignedTo] : [],
        userId: task.userId?.toString?.() || task.userId,
        visibility: task.visibility,
        progress: task.progress,
      },
      reports: normalized
    });
  } catch (e) {
    console.error('getTaskReports error', e);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

// Admin: créer une tâche avec fichiers pour un projet et l'assigner
export const adminCreateTaskWithAttachments = async (req, res) => {
  try {
    const { title, description = '', dueDate, priority = 'medium', projectId, assignedTo } = req.body;
    if (!title || !projectId) {
      return res.status(400).json({ message: "Titre et projectId sont requis." });
    }

    // Vérifier l'existence du projet
    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ message: "Projet introuvable" });

    // Normaliser les assignés (peut être string ou array)
    let assignedArray = [];
    if (Array.isArray(assignedTo)) assignedArray = assignedTo.filter(Boolean);
    else if (assignedTo) assignedArray = [assignedTo];

    // Construire les pièces jointes
    const files = Array.isArray(req.files) ? req.files : [];
    const attachments = files.map(f => ({
      filename: f.filename,
      originalname: f.originalname,
      size: f.size,
      url: `/uploads/${f.filename}`,
      mimetype: f.mimetype,
    }));

    const taskData = {
      title: title.trim(),
      description: String(description || '').trim(),
      userId: req.userId, // créateur = admin connecté
      projectId,
      assignedTo: assignedArray,
      visibility: assignedArray.length > 0 ? 'shared' : 'personal',
      priority,
      dueDate: dueDate ? new Date(dueDate) : null,
      progress: 0,
      attachments,
      status: 'todo',
      completed: false,
    };

    const newTask = new Task(taskData);
    const saved = await newTask.save();

    // Notifications aux collaborateurs non-admin
    if (assignedArray.length > 0) {
      const users = await User.find({ _id: { $in: assignedArray } }, 'role firstName lastName').lean();
      for (const u of users) {
        if (u.role === 'admin') continue;
        await Notification.create({
          recipientId: u._id,
          type: 'task_assignment',
          title: 'Nouvelle tâche projet',
          message: `${req.user?.firstName || 'Un admin'} ${req.user?.lastName || ''} vous a assigné la tâche "${taskData.title}"`,
          data: { taskId: saved._id, projectId: saved.projectId, at: new Date().toISOString() }
        });
      }
    }

    res.status(201).json(saved);
  } catch (e) {
    console.error('adminCreateTaskWithAttachments error', e);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};
