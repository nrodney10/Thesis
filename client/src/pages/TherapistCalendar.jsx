import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function TherapistCalendar() {
  const { authFetch } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [existingExercises, setExistingExercises] = useState([]);
  const [existingGames, setExistingGames] = useState([]);
  const [scheduleForm, setScheduleForm] = useState({ mode: 'template', templateId: '', existingKind: 'exercise', existingId: '', title: '', description: '', dueAt: '', dailyReminder: false });
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());

  const load = async (patientId) => {
    setLoading(true);
    try {
      let res;
      if (patientId) res = await authFetch(`http://localhost:5000/api/calendar/patient/${patientId}`);
      else res = await authFetch('http://localhost:5000/api/calendar/therapist');
      const data = await res.json();
      if (data.success) setItems(data.items || []);
    } catch (e) {
      console.error('calendar therapist load', e);
    }
    setLoading(false);
  };

  useEffect(() => { load(selectedPatient); }, [selectedPatient]);

  const fetchPatients = async () => {
    try {
      const res = await authFetch('http://localhost:5000/api/patients');
      const data = await res.json();
      if (data.success) setPatients(data.patients || []);
    } catch (e) { console.error('failed to load patients', e); }
  };

  useEffect(()=>{ fetchPatients(); }, []);
  useEffect(()=>{ const fetchTemplates = async () => { try { const res = await authFetch('http://localhost:5000/api/templates'); const j = await res.json(); if (j.success) setTemplates(j.templates || []); } catch(e){console.error('failed to load templates', e);} }; fetchTemplates(); }, []);
  useEffect(()=>{
    const fetchExisting = async () => {
      try {
        const res = await authFetch('http://localhost:5000/api/exercises');
        const j = await res.json();
        if (j.success) {
          const all = j.exercises || [];
          const games = all.filter(ex => (ex.metadata?.assignmentType || '').toLowerCase() === 'game');
          const exercises = all.filter(ex => (ex.metadata?.assignmentType || '').toLowerCase() !== 'game');
          setExistingGames(games);
          setExistingExercises(exercises);
        }
      } catch (e) { console.error('failed to load existing exercises/games', e); }
    };
    fetchExisting();
  }, [authFetch]);

  const grouped = useMemo(() => {
    const map = {};
    items.forEach(it => {
      const d = it.dueAt ? new Date(it.dueAt) : null;
      if (!d) return;
      const k = d.toDateString();
      if (!map[k]) map[k] = [];
      map[k].push(it);
    });
    return map;
  }, [items]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const monthLabel = new Date(year, month, 1).toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <main className="min-h-screen p-6 bg-gray-900 text-gray-100">
      <div className="max-w-6xl mx-auto bg-gray-800 p-6 rounded shadow">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Therapist Calendar</h1>
          <button onClick={load} className="px-3 py-2 bg-indigo-600 rounded text-sm">Refresh</button>
        </div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-gray-300">Upcoming activities for your patients in the next 30 days.</p>
          <div className="flex items-center gap-3">
            <label className="text-sm">Patient
              <select value={selectedPatient} onChange={e=>setSelectedPatient(e.target.value)} className="ml-2 bg-gray-700 p-2 rounded">
                <option value="">All patients</option>
                {patients.map(p=> <option key={p._id} value={p._id}>{p.name}</option>)}
              </select>
            </label>
            <button onClick={()=>setShowAdd(s=>!s)} className="px-3 py-2 bg-indigo-600 rounded text-sm">{showAdd ? 'Close' : 'Add activity'}</button>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-3">
          <select value={month} onChange={(e)=>setMonth(Number(e.target.value))} className="bg-gray-700 p-2 rounded">
            {Array.from({length:12}).map((_,i)=><option value={i} key={i}>{new Date(2000,i,1).toLocaleString('default',{month:'long'})}</option>)}
          </select>
          <select value={year} onChange={(e)=>setYear(Number(e.target.value))} className="bg-gray-700 p-2 rounded">
            {Array.from({length:5}).map((_,i)=> {
              const y = new Date().getFullYear() - 2 + i;
              return <option value={y} key={y}>{y}</option>;
            })}
          </select>
          <div className="text-sm text-gray-300">{monthLabel}</div>
        </div>

        {showAdd && (
          <div className="mb-4 p-4 bg-gray-900 rounded">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="text-sm">Mode
                <select value={scheduleForm.mode} onChange={e=>setScheduleForm({...scheduleForm, mode:e.target.value})} className="w-full p-2 bg-gray-700 rounded mt-1">
                  <option value="template">From template</option>
                  <option value="existing">Existing activity</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
              <label className="text-sm">Due date
                <input type="date" value={scheduleForm.dueAt||''} onChange={e=>setScheduleForm({...scheduleForm, dueAt: e.target.value})} className="w-full p-2 bg-gray-700 rounded mt-1" />
              </label>
              <label className="text-sm">Daily reminder
                <input type="checkbox" checked={!!scheduleForm.dailyReminder} onChange={e=>setScheduleForm({...scheduleForm, dailyReminder: e.target.checked})} className="ml-2" />
              </label>
            </div>
            {scheduleForm.mode === 'template' ? (
              <div className="mt-3">
                <label className="text-sm">Template
                  <select value={scheduleForm.templateId} onChange={e=>setScheduleForm({...scheduleForm, templateId: e.target.value})} className="w-full p-2 bg-gray-700 rounded mt-1">
                    <option value="">Select template</option>
                    {templates.map(t => <option key={t._id} value={t._id}>{t.title}</option>)}
                  </select>
                </label>
                <div className="mt-3 flex gap-2">
                  <button onClick={async ()=>{
                    if (!selectedPatient) return alert('Select a patient first');
                    if (!scheduleForm.templateId) return alert('Pick a template');
                    if (!scheduleForm.dueAt) return alert('Pick a due date for the schedule');
                    // validate due date not in past
                    if (scheduleForm.dueAt) {
                      const d = new Date(scheduleForm.dueAt);
                      const today = new Date(); today.setHours(0,0,0,0);
                      if (d < today) return alert('Cannot schedule on a past date');
                    }
                    try {
                      const body = { assignedTo: [selectedPatient], overrides: {}, dueAt: scheduleForm.dueAt || undefined, dailyReminder: scheduleForm.dailyReminder };
                      const res = await authFetch(`http://localhost:5000/api/templates/${scheduleForm.templateId}/instantiate`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
                      const j = await res.json();
                      if (j.success) { alert('Created'); load(selectedPatient); fetchPatients(); setShowAdd(false); }
                      else alert(j.error || 'Failed');
                    } catch (e) { console.error(e); alert('Error'); }
                  }} className="bg-indigo-600 px-3 py-2 rounded text-white">Create from template</button>
                  <button onClick={()=>setShowAdd(false)} className="bg-gray-700 px-3 py-2 rounded">Cancel</button>
                </div>
              </div>
            ) : scheduleForm.mode === 'existing' ? (
              <div className="mt-3">
                <label className="text-sm">Kind
                  <select value={scheduleForm.existingKind} onChange={e=>setScheduleForm({...scheduleForm, existingKind: e.target.value, existingId: ''})} className="w-full p-2 bg-gray-700 rounded mt-1">
                    <option value="exercise">Exercise</option>
                    <option value="game">Game</option>
                  </select>
                </label>
                <label className="text-sm mt-2">Select item
                  <select value={scheduleForm.existingId} onChange={e=>setScheduleForm({...scheduleForm, existingId: e.target.value})} className="w-full p-2 bg-gray-700 rounded mt-1">
                    <option value="">Pick an item</option>
                    {scheduleForm.existingKind === 'exercise' ? (
                      existingExercises.map(ex => <option key={ex._id} value={ex._id}>{ex.title}</option>)
                    ) : (
                      existingGames.map(g => <option key={g._id} value={g._id}>{g.title}</option>)
                    )}
                  </select>
                </label>
                <div className="mt-3 flex gap-2">
                  <button onClick={async ()=>{
                    if (!selectedPatient) return alert('Select a patient first');
                    if (!scheduleForm.existingId) return alert('Pick an existing item');
                    if (!scheduleForm.dueAt) return alert('Pick a due date for the schedule');
                    if (scheduleForm.dueAt) {
                      const d = new Date(scheduleForm.dueAt);
                      const today = new Date(); today.setHours(0,0,0,0);
                      if (d < today) return alert('Cannot schedule on a past date');
                    }
                    try {
                      // find the selected item
                      const list = scheduleForm.existingKind === 'exercise' ? existingExercises : existingGames;
                      const item = list.find(x => String(x._id) === String(scheduleForm.existingId));
                      if (!item) return alert('Selected item not found');
                      const body = {
                        // copy relevant fields
                        title: item.title,
                        description: item.description,
                        poseConfig: item.poseConfig || undefined,
                        metadata: item.metadata || undefined,
                        assignedTo: [selectedPatient],
                        dueAt: scheduleForm.dueAt || undefined,
                        dailyReminder: scheduleForm.dailyReminder
                      };
                      const res = await authFetch('http://localhost:5000/api/exercises', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
                      const j = await res.json();
                      if (j.success) { alert('Created'); load(selectedPatient); setShowAdd(false); }
                      else alert(j.error || 'Failed');
                    } catch (e) { console.error(e); alert('Error'); }
                  }} className="bg-indigo-600 px-3 py-2 rounded text-white">Create from existing</button>
                  <button onClick={()=>setShowAdd(false)} className="bg-gray-700 px-3 py-2 rounded">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <label className="text-sm">Title<input value={scheduleForm.title} onChange={e=>setScheduleForm({...scheduleForm, title: e.target.value})} className="w-full p-2 bg-gray-700 rounded mt-1" /></label>
                <label className="text-sm mt-2">Description<input value={scheduleForm.description} onChange={e=>setScheduleForm({...scheduleForm, description: e.target.value})} className="w-full p-2 bg-gray-700 rounded mt-1" /></label>
                <div className="mt-3 flex gap-2">
                  <button onClick={async ()=>{
                    if (!selectedPatient) return alert('Select a patient first');
                    if (!scheduleForm.title) return alert('Provide title');
                    if (!scheduleForm.dueAt) return alert('Pick a due date for the schedule');
                    if (scheduleForm.dueAt) {
                      const d = new Date(scheduleForm.dueAt);
                      const today = new Date(); today.setHours(0,0,0,0);
                      if (d < today) return alert('Cannot schedule on a past date');
                    }
                    try {
                      const body = { title: scheduleForm.title, description: scheduleForm.description, assignedTo: [selectedPatient], dueAt: scheduleForm.dueAt || undefined, dailyReminder: scheduleForm.dailyReminder };
                      const res = await authFetch('http://localhost:5000/api/exercises', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
                      const j = await res.json();
                      if (j.success) { alert('Created'); load(selectedPatient); setShowAdd(false); }
                      else alert(j.error || 'Failed');
                    } catch (e) { console.error(e); alert('Error'); }
                  }} className="bg-indigo-600 px-3 py-2 rounded text-white">Create custom activity</button>
                  <button onClick={()=>setShowAdd(false)} className="bg-gray-700 px-3 py-2 rounded">Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-7 gap-2 bg-gray-900 p-3 rounded mb-6">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d)=>(
            <div key={d} className="text-xs text-gray-400 text-center uppercase tracking-wide">{d}</div>
          ))}
          {cells.map((c, idx) => {
            if (!c) return <div key={idx} />;
            const k = c.toDateString();
            const has = grouped[k]?.length;
            return (
              <div key={idx} className={`rounded-lg p-2 h-20 border ${has ? 'border-indigo-400 bg-indigo-50 text-indigo-900' : 'border-gray-700 bg-gray-800 text-gray-200'}`}>
                <div className="text-right text-sm font-semibold">{c.getDate()}</div>
                {has ? <div className="text-xs">{has} item{has>1?'s':''}</div> : null}
              </div>
            );
          })}
        </div>

        <h2 className="text-lg font-semibold mb-2">Upcoming list</h2>
        {loading ? <div className="text-gray-300">Loading...</div> : (
          <ul className="space-y-2">
            {items.length === 0 && <li className="text-gray-400 text-sm">No upcoming items.</li>}
            {items.map((it) => (
              <li key={it.id} className="p-3 rounded bg-gray-900 flex justify-between items-center">
                <div style={{flex:1}}>
                  <div className="font-medium">{it.title}</div>
                  <div className="text-xs text-gray-400">
                    {it.dueAt ? new Date(it.dueAt).toLocaleString() : 'No due date'} {it.dailyReminder ? '• Daily reminder' : ''}
                  </div>
                  {it.description && <div className="text-xs text-gray-300 mt-1">{it.description}</div>}
                  {it.assignedTo && (
                    <div className="text-xs text-gray-400 mt-1">
                      Assigned: {it.assignedTo.map(p=>p?.name || p?.email || p).join(', ')}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={async ()=>{
                    // open inline edit prompt
                    const newTitle = window.prompt('Title', it.title);
                    if (newTitle === null) return; // cancelled
                    const newDue = window.prompt('Due date (YYYY-MM-DD) or empty to clear', it.dueAt ? new Date(it.dueAt).toISOString().slice(0,10) : '');
                    if (newDue !== null) {
                      // validate not in past
                      if (newDue) {
                        const d = new Date(newDue);
                        const today = new Date(); today.setHours(0,0,0,0);
                        if (d < today) { alert('Cannot schedule in the past'); return; }
                      }
                    }
                    const newDaily = window.confirm('Set daily reminder? (OK = yes, Cancel = no)');
                    try {
                      const body = { title: newTitle, dueAt: newDue ? new Date(newDue).toISOString() : null, dailyReminder: newDaily };
                      const res = await authFetch(`http://localhost:5000/api/exercises/${it.id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
                      const j = await res.json();
                      if (j.success) { alert('Updated'); load(selectedPatient); }
                      else alert(j.error || 'Update failed');
                    } catch (e) { console.error(e); alert('Error updating'); }
                  }} className="px-2 py-1 bg-gray-700 rounded text-sm">Edit</button>
                  <button onClick={async ()=>{
                    if (!window.confirm('Delete this scheduled item?')) return;
                    try {
                      const res = await authFetch(`http://localhost:5000/api/exercises/${it.id}`, { method:'DELETE' });
                      const j = await res.json();
                      if (j.success) { alert('Deleted'); load(selectedPatient); }
                      else alert(j.error || 'Delete failed');
                    } catch (e) { console.error(e); alert('Error deleting'); }
                  }} className="px-2 py-1 bg-red-600 rounded text-sm">Delete</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
