import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'Accès non autorisé : token manquant' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.userId = decoded.id;

    // Charger les infos de rôle pour les guards et contrôleurs
    const user = await User.findById(decoded.id).select('role firstName lastName email');
    if (!user) {
      return res.status(401).json({ message: 'Utilisateur introuvable' });
    }
    req.user = user;

    next();
  } catch (error) {
    console.error('Erreur d\'authentification :', error);
    res.status(401).json({ message: 'Token invalide ou expiré' });
  }
};

export const requireRole = (roles) => (req, res, next) => {
  const allowed = Array.isArray(roles) ? roles : [roles];
  if (!req.user || !allowed.includes(req.user.role)) {
    return res.status(403).json({ message: 'Accès refusé' });
  }
  next();
};