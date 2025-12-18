import express from 'express';
import mongoose from 'mongoose';
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
    const { title, description, assignedTo = [], metadata = {}, dueAt, dailyReminder } = req.body;
    const poseConfig = (() => {
      const cfg = req.body.poseConfig && typeof req.body.poseConfig === 'object' ? { ...req.body.poseConfig } : {};
      for (const k of Object.keys(cfg)) {
        if (cfg[k] === '' || cfg[k] === null || cfg[k] === undefined) delete cfg[k];
      }
      if (cfg.targets && typeof cfg.targets === 'object') {
        for (const k of Object.keys(cfg.targets)) {
          const v = cfg.targets[k];
          if (v === '' || v === null || v === undefined) delete cfg.targets[k];
        }
        if (Array.isArray(cfg.targets.kneeRange)) {
          const [a, b] = cfg.targets.kneeRange;
          if (!Number.isFinite(a) || !Number.isFinite(b)) delete cfg.targets.kneeRange;
        }
        if (Object.keys(cfg.targets).length === 0) delete cfg.targets;
      }
      return cfg;
    })();
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

// DELETE /api/exercises/patient/:patientId
// Therapist selects exercises to remove for a specific patient.
// If an exercise is only assigned to that patient it is deleted; otherwise the patient assignment is removed.
router.delete('/patient/:patientId', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'therapist') return res.status(403).json({ success: false, error: 'Forbidden' });

    const { patientId } = req.params;
    const { exerciseIds } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(patientId)) return res.status(400).json({ success: false, error: 'Invalid patient ID' });
    if (!Array.isArray(exerciseIds) || exerciseIds.length === 0) return res.status(400).json({ success: false, error: 'exerciseIds array is required' });

    const patient = await User.findById(patientId);
    if (!patient || patient.role !== 'patient') return res.status(404).json({ success: false, error: 'Patient not found' });

    // filter out invalid ids to avoid CastErrors
    const validIds = exerciseIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0) return res.status(400).json({ success: false, error: 'No valid exercise IDs provided' });

    const exercises = await Exercise.find({ _id: { $in: validIds }, assignedTo: patientId, createdBy: req.user.id });

    let removedAssignments = 0;
    let deletedExercises = 0;
    const processed = new Set();

    for (const ex of exercises) {
      processed.add(String(ex._id));
      const remainingAssignees = ex.assignedTo.filter((uid) => String(uid) !== patientId);
      if (remainingAssignees.length === 0) {
        await ex.deleteOne();
        deletedExercises += 1;
      } else {
        ex.assignedTo = remainingAssignees;
        await ex.save();
        removedAssignments += 1;
      }
    }

    const notFound = validIds.filter((id) => !processed.has(String(id)));

    res.json({
      success: true,
      removedAssignments,
      deletedExercises,
      notFound
    });
  } catch (err) {
    console.error('DELETE /api/exercises/patient/:patientId error', err);
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
