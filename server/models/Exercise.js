import mongoose from 'mongoose';

const poseConfigSchema = new mongoose.Schema({
  joints: { type: String, enum: ['knee', 'arm', 'shoulder'], default: 'knee' },
  upAngle: { type: Number },
  downAngle: { type: Number },
  smoothing: { type: Number, default: 0.2 },
  minRepTimeMs: { type: Number, default: 400 },
  // Therapist-defined target windows (e.g., { type:'squat', kneeRange:[70,100], torsoMaxLean:25 })
  targets: { type: Object }
}, { _id: false });

const ExerciseSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assignedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  metadata: { type: Object },
  // If created from a template, keep a reference and capture overrides used at instantiation time
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExerciseTemplate' },
  overrides: { type: Object },
  poseConfig: { type: poseConfigSchema, default: () => ({}) },
  dueAt: { type: Date }, // when exercise should be performed
  dueNotifiedAt: { type: Date }, // when a due notification was sent
  upcomingNotifiedAt: { type: Date }, // when an upcoming (advance) notice was sent
  dailyReminder: { type: Boolean, default: false }, // send daily reminder until completed
  lastDailyReminderDate: { type: Date }, // date (midnight) last reminder sent
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Exercise', ExerciseSchema);
