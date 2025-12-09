import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Settings() {
  const { authFetch, login } = useAuth();
  const [profile, setProfile] = useState({ name: '', age: 0, email: '' });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const load = async () => {
      const r = await authFetch('http://localhost:5000/api/user/me');
      const j = await r.json();
      if (j.success && j.user) setProfile({ name: j.user.name, age: j.user.age, email: j.user.email });
    };
    load();
  }, [authFetch]);

  const saveProfile = async (e) => {
    e.preventDefault(); setMsg('');
    const r = await authFetch('http://localhost:5000/api/user/me', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(profile) });
    const j = await r.json();
    if (j.success) { setMsg('Profile updated'); login({ token: localStorage.getItem('token') || sessionStorage.getItem('token'), user: j.user, remember: true }); }
  };

  const changePassword = async (e) => {
    e.preventDefault(); setMsg('');
    const r = await authFetch('http://localhost:5000/api/user/me/password', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(pw) });
    const j = await r.json();
    setMsg(j.success ? 'Password changed' : (j.message || 'Failed to change password'));
    setPw({ currentPassword:'', newPassword:'' });
  };

  return (
    <main className="min-h-screen p-8 bg-gray-900 text-gray-100">
      <div className="max-w-3xl mx-auto bg-gray-800 p-6 rounded shadow">
        <h1 className="text-2xl font-bold mb-3">Settings</h1>
        {msg && <div className="mb-3 text-green-400">{msg}</div>}
        <form onSubmit={saveProfile} className="space-y-3 mb-6">
          <div>
            <label className="block text-sm">Name</label>
            <input value={profile.name} onChange={e=>setProfile({...profile, name:e.target.value})} className="w-full bg-gray-700 p-2 rounded" />
          </div>
          <div>
            <label className="block text-sm">Age</label>
            <input type="number" value={profile.age} onChange={e=>setProfile({...profile, age:Number(e.target.value)||0})} className="w-full bg-gray-700 p-2 rounded" />
          </div>
          <div>
            <label className="block text-sm">Email</label>
            <input type="email" value={profile.email} onChange={e=>setProfile({...profile, email:e.target.value})} className="w-full bg-gray-700 p-2 rounded" />
          </div>
          <button className="bg-indigo-600 px-3 py-2 rounded">Save profile</button>
        </form>

        <form onSubmit={changePassword} className="space-y-3">
          <h2 className="font-semibold">Change password</h2>
          <input type="password" placeholder="Current password" value={pw.currentPassword} onChange={e=>setPw({...pw, currentPassword:e.target.value})} className="w-full bg-gray-700 p-2 rounded" />
          <input type="password" placeholder="New password" value={pw.newPassword} onChange={e=>setPw({...pw, newPassword:e.target.value})} className="w-full bg-gray-700 p-2 rounded" />
          <button className="bg-green-600 px-3 py-2 rounded">Change password</button>
        </form>
      </div>
    </main>
  );
}
