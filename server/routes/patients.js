import express from "express";
import User from "../models/User.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// GET /api/patients - therapist-only: return list of patients
router.get("/", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "therapist") {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const patients = await User.find({ role: "patient" }).select("-password");
    res.json({ success: true, patients });
  } catch (err) {
    console.error("Get patients error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Assign therapist to patient
router.post('/:id/assign-therapist', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'therapist') return res.status(403).json({ success:false, message:'Forbidden' });
    const patientId = req.params.id;
    const patient = await User.findById(patientId);
    if (!patient || patient.role !== 'patient') return res.status(404).json({ success:false, message:'Patient not found' });
    // Set therapistId if not already or overwrite
    patient.therapistId = req.user.id;
    await patient.save();
    res.json({ success:true, patient: { id: patient._id, therapistId: patient.therapistId } });
  } catch (e) {
    console.error('assign therapist error', e);
    res.status(500).json({ success:false, message:'Server error' });
  }
});

export default router;
