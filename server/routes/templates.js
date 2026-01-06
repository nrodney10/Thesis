import express from 'express';
import { verifyToken } from '../middleware/authMiddleware.js';
import ExerciseTemplate from '../models/ExerciseTemplate.js';
import Exercise from '../models/Exercise.js';
import User from '../models/User.js';
import { createNotification } from '../utils/createNotification.js';
import { autoAllocateForPatient } from '../utils/autoAllocate.js';

const router = express.Router();

// List templates (therapist only)
router.get('/', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'therapist') return res.status(403).json({ success: false, error: 'Forbidden' });
    const list = await ExerciseTemplate.find({ createdBy: req.user.id }).sort({ createdAt: -1 });
    res.json({ success: true, templates: list });
  } catch (e) {
    console.error('GET /api/templates', e);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Create template
router.post('/', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'therapist') return res.status(403).json({ success: false, error: 'Forbidden' });
    const { title, description, category, metadata = {} } = req.body;
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
    const t = new ExerciseTemplate({ title, description, category, poseConfig, metadata, createdBy: req.user.id });
    await t.save();
    res.json({ success: true, template: t });
  } catch (e) {
    console.error('POST /api/templates', e);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Update template (therapist only)
router.put('/:id', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'therapist') return res.status(403).json({ success: false, error: 'Forbidden' });
    const { id } = req.params;
    const tpl = await ExerciseTemplate.findById(id);
    if (!tpl) return res.status(404).json({ success: false, error: 'Template not found' });
    if (tpl.createdBy?.toString() !== req.user.id) return res.status(403).json({ success: false, error: 'Not allowed to edit this template' });

    const { title, description, category, metadata = {}, poseConfig: poseConfigRaw } = req.body || {};
    const poseConfig = (() => {
      const cfg = poseConfigRaw && typeof poseConfigRaw === 'object' ? { ...poseConfigRaw } : {};
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

    const updates = {};
    if (title) updates.title = title;
    if (description) updates.description = description;
    if (category) updates.category = category;
    const meta = { ...(tpl.metadata || {}) };
    for (const k of Object.keys(metadata || {})) {
      const v = metadata[k];
      if (v === '' || v === null || typeof v === 'undefined') { delete meta[k]; continue; }
      if (k === 'vulnerabilityTags' && Array.isArray(v)) { meta[k] = v.filter(Boolean); continue; }
      meta[k] = v;
    }
    updates.metadata = meta;
    updates.poseConfig = { ...(tpl.poseConfig?.toObject?.() || tpl.poseConfig || {}), ...poseConfig };

    const updated = await ExerciseTemplate.findByIdAndUpdate(id, { $set: updates }, { new: true });
    res.json({ success: true, template: updated });
  } catch (e) {
    console.error('PUT /api/templates/:id', e);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// AI-inspired allocation: pick best-matching templates for a patient based on vulnerability tags
router.post('/auto-allocate', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'therapist') return res.status(403).json({ success: false, error: 'Forbidden' });
    const { patientId, vulnerabilities = null, limit = 3, dueAt, dailyReminder } = req.body || {};
    if (!patientId) return res.status(400).json({ success: false, error: 'patientId required' });
    const patient = await User.findById(patientId);
    if (!patient || patient.role !== 'patient') return res.status(404).json({ success: false, error: 'Patient not found' });
    if (String(patient.therapistId) !== String(req.user.id)) return res.status(403).json({ success:false, error:'Forbidden' });

    // delegate to utility which accepts optional vulnerabilities override and returns matches
    const r = await autoAllocateForPatient(patientId, { limit, dueAt, dailyReminder, vulnerabilities });
    if (!r.success) return res.status(400).json({ success: false, error: r.reason || 'No matches' });
    // response already contains exercises and matches
    return res.json(r);
  } catch (e) {
    console.error('POST /api/templates/auto-allocate', e);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Auto-allocate immediately for a patient using their stored vulnerabilityProfile (no manual tags needed)
router.post('/auto-allocate/for-patient/:id', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'therapist') return res.status(403).json({ success: false, error: 'Forbidden' });
    const { id } = req.params;
    const patient = await User.findById(id);
    if (!patient || patient.role !== 'patient') return res.status(404).json({ success:false, error:'Patient not found' });
    if (String(patient.therapistId) !== String(req.user.id)) return res.status(403).json({ success:false, error:'Forbidden' });
    const { limit = 3, dueAt, dailyReminder } = req.body || {};
    const r = await autoAllocateForPatient(id, { limit, dueAt, dailyReminder });
    if (!r.success) return res.status(400).json({ success: false, error: r.reason || 'No matches' });
    res.json(r);
  } catch (e) {
    console.error('POST /api/templates/auto-allocate/for-patient/:id', e);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Instantiate template into concrete exercise without altering template
router.post('/:id/instantiate', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'therapist') return res.status(403).json({ success: false, error: 'Forbidden' });
    const { id } = req.params;
    const tpl = await ExerciseTemplate.findById(id);
    if (!tpl) return res.status(404).json({ success: false, error: 'Template not found' });

    const { assignedTo = [], overrides = {}, dueAt, dailyReminder } = req.body || {};

    // validate assigned users exist
    if (!Array.isArray(assignedTo)) return res.status(400).json({ success: false, error: 'assignedTo must be an array of user IDs' });
    const validAssigned = [];
    const invalid = [];
    for (const uid of assignedTo) {
      const u = await User.findById(uid);
      if (!u || u.role !== 'patient') { invalid.push(uid); continue; }
      if (String(u.therapistId) !== String(req.user.id)) { invalid.push(uid); continue; }
      validAssigned.push(u._id);
    }
    if (validAssigned.length === 0) return res.status(400).json({ success: false, error: 'No valid patient assignees provided or patients not assigned to you', invalid });

    // sanitize overrides.poseConfig: remove empty-string fields so they don't overwrite template defaults
    if (overrides && typeof overrides === 'object' && overrides.poseConfig && typeof overrides.poseConfig === 'object') {
      for (const k of Object.keys(overrides.poseConfig)) {
        if (overrides.poseConfig[k] === '' || overrides.poseConfig[k] === null || overrides.poseConfig[k] === undefined) {
          delete overrides.poseConfig[k];
        }
      }
      if (overrides.poseConfig.targets && typeof overrides.poseConfig.targets === 'object') {
        // drop empty target fields
        for (const k of Object.keys(overrides.poseConfig.targets)) {
          const val = overrides.poseConfig.targets[k];
          if (val === '' || val === null || val === undefined) delete overrides.poseConfig.targets[k];
        }
        if (Array.isArray(overrides.poseConfig.targets.kneeRange)) {
          const [a, b] = overrides.poseConfig.targets.kneeRange;
          if (!Number.isFinite(a) || !Number.isFinite(b)) delete overrides.poseConfig.targets.kneeRange;
        }
        if (Object.keys(overrides.poseConfig.targets).length === 0) delete overrides.poseConfig.targets;
      }
      // If poseConfig ends up empty, remove it
      if (Object.keys(overrides.poseConfig).length === 0) delete overrides.poseConfig;
    }

    // merge with overrides (shallow for simplicity)
    const exerciseDoc = new Exercise({
      title: overrides.title || tpl.title,
      description: overrides.description || tpl.description,
      assignedTo: validAssigned,
      metadata: { ...(tpl.metadata || {}), ...(overrides.metadata || {}) },
      poseConfig: { ...(tpl.poseConfig?.toObject?.() || tpl.poseConfig || {}), ...(overrides.poseConfig || {}) },
      createdBy: req.user.id,
      templateId: tpl._id,
      overrides,
      dueAt: dueAt ? new Date(dueAt) : undefined,
      dailyReminder: !!dailyReminder
    });
    await exerciseDoc.save();
    // notify assigned patients
    for (const uid of validAssigned) {
      await createNotification(uid, 'New activity assigned', `Your therapist assigned: ${exerciseDoc.title}`, { exerciseId: exerciseDoc._id, event: 'assigned', templateId: tpl._id });
    }
    res.json({ success: true, exercise: exerciseDoc });
  } catch (e) {
    console.error('POST /api/templates/:id/instantiate', e);
    res.status(500).json({ success: false, error: String(e.message || 'Server error') });
  }
});

// Delete a template (therapist only)
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'therapist') return res.status(403).json({ success: false, error: 'Forbidden' });
    const { id } = req.params;
    const tpl = await ExerciseTemplate.findById(id);
    if (!tpl) return res.status(404).json({ success: false, error: 'Template not found' });
    if (tpl.createdBy?.toString() !== req.user.id) return res.status(403).json({ success: false, error: 'Not allowed to delete this template' });

    await ExerciseTemplate.deleteOne({ _id: tpl._id });
    return res.json({ success: true });
  } catch (e) {
    console.error('DELETE /api/templates/:id', e);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

export default router;
