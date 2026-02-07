import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Link, useNavigate, useLocation } from 'react-router-dom';

export default function Exercises() {
  const { user, authFetch } = useAuth();
  const { push } = useToast();
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(false);
  const [patients, setPatients] = useState([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [assign, setAssign] = useState({ templateId: '', assignedTo: new Set(), overrides: { title: '', description: '', poseConfig: {}, metadata: {} }, dueAt: '', dailyReminder: false, scheduleType: 'scheduled' });
  const [autoAlloc, setAutoAlloc] = useState({ patientId: '', status: '', vulnerabilities: '', allowDuplicates: false, scheduleType: 'scheduled', dueAt: '' });
  const [lastMatches, setLastMatches] = useState([]);
  const [now, setNow] = useState(() => new Date());
  const userId = user?.id || user?._id;
  
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [selectedExerciseIds, setSelectedExerciseIds] = useState(new Set());
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchExercises = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('http://localhost:5000/api/exercises');
      const data = await res.json();
      if (data.success) setExercises(data.exercises || []);
      else setExercises([]);
    } catch (err) {
      console.error('Failed to fetch exercises', err);
      push('Failed to load exercises', 'error');
    }
    setLoading(false);
  }, [authFetch, push]);

  const fetchPatients = useCallback(async () => {
    setPatientsLoading(true);
    try {
      const res = await authFetch('http://localhost:5000/api/patients');
      const data = await res.json();
      if (data.success) setPatients(data.patients || []);
    } catch (err) {
      console.error('Failed to load patients', err);
      push('Failed to load patients', 'error');
    }
    setPatientsLoading(false);
  }, [authFetch, push]);

  const fetchTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const res = await authFetch('http://localhost:5000/api/templates');
      const data = await res.json();
      if (data.success) setTemplates(data.templates || []);
    } catch (err) {
      console.error('Failed to load templates', err);
      push('Failed to load templates', 'error');
    }
    setTemplatesLoading(false);
  }, [authFetch, push]);


  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    fetchExercises();
  }, [location.key, fetchExercises]);

  useEffect(() => {
    try {
      const qp = new URLSearchParams(location.search);
      const pid = qp.get('patientId');
      if (pid) setSelectedPatientId(pid);
    } catch (e) { }
  }, [location.search]);

  useEffect(() => {
    if (user?.role === 'therapist') {
      fetchPatients();
      fetchTemplates();
    }
  }, [user?.role, fetchPatients, fetchTemplates]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const startOfToday = useMemo(() => {
    const d = new Date(now);
    d.setHours(0,0,0,0);
    return d;
  }, [now]);

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

  const instantiate = async () => {
    if (!assign.templateId) return push('Pick a template', 'error');
    const isScheduled = assign.scheduleType === 'scheduled';
    if (isScheduled && !assign.dueAt) return push('Pick a schedule date', 'error');
    if (isScheduled) {
      const d = new Date(assign.dueAt);
      const today = new Date(); today.setHours(0,0,0,0);
      if (d < today) return push('Cannot schedule on a past date', 'error');
    }
    try {
      const cleanedOverrides = { ...assign.overrides };
      if (cleanedOverrides.poseConfig) cleanedOverrides.poseConfig = sanitizePoseConfig(cleanedOverrides.poseConfig);
      if (cleanedOverrides.metadata && typeof cleanedOverrides.metadata.vulnerabilityTags === 'string') {
        cleanedOverrides.metadata.vulnerabilityTags = cleanedOverrides.metadata.vulnerabilityTags.split(',').map(s=>s.trim()).filter(Boolean);
      }
      const body = { assignedTo: Array.from(assign.assignedTo), overrides: cleanedOverrides };
      if (isScheduled && assign.dueAt) body.dueAt = assign.dueAt;
      if (assign.dailyReminder) body.dailyReminder = assign.dailyReminder;
      const res = await authFetch(`http://localhost:5000/api/templates/${assign.templateId}/instantiate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.success) {
        push('Assignment created', 'success');
        setAssign({ templateId: '', assignedTo: new Set(), overrides: { title: '', description: '', poseConfig: {}, metadata: {} }, dueAt: '', dailyReminder: false, scheduleType: assign.scheduleType });
        fetchExercises();
      } else {
        console.error('Instantiate error', data);
        const msg = data.error || data.message || JSON.stringify(data);
        push(`Failed to create from template: ${msg}`, 'error');
      }
    } catch (e) { console.error(e); push('Error creating from template', 'error'); }
  };

  const formatAutoAllocReason = (reason) => {
    if (!reason) return 'No matches';
    const map = {
      already_assigned: 'All matching templates are already assigned.',
      no_matches: 'No templates matched those tags.',
      no_vulnerabilities: 'Patient has no vulnerability tags.',
      no_templates: 'No templates available.'
    };
    return map[reason] || reason;
  };

  const runAutoAllocate = async () => {
    if (!autoAlloc.patientId) return push('Pick a patient to auto-allocate', 'error');
    setAutoAlloc((s)=>({ ...s, status:'Running...' }));
    try {
      const isScheduled = autoAlloc.scheduleType === 'scheduled';
      if (isScheduled && !autoAlloc.dueAt) {
        setAutoAlloc((s)=>({ ...s, status: 'Pick a due date' }));
        return push('Pick a due date for scheduled auto-allocate', 'error');
      }
      if (isScheduled && autoAlloc.dueAt) {
        const d = new Date(autoAlloc.dueAt);
        const today = new Date(); today.setHours(0,0,0,0);
        if (d < today) {
          setAutoAlloc((s)=>({ ...s, status: 'Cannot schedule in the past' }));
          return push('Cannot schedule on a past date', 'error');
        }
      }
      const hasTags = autoAlloc.vulnerabilities && String(autoAlloc.vulnerabilities).trim().length > 0;
      const allowDuplicates = !!autoAlloc.allowDuplicates;
      const payloadSchedule = isScheduled && autoAlloc.dueAt ? { dueAt: autoAlloc.dueAt } : {};
      let res;
      if (hasTags) {
        const vulnerabilities = autoAlloc.vulnerabilities.split(',').map(s=>s.trim()).filter(Boolean);
        res = await authFetch(`http://localhost:5000/api/templates/auto-allocate`, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ patientId: autoAlloc.patientId, vulnerabilities, allowDuplicates, ...payloadSchedule })
        });
      } else {
        res = await authFetch(`http://localhost:5000/api/templates/auto-allocate/for-patient/${autoAlloc.patientId}`, {
          method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ allowDuplicates, ...payloadSchedule })
        });
      }
      const data = await res.json();
      if (data.success && (data.count || 0) > 0) {
        push(`Auto-allocated ${data.count || 0} exercise(s)`, 'success');
        setAutoAlloc((s)=>({ ...s, status:`Created ${data.count || 0} exercise(s)` }));
        setLastMatches(data.matches || []);
        fetchExercises();
      } else if (data.success) {
        const msg = formatAutoAllocReason(data.reason);
        push(`No exercises auto-allocated: ${msg}`, 'info');
        setAutoAlloc((s)=>({ ...s, status:`No matches: ${msg}` }));
        setLastMatches([]);
      } else {
        const msg = formatAutoAllocReason(data.error || data.reason);
        push(`Auto-allocate failed: ${msg}`, 'error');
        setAutoAlloc((s)=>({ ...s, status:`Error: ${msg}` }));
        setLastMatches([]);
      }
    } catch (e) {
      console.error(e);
      push('Auto-allocate failed', 'error');
      setAutoAlloc((s)=>({ ...s, status:'Error' }));
    }
  };

  const isAssignedToPatient = (exercise, patientId) =>
    (exercise.assignedTo || []).some((uid) => {
      if (uid && typeof uid === 'object' && uid._id) return String(uid._id) === patientId;
      return String(uid) === patientId;
    });

  const filteredExercises = exercises.filter((ex) => (ex.metadata?.assignmentType || 'exercise') !== 'game');

  const completionStatus = useCallback((item) => {
    if (!userId) return null;
    const entry = (item?.completions || []).find((c) => String(c.userId) === String(userId));
    if (!entry) return null;
    const completedAt = entry.completedAt ? new Date(entry.completedAt) : null;
    if (!completedAt || Number.isNaN(completedAt.getTime())) return null;
    const completedToday = completedAt >= startOfToday;
    return { completedAt, completedToday };
  }, [userId, startOfToday]);

  const patientExercises = selectedPatientId
    ? filteredExercises.filter((ex) => isAssignedToPatient(ex, selectedPatientId))
    : [];

  const visiblePatientExercises = useMemo(() => {
    return filteredExercises.filter((ex) => {
      if (!ex?.dueAt) return true;
      const status = completionStatus(ex);
      if (!status) return true;
      return status.completedAt >= startOfToday;
    });
  }, [filteredExercises, startOfToday, completionStatus]);

  const splitPatientExercises = useMemo(() => {
    const ready = [];
    const scheduled = [];
    visiblePatientExercises.forEach((ex) => {
      const dueMs = ex?.dueAt ? new Date(ex.dueAt).getTime() : NaN;
      if (Number.isFinite(dueMs)) {
        const completed = completionStatus(ex);
        if (!completed?.completedToday) scheduled.push(ex);
      } else {
        ready.push(ex);
      }
    });
    scheduled.sort((a, b) => {
      const aMs = a?.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      const bMs = b?.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      const aOverdue = Number.isFinite(aMs) && aMs < startOfToday.getTime();
      const bOverdue = Number.isFinite(bMs) && bMs < startOfToday.getTime();
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
      return aMs - bMs;
    });
    return { readyExercises: ready, scheduledExercises: scheduled };
  }, [visiblePatientExercises, startOfToday, completionStatus]);

  const patientReadyExercises = splitPatientExercises.readyExercises;
  const patientScheduledExercises = splitPatientExercises.scheduledExercises;

  const toggleSelection = (exerciseId) => {
    setSelectedExerciseIds((prev) => {
      const next = new Set(prev);
      if (next.has(exerciseId)) next.delete(exerciseId);
      else next.add(exerciseId);
      return next;
    });
  };

  const resetSelection = () => setSelectedExerciseIds(new Set());

  useEffect(() => {
    resetSelection();
  }, [selectedPatientId]);

  const handleDelete = async () => {
    if (!selectedPatientId || selectedExerciseIds.size === 0) return;
    setDeleteLoading(true);
    try {
      const res = await authFetch(`http://localhost:5000/api/exercises/patient/${selectedPatientId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exerciseIds: Array.from(selectedExerciseIds) })
      });
      const data = await res.json();
      if (data.success) {
        const removedCount = (data.removedAssignments || 0) + (data.deletedExercises || 0);
        push(`Removed ${removedCount} exercise${removedCount === 1 ? '' : 's'} for patient`, 'success');
        await fetchExercises();
        resetSelection();
      } else {
        push(data.error || 'Failed to delete exercises', 'error');
      }
    } catch (err) {
      console.error('Failed to delete exercises', err);
      push('Failed to delete exercises', 'error');
    }
    setDeleteLoading(false);
                <div className="mt-4 p-3 bg-gray-900 rounded border border-gray-700">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-lg font-semibold">Patient Schedule</div>
                    <div>
                      <button onClick={()=>{ setShowAddActivity(s=>!s); setScheduleForm({ ...scheduleForm, templateId: '', title:'', description:'', dueAt:'', dailyReminder:false }); }} className="px-3 py-1 bg-indigo-600 rounded text-white">{showAddActivity ? 'Close' : 'Add activity'}</button>
                    </div>
                  </div>
                  <div className="text-sm text-gray-400 mb-2">Assigned activities for {patientName(selectedPatientId)} (practice and scheduled, sorted by date)</div>
                  <ul className="space-y-2 mb-3">
                    {patientExercises.slice().sort((a,b)=> new Date(a.dueAt||0) - new Date(b.dueAt||0)).map((ex)=> (
                      <li key={ex._id} className="p-2 bg-gray-800 rounded">
                        <div className="font-medium">{ex.title} {ex.dailyReminder ? <span className="text-xs text-gray-300 ml-2">(daily)</span> : null}</div>
                        <div className="text-xs text-gray-400">{ex.description}</div>
                        <div className="text-xs text-gray-500">
                          {ex.dueAt ? `Scheduled: ${new Date(ex.dueAt).toLocaleString()}` : 'Practice (no date)'}
                        </div>
                      </li>
                    ))}
                    {patientExercises.length === 0 && <li className="text-gray-400">No activities assigned.</li>}
                  </ul>
                  {showAddActivity && (
                    <div className="p-3 bg-gray-800 rounded">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <label className="text-sm">Mode
                          <select value={scheduleForm.mode} onChange={e=>setScheduleForm({...scheduleForm, mode:e.target.value})} className="w-full p-2 bg-gray-700 rounded mt-1">
                            <option value="template">From template</option>
                            <option value="custom">Custom</option>
                          </select>
                        </label>
                        <label className="text-sm">Timing
                          <select
                            value={scheduleForm.scheduleType}
                            onChange={e=>setScheduleForm({ ...scheduleForm, scheduleType: e.target.value, dueAt: e.target.value === 'practice' ? '' : scheduleForm.dueAt })}
                            className="w-full p-2 bg-gray-700 rounded mt-1"
                          >
                            <option value="practice">Practice</option>
                            <option value="scheduled">Scheduled</option>
                          </select>
                        </label>
                      </div>
                      {scheduleForm.scheduleType === 'scheduled' && (
                        <label className="text-sm mt-2">Due date
                          <input type="date" min={new Date().toISOString().slice(0,10)} value={scheduleForm.dueAt||''} onChange={e=>setScheduleForm({...scheduleForm, dueAt:e.target.value})} className="w-full p-2 bg-gray-700 rounded mt-1" />
                        </label>
                      )}
                      {scheduleForm.mode === 'template' ? (
                        <div className="mt-2">
                          <label className="text-sm">Template
                            <select value={scheduleForm.templateId} onChange={e=>setScheduleForm({...scheduleForm, templateId: e.target.value})} className="w-full p-2 bg-gray-700 rounded mt-1">
                              <option value="">Select template</option>
                              {templates.map(t=> <option key={t._id} value={t._id}>{t.title}</option>)}
                            </select>
                          </label>
                          <label className="text-sm mt-2">Override title (optional)
                            <input value={scheduleForm.title} onChange={e=>setScheduleForm({...scheduleForm, title: e.target.value})} className="w-full p-2 bg-gray-700 rounded mt-1" />
                          </label>
                          <label className="text-sm mt-2">Override description (optional)
                            <input value={scheduleForm.description} onChange={e=>setScheduleForm({...scheduleForm, description: e.target.value})} className="w-full p-2 bg-gray-700 rounded mt-1" />
                          </label>
                          <div className="flex items-center gap-2 mt-2">
                            <label className="flex items-center gap-2"><input type="checkbox" checked={!!scheduleForm.dailyReminder} onChange={e=>setScheduleForm({...scheduleForm, dailyReminder: e.target.checked})} /> Daily reminder</label>
                          </div>
                          <div className="mt-3 flex gap-2">
                            <button onClick={createActivityForPatientFromTemplate} className="bg-indigo-600 px-3 py-2 rounded text-white">Create from template</button>
                            <button onClick={()=>setShowAddActivity(false)} className="bg-gray-700 px-3 py-2 rounded">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2">
                          <label className="text-sm">Title
                            <input value={scheduleForm.title} onChange={e=>setScheduleForm({...scheduleForm, title: e.target.value})} className="w-full p-2 bg-gray-700 rounded mt-1" />
                          </label>
                          <label className="text-sm mt-2">Description
                            <input value={scheduleForm.description} onChange={e=>setScheduleForm({...scheduleForm, description: e.target.value})} className="w-full p-2 bg-gray-700 rounded mt-1" />
                          </label>
                          <label className="text-sm mt-2">Type
                            <select value={scheduleForm.assignmentType} onChange={e=>setScheduleForm({...scheduleForm, assignmentType: e.target.value})} className="w-full p-2 bg-gray-700 rounded mt-1"><option value="exercise">Exercise</option><option value="game">Game</option></select>
                          </label>
                          <div className="flex items-center gap-2 mt-2">
                            <label className="flex items-center gap-2"><input type="checkbox" checked={!!scheduleForm.dailyReminder} onChange={e=>setScheduleForm({...scheduleForm, dailyReminder: e.target.checked})} /> Daily reminder</label>
                          </div>
                          <div className="mt-3 flex gap-2">
                            <button onClick={createCustomActivityForPatient} className="bg-indigo-600 px-3 py-2 rounded text-white">Create custom activity</button>
                            <button onClick={()=>setShowAddActivity(false)} className="bg-gray-700 px-3 py-2 rounded">Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
  };

  const patientName = (id) => patients.find((p) => p._id === id)?.name || 'selected patient';

  const formatAssignees = (assignedTo = []) => {
    if (!assignedTo.length) return 'Unassigned';
    const names = assignedTo.map((uid) => {
      const id = uid && typeof uid === 'object' && uid._id ? String(uid._id) : String(uid);
      return patients.find((p) => p._id === id)?.name || 'Unknown';
    });
    return names.join(', ');
  };

  const [showAddActivity, setShowAddActivity] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({ mode: 'template', templateId: '', title: '', description: '', dueAt: '', dailyReminder: false, assignmentType: 'exercise', scheduleType: 'scheduled' });

  const createActivityForPatientFromTemplate = async () => {
    if (!selectedPatientId) return push('Select a patient', 'error');
    if (!scheduleForm.templateId) return push('Select a template', 'error');
    const isScheduled = scheduleForm.scheduleType === 'scheduled';
    if (isScheduled && !scheduleForm.dueAt) return push('Pick a due date', 'error');
    if (isScheduled) {
      const d = new Date(scheduleForm.dueAt);
      const today = new Date(); today.setHours(0,0,0,0);
      if (d < today) return push('Cannot schedule on a past date', 'error');
    }
    try {
      const body = { assignedTo: [selectedPatientId], overrides: { title: scheduleForm.title || undefined, description: scheduleForm.description || undefined }, dailyReminder: !!scheduleForm.dailyReminder };
      if (isScheduled && scheduleForm.dueAt) body.dueAt = scheduleForm.dueAt;
      const res = await authFetch(`http://localhost:5000/api/templates/${scheduleForm.templateId}/instantiate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.success) {
        push(`${isScheduled ? 'Scheduled' : 'Practice'} activity created`, 'success');
        setShowAddActivity(false);
        fetchExercises();
      } else {
        push(data.error || 'Failed to create scheduled activity', 'error');
      }
    } catch (e) { console.error(e); push('Failed to create scheduled activity', 'error'); }
  };

  const createCustomActivityForPatient = async () => {
    if (!selectedPatientId) return push('Select a patient', 'error');
    if (!scheduleForm.title || scheduleForm.title.length < 3) return push('Provide a title', 'error');
    const isScheduled = scheduleForm.scheduleType === 'scheduled';
    if (isScheduled && !scheduleForm.dueAt) return push('Pick a due date', 'error');
    if (isScheduled) {
      const d = new Date(scheduleForm.dueAt);
      const today = new Date(); today.setHours(0,0,0,0);
      if (d < today) return push('Cannot schedule on a past date', 'error');
    }
    try {
      const body = { title: scheduleForm.title, description: scheduleForm.description, assignedTo: [selectedPatientId], dailyReminder: !!scheduleForm.dailyReminder, metadata: { assignmentType: scheduleForm.assignmentType } };
      if (isScheduled && scheduleForm.dueAt) body.dueAt = scheduleForm.dueAt;
      const res = await authFetch('http://localhost:5000/api/exercises', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.success) {
        push(`${isScheduled ? 'Scheduled' : 'Practice'} custom activity created`, 'success');
        setShowAddActivity(false);
        fetchExercises();
      } else {
        push(data.error || 'Failed to create activity', 'error');
      }
    } catch (e) { console.error(e); push('Failed to create activity', 'error'); }
  };

  
  const canStartExercise = (ex) => {
    const dueMs = ex?.dueAt ? new Date(ex.dueAt).getTime() : NaN;
    if (Number.isFinite(dueMs) && dueMs > now.getTime()) return false;
    if (ex?.dueAt) {
      const completed = completionStatus(ex);
      if (completed?.completedToday) return false;
    }
    return true;
  };

  const countdownFor = (dueAt) => {
    if (!dueAt) return '';
    const dueMs = new Date(dueAt).getTime();
    if (!Number.isFinite(dueMs)) return '';
    const diff = dueMs - now.getTime();
    if (diff <= 0) return 'Ready now';
    const totalSeconds = Math.floor(diff / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (days > 0) return `${days}d ${hours}h`;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const startExercise = (ex) => {
    if (!canStartExercise(ex)) {
      push(`This exercise unlocks on ${ex.dueAt ? new Date(ex.dueAt).toLocaleString() : 'its scheduled date'}`, 'info');
      return;
    }
    navigate('/exercises/run', { state: { exercise: ex } });
  };

  
  if (user?.role === 'therapist') {
    return (
      <main role="main" className="min-h-screen p-8 bg-gray-900 text-gray-100">
        <div className="max-w-3xl mx-auto bg-gray-800 p-6 rounded shadow">
          <h1 className="text-2xl font-bold mb-2">Assignments</h1>
          <p className="text-gray-300 mb-4">Assign exercises or cognitive games from templates to patients with schedules and reminders.</p>

          <section className="mb-6 p-4 bg-gray-900 rounded border border-gray-700">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
              <div>
                <div className="text-lg font-semibold">Assign from template</div>
                <p className="text-sm text-gray-400">Pick a template, choose patients, and set it as practice or scheduled (with optional reminders).</p>
              </div>
              <Link to="/templates" className="bg-gray-700 text-white px-3 py-2 rounded">Manage templates</Link>
            </div>
            <label className="text-sm">
              Template
              <select
                value={assign.templateId}
                onChange={(e)=>{
                  const tid = e.target.value;
                  if (!tid) { setAssign({...assign, templateId: ''}); return; }
                  const tpl = templates.find(x => String(x._id) === String(tid));
                  if (!tpl) { setAssign({...assign, templateId: tid}); return; }
                  const copyPose = tpl.poseConfig ? JSON.parse(JSON.stringify(tpl.poseConfig)) : {};
                  setAssign({...assign, templateId: tid, overrides: { ...assign.overrides, title: tpl.title || '', poseConfig: copyPose }});
                }}
                className="w-full p-2 bg-gray-700 rounded mt-1"
              >
                <option value="">{templatesLoading ? 'Loading...' : 'Select template'}</option>
                {templates.map(t => <option key={t._id} value={t._id}>{t.title}</option>)}
              </select>
            </label>
            <div className="mt-2 text-xs text-gray-400">
              <div className="font-semibold text-sm text-gray-200 mb-1">Templates preview</div>
              {templates.length === 0 ? <div>No templates loaded.</div> : (
                <ul className="space-y-1 max-h-28 overflow-auto">
                  {templates.map(t => (
                    <li key={t._id} className="text-sm bg-gray-800 p-1 rounded">
                      <div className="font-medium">{t.title}</div>
                      <div className="text-xs text-gray-400">{t.metadata?.vulnerabilityTags && t.metadata.vulnerabilityTags.length ? `Tags: ${Array.isArray(t.metadata.vulnerabilityTags) ? t.metadata.vulnerabilityTags.join(', ') : t.metadata.vulnerabilityTags}` : 'No tags'}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <label className="text-sm">
                Assignment title (optional)
                <input value={assign.overrides.title} onChange={(e)=>setAssign({...assign, overrides:{...assign.overrides, title:e.target.value}})} className="w-full p-2 bg-gray-700 rounded mt-1" />
              </label>
              <label className="text-sm">
                Description (optional)
                <input value={assign.overrides.description} onChange={(e)=>setAssign({...assign, overrides:{...assign.overrides, description:e.target.value}})} className="w-full p-2 bg-gray-700 rounded mt-1" />
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <label className="text-sm">
                Joint override
                <select value={assign.overrides.poseConfig?.joints || ''} onChange={(e)=>setAssign({...assign, overrides:{...assign.overrides, poseConfig:{...assign.overrides.poseConfig, joints:e.target.value}}})} className="w-full p-2 bg-gray-700 rounded mt-1">
                  <option value="">(keep)</option>
                  <option value="arm">Arm</option>
                  <option value="knee">Knee</option>
                  <option value="shoulder">Shoulder</option>
                </select>
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
              <label className="text-sm">
                Up angle
                <input type="number" value={assign.overrides.poseConfig?.upAngle ?? ''} onChange={(e)=>setAssign({...assign, overrides:{...assign.overrides, poseConfig:{...assign.overrides.poseConfig, upAngle: e.target.value === '' ? '' : Number(e.target.value)}}})} className="w-full p-2 bg-gray-700 rounded mt-1" />
              </label>
              <label className="text-sm">
                Down angle
                <input type="number" value={assign.overrides.poseConfig?.downAngle ?? ''} onChange={(e)=>setAssign({...assign, overrides:{...assign.overrides, poseConfig:{...assign.overrides.poseConfig, downAngle: e.target.value === '' ? '' : Number(e.target.value)}}})} className="w-full p-2 bg-gray-700 rounded mt-1" />
              </label>
              <label className="text-sm">
                Smoothing
                <input type="number" step="0.01" value={assign.overrides.poseConfig?.smoothing ?? ''} onChange={(e)=>setAssign({...assign, overrides:{...assign.overrides, poseConfig:{...assign.overrides.poseConfig, smoothing: e.target.value === '' ? '' : Number(e.target.value)}}})} className="w-full p-2 bg-gray-700 rounded mt-1" />
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
              <label className="text-sm">
                Min rep time (ms)
                <input type="number" value={assign.overrides.poseConfig?.minRepTimeMs ?? ''} onChange={(e)=>setAssign({...assign, overrides:{...assign.overrides, poseConfig:{...assign.overrides.poseConfig, minRepTimeMs: e.target.value === '' ? '' : Number(e.target.value)}}})} className="w-full p-2 bg-gray-700 rounded mt-1" />
              </label>
              <label className="text-sm">
                Knee range min
                <input type="number" value={assign.overrides.poseConfig?.targets?.kneeRange?.[0] ?? ''} onChange={(e)=>{
                  const targets = { ...(assign.overrides.poseConfig?.targets || {}) };
                  const cur = Array.isArray(targets.kneeRange) ? [...targets.kneeRange] : [null, null];
                  cur[0] = e.target.value === '' ? '' : Number(e.target.value);
                  targets.kneeRange = cur;
                  setAssign({...assign, overrides:{...assign.overrides, poseConfig:{...assign.overrides.poseConfig, targets}}});
                }} className="w-full p-2 bg-gray-700 rounded mt-1" />
              </label>
              <label className="text-sm">
                Knee range max
                <input type="number" value={assign.overrides.poseConfig?.targets?.kneeRange?.[1] ?? ''} onChange={(e)=>{
                  const targets = { ...(assign.overrides.poseConfig?.targets || {}) };
                  const cur = Array.isArray(targets.kneeRange) ? [...targets.kneeRange] : [null, null];
                  cur[1] = e.target.value === '' ? '' : Number(e.target.value);
                  targets.kneeRange = cur;
                  setAssign({...assign, overrides:{...assign.overrides, poseConfig:{...assign.overrides.poseConfig, targets}}});
                }} className="w-full p-2 bg-gray-700 rounded mt-1" />
              </label>
            </div>
            <div className="mt-3">
              <label className="text-sm">
                Vulnerability tags (comma separated)
                <input value={assign.overrides.metadata?.vulnerabilityTags || ''} onChange={(e)=>setAssign({...assign, overrides:{...assign.overrides, metadata:{...(assign.overrides.metadata||{}), vulnerabilityTags: e.target.value}}})} className="w-full p-2 bg-gray-700 rounded mt-1" />
              </label>
            </div>
            <div className="mt-3">
              <div className="text-sm text-gray-300 mb-1">Timing</div>
              <div className="flex items-center gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="assign-timing"
                    value="practice"
                    checked={assign.scheduleType === 'practice'}
                    onChange={() => setAssign({ ...assign, scheduleType: 'practice', dueAt: '' })}
                  />
                  Practice
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="assign-timing"
                    value="scheduled"
                    checked={assign.scheduleType === 'scheduled'}
                    onChange={() => setAssign({ ...assign, scheduleType: 'scheduled' })}
                  />
                  Scheduled
                </label>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-3">
              {assign.scheduleType === 'scheduled' && (
                <label className="text-sm flex items-center gap-2">
                  Due date
                  <input type="date" min={new Date().toISOString().slice(0,10)} value={assign.dueAt || ''} onChange={(e)=>setAssign({...assign, dueAt: e.target.value})} className="p-2 bg-gray-700 rounded" />
                </label>
              )}
              <label className="text-sm flex items-center gap-2">
                <input type="checkbox" checked={!!assign.dailyReminder} onChange={(e)=>setAssign({...assign, dailyReminder: e.target.checked})} /> Daily reminder
              </label>
            </div>
            <div className="mt-3">
              <div className="text-sm text-gray-300 mb-1">Assign to patients</div>
              <div className="max-h-32 overflow-auto bg-gray-800 p-2 rounded">
                {patients.map(p => (
                  <label key={p._id} className="flex items-center gap-2 p-1 text-sm">
                    <input type="checkbox" checked={assign.assignedTo.has(p._id)} onChange={e=>{
                      const s = new Set(assign.assignedTo);
                      if (e.target.checked) s.add(p._id); else s.delete(p._id);
                      setAssign({ ...assign, assignedTo: s });
                    }} />
                    <span>{p.name} ({p.email || 'no email'})</span>
                  </label>
                ))}
                {patients.length === 0 && <div className="text-xs text-gray-400">No patients yet.</div>}
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={instantiate} className="bg-indigo-600 text-white px-4 py-2 rounded">Create Assignment</button>
              <button onClick={fetchExercises} className="bg-gray-700 text-white px-3 py-2 rounded">Refresh</button>
            </div>
            <div className="mt-4 p-3 bg-gray-900 rounded">
              <div className="text-sm font-semibold mb-2">Auto-allocate based on vulnerabilities</div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <input placeholder="Optional tags (comma separated)" value={autoAlloc.vulnerabilities || ''} onChange={e=>setAutoAlloc({...autoAlloc, vulnerabilities: e.target.value})} className="bg-gray-700 p-2 rounded text-sm mr-2" />
                <select value={autoAlloc.patientId} onChange={e=>setAutoAlloc({...autoAlloc, patientId: e.target.value})} className="bg-gray-700 p-2 rounded text-sm">
                  <option value="">Select patient</option>
                  {patients.map(p=> <option key={p._id} value={p._id}>{p.name}</option>)}
                </select>
                <select value={autoAlloc.scheduleType} onChange={e=>setAutoAlloc({ ...autoAlloc, scheduleType: e.target.value, dueAt: e.target.value === 'practice' ? '' : autoAlloc.dueAt })} className="bg-gray-700 p-2 rounded text-sm">
                  <option value="practice">Practice</option>
                  <option value="scheduled">Scheduled</option>
                </select>
                {autoAlloc.scheduleType === 'scheduled' && (
                  <input type="date" min={new Date().toISOString().slice(0,10)} value={autoAlloc.dueAt || ''} onChange={e=>setAutoAlloc({ ...autoAlloc, dueAt: e.target.value })} className="bg-gray-700 p-2 rounded text-sm" />
                )}
                <button onClick={runAutoAllocate} className="bg-indigo-600 px-3 py-2 rounded text-sm">Auto-allocate</button>
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                <input type="checkbox" checked={!!autoAlloc.allowDuplicates} onChange={e=>setAutoAlloc({ ...autoAlloc, allowDuplicates: e.target.checked })} />
                Allow repeat templates
              </label>
              {autoAlloc.status && <div className="text-xs text-gray-300">{autoAlloc.status}</div>}
              <div className="text-[11px] text-gray-400">Choose Practice for immediate access or Scheduled to lock until the due date. Uses patient vulnerability tags and template vulnerability tags to assign up to 3 best matches.</div>
              {lastMatches && lastMatches.length > 0 && (
                <div className="mt-3 p-2 bg-gray-800 rounded">
                  <div className="font-semibold text-sm mb-1">Last auto-allocate matches</div>
                  <ul className="space-y-1 text-sm">
                    {lastMatches.map((m) => (
                      <li key={m.templateId} className="p-2 bg-gray-900 rounded">
                        <div className="font-medium">{m.title}</div>
                        <div className="text-xs text-gray-400">Score: {m.matchScore}</div>
                        <div className="text-xs text-gray-400">Matched tags: {(m.matchedVulnerabilities || []).join(', ') || '—'}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>

          <div className="mb-6 p-4 bg-gray-900 rounded border border-gray-700">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">Delete exercises for a patient</div>
                <p className="text-sm text-gray-400">Select a patient to see their assigned exercises and choose which ones to remove.</p>
              </div>
              <label className="text-sm">
                <span className="text-gray-300 mr-2">Patient</span>
                <select
                  value={selectedPatientId}
                  onChange={(e) => setSelectedPatientId(e.target.value)}
                  className="bg-gray-700 text-white px-3 py-2 rounded"
                  disabled={patientsLoading}
                >
                  <option value="">{patientsLoading ? 'Loading patients...' : 'Select patient'}</option>
                  {patients.map((p) => (
                    <option key={p._id} value={p._id}>{p.name}</option>
                  ))}
                </select>
              </label>
            </div>
            {selectedPatientId && (
              <div className="mt-4">
                {loading ? <p>Loading exercises...</p> : patientExercises.length === 0 ? (
                  <p className="text-gray-400 text-sm">No exercises assigned to {patientName(selectedPatientId)}.</p>
                ) : (
                  <ul className="space-y-2">
                    {patientExercises.map((ex) => (
                      <li key={ex._id} className="p-3 bg-gray-800 rounded flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium">{ex.title}</div>
                          <div className="text-xs text-gray-400">{ex.description}</div>
                          <div className="text-xs text-gray-500 mt-1">Assigned to: {formatAssignees(ex.assignedTo)}</div>
                        </div>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={selectedExerciseIds.has(ex._id)}
                            onChange={() => toggleSelection(ex._id)}
                          />
                          <span>Delete</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={handleDelete}
                    disabled={selectedExerciseIds.size === 0 || deleteLoading}
                    className={`px-4 py-2 rounded ${selectedExerciseIds.size === 0 || deleteLoading ? 'bg-gray-700 text-gray-400' : 'bg-red-600 text-white'}`}
                  >
                    {deleteLoading ? 'Deleting...' : `Delete selected (${selectedExerciseIds.size})`}
                  </button>
                  <button onClick={resetSelection} className="px-3 py-2 rounded bg-gray-700 text-white">Clear selection</button>
                </div>
              </div>
            )}
          </div>
          <div>
            <h2 className="text-lg font-semibold mb-2">Existing assignments</h2>
            {loading ? <p>Loading...</p> : filteredExercises.length === 0 ? <p className="text-gray-400">No assignments yet.</p> : (
              <ul className="space-y-2">
                {filteredExercises.map((ex) => (
                  <li key={ex._id} className="p-2 bg-gray-900 rounded">
                    <div className="font-medium">{ex.title}</div>
                    <div className="text-xs text-gray-400">{ex.description}</div>
                    <div className="text-xs text-gray-500 mt-1">Assigned to: {formatAssignees(ex.assignedTo)}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>
    );
  }

  
  return (
    <main role="main" className="min-h-screen p-8 bg-gray-900 text-gray-100">
      <div className="max-w-5xl mx-auto">
        <div className="grid lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2 bg-gray-800 p-6 rounded shadow space-y-4">
            <div>
              <h1 className="text-2xl font-bold mb-2">Exercises</h1>
              <p className="text-gray-300 mb-2">Practice exercises assigned to you. New assignments stay under Scheduled until their date.</p>
            </div>
            {loading ? (
              <p className="text-gray-400">Loading...</p>
            ) : patientReadyExercises.length === 0 ? (
              <p className="text-gray-400">No exercises ready right now. Check Scheduled for upcoming ones.</p>
            ) : (
              <ul className="space-y-3">
                {patientReadyExercises.map((ex) => {
                  const dueAt = ex.dueAt ? new Date(ex.dueAt) : null;
                  const isPractice = !ex?.dueAt;
                  const completed = isPractice ? null : completionStatus(ex);
                  return (
                    <li key={ex._id} className="p-3 bg-gray-900 rounded flex items-center justify-between">
                      <div>
                        <div className="font-medium text-white">{ex.title}</div>
                        <div className="text-xs text-gray-400">{ex.description}</div>
                        {dueAt && <div className="text-[11px] text-gray-500 mt-1">Scheduled for {dueAt.toLocaleDateString()} (now available)</div>}
                        {!isPractice && completed?.completedToday && <div className="text-[11px] text-green-300 mt-1">Performed today</div>}
                      </div>
                      <div className="text-sm">
                        <button
                          onClick={() => startExercise(ex)}
                          disabled={!isPractice && !!completed?.completedToday}
                          className={`px-3 py-1 rounded text-white ${!isPractice && completed?.completedToday ? 'bg-gray-700 text-gray-400 cursor-not-allowed' : 'bg-indigo-600'}`}
                        >
                          {!isPractice && completed?.completedToday ? 'Completed' : 'Start'}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <aside className="bg-gray-800 p-6 rounded shadow space-y-3">
            <div>
              <h3 className="text-lg font-semibold">Scheduled</h3>
              <p className="text-sm text-gray-400">Upcoming exercises appear here with a live countdown. Overdue items show in red.</p>
            </div>
            {loading ? (
              <p className="text-gray-400 text-sm">Loading scheduled exercises...</p>
            ) : patientScheduledExercises.length === 0 ? (
              <p className="text-gray-400 text-sm">Nothing scheduled yet.</p>
            ) : (
              <ul className="space-y-3">
                {patientScheduledExercises.map((ex) => {
                  const dueLabel = ex.dueAt ? new Date(ex.dueAt).toLocaleString() : 'Scheduled';
                  const completed = completionStatus(ex);
                  const dueMs = ex?.dueAt ? new Date(ex.dueAt).getTime() : NaN;
                  const overdue = Number.isFinite(dueMs) && dueMs < startOfToday.getTime() && !completed?.completedToday;
                  const countdown = countdownFor(ex.dueAt);
                  const statusText = completed?.completedToday
                    ? 'Performed today'
                    : overdue
                      ? 'Overdue'
                      : countdown === 'Ready now'
                        ? 'Ready now'
                        : `Starts in ${countdown}`;
                  const statusClass = overdue ? 'text-red-400' : 'text-indigo-300';
                  const disabled = !canStartExercise(ex);
                  return (
                    <li key={ex._id} className="p-3 bg-gray-900 rounded border border-gray-700">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold">{ex.title}</div>
                          <div className="text-xs text-gray-400">{ex.description}</div>
                          <div className="text-xs text-gray-400 mt-1">Scheduled for {dueLabel}</div>
                          <div className={`text-[11px] mt-1 ${statusClass}`}>{statusText}</div>
                        </div>
                        <button
                          onClick={() => startExercise(ex)}
                          disabled={disabled}
                          className={`px-3 py-1 rounded text-sm ${disabled ? 'bg-gray-700 text-gray-400 cursor-not-allowed' : 'bg-indigo-600 text-white'}`}
                        >
                          {completed?.completedToday ? 'Completed' : disabled ? 'Locked' : 'Start'}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}
