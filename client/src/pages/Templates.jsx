import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function Templates() {
  const { authFetch } = useAuth();
  const { push } = useToast();
  const [templates, setTemplates] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(false);

  const [newTpl, setNewTpl] = useState({ title: '', description: '', poseConfig: { joints: 'arm', upAngle: 90, downAngle: 140, smoothing: 0.2, minRepTimeMs: 400 } });
  const [assign, setAssign] = useState({ templateId: '', assignedTo: new Set(), overrides: { title: '', poseConfig: {} } });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, pRes] = await Promise.all([
        authFetch('http://localhost:5000/api/templates'),
        authFetch('http://localhost:5000/api/patients')
      ]);
      const tData = await tRes.json();
      const pData = await pRes.json();
      if (tData.success) setTemplates(tData.templates || []);
      if (pData.success) setPatients(pData.patients || []);
    } catch (e) {
      console.error(e); push('Failed to load templates/patients', 'error');
    }
    setLoading(false);
  }, [authFetch, push]);

  useEffect(() => { load(); }, [load]);

  const createTemplate = async () => {
    try {
      const res = await authFetch('http://localhost:5000/api/templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newTpl) });
      const data = await res.json();
      if (data.success) { push('Template created', 'success'); setNewTpl({ ...newTpl, title: '', description: '' }); load(); }
      else push('Failed to create template', 'error');
    } catch (e) { console.error(e); push('Error creating template', 'error'); }
  };

  const instantiate = async () => {
    if (!assign.templateId) return push('Pick a template', 'error');
    try {
      const body = { assignedTo: Array.from(assign.assignedTo), overrides: { ...assign.overrides } };
      const res = await authFetch(`http://localhost:5000/api/templates/${assign.templateId}/instantiate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.success) push('Exercise created from template', 'success');
      else {
        console.error('Instantiate error', data);
        const msg = data.error || data.message || JSON.stringify(data);
        push(`Failed to create from template: ${msg}`, 'error');
      }
    } catch (e) { console.error(e); push('Error creating from template', 'error'); }
  };

  return (
    <main className="min-h-screen p-8 bg-gray-900 text-gray-100">
      <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="bg-gray-800 p-4 rounded">
          <h2 className="text-xl font-semibold mb-2">Templates</h2>
          {loading ? <p>Loading...</p> : (
            <ul className="space-y-2 max-h-64 overflow-auto">
              {templates.map(t => (
                <li key={t._id} className="bg-gray-900 p-2 rounded">
                  <div className="font-medium">{t.title}</div>
                  <div className="text-xs text-gray-400">{t.description}</div>
                </li>
              ))}
              {templates.length === 0 && <li className="text-gray-400">No templates yet.</li>}
            </ul>
          )}
        </section>

        <section className="bg-gray-800 p-4 rounded">
          <h2 className="text-xl font-semibold mb-2">New Template</h2>
          <label className="block text-sm mb-2">Title<input value={newTpl.title} onChange={e=>setNewTpl({...newTpl, title:e.target.value})} className="w-full p-2 bg-gray-700 rounded mt-1"/></label>
          <label className="block text-sm mb-2">Description<textarea value={newTpl.description} onChange={e=>setNewTpl({...newTpl, description:e.target.value})} className="w-full p-2 bg-gray-700 rounded mt-1"/></label>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <label className="text-sm">Joints<select value={newTpl.poseConfig.joints} onChange={e=>setNewTpl({...newTpl, poseConfig:{...newTpl.poseConfig, joints:e.target.value}})} className="w-full p-2 bg-gray-700 rounded mt-1"><option value="arm">Arm</option><option value="knee">Knee</option><option value="shoulder">Shoulder</option></select></label>
            <label className="text-sm">Up angle<input type="number" value={newTpl.poseConfig.upAngle} onChange={e=>setNewTpl({...newTpl, poseConfig:{...newTpl.poseConfig, upAngle:Number(e.target.value)}})} className="w-full p-2 bg-gray-700 rounded mt-1"/></label>
            <label className="text-sm">Down angle<input type="number" value={newTpl.poseConfig.downAngle} onChange={e=>setNewTpl({...newTpl, poseConfig:{...newTpl.poseConfig, downAngle:Number(e.target.value)}})} className="w-full p-2 bg-gray-700 rounded mt-1"/></label>
            <label className="text-sm">Smoothing<input type="number" step="0.05" min="0" max="1" value={newTpl.poseConfig.smoothing} onChange={e=>setNewTpl({...newTpl, poseConfig:{...newTpl.poseConfig, smoothing:Number(e.target.value)}})} className="w-full p-2 bg-gray-700 rounded mt-1"/></label>
          </div>
          <button onClick={createTemplate} className="bg-indigo-600 px-3 py-2 rounded">Save Template</button>
        </section>

        <section className="bg-gray-800 p-4 rounded md:col-span-2">
          <h2 className="text-xl font-semibold mb-2">Create Assignment From Template</h2>
          <label className="block text-sm mb-2">Template
            <select value={assign.templateId} onChange={e=>setAssign({...assign, templateId:e.target.value})} className="w-full p-2 bg-gray-700 rounded mt-1">
              <option value="">Select...</option>
              {templates.map(t=> <option key={t._id} value={t._id}>{t.title}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm">Title override (optional)
              <input value={assign.overrides.title} onChange={e=>setAssign({...assign, overrides:{...assign.overrides, title:e.target.value}})} className="w-full p-2 bg-gray-700 rounded mt-1"/>
            </label>
            <label className="text-sm">Joint override
              <select value={assign.overrides.poseConfig?.joints || ''} onChange={e=>setAssign({...assign, overrides:{...assign.overrides, poseConfig:{...assign.overrides.poseConfig, joints:e.target.value}}})} className="w-full p-2 bg-gray-700 rounded mt-1">
                <option value="">(keep)</option>
                <option value="arm">Arm</option>
                <option value="knee">Knee</option>
                <option value="shoulder">Shoulder</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2">
            <label className="text-sm">Up angle<input type="number" value={assign.overrides.poseConfig?.upAngle || ''} onChange={e=>setAssign({...assign, overrides:{...assign.overrides, poseConfig:{...assign.overrides.poseConfig, upAngle:Number(e.target.value)}}})} className="w-full p-2 bg-gray-700 rounded mt-1"/></label>
            <label className="text-sm">Down angle<input type="number" value={assign.overrides.poseConfig?.downAngle || ''} onChange={e=>setAssign({...assign, overrides:{...assign.overrides, poseConfig:{...assign.overrides.poseConfig, downAngle:Number(e.target.value)}}})} className="w-full p-2 bg-gray-700 rounded mt-1"/></label>
            <label className="text-sm">Smoothing<input type="number" step="0.05" min="0" max="1" value={assign.overrides.poseConfig?.smoothing || ''} onChange={e=>setAssign({...assign, overrides:{...assign.overrides, poseConfig:{...assign.overrides.poseConfig, smoothing:Number(e.target.value)}}})} className="w-full p-2 bg-gray-700 rounded mt-1"/></label>
          </div>
          <div className="mt-3">
            <div className="text-sm text-gray-300 mb-1">Assign to patients</div>
            <div className="max-h-40 overflow-auto bg-gray-900 p-2 rounded">
              {patients.map(p => (
                <label key={p._id} className="flex items-center gap-2 p-1">
                  <input type="checkbox" checked={assign.assignedTo.has(p._id)} onChange={e=>{
                    const s = new Set(assign.assignedTo);
                    if (e.target.checked) s.add(p._id); else s.delete(p._id);
                    setAssign({ ...assign, assignedTo: s });
                  }} />
                  <span className="text-sm">{p.name} ({p.email || 'no email'})</span>
                </label>
              ))}
            </div>
          </div>
          <button onClick={instantiate} className="mt-3 bg-green-600 px-3 py-2 rounded">Create Assignment</button>
        </section>
      </div>
    </main>
  );
}
