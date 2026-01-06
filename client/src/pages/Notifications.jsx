import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Notifications() {
  const { authFetch, decrementNotifications, refreshIndicators, user } = useAuth();
  const [items, setItems] = useState([]);
  const [actionStatus, setActionStatus] = useState({});

  useEffect(() => {
    const load = async () => {
      const r = await authFetch('http://localhost:5000/api/notifications');
      const j = await r.json();
      if (j.success) {
        const filtered = (j.notifications || []).filter(n => {
          if (n.data?.type === 'therapist-request') {
            if (user?.therapistId && (!n.data?.therapistId || String(n.data?.therapistId) === String(user.therapistId))) {
              return false; // already linked to a therapist; hide request
            }
            if (n.readAt) return false;
          }
          return true;
        });
        const initialStatus = {};
        filtered.forEach((n) => {
          if (['accepted', 'declined'].includes(n?.data?.status)) {
            initialStatus[n._id] = n.data.status;
          }
          if (n.data?.type === 'therapist-request' && user?.therapistId && n.data?.therapistId && String(n.data.therapistId) === String(user.therapistId)) {
            initialStatus[n._id] = 'accepted';
          }
        });
        setActionStatus(initialStatus);
        setItems(filtered);
      }
    };
    load();
  }, [authFetch, user]);

  const markRead = async (id) => {
    await authFetch(`http://localhost:5000/api/notifications/${id}/read`, { method:'POST' });
    setItems(items.map(n => n._id===id ? { ...n, readAt: new Date().toISOString() } : n));
    decrementNotifications();
    // optional freshness
    refreshIndicators();
  };

  const respondTherapist = async (action, notif) => {
    setActionStatus((s)=>({ ...s, [notif._id]: 'working' }));
    try {
      const r = await authFetch('http://localhost:5000/api/patients/respond-therapist', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action, therapistId: notif?.data?.therapistId || null })
      });
      const j = await r.json();
      if (j.success) {
        // mark status for this notification and set it read locally
        const finalStatus = action === 'accept' ? 'accepted' : 'declined';
        setItems((prev)=>prev.filter(n => n._id !== notif._id));
        try { await authFetch(`http://localhost:5000/api/notifications/${notif._id}/read`, { method:'POST' }); } catch (_) {}
        refreshIndicators();
        setActionStatus((s)=>({ ...s, [notif._id]: finalStatus }));
      } else {
        alert(j.message || 'Action failed');
        setActionStatus((s)=>({ ...s, [notif._id]: 'error' }));
      }
    } catch (e) {
      console.error(e);
      alert('Error sending response');
      setActionStatus((s)=>({ ...s, [notif._id]: 'error' }));
    }
  };

  return (
    <main className="min-h-screen p-8 bg-gray-900 text-gray-100">
      <div className="max-w-4xl mx-auto bg-gray-800 p-6 rounded shadow">
        <h1 className="text-2xl font-bold mb-4">Notifications</h1>
        <ul className="divide-y divide-gray-700">
          {items.map(n => (
            <li key={n._id} className="py-3">
              <div className="font-semibold text-gray-100">{n.title}</div>
              <div className="text-sm text-gray-200">{n.body}</div>
              <div className="text-xs text-gray-400 mb-2">{new Date(n.createdAt).toLocaleString()}</div>
              {n.data?.type === 'therapist-request' ? (
                <div className="flex gap-2 items-center">
                  {['accepted','declined'].includes(actionStatus[n._id]) ? (
                    <span className={`text-xs ${actionStatus[n._id] === 'accepted' ? 'text-green-300' : 'text-yellow-300'}`}>
                      {actionStatus[n._id] === 'accepted' ? 'Accepted' : 'Declined'}
                    </span>
                  ) : (
                    <>
                      <button disabled={actionStatus[n._id]==='working'} onClick={()=>respondTherapist('accept', n)} className="bg-green-600 px-2 py-1 rounded text-sm disabled:opacity-50">Accept</button>
                      <button disabled={actionStatus[n._id]==='working'} onClick={()=>respondTherapist('decline', n)} className="bg-red-600 px-2 py-1 rounded text-sm disabled:opacity-50">Decline</button>
                      {actionStatus[n._id] === 'working' && <span className="text-xs text-gray-300">Saving...</span>}
                      {actionStatus[n._id] === 'error' && <span className="text-xs text-red-300">Error</span>}
                    </>
                  )}
                </div>
              ) : (
                !n.readAt && <button onClick={()=>markRead(n._id)} className="bg-indigo-600 px-2 py-1 rounded text-sm">Mark read</button>
              )}
            </li>
          ))}
          {items.length===0 && <div className="text-gray-400">No notifications yet.</div>}
        </ul>
      </div>
    </main>
  );
}
