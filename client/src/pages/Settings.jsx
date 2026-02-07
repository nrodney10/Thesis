import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Settings() {
  const { authFetch, login } = useAuth();
  const [profile, setProfile] = useState({ name: '', age: 0, email: '', dateOfBirth: '', vulnerabilityTags: '', vulnerabilityNotes: '' });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const load = async () => {
      const r = await authFetch('http://localhost:5000/api/user/me');
      const j = await r.json();
      if (j.success && j.user) {
        const tags = j.user.vulnerabilityProfile?.tags?.join(', ') || '';
        const dob = j.user.dateOfBirth ? new Date(j.user.dateOfBirth).toISOString().slice(0, 10) : '';
        setProfile({ name: j.user.name, age: j.user.age, email: j.user.email, dateOfBirth: dob, vulnerabilityTags: tags, vulnerabilityNotes: j.user.vulnerabilityProfile?.notes || '' });
      }
    };
    load();
  }, [authFetch]);

  const calculateAge = (dob) => {
    if (!dob) return '';
    const d = new Date(dob);
    if (Number.isNaN(d.getTime())) return '';
    const today = new Date();
    let age = today.getFullYear() - d.getFullYear();
    const m = today.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age -= 1;
    return age >= 0 ? age : '';
  };
  const derivedAge = profile.dateOfBirth ? calculateAge(profile.dateOfBirth) : profile.age;

  const saveProfile = async (e) => {
    e.preventDefault(); setMsg('');
    const body = {
      name: profile.name,
      email: profile.email,
      vulnerabilityProfile: {
        tags: profile.vulnerabilityTags.split(',').map(t=>t.trim()).filter(Boolean),
        notes: profile.vulnerabilityNotes
      }
    };
    const r = await authFetch('http://localhost:5000/api/user/me', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
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
            <label className="block text-sm">Date of birth</label>
            <input type="date" value={profile.dateOfBirth || ''} className="w-full bg-gray-700 p-2 rounded text-gray-400" disabled />
          </div>
          <div>
            <label className="block text-sm">Age (calculated)</label>
            <input type="number" value={derivedAge} className="w-full bg-gray-700 p-2 rounded text-gray-400" disabled />
            <div className="text-xs text-gray-500 mt-1">Age is calculated from your date of birth and cannot be changed.</div>
          </div>
          <div>
            <label className="block text-sm">Email</label>
            <input type="email" value={profile.email} onChange={e=>setProfile({...profile, email:e.target.value})} className="w-full bg-gray-700 p-2 rounded" />
          </div>
          <div>
            <label className="block text-sm">Vulnerability tags (comma-separated)</label>
            <input value={profile.vulnerabilityTags} onChange={e=>setProfile({...profile, vulnerabilityTags:e.target.value})} className="w-full bg-gray-700 p-2 rounded" placeholder="e.g., knee, balance, fall-risk" />
          </div>
          <div>
            <label className="block text-sm">Vulnerability notes</label>
            <textarea value={profile.vulnerabilityNotes} onChange={e=>setProfile({...profile, vulnerabilityNotes:e.target.value})} className="w-full bg-gray-700 p-2 rounded" rows={3} />
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
