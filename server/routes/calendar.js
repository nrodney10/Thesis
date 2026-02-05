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
    const filtered = items.filter((ex) => {
      const completions = ex.completions || [];
      return !completions.find((c) => String(c.userId) === String(req.user.id));
    });
    const mapped = filtered.map(ex => ({
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
    const mapped = items
      .filter((ex) => {
        const completions = ex.completions || [];
        if (!Array.isArray(ex.assignedTo) || ex.assignedTo.length === 0) return true;
        const allCompleted = ex.assignedTo.every((p) => completions.find((c) => String(c.userId) === String(p._id)));
        return !allCompleted;
      })
      .map(ex => ({
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

// Therapist view: upcoming activities for a specific patient
router.get('/patient/:id', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'therapist') return res.status(403).json({ success: false, error: 'Forbidden' });
    const { id } = req.params;
    if (!id) return res.status(400).json({ success:false, error:'Missing patient id' });
    const patient = await User.findById(id);
    if (!patient || patient.role !== 'patient') return res.status(404).json({ success:false, error:'Patient not found' });
    if (String(patient.therapistId) !== String(req.user.id)) return res.status(403).json({ success:false, error:'Forbidden' });

    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const items = await Exercise.find({
      assignedTo: patient._id,
      createdBy: req.user.id,
      $or: [ { dueAt: { $gte: now, $lte: in30 } }, { dailyReminder: true } ]
    }).populate('createdBy', 'name').limit(200);
    const filtered = items.filter((ex) => {
      const completions = ex.completions || [];
      return !completions.find((c) => String(c.userId) === String(patient._id));
    });
    const mapped = filtered.map(ex => ({ id: ex._id, title: ex.title, description: ex.description, dueAt: ex.dueAt, dailyReminder: ex.dailyReminder, createdBy: ex.createdBy, type: 'exercise' }));
    res.json({ success:true, items: mapped });
  } catch (e) {
    console.error('calendar patient/:id error', e);
    res.status(500).json({ success:false, error:'Server error' });
  }
});

export default router;
