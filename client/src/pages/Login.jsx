import React, { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const passwordRef = useRef(null);
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    try {
      const last = localStorage.getItem('lastEmail');
      if (last) {
        setEmail(last);
        setTimeout(() => passwordRef.current?.focus(), 0);
      }
    } catch (_) {}
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError("");
    try {
      const res = await fetch("http://localhost:5000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        login({ token: data.token, user: data.user, remember });
        try { localStorage.setItem('lastEmail', email); } catch (_) {}

        const role = data.user?.role;
        if (role === "therapist") navigate("/therapist");
        else navigate("/patient");
      } else {
        setError(data.message || "Invalid email or password. Please try again.");
      }
    } catch (err) {
      console.error("Login error:", err);
      setError("Server error. Please try again shortly.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="w-full max-w-md p-8">
        <div className="text-center mb-6">
          <img
            src="/rodrecover-logo.png"
            alt="RodRecover"
            className="mx-auto w-48 max-w-full h-auto object-contain"
          />
          <h1 className="text-4xl font-semibold text-white mt-4">User Login</h1>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-md border border-red-500 bg-red-900/40 px-4 py-3 text-sm text-red-100 shadow">
            <span className="text-red-300 font-semibold">Error:</span>
            <span>{error}</span>
          </div>
        )}
        <form onSubmit={handleSubmit} className="bg-gray-800 p-6 rounded-lg shadow-lg">
          <div className="mb-4">
            <label className="flex items-center text-gray-300">
              <input
                className="w-full bg-transparent border-b border-gray-600 focus:outline-none px-2 py-2 text-white"
                type="email"
                placeholder="Email ID"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
          </div>

          <div className="mb-4">
            <label className="flex items-center text-gray-300">
              <input
                className="w-full bg-transparent border-b border-gray-600 focus:outline-none px-2 py-2 text-white"
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                ref={passwordRef}
                required
              />
            </label>
          </div>

          <div className="flex items-center justify-between mb-4 text-sm text-gray-400">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="mr-2"
              />
              Remember me
            </label>

            <Link to="/forgot" className="underline text-gray-300">
              Forgot Password?
            </Link>
          </div>

          <button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-md mb-4">LOGIN</button>

          <div className="text-center text-sm text-gray-300">
            Don't have an account?{' '}
            <Link to="/register" className="text-indigo-400 underline">
              Create Account
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
