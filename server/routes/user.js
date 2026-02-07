import express from 'express';
import bcrypt from 'bcryptjs';
import { verifyToken } from '../middleware/authMiddleware.js';
import User from '../models/User.js';

const router = express.Router();

router.get('/me', verifyToken, async (req, res) => {
  const u = await User.findById(req.user.id).select('-password');
  if (!u) return res.status(404).json({ success:false, message:'User not found' });
  const userObj = u.toObject ? u.toObject() : { ...u };
  try {
    if (userObj.therapistId) {
      const t = await User.findById(userObj.therapistId).select('name email');
      if (t) userObj.therapistName = t.name || (t.email ? t.email.split('@')[0] : 'Therapist');
    }
  } catch (e) {
  }
  res.json({ success:true, user: userObj });
});

router.put('/me', verifyToken, async (req, res) => {
  try {
    const { name, email, vulnerabilityProfile } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (email) updates.email = email;
    if (vulnerabilityProfile && typeof vulnerabilityProfile === 'object') {
      const tags = Array.isArray(vulnerabilityProfile.tags)
        ? vulnerabilityProfile.tags.map((t) => String(t).trim()).filter(Boolean)
        : [];
      updates.vulnerabilityProfile = {
        tags,
        notes: vulnerabilityProfile.notes || ''
      };
    }
    const u = await User.findByIdAndUpdate(req.user.id, { $set: updates }, { new:true }).select('-password');
    res.json({ success:true, user:u });
  } catch (e) { res.status(500).json({ success:false, message:'Server error' }); }
});

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

router.get('/therapists', verifyToken, async (req, res) => {
  try {
    const therapists = await User.find({ role: 'therapist' }).select('_id name email');
    res.json({ success:true, therapists });
  } catch (e) { res.status(500).json({ success:false, message:'Server error' }); }
});
