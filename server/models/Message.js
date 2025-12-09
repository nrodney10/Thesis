import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subject: { type: String, default: '' },
  body: { type: String, required: true },
  readAt: { type: Date },
}, { timestamps: true });

export default mongoose.model('Message', messageSchema);
