import express from 'express';
import Exercise from '../models/Exercise.js';
import { verifyToken } from '../middleware/authMiddleware.js';
import User from '../models/User.js';
import { notifyUsers } from '../utils/notify.js';
import { createNotification } from '../utils/createNotification.js';

const router = express.Router();

// GET /api/exercises
// Therapists: return all exercises
// Patients: return exercises assigned to them
router.get('/', verifyToken, async (req, res) => {
  try {
    if (req.user.role === 'therapist') {
      const list = await Exercise.find().populate('createdBy', 'name');
      return res.json({ success: true, exercises: list });
    }
    // patient
    const list = await Exercise.find({ assignedTo: req.user.id });
    return res.json({ success: true, exercises: list });
  } catch (err) {
    console.error('GET /api/exercises error', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// POST /api/exercises
// Therapist creates exercise and optionally assigns to patient IDs
router.post('/', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'therapist') return res.status(403).json({ success: false, error: 'Forbidden' });
    const { title, description, assignedTo = [], metadata = {}, poseConfig = {}, dueAt, dailyReminder } = req.body;
    if (!title || typeof title !== 'string' || title.length < 3) return res.status(400).json({ success: false, error: 'Title is required (min 3 chars)' });

    // validate assignedTo are existing users
    const validAssigned = [];
    for (const id of assignedTo) {
      const u = await User.findById(id);
      if (u) validAssigned.push(u._id);
    }

    const ex = new Exercise({ title, description, assignedTo: validAssigned, metadata, poseConfig, createdBy: req.user.id, dueAt: dueAt ? new Date(dueAt) : undefined, dailyReminder: !!dailyReminder });
    await ex.save();

    // notify assigned users (non-blocking)
    if (validAssigned.length) {
      notifyUsers(validAssigned, `A new exercise has been assigned: ${title}`, `Your therapist assigned a new exercise: ${title}`)
        .catch((e) => console.error('Notification error', e));
    }

    res.json({ success: true, exercise: ex });
  } catch (err) {
    console.error('POST /api/exercises error', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Patient starts exercise
router.post('/:id/start', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'patient') return res.status(403).json({ success:false });
    const ex = await Exercise.findById(req.params.id);
    if (!ex || !ex.assignedTo.map(String).includes(req.user.id)) return res.status(404).json({ success:false, message:'Exercise not found' });
    // Notify therapist if linked
    const patient = await User.findById(req.user.id).select('therapistId name');
    if (patient?.therapistId) {
      await createNotification(patient.therapistId, 'Exercise started', `${patient.name} started exercise: ${ex.title}`, { exerciseId: ex._id, event:'start' });
    }
    res.json({ success:true });
  } catch (e) { console.error('start exercise error', e); res.status(500).json({ success:false }); }
});

// Patient skips exercise
router.post('/:id/skip', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'patient') return res.status(403).json({ success:false });
    const ex = await Exercise.findById(req.params.id);
    if (!ex || !ex.assignedTo.map(String).includes(req.user.id)) return res.status(404).json({ success:false, message:'Exercise not found' });
    const patient = await User.findById(req.user.id).select('therapistId name');
    if (patient?.therapistId) {
      await createNotification(patient.therapistId, 'Exercise skipped', `${patient.name} skipped exercise: ${ex.title}`, { exerciseId: ex._id, event:'skip' });
    }
    res.json({ success:true });
  } catch (e) { console.error('skip exercise error', e); res.status(500).json({ success:false }); }
});

export default router;

// Manual trigger for reminders (can be called by external cron)
router.post('/run-reminders', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'therapist') return res.status(403).json({ success:false });
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dueExercises = await Exercise.find({ dueAt: { $lte: now }, dueNotifiedAt: { $exists: false } }).limit(100);
    for (const ex of dueExercises) {
      for (const uid of ex.assignedTo) {
        await createNotification(uid, 'Exercise due', `Time to do exercise: ${ex.title}`, { exerciseId: ex._id, event:'due', manual:true });
      }
      ex.dueNotifiedAt = new Date();
      await ex.save();
    }
    const daily = await Exercise.find({ dailyReminder: true }).limit(200);
    for (const ex of daily) {
      const last = ex.lastDailyReminderDate ? new Date(ex.lastDailyReminderDate) : null;
      if (!last || last < midnight) {
        for (const uid of ex.assignedTo) {
          await createNotification(uid, 'Daily exercise reminder', `Don't forget: ${ex.title}`, { exerciseId: ex._id, event:'daily', manual:true });
        }
        ex.lastDailyReminderDate = midnight;
        await ex.save();
      }
    }
    res.json({ success:true, dueCount: dueExercises.length });
  } catch (e) { console.error('run reminders error', e); res.status(500).json({ success:false }); }
});
