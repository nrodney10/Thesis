import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function TherapistNotifications(){
  const { authFetch } = useAuth();
  const [patients, setPatients] = useState([]);
  const [selected, setSelected] = useState([]);
  const [form, setForm] = useState({ title:'', body:'' });
  const [msg, setMsg] = useState('');

  useEffect(()=>{ const load= async()=>{ try{ const r= await authFetch('http://localhost:5000/api/patients'); const j= await r.json(); if(j.success) setPatients(j.patients||[]);} catch(_){} }; load(); },[authFetch]);

  const toggle = (id)=> setSelected(s => s.includes(id) ? s.filter(x=>x!==id) : [...s,id]);

  const send = async (e)=>{ e.preventDefault(); setMsg(''); if(!selected.length) return; try{ const r= await authFetch('http://localhost:5000/api/notifications',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ userIds:selected, title:form.title, body:form.body })}); const j= await r.json(); setMsg(j.success? `Sent to ${j.created} patients.` : (j.message||'Failed')); if(j.success){ setForm({ title:'', body:''}); setSelected([]);} } catch(err){ setMsg('Error sending'); }};

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
      </div>
    </main>
  );
}
