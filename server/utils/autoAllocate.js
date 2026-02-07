import ExerciseTemplate from '../models/ExerciseTemplate.js';
import Exercise from '../models/Exercise.js';
import User from '../models/User.js';
import { createNotification } from './createNotification.js';

function scoreTemplates(templates, vulnTags = []) {
  const tags = vulnTags.map((t) => String(t).trim().toLowerCase()).filter(Boolean);
  return templates.map((tpl) => {
    const meta = tpl.metadata || {};
    // Normalize vulnerability tags (handle arrays or comma-separated strings)
    const rawTags = meta.vulnerabilityTags || meta.tags || [];
    const list = Array.isArray(rawTags)
      ? rawTags
      : String(rawTags).split(','); // if stored as a single comma-separated string
    const tplTags = list
      .map((t) => String(t).trim().toLowerCase())
      .filter(Boolean);
    const overlap = tags.length ? tplTags.filter((t) => tags.includes(t)) : [];
    const cat = (tpl.category || '').toLowerCase();
    const catHit = tags.some((v) => cat && cat.includes(v)) ? 0.5 : 0;
    // Additional heuristic matches: joints (e.g., 'knee'), and title/description keywords
    const joints = (tpl.poseConfig && tpl.poseConfig.joints) ? String(tpl.poseConfig.joints).toLowerCase() : '';
    const jointHit = joints && tags.includes(joints) ? 1 : 0;
    const txt = ((tpl.title || '') + ' ' + (tpl.description || '')).toLowerCase();
    const titleHit = tags.some((v) => txt.includes(v)) ? 0.5 : 0;
    const score = overlap.length + catHit + jointHit + titleHit;
    return { tpl, score, overlap };
  }).sort((a, b) => b.score - a.score);
}

export async function autoAllocateForPatient(patientId, { limit = 3, dueAt = null, dailyReminder = false, vulnerabilities = null, allowDuplicates = false } = {}) {
  const patient = await User.findById(patientId);
  if (!patient || patient.role !== 'patient') return { success: false, reason: 'patient_not_found' };
  if (!patient.therapistId) return { success: false, reason: 'no_therapist' };
  const vulnTags = Array.isArray(vulnerabilities) && vulnerabilities.length
    ? vulnerabilities.map((t) => String(t).trim().toLowerCase()).filter(Boolean)
    : (patient.vulnerabilityProfile?.tags || []).map((t) => String(t).trim().toLowerCase()).filter(Boolean);
  if (!vulnTags.length) return { success: false, reason: 'no_vulnerabilities' };

  const templates = await ExerciseTemplate.find({ createdBy: patient.therapistId });
  if (!templates.length) return { success: false, reason: 'no_templates' };

  const scored = scoreTemplates(templates, vulnTags);
  let available = scored;
  if (!allowDuplicates) {
    // Avoid duplicating existing assignments for this patient/therapist/template
    const existing = await Exercise.find({
      assignedTo: patient._id,
      createdBy: patient.therapistId,
      templateId: { $ne: null }
    }).select('templateId');
    const existingTplIds = new Set(existing.map((e) => String(e.templateId)));
    available = scored.filter((s) => !existingTplIds.has(String(s.tpl._id)));
  }
  const chosen = available.filter((s) => s.score > 0).slice(0, Math.max(1, Math.min(10, Number(limit) || 3)));
  if (!chosen.length) {
    if (available.length === 0) return { success: true, count: 0, reason: 'already_assigned' };
    return { success: false, reason: 'no_matches' };
  }

  const created = [];
  const matches = [];
  for (const { tpl, overlap, score } of chosen) {
    const exerciseDoc = new Exercise({
      title: tpl.title,
      description: tpl.description,
      assignedTo: [patient._id],
      metadata: { ...(tpl.metadata || {}), matchedVulnerabilities: overlap, matchScore: score },
      poseConfig: tpl.poseConfig?.toObject?.() || tpl.poseConfig || {},
      createdBy: patient.therapistId,
      templateId: tpl._id,
      overrides: { autoAllocated: true, vulnerabilitiesUsed: vulnTags },
      dueAt: dueAt ? new Date(dueAt) : undefined,
      dailyReminder: !!dailyReminder
    });
    await exerciseDoc.save();
    await createNotification(
      patient._id,
      'New tailored activity',
      `We assigned '${exerciseDoc.title}' based on your needs.`,
      { exerciseId: exerciseDoc._id, event: 'assigned', templateId: tpl._id, auto: true }
    );
    created.push(exerciseDoc);
    matches.push({ templateId: String(tpl._id), title: tpl.title, matchScore: score, matchedVulnerabilities: overlap });
  }

  return { success: true, count: created.length, exercises: created, matches };
}

// Allocate for all patients with vulnerability tags; intended for scheduled runs
export async function autoAllocateForAllPatients({ limitPerPatient = 3, dueAt = null, dailyReminder = false } = {}) {
  const patients = await User.find({ role: 'patient', 'vulnerabilityProfile.tags.0': { $exists: true } });
  const results = [];
  for (const p of patients) {
    try {
      const r = await autoAllocateForPatient(p._id, { limit: limitPerPatient, dueAt, dailyReminder });
      results.push({ patientId: p._id, ...r });
    } catch (e) {
      results.push({ patientId: p._id, success: false, error: e.message || 'error' });
    }
  }
  return results;
}
