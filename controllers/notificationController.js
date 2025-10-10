import Notification from "../models/Notification.js";

export const listNotifications = async (req, res) => {
  try {
    const items = await Notification.find({ recipientId: req.userId }).sort({ createdAt: -1 });
    res.json(items);
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

export const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const notif = await Notification.findOne({ _id: id, recipientId: req.userId });
    if (!notif) return res.status(404).json({ message: 'Notification non trouvée.' });
    notif.read = true;
    await notif.save();
    res.json(notif);
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

export const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Notification.findOneAndDelete({ _id: id, recipientId: req.userId });
    if (!deleted) return res.status(404).json({ message: 'Notification non trouvée.' });
    res.json({ message: 'Notification supprimée.' });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};

export const deleteAllNotifications = async (req, res) => {
  try {
    const result = await Notification.deleteMany({ recipientId: req.userId });
    res.json({ message: 'Notifications supprimées.', deleted: result.deletedCount || 0 });
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur.' });
  }
};
