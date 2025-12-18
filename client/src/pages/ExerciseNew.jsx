import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useNavigate } from 'react-router-dom';

export default function ExerciseNew() {
  const { authFetch } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [patients, setPatients] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [poseConfig, setPoseConfig] = useState({
    joints: 'knee',
    upAngle: '',
    downAngle: '',
    smoothing: 0.2,
    minRepTimeMs: 400,
    targets: {}
  });
  const [dueAt, setDueAt] = useState('');
  const [dailyReminder, setDailyReminder] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await authFetch('http://localhost:5000/api/patients');
        const data = await res.json();
        if (data.success) setPatients(data.patients || []);
      } catch (err) {
        console.error('Failed to load patients', err);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    try {
      const assignedTo = Array.from(selected);
      const cleanedPoseConfig = (() => {
        const cfg = { ...poseConfig };
        if (cfg.upAngle === '' || cfg.upAngle === null) delete cfg.upAngle;
        if (cfg.downAngle === '' || cfg.downAngle === null) delete cfg.downAngle;
        if (cfg.targets && Object.keys(cfg.targets).length === 0) delete cfg.targets;
        return cfg;
      })();
      const res = await authFetch('http://localhost:5000/api/exercises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, assignedTo, poseConfig: cleanedPoseConfig, dueAt: dueAt ? new Date(dueAt) : undefined, dailyReminder }),
      });
      const data = await res.json();
      if (data.success) {
        push('Exercise created', 'success');
        navigate('/exercises');
      } else push('Failed to create exercise', 'error');
    } catch (err) {
      console.error(err);
      push('Error creating exercise', 'error');
    }
  };

  return (
    <main className="min-h-screen p-8 bg-gray-900 text-gray-100">
      <div className="max-w-2xl mx-auto bg-gray-800 p-6 rounded shadow">
        <h1 className="text-2xl font-bold mb-4">Create Exercise</h1>
        <label className="block mb-2">Title<input value={title} onChange={(e)=>setTitle(e.target.value)} className="w-full p-2 bg-gray-700 rounded mt-1" /></label>
        <label className="block mb-4">Description<textarea value={description} onChange={(e)=>setDescription(e.target.value)} className="w-full p-2 bg-gray-700 rounded mt-1" /></label>
        <div className="mb-4">
          <div className="text-sm text-gray-300 mb-2">Assign to patients</div>
          <div className="max-h-48 overflow-auto bg-gray-900 p-2 rounded">
            {patients.map((p) => (
              <label key={p._id} className="flex items-center gap-2 p-1">
                <input type="checkbox" checked={selected.has(p._id)} onChange={(e) => {
                  const copy = new Set(selected);
                  if (e.target.checked) copy.add(p._id); else copy.delete(p._id);
                  setSelected(copy);
                }} />
                <span className="text-sm">{p.name} ({p.email || 'no email'})</span>
              </label>
            ))}
          </div>
        </div>
        <fieldset className="mb-4 p-4 border border-gray-700 rounded">
          <legend className="text-sm font-semibold text-gray-300 px-2">Pose Configuration (optional)</legend>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block text-sm">
              Joints to track
              <select value={poseConfig.joints} onChange={(e)=>setPoseConfig({...poseConfig, joints:e.target.value})} className="w-full p-2 bg-gray-700 rounded mt-1">
                <option value="knee">Knee</option>
                <option value="arm">Arm</option>
                <option value="shoulder">Shoulder</option>
              </select>
            </label>
            <label className="block text-sm">
              Up angle (degrees)
              <input type="number" value={poseConfig.upAngle} onChange={(e)=>setPoseConfig({...poseConfig, upAngle: e.target.value === '' ? '' : Number(e.target.value)})} className="w-full p-2 bg-gray-700 rounded mt-1" />
            </label>
            <label className="block text-sm">
              Down angle (degrees)
              <input type="number" value={poseConfig.downAngle} onChange={(e)=>setPoseConfig({...poseConfig, downAngle: e.target.value === '' ? '' : Number(e.target.value)})} className="w-full p-2 bg-gray-700 rounded mt-1" />
            </label>
            <label className="block text-sm">
              Smoothing (0-1)
              <input type="number" step="0.05" min="0" max="1" value={poseConfig.smoothing} onChange={(e)=>setPoseConfig({...poseConfig, smoothing: Number(e.target.value)})} className="w-full p-2 bg-gray-700 rounded mt-1" />
            </label>
            <label className="block text-sm">
              Min rep time (ms)
              <input type="number" value={poseConfig.minRepTimeMs} onChange={(e)=>setPoseConfig({...poseConfig, minRepTimeMs: Number(e.target.value)})} className="w-full p-2 bg-gray-700 rounded mt-1" />
            </label>
          </div>
        </fieldset>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <label className="block text-sm">
            Due date/time
            <input type="datetime-local" value={dueAt} onChange={(e)=>setDueAt(e.target.value)} className="w-full p-2 bg-gray-700 rounded mt-1" />
          </label>
          <label className="block text-sm mt-1 md:mt-0">
            <span className="flex items-center gap-2">
              <input type="checkbox" checked={dailyReminder} onChange={(e)=>setDailyReminder(e.target.checked)} />
              Daily reminder until completed
            </span>
          </label>
        </div>
        <div className="flex gap-2">
          <button onClick={submit} className="bg-indigo-600 px-4 py-2 rounded">Create</button>
        </div>
      </div>
    </main>
  );
}
