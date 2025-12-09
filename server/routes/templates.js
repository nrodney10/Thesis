import express from 'express';
import { verifyToken } from '../middleware/authMiddleware.js';
import ExerciseTemplate from '../models/ExerciseTemplate.js';
import Exercise from '../models/Exercise.js';
import User from '../models/User.js';

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
    const { title, description, category, poseConfig = {}, metadata = {} } = req.body;
    if (!title || typeof title !== 'string' || title.length < 3) return res.status(400).json({ success: false, error: 'Title is required (min 3 chars)' });
    const t = new ExerciseTemplate({ title, description, category, poseConfig, metadata, createdBy: req.user.id });
    await t.save();
    res.json({ success: true, template: t });
  } catch (e) {
    console.error('POST /api/templates', e);
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

    const { assignedTo = [], overrides = {} } = req.body || {};

    // validate assigned users exist
    if (!Array.isArray(assignedTo)) return res.status(400).json({ success: false, error: 'assignedTo must be an array of user IDs' });
    const validAssigned = [];
    const invalid = [];
    for (const uid of assignedTo) {
      const u = await User.findById(uid);
      if (u && u.role === 'patient') validAssigned.push(u._id);
      else invalid.push(uid);
    }
    if (validAssigned.length === 0) return res.status(400).json({ success: false, error: 'No valid patient assignees provided', invalid });

    // sanitize overrides.poseConfig: remove empty-string fields so they don't overwrite template defaults
    if (overrides && typeof overrides === 'object' && overrides.poseConfig && typeof overrides.poseConfig === 'object') {
      for (const k of Object.keys(overrides.poseConfig)) {
        if (overrides.poseConfig[k] === '' || overrides.poseConfig[k] === null || overrides.poseConfig[k] === undefined) {
          delete overrides.poseConfig[k];
        }
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
      overrides
    });
    await exerciseDoc.save();
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
