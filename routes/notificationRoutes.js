import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { listNotifications, markAsRead, deleteNotification, deleteAllNotifications } from '../controllers/notificationController.js';

const router = express.Router();
router.use(authMiddleware);

router.get('/', listNotifications);
router.post('/:id/read', markAsRead);
router.delete('/:id', deleteNotification);
router.delete('/', deleteAllNotifications);

export default router;
