import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  body: { type: String, required: true },
  readAt: { type: Date },
  data: { type: Object },
}, { timestamps: true });

export default mongoose.model('Notification', notificationSchema);
