import express from 'express';
import { verifyToken } from '../middleware/authMiddleware.js';
import Notification from '../models/Notification.js';
import { notifyUsers } from '../utils/notify.js';

const router = express.Router();

// Current user's notifications
router.get('/', verifyToken, async (req, res) => {
  try {
    const list = await Notification.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(200);
    res.json({ success:true, notifications:list });
  } catch (e) { res.status(500).json({ success:false, message:'Server error' }); }
});

// Create a notification (therapist only) for one or many users
router.post('/', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'therapist') return res.status(403).json({ success:false, message:'Forbidden' });
    const { userIds, title, body } = req.body;
    if (!Array.isArray(userIds) || !userIds.length) return res.status(400).json({ success:false, message:'userIds required' });
    const docs = await Notification.insertMany(userIds.map(u => ({ userId:u, title, body })));
    // optionally email
    try { await notifyUsers(userIds, title, body); } catch(_) {}
    res.status(201).json({ success:true, created: docs.length });
  } catch (e) { res.status(500).json({ success:false, message:'Server error' }); }
});

// Mark read
router.post('/:id/read', verifyToken, async (req, res) => {
  try { const n = await Notification.findOne({ _id:req.params.id, userId:req.user.id }); if(!n) return res.status(404).json({ success:false }); n.readAt = new Date(); await n.save(); res.json({ success:true }); }
  catch(e){ res.status(500).json({ success:false }); }
});

export default router;
