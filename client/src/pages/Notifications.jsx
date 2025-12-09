import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Notifications() {
  const { authFetch, decrementNotifications, refreshIndicators } = useAuth();
  const [items, setItems] = useState([]);

  useEffect(() => {
    const load = async () => {
      const r = await authFetch('http://localhost:5000/api/notifications');
      const j = await r.json();
      if (j.success) setItems(j.notifications||[]);
    };
    load();
  }, [authFetch]);

  const markRead = async (id) => {
    await authFetch(`http://localhost:5000/api/notifications/${id}/read`, { method:'POST' });
    setItems(items.map(n => n._id===id ? { ...n, readAt: new Date().toISOString() } : n));
    decrementNotifications();
    // optional freshness
    refreshIndicators();
  };

  return (
    <main className="min-h-screen p-8 bg-gray-900 text-gray-100">
      <div className="max-w-4xl mx-auto bg-gray-800 p-6 rounded shadow">
        <h1 className="text-2xl font-bold mb-4">Notifications</h1>
        <ul className="divide-y divide-gray-700">
          {items.map(n => (
            <li key={n._id} className="py-3">
              <div className="font-semibold">{n.title}</div>
              <div className="text-gray-200">{n.body}</div>
              <div className="text-xs text-gray-400 mb-2">{new Date(n.createdAt).toLocaleString()}</div>
              {!n.readAt && <button onClick={()=>markRead(n._id)} className="bg-indigo-600 px-2 py-1 rounded text-sm">Mark read</button>}
            </li>
          ))}
          {items.length===0 && <div className="text-gray-400">No notifications yet.</div>}
        </ul>
      </div>
    </main>
  );
}
