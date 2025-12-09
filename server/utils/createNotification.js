import Notification from '../models/Notification.js';

export async function createNotification(userId, title, body, data = {}) {
  try {
    const n = new Notification({ userId, title, body, data });
    await n.save();
    return n;
  } catch (e) {
    console.error('createNotification error', e);
    return null;
  }
}
