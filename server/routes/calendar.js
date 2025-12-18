import express from 'express';
import { verifyToken } from '../middleware/authMiddleware.js';
import Exercise from '../models/Exercise.js';
import User from '../models/User.js';

const router = express.Router();

// Patient view: upcoming activities for the logged-in patient
router.get('/patient', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'patient') return res.status(403).json({ success: false, error: 'Forbidden' });
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const items = await Exercise.find({
      assignedTo: req.user.id,
      $or: [
        { dueAt: { $gte: now, $lte: in30 } },
        { dailyReminder: true }
      ]
    }).populate('createdBy', 'name').limit(200);
    const mapped = items.map(ex => ({
      id: ex._id,
      title: ex.title,
      description: ex.description,
      dueAt: ex.dueAt,
      dailyReminder: ex.dailyReminder,
      createdBy: ex.createdBy,
      type: 'exercise'
    }));
    res.json({ success: true, items: mapped });
  } catch (e) {
    console.error('calendar patient error', e);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Therapist view: upcoming activities across their patients
router.get('/therapist', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'therapist') return res.status(403).json({ success: false, error: 'Forbidden' });
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const items = await Exercise.find({
      createdBy: req.user.id,
      $or: [
        { dueAt: { $gte: now, $lte: in30 } },
        { dailyReminder: true }
      ]
    }).populate('assignedTo', 'name email').limit(400);
    const mapped = items.map(ex => ({
      id: ex._id,
      title: ex.title,
      description: ex.description,
      dueAt: ex.dueAt,
      dailyReminder: ex.dailyReminder,
      assignedTo: ex.assignedTo,
      type: 'exercise'
    }));
    res.json({ success: true, items: mapped });
  } catch (e) {
    console.error('calendar therapist error', e);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

export default router;
