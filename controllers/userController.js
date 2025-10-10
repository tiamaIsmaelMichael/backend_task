import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ✅ Inscription d’un nouvel utilisateur
export const registerUser = async (req, res) => {
  const { firstName, lastName, email, password } = req.body;

  if (!firstName || !lastName || !email || !password) {
    return res.status(400).json({ message: "Tous les champs sont requis." });
  }

  try {
    // Vérifie si l'utilisateur existe déjà
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email déjà utilisé." });
    }

    // Création de l'utilisateur (le hash se fait automatiquement via le hook Mongoose)
    const newUser = new User({ firstName, lastName, email, password });

    await newUser.save();

    res.status(201).json({ message: "Utilisateur créé avec succès." });
  } catch (error) {
    console.error("❌ Erreur lors de l'inscription :", error);
    res.status(500).json({ message: "Erreur serveur lors de l'inscription." });
  }
};

// ✅ Connexion utilisateur
export const loginUser = async (req, res) => {
  const { email, password } = req.body;
  console.log("📩 Login request body:", req.body);

  if (!email || !password) {
    return res.status(400).json({ message: "Email et mot de passe requis." });
  }

  try {
    // On force la récupération du password ici avec select("+password")
    const user = await User.findOne({ email }).select("+password");

    if (!user) {
      console.log("❌ Utilisateur non trouvé");
      return res.status(400).json({ message: "Utilisateur non trouvé." });
    }

    if (!user.password) {
      console.error(
        "⚠️ Le mot de passe est manquant dans la base de données !"
      );
      return res.status(500).json({ message: "Mot de passe manquant." });
    }

    console.log("📦 Utilisateur trouvé :", user);

    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      console.log("❌ Mot de passe incorrect");
      return res.status(400).json({ message: "Mot de passe incorrect." });
    }

    console.log("✅ Connexion réussie");

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    res.json({
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        avatarUrl: user.avatarUrl || "",
        role: user.role,
      },
    });
  } catch (error) {
    console.error("🔥 Erreur serveur :", error);
    res.status(500).json({ message: "Erreur serveur lors de la connexion." });
  }
};

// Admin: lister tous les utilisateurs
export const adminListUsers = async (_req, res) => {
  try {
    const users = await User.find().select("firstName lastName email role createdAt").sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    console.error("Erreur list users:", error);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// Admin: supprimer un utilisateur
export const adminDeleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "Utilisateur non trouvé." });
    await user.deleteOne();
    res.json({ message: "Utilisateur supprimé." });
  } catch (error) {
    console.error("Erreur suppression user:", error);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// Admin: réinitialiser le mot de passe
export const adminResetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: "Mot de passe trop court (min 6)." });
    }
    const user = await User.findById(id).select("+password");
    if (!user) return res.status(404).json({ message: "Utilisateur non trouvé." });
    user.password = newPassword; // hook mongoose fera le hash
    await user.save();
    res.json({ message: "Mot de passe réinitialisé." });
  } catch (error) {
    console.error("Erreur reset pwd:", error);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// Profil: mise à jour des infos utilisateur (nom, avatar)
export const updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, avatarUrl } = req.body;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "Utilisateur non trouvé." });
    const previousAvatar = user.avatarUrl || "";
    if (firstName) user.firstName = firstName.trim();
    if (lastName) user.lastName = lastName.trim();
    if (avatarUrl) user.avatarUrl = avatarUrl.trim();
    await user.save();

    // Suppression sécurisée de l'ancien avatar local si remplacé et stocké en local
    try {
      if (avatarUrl && previousAvatar && previousAvatar !== avatarUrl && previousAvatar.startsWith("/uploads/")) {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const filePath = path.join(__dirname, "..", previousAvatar);
        fs.unlink(filePath, () => {});
      }
    } catch {}
    res.json({ message: "Profil mis à jour", user: {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      avatarUrl: user.avatarUrl || null,
    }});
  } catch (error) {
    console.error("Erreur update profile:", error);
    res.status(500).json({ message: "Erreur serveur." });
  }
};

// ✅ Liste de base des utilisateurs (auth) pour sélection d'un collaborateur
export const listAllUsersBasic = async (req, res) => {
  try {
    const users = await User.find({}, 'firstName lastName email').lean();
    const mapped = users.map(u => ({
      id: u._id?.toString?.() || u._id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
    }));
    res.json(mapped);
  } catch (e) {
    console.error('listAllUsersBasic error', e);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};