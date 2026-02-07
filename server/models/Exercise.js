import mongoose from 'mongoose';

const poseConfigSchema = new mongoose.Schema({
  joints: { type: String, enum: ['knee', 'arm', 'shoulder'], default: 'knee' },
  upAngle: { type: Number },
  downAngle: { type: Number },
  smoothing: { type: Number, default: 0.2 },
  minRepTimeMs: { type: Number, default: 400 },
  targets: { type: Object }
}, { _id: false });

const ExerciseSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assignedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  metadata: { type: Object },
  
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExerciseTemplate' },
  overrides: { type: Object },
  poseConfig: { type: poseConfigSchema, default: () => ({}) },
  dueAt: { type: Date },
  dueNotifiedAt: { type: Date },
  upcomingNotifiedAt: { type: Date },
  dailyReminder: { type: Boolean, default: false },
  lastDailyReminderDate: { type: Date },
  completions: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    completedAt: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Exercise', ExerciseSchema);
