import express from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import Result from "../models/Result.js";
import User from "../models/User.js";
import Exercise from "../models/Exercise.js";
import { createNotification } from "../utils/createNotification.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import { z } from "zod";
import { validateBody } from "../middleware/validate.js";

const router = express.Router();

// Ensure uploads directory exists for multipart uploads
const uploadsDir = path.join(process.cwd(), "uploads");
try { fs.mkdirSync(uploadsDir, { recursive: true }); } catch (e) { /* ignore */ }

const upload = multer({ dest: uploadsDir });

// Schemas
const poseMetricsSchema = z.object({
  reps: z.number().min(0),
  lastAngle: z.number().nullable().optional(),
  state: z.enum(["up", "down", "unknown"]).optional(),
  samples: z.array(z.number()).optional(),
  // Extended metrics for physical progress
  minAngle: z.number().optional(),
  maxAngle: z.number().optional(),
  avgAngle: z.number().optional(),
  timeInTargetMs: z.number().optional(),
  usedSide: z.enum(["left", "right"]).optional(),
  cadence: z.number().optional(),
  quality: z.array(z.number()).optional(),
  correctReps: z.number().optional(),
  incorrectReps: z.number().optional(),
}).strict().optional();

const metadataSchema = z.object({
  poseMetrics: poseMetricsSchema,
  reps: z.number().optional(),
  difficulty: z.string().optional(),
  duration: z.number().optional(),
  video: z.boolean().optional(),
}).passthrough().optional();

const payloadSchema = z.object({
  exerciseId: z.string(),
  type: z.string(),
  score: z.number().optional(),
  metadata: metadataSchema,
});

// Create a new result (protected) - JSON body
router.post("/", verifyToken, validateBody(payloadSchema), async (req, res) => {
  try {
    const { exerciseId, type, score, metadata } = req.validatedBody;
    const newResult = new Result({
      userId: req.user.id,
      exerciseId,
      type,
      score,
      metadata,
    });
    await newResult.save();
    // Notify therapist of completion
    try {
      const patient = await User.findById(req.user.id).select('therapistId name');
      if (patient?.therapistId) {
        const ex = await Exercise.findById(exerciseId).select('title');
        await createNotification(patient.therapistId, 'Exercise finished', `${patient.name} finished exercise: ${ex?.title || exerciseId}`, { exerciseId, event:'finish', resultId: newResult._id });
      }
    } catch (_) {}
    res.status(201).json({ success: true, result: newResult });
  } catch (err) {
    console.error("Create result error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Upload endpoint: accepts multipart with 'video' file and 'payload' JSON field
router.post("/upload", verifyToken, upload.single('video'), async (req, res) => {
  try {
    let payload = null;
    try {
      payload = req.body.payload ? JSON.parse(req.body.payload) : null;
    } catch (e) {
      return res.status(400).json({ success: false, message: 'Invalid payload JSON' });
    }
    if (!payload) return res.status(400).json({ success: false, message: 'Missing payload' });

    // Validate payload
    const parsed = payloadSchema.safeParse(payload);
    if (!parsed.success) return res.status(400).json({ success: false, message: 'Invalid payload', errors: parsed.error.errors });

    const { exerciseId, type, score, metadata } = parsed.data;
    // attach file path to metadata
    const filePath = req.file ? path.relative(process.cwd(), req.file.path) : null;
    const fullMetadata = Object.assign({}, metadata || {}, { video: !!req.file, videoPath: filePath });

    const newResult = new Result({
      userId: req.user.id,
      exerciseId,
      type,
      score,
      metadata: fullMetadata,
    });
    await newResult.save();
    try {
      const patient = await User.findById(req.user.id).select('therapistId name');
      if (patient?.therapistId) {
        const ex = await Exercise.findById(exerciseId).select('title');
        await createNotification(patient.therapistId, 'Exercise finished', `${patient.name} finished exercise: ${ex?.title || exerciseId}`, { exerciseId, event:'finish', resultId: newResult._id });
      }
    } catch (_) {}
    res.status(201).json({ success: true, result: newResult });
  } catch (err) {
    console.error('Upload result error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get results for a user (therapist can pass ?userId=...)
router.get("/", verifyToken, async (req, res) => {
  try {
    const queryUserId = req.query.userId;

    // Patients can only request their own results
    if (req.user.role === "patient" && queryUserId && queryUserId !== req.user.id) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const filter = {};
    if (queryUserId) filter.userId = queryUserId;
    else filter.userId = req.user.id;

    const results = await Result.find(filter).sort({ createdAt: -1 }).limit(200);
    res.json({ success: true, results });
  } catch (err) {
    console.error("Get results error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
