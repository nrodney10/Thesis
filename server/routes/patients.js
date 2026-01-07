import express from "express";
import User from "../models/User.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import { createNotification } from '../utils/createNotification.js';

const router = express.Router();

// GET /api/patients - therapist-only: return list of patients assigned to this therapist
router.get("/", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "therapist") {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const patients = await User.find({ role: "patient", therapistId: req.user.id }).select("-password");
    res.json({ success: true, patients });
  } catch (err) {
    console.error("Get patients error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET /api/patients/available - therapist-only: patients that are not assigned and not pending
router.get('/available', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'therapist') return res.status(403).json({ success:false, message:'Forbidden' });
    const patients = await User.find({ role: 'patient', therapistId: { $exists: false }, pendingTherapistId: { $exists: false } }).select('-password');
    res.json({ success:true, patients });
  } catch (e) {
    console.error('get available patients error', e);
    res.status(500).json({ success:false, message:'Server error' });
  }
});

// List available therapists (for patients to browse)
router.get('/therapists', verifyToken, async (req, res) => {
  try {
    const therapists = await User.find({ role: 'therapist' }).select('_id name email');
    res.json({ success:true, therapists });
  } catch (e) {
    console.error('get therapists error', e);
    res.status(500).json({ success:false, message:'Server error' });
  }
});

// Assign therapist to patient
router.post('/:id/assign-therapist', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'therapist') return res.status(403).json({ success:false, message:'Forbidden' });
    const patientId = req.params.id;
    const patient = await User.findById(patientId);
    if (!patient || patient.role !== 'patient') return res.status(404).json({ success:false, message:'Patient not found' });
    // Only allow if patient is not already assigned and not already pending
    if (patient.therapistId) return res.status(400).json({ success:false, message:'Patient already has a therapist' });
    if (patient.pendingTherapistId) return res.status(400).json({ success:false, message:'Patient already has a pending request' });
    // create pending request; patient must accept
    patient.pendingTherapistId = req.user.id;
    await patient.save();
    // notify patient
    try {
      const Notification = (await import('../models/Notification.js')).default;
      await Notification.create({
        userId: patient._id,
        title: 'Therapist request',
        body: `${req.user.name || 'Therapist'} wants to be your therapist.`,
        data: { type: 'therapist-request', therapistId: req.user.id, therapistName: req.user.name || 'Therapist' }
      });
    } catch (e) { console.warn('notify patient failed', e.message); }
    res.json({ success:true, message:'Request sent to patient', pendingTherapistId: req.user.id });
  } catch (e) {
    console.error('assign therapist error', e);
    res.status(500).json({ success:false, message:'Server error' });
  }
});

// Patient requests a therapist (patient -> therapist request)
router.post('/therapists/:id/request', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'patient') return res.status(403).json({ success:false, message:'Forbidden' });
    const therapistId = req.params.id;
    const therapist = await User.findById(therapistId);
    if (!therapist || therapist.role !== 'therapist') return res.status(404).json({ success:false, message:'Therapist not found' });
    const patient = await User.findById(req.user.id);
    if (!patient) return res.status(404).json({ success:false, message:'Patient not found' });
    patient.pendingTherapistId = therapistId;
    await patient.save();
    // notify therapist
    try {
      await createNotification(therapist._id, 'Patient request', `${patient.name || 'A patient'} requested you as their therapist.`, { type:'patient-request', patientId: patient._id, patientName: patient.name || 'Patient' });
    } catch (e) { console.warn('notify therapist failed', e.message); }
    res.json({ success:true, message:'Request sent to therapist' });
  } catch (e) {
    console.error('patient request therapist error', e);
    res.status(500).json({ success:false, message:'Server error' });
  }
});

// Patient responds to therapist request
router.post('/respond-therapist', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'patient') return res.status(403).json({ success:false, message:'Forbidden' });
    const { action, therapistId } = req.body || {};
    const patient = await User.findById(req.user.id);
    if (!patient) return res.status(404).json({ success:false, message:'Patient not found' });
    // allow fallback if pending wasn't set but therapistId provided
    if (!patient.pendingTherapistId && therapistId) {
      patient.pendingTherapistId = therapistId;
    }
    if (!patient.pendingTherapistId) return res.status(400).json({ success:false, message:'No pending request' });
    if (action === 'accept') {
      patient.therapistId = patient.pendingTherapistId;
      patient.pendingTherapistId = undefined;
      await patient.save();
      // remove therapist request notifications for this patient
      try {
        const Notification = (await import('../models/Notification.js')).default;
        await Notification.deleteMany({ userId: patient._id, 'data.type': 'therapist-request' });
        // notify therapist of acceptance
        await Notification.create({
          userId: patient.therapistId,
          title: 'Patient accepted',
          body: `${patient.name || 'Patient'} accepted you as their therapist.`,
          data: { type: 'therapist-accepted', patientId: patient._id, patientName: patient.name || 'Patient' }
        });
      } catch (e) { console.warn('cleanup notifications failed', e.message); }
      return res.json({ success:true, therapistId: patient.therapistId });
    }
    if (action === 'decline') {
      patient.pendingTherapistId = undefined;
      await patient.save();
      try {
        const Notification = (await import('../models/Notification.js')).default;
        await Notification.deleteMany({ userId: patient._id, 'data.type': 'therapist-request' });
      } catch (e) { console.warn('cleanup notifications failed', e.message); }
      return res.json({ success:true, message:'Declined' });
    }
    return res.status(400).json({ success:false, message:'Invalid action' });
  } catch (e) {
    console.error('respond therapist error', e);
    res.status(500).json({ success:false, message:'Server error' });
  }
});

