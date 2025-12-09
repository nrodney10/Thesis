import mongoose from 'mongoose';

const poseConfigSchema = new mongoose.Schema({
  joints: { type: String, enum: ['knee', 'arm', 'shoulder'], default: 'knee' },
  upAngle: { type: Number, default: 90 },
  downAngle: { type: Number, default: 140 },
  smoothing: { type: Number, default: 0.2 },
  minRepTimeMs: { type: Number, default: 400 }
  , targets: { type: Object }
}, { _id: false });

const ExerciseTemplateSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  category: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  poseConfig: { type: poseConfigSchema, default: () => ({}) },
  metadata: { type: Object },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('ExerciseTemplate', ExerciseTemplateSchema);
