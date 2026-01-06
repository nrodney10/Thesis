import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export default function ResetPassword() {
  const qs = new URLSearchParams(useLocation().search);
  const presetEmail = qs.get('email') || '';
  const token = qs.get('token') || '';
  const [email, setEmail] = useState(presetEmail);
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    if (!token) return setStatus('Missing token');
    setStatus('Resetting...');
    try {
      const res = await fetch('http://localhost:5000/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email, newPassword: password })
      });
      const j = await res.json();
      if (j.success) {
        setStatus('Password reset. Redirecting to login...');
        setTimeout(() => navigate('/login'), 1200);
      } else {
        setStatus(j.message || 'Reset failed');
      }
    } catch (e) {
      console.error(e);
      setStatus('Server error');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-gray-100">
      <div className="w-full max-w-md bg-gray-800 p-6 rounded shadow">
        <h1 className="text-2xl font-bold mb-4 text-center">Reset Password</h1>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm mb-1">Email</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full p-2 rounded bg-gray-700" required />
          </div>
          <div>
            <label className="block text-sm mb-1">New password</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full p-2 rounded bg-gray-700" required />
          </div>
          <button className="w-full bg-indigo-600 py-2 rounded">Reset</button>
        </form>
        {status && <div className="mt-3 text-sm text-gray-200">{status}</div>}
      </div>
    </div>
  );
}
