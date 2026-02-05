import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import crypto from "crypto";
import { notifyUsers } from "../utils/notify.js";

const router = express.Router();

// REGISTER
router.post("/register", async (req, res) => {
  try {
    const { name, age, email, password, role } = req.body;

    // Check for existing email
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Save new user
    const newUser = new User({
      name,
      age,
      email,
      password: hashedPassword,
      role,
    });
    await newUser.save();

    // Sign JWT token
    const token = jwt.sign(
      { id: newUser._id, name: newUser.name, role: newUser.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      success: true,
      message: "Registration successful",
      user: { id: newUser._id, name: newUser.name, email: newUser.email, role: newUser.role },
      token,
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ message: "Server error during registration" });
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    //SUCCESS — issue JWT and return user + token
    const token = jwt.sign(
      { id: user._id, name: user.name, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(200).json({
      success: true,
      message: "Login successful",
      user: { id: user._id, name: user.name, role: user.role, email: user.email },
      token,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server error during login" });
  }
});

// FORGOT PASSWORD - generate reset token and send link
router.post("/forgot", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Email required" });
    const user = await User.findOne({ email });
    if (!user) return res.status(200).json({ success: true, message: "If the email exists, a reset link was sent." });

    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashed = crypto.createHash("sha256").update(rawToken).digest("hex");
    user.resetPasswordToken = hashed;
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    const resetLink = `http://localhost:3000/reset?token=${rawToken}&email=${encodeURIComponent(email)}`;
    try { await notifyUsers([user._id], "Password reset", `Reset link: ${resetLink}`); } catch (e) { console.warn("notify send failed", e.message); }

    res.json({ success: true, message: "If the email exists, a reset link was sent.", resetLink }); // resetLink returned for local testing
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ success: false, message: "Server error during password reset request" });
  }
});

router.post("/reset", async (req, res) => {
  try {
    const { token, email, newPassword } = req.body;
    if (!token || !email || !newPassword) return res.status(400).json({ success: false, message: "Missing fields" });

    const hashed = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({
      email,
      resetPasswordToken: hashed,
      resetPasswordExpires: { $gt: new Date() }
    });
    if (!user) return res.status(400).json({ success: false, message: "Invalid or expired token" });

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ success: true, message: "Password has been reset" });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ success: false, message: "Server error during password reset" });
  }
});

export default router;
