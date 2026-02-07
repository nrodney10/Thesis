import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  age: { type: Number, required: true },
  dateOfBirth: { type: Date },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["patient", "therapist"], required: true },
  therapistId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // patient -> therapist link
  vulnerabilityProfile: {
    tags: [{ type: String }],
    notes: { type: String }
  },
  pendingTherapistId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
  fitbit: {
    accessToken: { type: String },
    refreshToken: { type: String },
    expiresAt: { type: Date },
    scope: { type: String },
    fitbitUserId: { type: String },
    lastHeartRate: {
      bpm: { type: Number },
      time: { type: String },
      recordedAt: { type: Date },
      source: { type: String }
    },
    // PKCE support (persist across restarts)
    pkceVerifier: { type: String },
    pkceCreatedAt: { type: Date }
  }
});

export default mongoose.model("User", userSchema);
