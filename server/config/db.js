// C:\rodrecover\server\config\db.js
import mongoose from "mongoose";

export default async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
  console.log("MongoDB Connected to Atlas");
  } catch (err) {
  console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  }
}
