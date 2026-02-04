import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function Templates() {
  const { authFetch } = useAuth();
  const { push } = useToast();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);

  const [editId, setEditId] = useState('');
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
    metadata: { reps: '', holdSeconds: '', vulnerabilityTags: '' }
  });
  

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const tRes = await authFetch('http://localhost:5000/api/templates');
      const tData = await tRes.json();
      if (tData.success) setTemplates(tData.templates || []);
    } catch (e) {
      console.error(e); push('Failed to load templates', 'error');
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
      if (body.metadata.vulnerabilityTags) {
        body.metadata.vulnerabilityTags = body.metadata.vulnerabilityTags.split(',').map(t=>t.trim()).filter(Boolean);
      } else {
        delete body.metadata.vulnerabilityTags;
      }
      const url = editId ? `http://localhost:5000/api/templates/${editId}` : 'http://localhost:5000/api/templates';
      const method = editId ? 'PUT' : 'POST';
      const res = await authFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.success) {
        push(editId ? 'Template updated' : 'Template created', 'success');
        setNewTpl({ ...newTpl, title: '', description: '', metadata: { ...newTpl.metadata, vulnerabilityTags: '' } });
        setEditId('');
        load();
      }
      else push('Failed to save template', 'error');
    } catch (e) { console.error(e); push('Error creating template', 'error'); }
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
                    {t.metadata?.vulnerabilityTags && t.metadata.vulnerabilityTags.length > 0 && (
                      <div className="text-[11px] text-amber-300 mt-1">
                        Vulnerabilities: {Array.isArray(t.metadata.vulnerabilityTags) ? t.metadata.vulnerabilityTags.join(', ') : t.metadata.vulnerabilityTags}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={()=>{
                      const tags = Array.isArray(t.metadata?.vulnerabilityTags) ? t.metadata.vulnerabilityTags.join(', ') : (t.metadata?.vulnerabilityTags || '');
                      setNewTpl({
                        title: t.title || '',
                        description: t.description || '',
                        poseConfig: JSON.parse(JSON.stringify(t.poseConfig || {})),
                        metadata: { reps: t.metadata?.reps ?? '', holdSeconds: t.metadata?.holdSeconds ?? '', vulnerabilityTags: tags }
                      });
                      setEditId(t._id);
                    }} className="px-2 py-1 bg-gray-700 rounded text-sm">Edit</button>
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
          <label className="text-sm block mb-2">Vulnerability tags (comma-separated)
            <input value={newTpl.metadata?.vulnerabilityTags || ''} onChange={e=>setNewTpl({...newTpl, metadata:{...newTpl.metadata, vulnerabilityTags: e.target.value}})} className="w-full p-2 bg-gray-700 rounded mt-1" placeholder="e.g., knee, balance, fall-risk" />
          </label>
          <div className="flex gap-2 mt-2">
            <button onClick={createTemplate} className="bg-indigo-600 px-3 py-2 rounded">{editId ? 'Update Template' : 'Save Template'}</button>
            {editId && <button onClick={()=>{ setEditId(''); setNewTpl({ ...newTpl, title:'', description:'', metadata:{...newTpl.metadata, vulnerabilityTags:''}, poseConfig:{ joints:'arm', upAngle:'', downAngle:'', smoothing:0.2, minRepTimeMs:400, targets:{} } }); }} className="bg-gray-700 px-3 py-2 rounded">Cancel</button>}
          </div>
        </section>

        {/* Assignment UI moved to Exercises page */}
      </div>
    </main>
  );
}
