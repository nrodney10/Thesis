import express from 'express';
import { verifyToken } from '../middleware/authMiddleware.js';
import Message from '../models/Message.js';
import User from '../models/User.js';

const router = express.Router();

// List inbox for current user
router.get('/', verifyToken, async (req, res) => {
  try {
    const msgs = await Message.find({ to: req.user.id }).sort({ createdAt: -1 }).limit(200).populate('from','name email role');
    res.json({ success:true, inbox: msgs });
  } catch (e) { res.status(500).json({ success:false, message:'Server error' }); }
});

// List sent messages
router.get('/sent', verifyToken, async (req, res) => {
  try { const msgs = await Message.find({ from: req.user.id }).sort({ createdAt: -1 }).limit(200).populate('to','name email role');
    res.json({ success:true, sent: msgs });
  } catch (e) { res.status(500).json({ success:false, message:'Server error' }); }
});

// Send a message
router.post('/', verifyToken, async (req, res) => {
  try {
    const { to, subject, body } = req.body;
    const recipient = await User.findOne({ _id: to });
    if (!recipient) return res.status(404).json({ success:false, message:'Recipient not found' });
    const m = new Message({ from: req.user.id, to, subject: subject||'', body });
    await m.save();
    res.status(201).json({ success:true, message:m });
  } catch (e) { res.status(500).json({ success:false, message:'Server error' }); }
});

// Mark as read
router.post('/:id/read', verifyToken, async (req, res) => {
  try { const m = await Message.findOne({ _id:req.params.id, to:req.user.id }); if(!m) return res.status(404).json({ success:false }); m.readAt = new Date(); await m.save(); res.json({ success:true }); }
  catch(e){ res.status(500).json({ success:false }); }
});

export default router;
