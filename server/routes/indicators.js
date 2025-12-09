import express from 'express';
import { verifyToken } from '../middleware/authMiddleware.js';
import Notification from '../models/Notification.js';
import Message from '../models/Message.js';

const router = express.Router();

// Return unread counts for notifications + messages
router.get('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const [notificationsUnread, messagesUnread] = await Promise.all([
      Notification.countDocuments({ userId, readAt: { $exists: false } }),
      Message.countDocuments({ to: userId, readAt: { $exists: false } })
    ]);
    res.json({ success: true, notificationsUnread, messagesUnread });
  } catch (e) {
    console.error('Indicators error', e);
    res.status(500).json({ success:false, message:'Server error' });
  }
});

export default router;
