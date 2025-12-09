import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Messages() {
  const { authFetch, user, decrementMessages, refreshIndicators } = useAuth();
  const [inbox, setInbox] = useState([]);
  const [sent, setSent] = useState([]);
  const [tab, setTab] = useState('inbox');
  const [users, setUsers] = useState([]); // simple recipient picker for therapists: pull from patients API
  const [newMsg, setNewMsg] = useState({ to: '', subject: '', body: '' });
  const [loading, setLoading] = useState(false);
  const [autoRecipientLoaded, setAutoRecipientLoaded] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [a,b] = await Promise.all([
          authFetch('http://localhost:5000/api/messages'),
          authFetch('http://localhost:5000/api/messages/sent')
        ]);
        const aj = await a.json(); const bj = await b.json();
        if (aj.success) setInbox(aj.inbox||[]);
        if (bj.success) setSent(bj.sent||[]);
      } catch(e) {}
      if (user?.role === 'therapist') {
        try { const r = await authFetch('http://localhost:5000/api/patients'); const j = await r.json(); if (j.success) setUsers(j.patients||[]); } catch(_){ }
      } else if (user?.role === 'patient' && !autoRecipientLoaded) {
        try {
          const r = await authFetch('http://localhost:5000/api/user/therapists');
          const j = await r.json();
          if (j.success && j.therapists && j.therapists.length) {
            setNewMsg(m => ({ ...m, to: j.therapists[0]._id }));
          }
        } catch(_){}
        setAutoRecipientLoaded(true);
      }
    };
    load();
  }, [authFetch, user, autoRecipientLoaded]);

  const markRead = async (id) => {
    try {
      await authFetch(`http://localhost:5000/api/messages/${id}/read`, { method:'POST' });
      setInbox(inbox.map(m => m._id===id ? { ...m, readAt: new Date().toISOString() } : m));
      decrementMessages();
      refreshIndicators();
    } catch(e) {}
  };

  const send = async (e) => {
    e.preventDefault();
    // For patients, rely on auto-assigned therapist; if missing, abort
    if (user?.role === 'patient' && !newMsg.to) return;
    if (!newMsg.to || !newMsg.body) return;
    setLoading(true);
    try {
      const r = await authFetch('http://localhost:5000/api/messages', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(newMsg) });
      const j = await r.json();
      if (j.success) { setNewMsg({ to:'', subject:'', body:'' }); setTab('sent'); setSent([j.message, ...sent]); }
    } finally { setLoading(false); }
  };

  return (
    <main className="min-h-screen p-8 bg-gray-900 text-gray-100">
      <div className="max-w-5xl mx-auto bg-gray-800 p-6 rounded shadow">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Messages</h1>
          <div className="space-x-2">
            <button className={`px-3 py-1 rounded ${tab==='inbox'?'bg-indigo-600':'bg-gray-700'}`} onClick={()=>setTab('inbox')}>Inbox</button>
            <button className={`px-3 py-1 rounded ${tab==='sent'?'bg-indigo-600':'bg-gray-700'}`} onClick={()=>setTab('sent')}>Sent</button>
            <button className={`px-3 py-1 rounded ${tab==='compose'?'bg-indigo-600':'bg-gray-700'}`} onClick={()=>setTab('compose')}>Compose</button>
          </div>
        </div>

        {tab === 'inbox' && (
          <ul className="divide-y divide-gray-700">
            {inbox.map(m => (
              <li key={m._id} className="py-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-sm text-gray-300">From: {m.from?.name || 'Unknown'}</div>
                    <div className="font-semibold">{m.subject || '(no subject)'}</div>
                  </div>
                  {!m.readAt && (
                    <button onClick={()=>markRead(m._id)} className="ml-4 bg-indigo-600 px-2 py-1 rounded text-xs">Mark read</button>
                  )}
                </div>
                <div className="text-gray-200 whitespace-pre-wrap mt-1">{m.body}</div>
                <div className="text-xs text-gray-400 mt-1">{new Date(m.createdAt).toLocaleString()}</div>
              </li>
            ))}
            {inbox.length===0 && <div className="text-gray-400">No messages.</div>}
          </ul>
        )}

        {tab === 'sent' && (
          <ul className="divide-y divide-gray-700">
            {sent.map(m => (
              <li key={m._id} className="py-3">
                <div className="text-sm text-gray-300">To: {m.to?.name || 'Unknown'}</div>
                <div className="font-semibold">{m.subject || '(no subject)'}</div>
                <div className="text-gray-200 whitespace-pre-wrap">{m.body}</div>
                <div className="text-xs text-gray-400">{new Date(m.createdAt).toLocaleString()}</div>
              </li>
            ))}
            {sent.length===0 && <div className="text-gray-400">No sent messages.</div>}
          </ul>
        )}

        {tab === 'compose' && (
          <form onSubmit={send} className="space-y-3">
            {user?.role === 'therapist' ? (
              <select value={newMsg.to} onChange={e=>setNewMsg({...newMsg, to:e.target.value})} className="bg-gray-700 p-2 rounded">
                <option value="">Select recipient</option>
                {users.map(u => <option key={u._id} value={u._id}>{u.name} ({u.email})</option>)}
              </select>
            ) : (
              <div className="text-sm text-gray-300">Messages are sent to your therapist automatically.</div>
            )}
            <input value={newMsg.subject} onChange={e=>setNewMsg({...newMsg, subject:e.target.value})} placeholder="Subject" className="w-full bg-gray-700 p-2 rounded" />
            <textarea value={newMsg.body} onChange={e=>setNewMsg({...newMsg, body:e.target.value})} placeholder="Write your message..." className="w-full bg-gray-700 p-2 rounded h-40" />
            {user?.role !== 'therapist' && (
              <input type="hidden" value={newMsg.to} readOnly />
            )}
            <button disabled={loading || (!newMsg.to && user?.role==='therapist')} className="bg-green-600 px-3 py-2 rounded disabled:opacity-50">Send</button>
          </form>
        )}
      </div>
    </main>
  );
}
