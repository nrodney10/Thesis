import mongoose from "mongoose";

const resultSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  exerciseId: { type: String },
  type: { type: String, enum: ["cognitive", "physical"], required: true },
  score: { type: Number, default: 0 },
  metadata: { type: Object, default: {} },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Result", resultSchema);
