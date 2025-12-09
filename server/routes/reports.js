import express from 'express';
import Result from '../models/Result.js';
import { verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// Export results for current user or ?userId= (therapist only)
router.get('/export.csv', verifyToken, async (req, res) => {
  try {
    const queryUserId = req.query.userId || req.user.id;
    if (req.user.role === 'patient' && queryUserId !== req.user.id) {
      return res.status(403).send('Forbidden');
    }
    const items = await Result.find({ userId: queryUserId }).sort({ createdAt: -1 }).lean();
    const rows = items.map(r => ({
      id: r._id,
      createdAt: r.createdAt,
      type: r.type,
      score: r.score,
      exerciseId: r.exerciseId,
      reps: r.metadata?.reps ?? '',
      duration: r.metadata?.duration ?? '',
      heartRate: r.metadata?.heartRate ?? '',
    }));
    // Manual CSV build (avoid external dependency)
    const fields = ['id','createdAt','type','score','exerciseId','reps','duration','heartRate'];
    const esc = (v) => {
      if (v == null) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
    };
    const csv = [fields.join(','), ...rows.map(r => fields.map(f => esc(r[f])).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="results-export.csv"');
    res.send(csv);
  } catch (e) { res.status(500).send('Server error'); }
});

export default router;

// Therapist summary (avg scores & counts per patient)
router.get('/summary', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'therapist') return res.status(403).json({ success:false, message:'Forbidden' });
    const agg = await Result.aggregate([
      { $group: { _id: '$userId', count:{ $sum:1 }, avgScore:{ $avg:'$score' } } },
      { $sort: { avgScore: -1 } }
    ]);
    res.json({ success:true, patients: agg.map(r => ({ userId: r._id, count:r.count, avgScore: Math.round(r.avgScore) })) });
  } catch (e) { res.status(500).json({ success:false, message:'Server error' }); }
});
