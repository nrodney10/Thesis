import express from 'express';
import bcrypt from 'bcryptjs';
import { verifyToken } from '../middleware/authMiddleware.js';
import User from '../models/User.js';

const router = express.Router();

// Get current user profile
router.get('/me', verifyToken, async (req, res) => {
  const u = await User.findById(req.user.id).select('-password');
  res.json({ success:true, user:u });
});

// Update profile (name, age, email)
router.put('/me', verifyToken, async (req, res) => {
  try {
    const { name, age, email } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (typeof age !== 'undefined') updates.age = age;
    if (email) updates.email = email;
    const u = await User.findByIdAndUpdate(req.user.id, { $set: updates }, { new:true }).select('-password');
    res.json({ success:true, user:u });
  } catch (e) { res.status(500).json({ success:false, message:'Server error' }); }
});

// Change password
router.put('/me/password', verifyToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const u = await User.findById(req.user.id);
    if (!u) return res.status(404).json({ success:false });
    const ok = await bcrypt.compare(currentPassword || '', u.password);
    if (!ok) return res.status(400).json({ success:false, message:'Current password incorrect' });
    u.password = await bcrypt.hash(newPassword, 10);
    await u.save();
    res.json({ success:true });
  } catch (e) { res.status(500).json({ success:false, message:'Server error' }); }
});

export default router;

// List therapists (basic info) – can be used by patients to target messages
router.get('/therapists', verifyToken, async (req, res) => {
  try {
    const therapists = await User.find({ role: 'therapist' }).select('_id name email');
    res.json({ success:true, therapists });
  } catch (e) { res.status(500).json({ success:false, message:'Server error' }); }
});
