import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import resultsRoutes from "./routes/results.js";
import patientsRoutes from "./routes/patients.js";
import exercisesRoutes from "./routes/exercises.js";
import templatesRoutes from "./routes/templates.js";
import fitbitRoutes from "./routes/fitbit.routes.js";
import messagesRoutes from "./routes/messages.js";
import notificationsRoutes from "./routes/notifications.js";
import reportsExportRoutes from "./routes/reports.js";
import userRoutes from "./routes/user.js";
import indicatorsRoutes from "./routes/indicators.js";
import Exercise from './models/Exercise.js';
import { createNotification } from './utils/createNotification.js';

console.log("Starting RodRecover backend...");
if (process.env.FITBIT_CLIENT_ID) {
  console.log(`Fitbit client configured: ${process.env.FITBIT_CLIENT_ID} (secret len=${(process.env.FITBIT_CLIENT_SECRET||'').length}) redirect=${process.env.FITBIT_REDIRECT_URI}`);
} else {
  console.log('Fitbit client not configured (no FITBIT_CLIENT_ID in env).');
}

dotenv.config();
console.log("Mongo URI from .env:", process.env.MONGO_URI);


const app = express();
app.use(cors());
app.use(express.json());

// Connect to MongoDB
connectDB();

app.get("/", (req, res) => {
  res.send("RodRecover API running...");
});

app.use("/api/auth", authRoutes);
app.use("/api/results", resultsRoutes);
app.use("/api/patients", patientsRoutes);
app.use("/api/exercises", exercisesRoutes);
app.use("/api/templates", templatesRoutes);
app.use("/api/fitbit", fitbitRoutes);
app.use("/api/messages", messagesRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/reports", reportsExportRoutes);
app.use("/api/user", userRoutes);
app.use("/api/indicators", indicatorsRoutes);

// Simple interval to send due / daily reminders every minute
setInterval(async () => {
  try {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // Due notifications
    const dueExercises = await Exercise.find({ dueAt: { $lte: now }, dueNotifiedAt: { $exists: false } }).limit(50);
    for (const ex of dueExercises) {
      for (const uid of ex.assignedTo) {
        await createNotification(uid, 'Exercise due', `Time to do exercise: ${ex.title}`, { exerciseId: ex._id, event:'due' });
      }
      ex.dueNotifiedAt = new Date();
      await ex.save();
    }
    // Daily reminders
    const daily = await Exercise.find({ dailyReminder: true }).limit(200);
    for (const ex of daily) {
      const last = ex.lastDailyReminderDate ? new Date(ex.lastDailyReminderDate) : null;
      if (!last || last < midnight) {
        for (const uid of ex.assignedTo) {
          await createNotification(uid, 'Daily exercise reminder', `Don't forget: ${ex.title}`, { exerciseId: ex._id, event:'daily' });
        }
        ex.lastDailyReminderDate = midnight;
        await ex.save();
      }
    }
  } catch (e) {
    console.error('Reminder interval error', e);
  }
}, 60000); // 60s

const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

export default app;