// Therapist can remove themselves from a patient
router.post('/:id/unassign-therapist', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'therapist') return res.status(403).json({ success:false, message:'Forbidden' });
    const patientId = req.params.id;
    const patient = await User.findById(patientId);
    if (!patient || patient.role !== 'patient') return res.status(404).json({ success:false, message:'Patient not found' });
    if (String(patient.therapistId) !== String(req.user.id)) return res.status(403).json({ success:false, message:'Not assigned to you' });

    patient.therapistId = undefined;
    patient.pendingTherapistId = undefined;
    await patient.save();
    try {
      const Notification = (await import('../models/Notification.js')).default;
      await Notification.create({
        userId: patient._id,
        title: 'Therapist removed',
        body: `${req.user.name || 'Therapist'} removed themselves from your care.`,
        data: { type: 'therapist-removed', therapistId: req.user.id }
      });
    } catch (e) { console.warn('notify removal failed', e.message); }

    res.json({ success:true });
  } catch (e) {
    console.error('unassign therapist error', e);
    res.status(500).json({ success:false, message:'Server error' });
  }
});

// Therapist responds to patient request (accept/decline)
router.post('/respond-patient', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'therapist') return res.status(403).json({ success:false, message:'Forbidden' });
    const { action, patientId } = req.body || {};
    if (!patientId) return res.status(400).json({ success:false, message:'Missing patientId' });
    const patient = await User.findById(patientId);
    if (!patient || patient.role !== 'patient') return res.status(404).json({ success:false, message:'Patient not found' });
    // ensure the pending request targets this therapist
    if (!patient.pendingTherapistId || String(patient.pendingTherapistId) !== String(req.user.id)) {
      return res.status(400).json({ success:false, message:'No pending request for you' });
    }
    if (action === 'accept') {
      patient.therapistId = req.user.id;
      patient.pendingTherapistId = undefined;
      await patient.save();
      // notify patient of acceptance
      try {
        await createNotification(patient._id, 'Therapist accepted', `${req.user.name || 'Therapist'} accepted your request.`, { type:'therapist-accepted', therapistId: req.user.id, therapistName: req.user.name || 'Therapist' });
      } catch (e) { console.warn('notify patient failed', e.message); }
      return res.json({ success:true, therapistId: req.user.id });
    }
    if (action === 'decline') {
      patient.pendingTherapistId = undefined;
      await patient.save();
      try { await createNotification(patient._id, 'Therapist declined', `${req.user.name || 'Therapist'} declined your request.`, { type:'therapist-declined', therapistId: req.user.id }); } catch(e){/*ignore*/}
      return res.json({ success:true, message:'Declined' });
    }
    return res.status(400).json({ success:false, message:'Invalid action' });
  } catch (e) {
    console.error('respond patient error', e);
    res.status(500).json({ success:false, message:'Server error' });
  }
});

// Update patient vulnerability profile (therapist only)
router.put('/:id/vulnerabilities', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'therapist') return res.status(403).json({ success:false, message:'Forbidden' });
    const patientId = req.params.id;
    const patient = await User.findById(patientId);
    if (!patient || patient.role !== 'patient') return res.status(404).json({ success:false, message:'Patient not found' });
    const { tags = [], notes = '' } = req.body || {};
    const cleanTags = Array.isArray(tags) ? tags.map((t)=>String(t).trim()).filter(Boolean) : [];
    patient.vulnerabilityProfile = { tags: cleanTags, notes };
    await patient.save();
    res.json({ success:true, vulnerabilityProfile: patient.vulnerabilityProfile });
  } catch (e) {
    console.error('update vulnerabilities error', e);
    res.status(500).json({ success:false, message:'Server error' });
  }
});

export default router;
