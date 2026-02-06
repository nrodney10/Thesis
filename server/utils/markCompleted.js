import Exercise from '../models/Exercise.js';

// helper to upsert completion for a user; used by results and manual completion routes
export const markCompletedForUser = async (exerciseId, userId) => {
  try {
    const ex = await Exercise.findById(exerciseId);
    if (!ex) return { ok: false, reason: 'not-found' };
    if (!ex.assignedTo.map(String).includes(String(userId))) return { ok: false, reason: 'not-assigned' };
    // Only scheduled items (with dueAt) should lock as completed
    if (!ex.dueAt) return { ok: true, skipped: true, reason: 'not-scheduled' };
    const now = new Date();
    const completions = ex.completions || [];
    const idx = completions.findIndex((c) => String(c.userId) === String(userId));
    if (idx >= 0) completions[idx].completedAt = now;
    else completions.push({ userId, completedAt: now });
    ex.completions = completions;
    await ex.save();
    return { ok: true };
  } catch (e) {
    console.error('markCompletedForUser error', e);
    return { ok: false, reason: 'error' };
  }
};

