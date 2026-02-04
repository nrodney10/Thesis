import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function TherapistNotifications(){
  const { authFetch } = useAuth();
  const [patients, setPatients] = useState([]);
  const [selected, setSelected] = useState([]);
  const [form, setForm] = useState({ title:'', body:'' });
  const [msg, setMsg] = useState('');
  const [inbox, setInbox] = useState([]);

  useEffect(()=>{ const load= async()=>{ try{ const r= await authFetch('http://localhost:5000/api/patients'); const j= await r.json(); if(j.success) setPatients(j.patients||[]);} catch(_){} }; load(); },[authFetch]);
  useEffect(()=>{ const load= async()=>{ try{ const r= await authFetch('http://localhost:5000/api/notifications'); const j= await r.json(); if(j.success) setInbox(j.notifications||[]);} catch(_){} }; load(); },[authFetch]);

  const toggle = (id)=> setSelected(s => s.includes(id) ? s.filter(x=>x!==id) : [...s,id]);

  const send = async (e)=>{ e.preventDefault(); setMsg(''); if(!selected.length) return; try{ const r= await authFetch('http://localhost:5000/api/notifications',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ userIds:selected, title:form.title, body:form.body })}); const j= await r.json(); setMsg(j.success? `Sent to ${j.created} patients.` : (j.message||'Failed')); if(j.success){ setForm({ title:'', body:''}); setSelected([]);} } catch(err){ setMsg('Error sending'); }};
  const markRead = async (id) => {
    try { await authFetch(`http://localhost:5000/api/notifications/${id}/read`, { method:'POST' }); } catch (_) {}
    setInbox(inbox.map(n => n._id===id ? { ...n, readAt: new Date().toISOString() } : n));
  };

  const respondToPatientRequest = async (notif, action) => {
    try {
      const patientId = notif.data?.patientId;
      if (!patientId) return;
      const r = await authFetch('http://localhost:5000/api/patients/respond-patient', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action, patientId }) });
      const j = await r.json();
      if (j.success) {
        await markRead(notif._id);
        const nbox = inbox.filter(i => i._id !== notif._id);
        setInbox(nbox);
        try {
          const r2 = await authFetch('http://localhost:5000/api/patients');
          const j2 = await r2.json();
          if (j2.success) setPatients(j2.patients||[]);
        } catch (_) {}
      } else {
        alert(j.message || 'Failed');
      }
    } catch (e) {
      console.error('respond patient request', e);
      alert('Error');
    }
  };

  return (
    <main className='min-h-screen p-8 bg-gray-900 text-gray-100'>
      <div className='max-w-5xl mx-auto bg-gray-800 p-6 rounded shadow'>
        <h1 className='text-2xl font-bold mb-4'>Send Notifications</h1>
        {msg && <div className='mb-4 text-green-400'>{msg}</div>}
        <form onSubmit={send} className='space-y-3 mb-6'>
          <input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder='Title' className='w-full bg-gray-700 p-2 rounded' />
          <textarea value={form.body} onChange={e=>setForm({...form,body:e.target.value})} placeholder='Message body' className='w-full bg-gray-700 p-2 rounded h-32' />
          <div className='text-sm text-gray-300'>Select recipients:</div>
          <div className='grid grid-cols-2 md:grid-cols-3 gap-2 max-h-60 overflow-auto'>
            {patients.map(p => (
              <label key={p._id} className={`cursor-pointer flex items-center gap-2 bg-gray-700 rounded p-2 text-sm ${selected.includes(p._id)?'ring-2 ring-indigo-500':''}`}> 
                <input type='checkbox' checked={selected.includes(p._id)} onChange={()=>toggle(p._id)} />
                <span>{p.name} ({p.age})</span>
              </label>
            ))}
            {patients.length===0 && <div className='text-gray-400 col-span-full'>No patients.</div>}
          </div>
          <button disabled={!selected.length} className='bg-indigo-600 px-3 py-2 rounded disabled:opacity-50'>Send Notification</button>
        </form>

        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-3">Your notifications</h2>
          <ul className="divide-y divide-gray-700">
            {inbox.map(n => (
              <li key={n._id} className="py-3">
                <div className="font-semibold text-gray-100">{n.title}</div>
                <div className="text-sm text-gray-200">{n.body}</div>
                <div className="text-xs text-gray-400 mb-2">{new Date(n.createdAt).toLocaleString()}</div>
                {!n.readAt && <button onClick={()=>markRead(n._id)} className="bg-indigo-600 px-2 py-1 rounded text-sm mr-2">Mark read</button>}
                {n.data?.type === 'patient-request' && (
                  <>
                    <button onClick={()=>respondToPatientRequest(n,'accept')} className="bg-green-600 px-2 py-1 rounded text-sm mr-2">Accept</button>
                    <button onClick={()=>respondToPatientRequest(n,'decline')} className="bg-red-600 px-2 py-1 rounded text-sm">Decline</button>
                  </>
                )}
              </li>
            ))}
            {inbox.length === 0 && <li className="text-gray-400">No notifications.</li>}
          </ul>
        </div>
      </div>
    </main>
  );
}
