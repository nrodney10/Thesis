import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function Templates() {
  const { authFetch } = useAuth();
  const { push } = useToast();
  const [templates, setTemplates] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(false);

  const [newTpl, setNewTpl] = useState({
    title: '',
    description: '',
    poseConfig: {
      joints: 'arm',
      upAngle: '',
      downAngle: '',
      smoothing: 0.2,
      minRepTimeMs: 400,
      targets: {}
    },
    metadata: { reps: '', holdSeconds: '' }
  });
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

  const sanitizePoseConfig = (cfg = {}) => {
    const copy = JSON.parse(JSON.stringify(cfg));
    if (copy.upAngle === '' || copy.upAngle === null) delete copy.upAngle;
    if (copy.downAngle === '' || copy.downAngle === null) delete copy.downAngle;
    if (copy.targets) {
      if (Array.isArray(copy.targets.kneeRange)) {
        const [a, b] = copy.targets.kneeRange;
        if (!Number.isFinite(a) || !Number.isFinite(b)) delete copy.targets.kneeRange;
      }
      for (const key of Object.keys(copy.targets)) {
        const val = copy.targets[key];
        if (val === '' || val === null) delete copy.targets[key];
      }
      if (Object.keys(copy.targets).length === 0) delete copy.targets;
    }
    return copy;
  };

  const createTemplate = async () => {
    try {
      const body = {
        ...newTpl,
        poseConfig: sanitizePoseConfig(newTpl.poseConfig),
        metadata: { ...newTpl.metadata }
      };
      if (!body.metadata.reps) delete body.metadata.reps;
      if (!body.metadata.holdSeconds) delete body.metadata.holdSeconds;
      const res = await authFetch('http://localhost:5000/api/templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.success) { push('Template created', 'success'); setNewTpl({ ...newTpl, title: '', description: '' }); load(); }
      else push('Failed to create template', 'error');
    } catch (e) { console.error(e); push('Error creating template', 'error'); }
  };

  const instantiate = async () => {
    if (!assign.templateId) return push('Pick a template', 'error');
    try {
      const cleanedOverrides = { ...assign.overrides };
      if (cleanedOverrides.poseConfig) cleanedOverrides.poseConfig = sanitizePoseConfig(cleanedOverrides.poseConfig);
      const body = { assignedTo: Array.from(assign.assignedTo), overrides: cleanedOverrides };
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
                <li key={t._id} className="bg-gray-900 p-2 rounded flex justify-between items-start">
                  <div>
                    <div className="font-medium">{t.title}</div>
                    <div className="text-xs text-gray-400">{t.description}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={async ()=>{
                      if (!window.confirm('Delete template "' + t.title + '"? This cannot be undone.')) return;
                      try {
                        const res = await authFetch(`http://localhost:5000/api/templates/${t._id}`, { method: 'DELETE' });
                        const data = await res.json();
                        if (data.success) { push('Template deleted', 'success'); load(); }
                        else { push('Failed to delete template', 'error'); console.error('delete template failed', data); }
                      } catch (err) { console.error('delete err', err); push('Error deleting template', 'error'); }
                    }} className="px-2 py-1 bg-red-600 rounded text-sm">Delete</button>
                  </div>
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
            <label className="text-sm">Up angle<input type="number" value={newTpl.poseConfig.upAngle ?? ''} onChange={e=>setNewTpl({...newTpl, poseConfig:{...newTpl.poseConfig, upAngle:e.target.value === '' ? '' : Number(e.target.value)}})} className="w-full p-2 bg-gray-700 rounded mt-1"/></label>
            <label className="text-sm">Down angle<input type="number" value={newTpl.poseConfig.downAngle ?? ''} onChange={e=>setNewTpl({...newTpl, poseConfig:{...newTpl.poseConfig, downAngle:e.target.value === '' ? '' : Number(e.target.value)}})} className="w-full p-2 bg-gray-700 rounded mt-1"/></label>
            <label className="text-sm">Smoothing<input type="number" step="0.05" min="0" max="1" value={newTpl.poseConfig.smoothing} onChange={e=>setNewTpl({...newTpl, poseConfig:{...newTpl.poseConfig, smoothing:Number(e.target.value)}})} className="w-full p-2 bg-gray-700 rounded mt-1"/></label>
          </div>

          <div className="mb-2">
            <label className="text-sm block">Target type
              <select value={newTpl.poseConfig.targets?.type || ''} onChange={e=>setNewTpl({...newTpl, poseConfig:{...newTpl.poseConfig, targets:{...newTpl.poseConfig.targets, type: e.target.value}}})} className="w-full p-2 bg-gray-700 rounded mt-1">
                <option value="">(none)</option>
                <option value="tpose">T-pose (static)</option>
                <option value="squat">Squat (static)</option>
              </select>
            </label>

            {newTpl.poseConfig.targets?.type === 'tpose' && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <label className="text-sm">Allowed tilt (deg)
                  <input type="number" value={newTpl.poseConfig.targets.allowedRotation ?? ''} onChange={e=>setNewTpl({...newTpl, poseConfig:{...newTpl.poseConfig, targets:{...newTpl.poseConfig.targets, allowedRotation: e.target.value === '' ? '' : Number(e.target.value)}}})} className="w-full p-2 bg-gray-700 rounded mt-1" />
                </label>
                <label className="text-sm">Elbow tolerance (deg)
                  <input type="number" value={newTpl.poseConfig.targets.elbowTol ?? ''} onChange={e=>setNewTpl({...newTpl, poseConfig:{...newTpl.poseConfig, targets:{...newTpl.poseConfig.targets, elbowTol: e.target.value === '' ? '' : Number(e.target.value)}}})} className="w-full p-2 bg-gray-700 rounded mt-1" />
                </label>
                <label className="text-sm">Min keypoint score
                  <input type="number" step="0.05" min="0" max="1" value={newTpl.poseConfig.targets.minScore ?? ''} onChange={e=>setNewTpl({...newTpl, poseConfig:{...newTpl.poseConfig, targets:{...newTpl.poseConfig.targets, minScore: e.target.value === '' ? '' : Number(e.target.value)}}})} className="w-full p-2 bg-gray-700 rounded mt-1" />
                </label>
                <label className="text-sm">Correct message
                  <input value={newTpl.poseConfig.targets.correctMsg || ''} onChange={e=>setNewTpl({...newTpl, poseConfig:{...newTpl.poseConfig, targets:{...newTpl.poseConfig.targets, correctMsg: e.target.value}}})} className="w-full p-2 bg-gray-700 rounded mt-1" />
                </label>
                <label className="text-sm">Incorrect message
                  <input value={newTpl.poseConfig.targets.incorrectMsg || ''} onChange={e=>setNewTpl({...newTpl, poseConfig:{...newTpl.poseConfig, targets:{...newTpl.poseConfig.targets, incorrectMsg: e.target.value}}})} className="w-full p-2 bg-gray-700 rounded mt-1" />
                </label>
              </div>
            )}

            {newTpl.poseConfig.targets?.type === 'squat' && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <label className="text-sm">Knee range (min)
                  <input type="number" value={(newTpl.poseConfig.targets.kneeRange && newTpl.poseConfig.targets.kneeRange[0]) ?? ''} onChange={e=>setNewTpl({...newTpl, poseConfig:{...newTpl.poseConfig, targets:{...newTpl.poseConfig.targets, kneeRange: [e.target.value === '' ? '' : Number(e.target.value), newTpl.poseConfig.targets?.kneeRange ? newTpl.poseConfig.targets.kneeRange[1] : '']}}})} className="w-full p-2 bg-gray-700 rounded mt-1" />
                </label>
                <label className="text-sm">Knee range (max)
                  <input type="number" value={(newTpl.poseConfig.targets.kneeRange && newTpl.poseConfig.targets.kneeRange[1]) ?? ''} onChange={e=>setNewTpl({...newTpl, poseConfig:{...newTpl.poseConfig, targets:{...newTpl.poseConfig.targets, kneeRange: [newTpl.poseConfig.targets?.kneeRange ? newTpl.poseConfig.targets.kneeRange[0] : '', e.target.value === '' ? '' : Number(e.target.value)]}}})} className="w-full p-2 bg-gray-700 rounded mt-1" />
                </label>
                <label className="text-sm">Max torso lean (deg)
                  <input type="number" value={newTpl.poseConfig.targets.torsoMaxLean ?? ''} onChange={e=>setNewTpl({...newTpl, poseConfig:{...newTpl.poseConfig, targets:{...newTpl.poseConfig.targets, torsoMaxLean: e.target.value === '' ? '' : Number(e.target.value)}}})} className="w-full p-2 bg-gray-700 rounded mt-1" />
                </label>
                <label className="text-sm">Max arm tilt (deg)
                  <input type="number" value={newTpl.poseConfig.targets.armMaxTilt ?? ''} onChange={e=>setNewTpl({...newTpl, poseConfig:{...newTpl.poseConfig, targets:{...newTpl.poseConfig.targets, armMaxTilt: e.target.value === '' ? '' : Number(e.target.value)}}})} className="w-full p-2 bg-gray-700 rounded mt-1" />
                </label>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <label className="text-sm">Default reps
              <input type="number" value={newTpl.metadata?.reps ?? ''} onChange={e=>setNewTpl({...newTpl, metadata:{...newTpl.metadata, reps: e.target.value === '' ? '' : Number(e.target.value)}})} className="w-full p-2 bg-gray-700 rounded mt-1" />
            </label>
            <label className="text-sm">Hold seconds (optional)
              <input type="number" value={newTpl.metadata?.holdSeconds ?? ''} onChange={e=>setNewTpl({...newTpl, metadata:{...newTpl.metadata, holdSeconds: e.target.value === '' ? '' : Number(e.target.value)}})} className="w-full p-2 bg-gray-700 rounded mt-1" />
            </label>
          </div>
          <button onClick={createTemplate} className="bg-indigo-600 px-3 py-2 rounded">Save Template</button>
        </section>

        <section className="bg-gray-800 p-4 rounded md:col-span-2">
          <h2 className="text-xl font-semibold mb-2">Create Assignment From Template</h2>
          <label className="block text-sm mb-2">Template
            <select value={assign.templateId} onChange={e=>{
              const tid = e.target.value;
              if (!tid) { setAssign({...assign, templateId: ''}); return; }
              const tpl = templates.find(x => String(x._id) === String(tid));
              if (!tpl) { setAssign({...assign, templateId: tid}); return; }
              // copy title and poseConfig into overrides so therapist can tweak before instantiate
              const copyPose = tpl.poseConfig ? JSON.parse(JSON.stringify(tpl.poseConfig)) : {};
              setAssign({...assign, templateId: tid, overrides: { ...assign.overrides, title: tpl.title || '', poseConfig: copyPose }});
            }} className="w-full p-2 bg-gray-700 rounded mt-1">
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
            <label className="text-sm">Up angle<input type="number" value={assign.overrides.poseConfig?.upAngle || ''} onChange={e=>setAssign({...assign, overrides:{...assign.overrides, poseConfig:{...assign.overrides.poseConfig, upAngle:e.target.value === '' ? '' : Number(e.target.value)}}})} className="w-full p-2 bg-gray-700 rounded mt-1"/></label>
            <label className="text-sm">Down angle<input type="number" value={assign.overrides.poseConfig?.downAngle || ''} onChange={e=>setAssign({...assign, overrides:{...assign.overrides, poseConfig:{...assign.overrides.poseConfig, downAngle:e.target.value === '' ? '' : Number(e.target.value)}}})} className="w-full p-2 bg-gray-700 rounded mt-1"/></label>
            <label className="text-sm">Smoothing<input type="number" step="0.05" min="0" max="1" value={assign.overrides.poseConfig?.smoothing || ''} onChange={e=>setAssign({...assign, overrides:{...assign.overrides, poseConfig:{...assign.overrides.poseConfig, smoothing:e.target.value === '' ? '' : Number(e.target.value)}}})} className="w-full p-2 bg-gray-700 rounded mt-1"/></label>
          </div>

          <div className="mt-2">
            <label className="text-sm block">Target type override
              <select value={assign.overrides.poseConfig?.targets?.type || ''} onChange={e=>setAssign({...assign, overrides:{...assign.overrides, poseConfig:{...assign.overrides.poseConfig, targets:{...assign.overrides.poseConfig?.targets, type: e.target.value}}}})} className="w-full p-2 bg-gray-700 rounded mt-1">
                <option value="">(keep)</option>
                <option value="tpose">T-pose</option>
                <option value="squat">Squat</option>
              </select>
            </label>

            {assign.overrides.poseConfig?.targets?.type === 'tpose' && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <label className="text-sm">Allowed tilt (deg)
                  <input type="number" value={assign.overrides.poseConfig?.targets?.allowedRotation ?? ''} onChange={e=>setAssign({...assign, overrides:{...assign.overrides, poseConfig:{...assign.overrides.poseConfig, targets:{...assign.overrides.poseConfig?.targets, allowedRotation: e.target.value === '' ? '' : Number(e.target.value)}}}})} className="w-full p-2 bg-gray-700 rounded mt-1" />
                </label>
                <label className="text-sm">Elbow tolerance (deg)
                  <input type="number" value={assign.overrides.poseConfig?.targets?.elbowTol ?? ''} onChange={e=>setAssign({...assign, overrides:{...assign.overrides, poseConfig:{...assign.overrides.poseConfig, targets:{...assign.overrides.poseConfig?.targets, elbowTol: e.target.value === '' ? '' : Number(e.target.value)}}}})} className="w-full p-2 bg-gray-700 rounded mt-1" />
                </label>
                <label className="text-sm">Min keypoint score
                  <input type="number" step="0.05" min="0" max="1" value={assign.overrides.poseConfig?.targets?.minScore ?? ''} onChange={e=>setAssign({...assign, overrides:{...assign.overrides, poseConfig:{...assign.overrides.poseConfig, targets:{...assign.overrides.poseConfig?.targets, minScore: e.target.value === '' ? '' : Number(e.target.value)}}}})} className="w-full p-2 bg-gray-700 rounded mt-1" />
                </label>
                <label className="text-sm">Correct message
                  <input value={assign.overrides.poseConfig?.targets?.correctMsg || ''} onChange={e=>setAssign({...assign, overrides:{...assign.overrides, poseConfig:{...assign.overrides.poseConfig, targets:{...assign.overrides.poseConfig?.targets, correctMsg: e.target.value}}}})} className="w-full p-2 bg-gray-700 rounded mt-1" />
                </label>
                <label className="text-sm">Incorrect message
                  <input value={assign.overrides.poseConfig?.targets?.incorrectMsg || ''} onChange={e=>setAssign({...assign, overrides:{...assign.overrides, poseConfig:{...assign.overrides.poseConfig, targets:{...assign.overrides.poseConfig?.targets, incorrectMsg: e.target.value}}}})} className="w-full p-2 bg-gray-700 rounded mt-1" />
                </label>
              </div>
            )}

            {assign.overrides.poseConfig?.targets?.type === 'squat' && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <label className="text-sm">Knee min
                  <input type="number" value={assign.overrides.poseConfig?.targets?.kneeRange?.[0] ?? ''} onChange={e=>setAssign({...assign, overrides:{...assign.overrides, poseConfig:{...assign.overrides.poseConfig, targets:{...assign.overrides.poseConfig?.targets, kneeRange: [e.target.value === '' ? '' : Number(e.target.value), assign.overrides.poseConfig?.targets?.kneeRange?.[1] ?? '']}}}})} className="w-full p-2 bg-gray-700 rounded mt-1" />
                </label>
                <label className="text-sm">Knee max
                  <input type="number" value={assign.overrides.poseConfig?.targets?.kneeRange?.[1] ?? ''} onChange={e=>setAssign({...assign, overrides:{...assign.overrides, poseConfig:{...assign.overrides.poseConfig, targets:{...assign.overrides.poseConfig?.targets, kneeRange: [assign.overrides.poseConfig?.targets?.kneeRange?.[0] ?? '', e.target.value === '' ? '' : Number(e.target.value)]}}}})} className="w-full p-2 bg-gray-700 rounded mt-1" />
                </label>
                <label className="text-sm">Max torso lean (deg)
                  <input type="number" value={assign.overrides.poseConfig?.targets?.torsoMaxLean ?? ''} onChange={e=>setAssign({...assign, overrides:{...assign.overrides, poseConfig:{...assign.overrides.poseConfig, targets:{...assign.overrides.poseConfig?.targets, torsoMaxLean: e.target.value === '' ? '' : Number(e.target.value)}}}})} className="w-full p-2 bg-gray-700 rounded mt-1" />
                </label>
                <label className="text-sm">Max arm tilt (deg)
                  <input type="number" value={assign.overrides.poseConfig?.targets?.armMaxTilt ?? ''} onChange={e=>setAssign({...assign, overrides:{...assign.overrides, poseConfig:{...assign.overrides.poseConfig, targets:{...assign.overrides.poseConfig?.targets, armMaxTilt: e.target.value === '' ? '' : Number(e.target.value)}}}})} className="w-full p-2 bg-gray-700 rounded mt-1" />
                </label>
              </div>
            )}
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
