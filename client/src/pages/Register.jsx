import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Register() {
  const [form, setForm] = useState({
    name: "",
    dateOfBirth: "",
    email: "",
    password: "",
    role: "patient",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const navigate = useNavigate();
  const { login } = useAuth();

  const calculateAge = (dob) => {
    if (!dob) return "";
    const d = new Date(dob);
    if (Number.isNaN(d.getTime())) return "";
    const today = new Date();
    let age = today.getFullYear() - d.getFullYear();
    const m = today.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age -= 1;
    return age >= 0 ? age : "";
  };

  const computedAge = calculateAge(form.dateOfBirth);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    try {
      const payload = {
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        dateOfBirth: form.dateOfBirth
      };
      const res = await fetch("http://localhost:5000/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccess("Registered successfully! Redirecting...");
        login({ token: data.token, user: data.user, remember: true });
        if (data.user?.role === "therapist") navigate("/therapist");
        else navigate("/patient");
      } else {
        setError(data.message || "Registration failed. Please check your details.");
      }
    } catch (err) {
      setError("Server error. Please try again.");
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
      <form
        onSubmit={handleSubmit}
        className="bg-gray-800 shadow-2xl rounded-2xl p-8 w-full max-w-md"
      >
        <div className="text-center mb-4">
          <img
            src="/rodrecover-logo.png"
            alt="RodRecover"
            className="mx-auto w-48 max-w-full h-auto object-contain"
          />
        </div>
        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-md border border-red-500 bg-red-900/40 px-4 py-3 text-sm text-red-100 shadow">
            <span className="text-red-300 font-semibold">Error:</span>
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="mb-4 flex items-start gap-2 rounded-md border border-green-500 bg-green-900/30 px-4 py-3 text-sm text-green-100 shadow">
            <span className="text-green-300 font-semibold">Success:</span>
            <span>{success}</span>
          </div>
        )}
        <h1 className="text-3xl font-bold text-center text-white mb-6">
          RodRecover Registration
        </h1>

        <input
          type="text"
          name="name"
          placeholder="Full Name"
          value={form.name}
          onChange={handleChange}
          className="w-full bg-transparent border-b border-gray-600 px-4 py-2 mb-4 focus:outline-none text-white"
          required
        />

        <div className="mb-4">
          <label className="block text-sm text-gray-300 mb-1">Date of birth</label>
          <input
            type="date"
            name="dateOfBirth"
            value={form.dateOfBirth}
            onChange={handleChange}
            max={new Date().toISOString().slice(0, 10)}
            className="w-full bg-transparent border-b border-gray-600 px-4 py-2 focus:outline-none text-white"
            required
          />
        </div>
        <div className="mb-4">
          <label className="block text-sm text-gray-300 mb-1">Age (calculated)</label>
          <input
            type="number"
            value={computedAge}
            readOnly
            className="w-full bg-transparent border-b border-gray-700 px-4 py-2 text-gray-400"
            placeholder="Age will appear after selecting DOB"
          />
          <div className="text-xs text-gray-500 mt-1">Age is calculated from your date of birth and cannot be changed later.</div>
        </div>

        <input
          type="email"
          name="email"
          placeholder="Email"
          value={form.email}
          onChange={handleChange}
          className="w-full bg-transparent border-b border-gray-600 px-4 py-2 mb-4 focus:outline-none text-white"
          required
        />

        <input
          type="password"
          name="password"
          placeholder="Password"
          value={form.password}
          onChange={handleChange}
          className="w-full bg-transparent border-b border-gray-600 px-4 py-2 mb-4 focus:outline-none text-white"
          required
        />

        <select
          name="role"
          value={form.role}
          onChange={handleChange}
          className="w-full bg-gray-800 border-b border-gray-600 px-4 py-2 mb-6 text-white"
        >
          <option value="patient">Patient</option>
          <option value="therapist">Therapist</option>
        </select>

        <button
          type="submit"
          className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 transition duration-200"
        >
          Register
        </button>
        <div className="text-center text-sm text-gray-700 mt-4">
          Already have an account?{' '}
          <Link to="/login" className="text-blue-600 underline">
            Login
          </Link>
        </div>
      </form>
    </div>
  );
}
