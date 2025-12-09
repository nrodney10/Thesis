import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  age: { type: Number, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["patient", "therapist"], required: true },
  therapistId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // patient -> therapist link
  fitbit: {
    accessToken: { type: String },
    refreshToken: { type: String },
    expiresAt: { type: Date },
    scope: { type: String },
    fitbitUserId: { type: String },
    // PKCE support (persist across restarts)
    pkceVerifier: { type: String },
    pkceCreatedAt: { type: Date }
  }
});

export default mongoose.model("User", userSchema);
