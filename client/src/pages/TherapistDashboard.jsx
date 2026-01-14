import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import UnreadBadge from "../components/UnreadBadge";
import TrendChart from "../components/TrendChart";

export default function TherapistDashboard() {
  const { user, authFetch, logout, notificationsUnread, messagesUnread } = useAuth();
  const [patients, setPatients] = useState([]);
  const [availablePatients, setAvailablePatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [recentResults, setRecentResults] = useState([]);
  const [loadingResults, setLoadingResults] = useState(false);
  const [schedule, setSchedule] = useState([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedDateExercise, setSelectedDateExercise] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedDateCognitive, setSelectedDateCognitive] = useState(() => new Date().toISOString().slice(0, 10));
  const [therapistLink, setTherapistLink] = useState({ patientId: '', status: '' });
  const [removeLink, setRemoveLink] = useState({ patientId: '', status: '' });
  const navigate = useNavigate();
  const { push } = useToast();

  // Mock data used until API endpoints are added
  useEffect(() => {
    // load patients from API
    const load = async () => {
      try {
        const res = await authFetch("http://localhost:5000/api/patients");
        const data = await res.json();
        if (data.success) {
          setPatients(data.patients || []);
          if (data.patients && data.patients.length) {
            setSelectedPatient(data.patients[0]);
            fetchPatientResults(data.patients[0]._id);
          }
        }
        // also fetch available patients for assignment
        try {
          const r2 = await authFetch('http://localhost:5000/api/patients/available');
          const j2 = await r2.json();
          if (j2.success) setAvailablePatients(j2.patients || []);
        } catch (e) { console.warn('failed to load available patients', e); }
        fetchSchedule();
      } catch (err) {
        console.error("Failed to load patients", err);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Placeholder for fetching real patients via API
  const fetchPatients = async () => {
    try {
      const res = await authFetch("http://localhost:5000/api/patients");
      const data = await res.json();
      if (data.success) {
        setPatients(data.patients || []);
        fetchSchedule();
      }
    } catch (err) {
      console.error("Failed to fetch patients", err);
    }
  };

  const fetchPatientResults = async (patientId) => {
    setLoadingResults(true);
    try {
      const res = await authFetch(`http://localhost:5000/api/results?userId=${patientId}`);
      const data = await res.json();
      if (data.success) setRecentResults(data.results || []);
    } catch (err) {
      console.error("Failed to fetch patient results", err);
    }
    setLoadingResults(false);
  };

  

  // Navigate to Exercises page and preselect patient for assignment
  const assignExercise = (patientId) => {
    if (!patientId) return;
    navigate(`/exercises?patientId=${patientId}`);
  };

  const viewResultsForPatient = async (patientId) => {
    if (!patientId) return;
    try {
      // Prefetch results and recent activities for the selected patient so Results page can render immediately
      console.debug('viewResultsForPatient: fetching patient results and activities', patientId);
      const [resR, resA] = await Promise.all([
        authFetch(`http://localhost:5000/api/results?userId=${patientId}`),
        authFetch(`http://localhost:5000/api/calendar/patient/${patientId}`)
      ]);
      let prefetchedResults = [];
      let prefetchedActivities = [];

      if (resR.ok) {
        try { const resultsJson = await resR.json(); if (resultsJson && resultsJson.success) prefetchedResults = resultsJson.results || []; }
        catch(e){ console.warn('Failed to parse results JSON', e); }
      } else {
        console.warn('results fetch not ok', resR.status);
      }

      // Prefer using already-loaded `recentResults` (fetched when selecting patient) to show recent activity immediately
      if (recentResults && recentResults.length) {
        prefetchedActivities = recentResults.map(r => ({
          id: r._id,
          title: r.title || r.type || 'Result',
          description: r.type || '',
          dueAt: r.createdAt,
          dailyReminder: false,
          assignedTo: selectedPatient ? { name: selectedPatient.name } : undefined
        }));
      } else {
        if (resA.ok) {
          try { const activitiesJson = await resA.json(); if (activitiesJson && activitiesJson.success) prefetchedActivities = activitiesJson.items || []; }
          catch(e){ console.warn('Failed to parse activities JSON', e); }
        } else {
          console.warn('activities fetch not ok', resA.status);
        }
      }

      navigate(`/results?userId=${patientId}`, { state: { prefetchedResults, prefetchedActivities } });
    } catch (e) {
      console.error('prefetch view results failed', e);
      // fallback: navigate without state so Results page will attempt its own fetch
      navigate(`/results?userId=${patientId}`);
    }
  };

  const exportCsvForPatient = async (patientId) => {
    try {
      const url = `http://localhost:5000/api/reports/export.csv?userId=${patientId || ''}`;
      const r = await authFetch(url);
      const blob = await r.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = patientId ? `results-${patientId}.csv` : 'results-export.csv';
      a.click();
      URL.revokeObjectURL(downloadUrl);
    } catch (e) {
      console.error('Export CSV failed', e);
      alert('Failed to export CSV');
    }
  };

  const generatePdfForPatient = (patientId) => {
    // Open the CSV in a new tab; user can print to PDF from browser.
    const url = `http://localhost:5000/api/reports/export.csv?userId=${patientId || ''}`;
    window.open(url, '_blank');
  };

  const assignTherapistToPatient = async () => {
    if (!therapistLink.patientId) {
      setTherapistLink((s)=>({ ...s, status:'Pick a patient first' }));
      return;
    }
    setTherapistLink((s)=>({ ...s, status:'Assigning...' }));
    try {
      const res = await authFetch(`http://localhost:5000/api/patients/${therapistLink.patientId}/assign-therapist`, { method:'POST' });
      const data = await res.json();
      if (data.success) {
      setTherapistLink((s)=>({ ...s, status:'You are assigned as therapist' }));
      fetchPatients();
    } else {
      setTherapistLink((s)=>({ ...s, status: data.message || 'Failed to assign' }));
    }
  } catch (e) {
      console.error('assign therapist', e);
      setTherapistLink((s)=>({ ...s, status:'Error assigning therapist' }));
    }
  };

  const removeTherapistFromPatient = async () => {
    if (!removeLink.patientId) {
      setRemoveLink((s)=>({ ...s, status:'Pick a patient first' }));
      return;
    }
    setRemoveLink((s)=>({ ...s, status:'Removing...' }));
    try {
      const res = await authFetch(`http://localhost:5000/api/patients/${removeLink.patientId}/unassign-therapist`, { method:'POST' });
      const data = await res.json();
      if (data.success) {
        setRemoveLink((s)=>({ ...s, status:'Removed link' }));
        fetchPatients();
      } else {
        setRemoveLink((s)=>({ ...s, status: data.message || 'Failed to remove' }));
      }
    } catch (e) {
      console.error('remove therapist', e);
      setRemoveLink((s)=>({ ...s, status:'Error removing therapist' }));
    }
  };

  const fetchSchedule = async () => {
    setScheduleLoading(true);
    try {
      const res = await authFetch('http://localhost:5000/api/calendar/therapist');
      const data = await res.json();
      if (data.success) {
        const items = (data.items || []).map(it => {
          const when = it.dueAt ? new Date(it.dueAt) : null;
          const hh = when ? String(when.getHours()).padStart(2, '0') : 'Any';
          const mm = when ? String(when.getMinutes()).padStart(2, '0') : 'time';
          const assignees = Array.isArray(it.assignedTo) ? it.assignedTo.map(p => p.name || p.email).join(', ') : '';
          return {
            id: it.id,
            time: when ? `${hh}:${mm}` : 'Anytime',
            title: it.title || 'Activity',
            patient: assignees || 'Patient',
            note: it.dailyReminder ? 'Daily reminder' : 'Scheduled activity',
            when: when ? when.getTime() : Number.MAX_SAFE_INTEGER
          };
        }).sort((a, b) => a.when - b.when);
        setSchedule(items);
      } else {
        setSchedule([]);
      }
    } catch (e) {
      console.error('Failed to fetch schedule', e);
      setSchedule([]);
    }
    setScheduleLoading(false);
  };

  const filteredPatients = useMemo(() => {
    if (!search.trim()) return patients;
    const q = search.toLowerCase();
    return patients.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.email || '').toLowerCase().includes(q)
    );
  }, [patients, search]);

  useEffect(() => {
    // if current selection falls out of filtered list, pick the first filtered patient
    if (filteredPatients.length === 0) {
      setSelectedPatient(null);
      setRecentResults([]);
      return;
    }
    if (!selectedPatient || !filteredPatients.find(p => p._id === selectedPatient._id)) {
      const first = filteredPatients[0];
      setSelectedPatient(first);
      fetchPatientResults(first._id);
    }
  }, [filteredPatients, selectedPatient]);

  // compute daily filtered summaries for selected date
  const exerciseForDate = (date) => recentResults.filter(r => {
    if (!r.createdAt) return false;
    const d = new Date(r.createdAt).toISOString().slice(0, 10);
    return d === date && (r.type === 'exercise' || r.type === 'physical');
  });
  const cognitiveForDate = (date) => recentResults.filter(r => {
    if (!r.createdAt) return false;
    const d = new Date(r.createdAt).toISOString().slice(0, 10);
    return d === date && (r.type === 'game' || r.type === 'cognitive');
  });

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <div className="container mx-auto p-6">
        <div className="grid grid-cols-12 gap-6">
          {/* Sidebar */}
          <aside className="col-span-2 bg-gray-800 rounded-lg p-4 shadow-inner">
            <div className="mb-6 text-center">
              <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-purple-600 to-indigo-500 flex items-center justify-center text-xl font-bold">TR</div>
              <div className="mt-3 text-sm">{user?.name || 'Therapist'}</div>
              <div className="text-xs text-gray-400">Logged in</div>
            </div>
            <nav className="space-y-2 text-sm">
              <button className="w-full text-left px-3 py-2 rounded bg-gradient-to-r from-indigo-700 to-purple-600">Dashboard</button>
              <Link className="block px-3 py-2 rounded hover:bg-gray-700" to="/games">Games</Link>
              <Link className="block px-3 py-2 rounded hover:bg-gray-700" to="/exercises">Exercises</Link>
              <Link className="block px-3 py-2 rounded hover:bg-gray-700" to="/therapist/calendar">Calendar</Link>
              <Link className="block px-3 py-2 rounded hover:bg-gray-700" to="/reports">Patient Reports</Link>
              <Link className="block px-3 py-2 rounded hover:bg-gray-700" to="/therapist/reports">Summary</Link>
              <Link className="flex items-center px-3 py-2 rounded hover:bg-gray-700" to="/therapist/notifications">
                <span>Notify Patients</span>
                <UnreadBadge count={notificationsUnread} />
              </Link>
              <Link className="flex items-center px-3 py-2 rounded hover:bg-gray-700" to="/messages">
                <span>Messages</span>
                <UnreadBadge count={messagesUnread} />
              </Link>
              <div className="mt-4 text-xs text-gray-400 px-2">Patients</div>
              <div className="max-h-48 overflow-auto mt-2">
                {filteredPatients.map((p) => (
                  <div
                    key={p._id}
                    onClick={() => { setSelectedPatient(p); fetchPatientResults(p._id); }}
                    className={`cursor-pointer p-2 rounded mb-2 ${selectedPatient?._id === p._id ? 'bg-gray-700' : 'hover:bg-gray-700'}`}
                  >
                    <div className="text-sm font-medium">{p.name}</div>
                    <div className="text-xs text-gray-400">Age: {p.age}</div>
                  </div>
                ))}
              </div>
              <button className="w-full text-left px-3 py-2 rounded hover:bg-gray-700 mt-3" onClick={() => fetchPatients()}>Refresh</button>
              <button className="w-full text-left px-3 py-2 rounded hover:bg-gray-700 text-red-300 mt-4" onClick={logout}>Logout</button>
            </nav>
          </aside>

          {/* Main area */}
          <main className="col-span-7">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-semibold">Dashboard</h2>
              <div className="flex items-center gap-3">
                <input
                  className="px-3 py-2 rounded bg-gray-800 text-sm"
                  placeholder="Search patients..."
                  value={search}
                  onChange={(e)=>setSearch(e.target.value)}
                />
                <button className="px-3 py-2 bg-indigo-600 rounded text-sm" onClick={()=>navigate('/register')}>
                  New Patient
                </button>
                {/* View Results button removed per request */}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="col-span-1 bg-gradient-to-br from-indigo-700 to-purple-600 rounded-lg p-4 shadow">
                <div className="text-xs text-gray-200">Active Patients</div>
                <div className="text-2xl font-bold mt-2">{patients.length}</div>
              </div>
              <div className="col-span-1 bg-gray-800 rounded-lg p-4 shadow">
                <div className="text-xs text-gray-400">Avg Cognitive Score (30d)</div>
                <div className="text-2xl font-bold mt-2">72%</div>
              </div>
              <div className="col-span-1 bg-gray-800 rounded-lg p-4 shadow">
                <div className="text-xs text-gray-400">Avg Physical Score (30d)</div>
                <div className="text-2xl font-bold mt-2">78%</div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 mb-4">
              <div className="bg-gray-800 rounded-lg p-4 shadow">
                <div className="space-y-6 mb-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm text-gray-200 font-semibold">Cognitive trends</div>
                      <div className="flex items-center gap-3">
                        <label className="text-xs text-gray-300">Date</label>
                        <input type="date" value={selectedDateCognitive} onChange={(e)=>setSelectedDateCognitive(e.target.value)} className="bg-gray-700 text-sm text-gray-100 px-2 py-1 rounded" />
                      </div>
                    </div>
                    <div className="text-xs text-gray-300 mb-2">
                      {(() => {
                        const list = cognitiveForDate(selectedDateCognitive);
                        if (!list.length) return (<div className="text-xs text-gray-400">No cognitive games on {selectedDateCognitive}.</div>);
                        return (<div>Items: {list.length} • Avg: {Math.round((list.reduce((s,r)=>s+(r.score||0),0)/list.length)||0)}</div>);
                      })()}
                    </div>
                    {loadingResults ? (
                      <div className="w-full h-40 flex items-center justify-center">Loading...</div>
                      ) : (
                      <TrendChart label="Cognitive trends" color="#10B981" data={recentResults} types={["game","cognitive"]} limit={60} height={320} yLabel="Score" showHeader={true} />
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm text-gray-200 font-semibold">Exercise trends</div>
                      <div className="flex items-center gap-3">
                        <label className="text-xs text-gray-300">Date</label>
                        <input type="date" value={selectedDateExercise} onChange={(e)=>setSelectedDateExercise(e.target.value)} className="bg-gray-700 text-sm text-gray-100 px-2 py-1 rounded" />
                      </div>
                    </div>
                    <div className="text-xs text-gray-300 mb-2">
                      {(() => {
                        const list = exerciseForDate(selectedDateExercise);
                        if (!list.length) return (<div className="text-xs text-gray-400">No exercises on {selectedDateExercise}.</div>);
                        return (<div>Items: {list.length} • Avg: {Math.round((list.reduce((s,r)=>s+(r.score||0),0)/list.length)||0)}</div>);
                      })()}
                    </div>
                    {loadingResults ? (
                      <div className="w-full h-40 flex items-center justify-center">Loading...</div>
                    ) : (
                      <TrendChart label="Exercise trends" color="#8B5CF6" data={recentResults} types={["exercise","physical"]} limit={60} height={320} yLabel="Score" showHeader={true} />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Recent activity moved to the Results page (use 'View Results') */}
          </main>

          {/* Right column */}
          <aside className="col-span-3">
            <div className="bg-gradient-to-br from-gray-800 to-gray-700 rounded-lg p-4 mb-4 shadow">
              <h4 className="text-sm text-gray-300">Selected patient</h4>
              {selectedPatient ? (
                <div className="mt-3">
                  <div className="text-lg font-bold">{selectedPatient.name}</div>
                  <div className="text-xs text-gray-400">Age: {selectedPatient.age}</div>
                  <div className="text-xs text-gray-400">Last active: {selectedPatient.lastActive}</div>

                  <div className="mt-4 flex gap-2">
                    <button onClick={() => assignExercise(selectedPatient._id)} className="px-3 py-2 bg-indigo-600 rounded">Assign Exercise</button>
                    <button onClick={() => viewResultsForPatient(selectedPatient._id)} className="px-3 py-2 bg-gray-600 rounded">View Results</button>
                    <button onClick={async ()=>{
                      if (!selectedPatient || !selectedPatient._id) return;
                      if (!window.confirm(`Remove ${selectedPatient.name} from your patients? This will unassign the patient.`)) return;
                      try {
                        const res = await authFetch(`http://localhost:5000/api/patients/${selectedPatient._id}/unassign-therapist`, { method: 'POST' });
                        const j = await res.json();
                        if (j.success) {
                          push('Patient unassigned', 'success');
                          // refresh patient list and clear selection
                          try { const r = await authFetch('http://localhost:5000/api/patients'); const j2 = await r.json(); if (j2.success) setPatients(j2.patients||[]); } catch(_){}
                          setSelectedPatient(null);
                          setRecentResults([]);
                        } else {
                          push(j.message || 'Failed to unassign', 'error');
                        }
                      } catch (e) { console.error('unassign error', e); push('Error unassigning patient', 'error'); }
                    }} className="px-3 py-2 bg-red-600 rounded">Remove patient</button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 text-gray-400">No patient selected</div>
              )}
            </div>

            <div className="bg-gray-800 rounded-lg p-4 mb-4 shadow">
              <h4 className="text-sm text-gray-300">Schedule</h4>
              {scheduleLoading ? (
                <div className="text-gray-400 text-sm mt-2">Loading schedule...</div>
              ) : (
                <ul className="mt-3 text-sm text-gray-200 space-y-2">
                  {schedule.length === 0 ? (
                    <li className="text-gray-400">No upcoming sessions.</li>
                  ) : (
                    schedule.slice(0, 6).map((s) => (
                      <li key={s.id || `${s.time}-${s.title}`} className="flex items-center justify-between bg-gray-900/60 p-2 rounded">
                        <div>
                          <div className="text-xs text-gray-400">{s.time}</div>
                          <div className="font-semibold">{s.title}</div>
                          <div className="text-xs text-gray-400">{s.patient}</div>
                        </div>
                        <div className="text-[11px] text-gray-400">{s.note}</div>
                      </li>
                    ))
                  )}
                </ul>
              )}
              <button onClick={fetchSchedule} className="mt-3 text-xs text-indigo-300 underline">Refresh schedule</button>
            </div>

            <div className="bg-gradient-to-br from-indigo-700 to-purple-600 rounded-lg p-4 shadow">
              <h4 className="text-sm text-white">Quick reports</h4>
                <div className="mt-3 space-y-2">
                <button onClick={() => exportCsvForPatient(selectedPatient?._id)} className="w-full bg-white/10 text-white px-3 py-2 rounded text-sm">Export CSV</button>
                <button onClick={() => generatePdfForPatient(selectedPatient?._id)} className="w-full bg-white/10 text-white px-3 py-2 rounded text-sm">Generate PDF</button>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-4 shadow mt-4">
              <h4 className="text-sm text-gray-300">Assign yourself as therapist</h4>
              <div className="flex items-center gap-2 mt-2">
                <select value={therapistLink.patientId} onChange={e=>setTherapistLink({...therapistLink, patientId: e.target.value})} className="bg-gray-700 p-2 rounded text-sm w-full">
                  <option value="">Select patient</option>
                  {availablePatients.map(p=> <option key={p._id} value={p._id}>{p.name} — {p.email}</option>)}
                </select>
                <button onClick={assignTherapistToPatient} className="bg-green-600 px-3 py-2 rounded text-sm whitespace-nowrap">Assign</button>
              </div>
              {therapistLink.status && <div className="text-xs text-gray-300 mt-1">{therapistLink.status}</div>}
              <div className="text-[11px] text-gray-400 mt-1">Patient will get a request and must accept you as their therapist.</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-4 shadow mt-4">
              <h4 className="text-sm text-gray-300">Remove patient link</h4>
              <div className="flex items-center gap-2 mt-2">
                <select value={removeLink.patientId} onChange={e=>setRemoveLink({...removeLink, patientId: e.target.value})} className="bg-gray-700 p-2 rounded text-sm w-full">
                  <option value="">Select patient</option>
                  {patients.map(p=> <option key={p._id} value={p._id}>{p.name} — {p.email}</option>)}
                </select>
                <button onClick={removeTherapistFromPatient} className="bg-red-600 px-3 py-2 rounded text-sm whitespace-nowrap">Remove</button>
              </div>
              {removeLink.status && <div className="text-xs text-gray-300 mt-1">{removeLink.status}</div>}
              <div className="text-[11px] text-gray-400 mt-1">Removes you as therapist for that patient.</div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
