import React, { useState } from 'react';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('');
  const [resetLink, setResetLink] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setStatus('Sending...');
    setResetLink('');
    try {
      const res = await fetch('http://localhost:5000/api/auth/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const j = await res.json();
      if (j.success) {
        setStatus('If the email exists, a reset link was sent.');
        if (j.resetLink) setResetLink(j.resetLink);
      } else {
        setStatus(j.message || 'Request failed');
      }
    } catch (e) {
      console.error(e);
      setStatus('Server error');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-gray-100">
      <div className="w-full max-w-md bg-gray-800 p-6 rounded shadow">
        <h1 className="text-2xl font-bold mb-4 text-center">Forgot Password</h1>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm mb-1">Email</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full p-2 rounded bg-gray-700" required />
          </div>
          <button className="w-full bg-indigo-600 py-2 rounded">Send reset link</button>
        </form>
        {status && <div className="mt-3 text-sm text-gray-200">{status}</div>}
        {resetLink && (
          <div className="mt-2 text-xs text-gray-300">
            Reset link (local testing): <a className="underline text-indigo-300" href={resetLink}>{resetLink}</a>
          </div>
        )}
      </div>
    </div>
  );
}
