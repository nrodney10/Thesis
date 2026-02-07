import express from 'express';
import mongoose from 'mongoose';
import Exercise from '../models/Exercise.js';
import { verifyToken } from '../middleware/authMiddleware.js';
import User from '../models/User.js';
import { notifyUsers } from '../utils/notify.js';
import { createNotification } from '../utils/createNotification.js';
import { markCompletedForUser } from '../utils/markCompleted.js';

const router = express.Router();

router.get('/', verifyToken, async (req, res) => {
  try {
    if (req.user.role === 'therapist') {
      const list = await Exercise.find().populate('createdBy', 'name');
      return res.json({ success: true, exercises: list });
    }
    const list = await Exercise.find({ assignedTo: req.user.id });
    return res.json({ success: true, exercises: list });
  } catch (err) {
    console.error('GET /api/exercises error', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

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

    const validAssigned = [];
    const invalid = [];
    for (const id of assignedTo) {
      const u = await User.findById(id);
      if (!u || u.role !== 'patient') { invalid.push(id); continue; }
      if (String(u.therapistId) !== String(req.user.id)) { invalid.push(id); continue; }
      validAssigned.push(u._id);
    }
    if (invalid.length) return res.status(400).json({ success:false, error:'Some assignees are invalid or not assigned to you', invalid });

    const meta = { ...(metadata || {}) };
    if (!meta.assignmentType) meta.assignmentType = 'exercise';

    if (validAssigned.length && !dueAt) {
      const assignType = meta.assignmentType || 'exercise';
      const dup = await Exercise.findOne({
        createdBy: req.user.id,
        title,
        'metadata.assignmentType': assignType,
        assignedTo: { $in: validAssigned }
      });
      if (dup) return res.status(400).json({ success:false, error:`${assignType.charAt(0).toUpperCase()+assignType.slice(1)} already assigned to one of the selected patients` });
    }

    const ex = new Exercise({ title, description, assignedTo: validAssigned, metadata: meta, poseConfig, createdBy: req.user.id, dueAt: dueAt ? new Date(dueAt) : undefined, dailyReminder: !!dailyReminder });
    await ex.save();

    if (validAssigned.length) {
      const label = meta.assignmentType === 'game' ? 'game' : 'exercise';
      notifyUsers(validAssigned, `A new ${label} has been assigned: ${title}`, `Your therapist assigned a new ${label}: ${title}`)
        .catch((e) => console.error('Notification email error', e));
      for (const uid of validAssigned) {
        try {
          await createNotification(uid, `New ${label} assigned`, `Your therapist assigned: ${title}`, { exerciseId: ex._id, assignmentType: meta.assignmentType });
        } catch (e) {
          console.error('Notification create error', e.message);
        }
      }
    }

    res.json({ success: true, exercise: ex });
  } catch (err) {
    console.error('POST /api/exercises error', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.delete('/patient/:patientId', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'therapist') return res.status(403).json({ success: false, error: 'Forbidden' });

    const { patientId } = req.params;
    const { exerciseIds } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(patientId)) return res.status(400).json({ success: false, error: 'Invalid patient ID' });
    if (!Array.isArray(exerciseIds) || exerciseIds.length === 0) return res.status(400).json({ success: false, error: 'exerciseIds array is required' });

    const patient = await User.findById(patientId);
    if (!patient || patient.role !== 'patient') return res.status(404).json({ success: false, error: 'Patient not found' });

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

router.post('/:id/start', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'patient') return res.status(403).json({ success:false });
    const ex = await Exercise.findById(req.params.id);
    if (!ex || !ex.assignedTo.map(String).includes(req.user.id)) return res.status(404).json({ success:false, message:'Exercise not found' });
    const patient = await User.findById(req.user.id).select('therapistId name');
    if (patient?.therapistId) {
      await createNotification(patient.therapistId, 'Exercise started', `${patient.name} started exercise: ${ex.title}`, { exerciseId: ex._id, event:'start' });
    }
    res.json({ success:true });
  } catch (e) { console.error('start exercise error', e); res.status(500).json({ success:false }); }
});

router.post('/:id/complete', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'patient') return res.status(403).json({ success:false, error:'Forbidden' });
    const { id } = req.params;
    const ex = await Exercise.findById(id);
    if (!ex) return res.status(404).json({ success:false, error:'Not found' });
    if (!ex.assignedTo.map(String).includes(String(req.user.id))) return res.status(403).json({ success:false, error:'Not assigned to you' });
    const r = await markCompletedForUser(id, req.user.id);
    if (!r.ok) return res.status(500).json({ success:false, error:'Failed to mark completed' });
    return res.json({ success:true });
  } catch (e) {
    console.error('complete exercise error', e);
    res.status(500).json({ success:false, error:'Server error' });
  }
});

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

router.put('/:id', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'therapist') return res.status(403).json({ success: false, error: 'Forbidden' });
    const { id } = req.params;
    const ex = await Exercise.findById(id);
    if (!ex) return res.status(404).json({ success: false, error: 'Exercise not found' });
    if (String(ex.createdBy) !== String(req.user.id)) return res.status(403).json({ success: false, error: 'Not allowed' });

    const { title, description, dueAt, dailyReminder } = req.body || {};
    if (title && typeof title === 'string') ex.title = title;
    if (description && typeof description === 'string') ex.description = description;
    if (typeof dailyReminder !== 'undefined') ex.dailyReminder = !!dailyReminder;
    if (dueAt) ex.dueAt = new Date(dueAt);
    else if (dueAt === null) ex.dueAt = undefined;

    await ex.save();
    res.json({ success: true, exercise: ex });
  } catch (e) {
    console.error('PUT /api/exercises/:id', e);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Delete an exercise
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'therapist') return res.status(403).json({ success: false, error: 'Forbidden' });
    const { id } = req.params;
    const ex = await Exercise.findById(id);
    if (!ex) return res.status(404).json({ success: false, error: 'Exercise not found' });
    if (String(ex.createdBy) !== String(req.user.id)) return res.status(403).json({ success: false, error: 'Not allowed' });
    await ex.deleteOne();
    res.json({ success: true });
  } catch (e) {
    console.error('DELETE /api/exercises/:id', e);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});
