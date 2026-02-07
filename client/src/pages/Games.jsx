import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useNavigate, useLocation } from 'react-router-dom';

export default function Games() {
  const { user, authFetch } = useAuth();
  const { push } = useToast();
  const [patients, setPatients] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [form, setForm] = useState({ game: 'memory', note: '', dueAt: '', scheduleType: 'scheduled' });
  const [status, setStatus] = useState('');
  const [assignments, setAssignments] = useState([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState(new Set());
  const [patientAssignments, setPatientAssignments] = useState([]);
  const [patientLoading, setPatientLoading] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const userId = user?.id || user?._id;
  const location = useLocation();

  useEffect(() => {
    const load = async () => {
      if (user?.role !== 'therapist') return;
      try {
        const r = await authFetch('http://localhost:5000/api/patients');
        const j = await r.json();
        if (j.success) setPatients(j.patients || []);
      } catch (e) {
        console.error(e);
        push('Failed to load patients', 'error');
      }
    };
    load();
  }, [authFetch, push, user?.role]);

  const fetchAssignments = React.useCallback(async () => {
    if (user?.role !== 'therapist') return;
    setAssignmentsLoading(true);
    try {
      const r = await authFetch('http://localhost:5000/api/exercises');
      const j = await r.json();
      if (j.success) {
        const gamesOnly = (j.exercises || []).filter(ex => (ex.metadata?.assignmentType || '').toLowerCase() === 'game');
        setAssignments(gamesOnly);
      } else {
        setAssignments([]);
      }
    } catch (e) {
      console.error(e);
      push('Failed to load game assignments', 'error');
    }
    setAssignmentsLoading(false);
  }, [authFetch, push, user?.role]);

  useEffect(() => {
    fetchAssignments();
  }, [user?.role, fetchAssignments]);

  useEffect(() => {
    const loadPatientAssignments = async () => {
      if (user?.role === 'therapist') return;
      setPatientLoading(true);
      try {
        const r = await authFetch('http://localhost:5000/api/exercises');
        const j = await r.json();
        if (j.success) {
          const games = (j.exercises || []).filter(ex => (ex.metadata?.assignmentType || '').toLowerCase() === 'game');
          setPatientAssignments(games);
        } else {
          setPatientAssignments([]);
        }
      } catch (e) {
        console.error(e);
        setPatientAssignments([]);
      }
      setPatientLoading(false);
    };
    loadPatientAssignments();
  }, [authFetch, user?.role, location.key]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const startOfToday = useMemo(() => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [now]);

  const completionStatus = (item) => {
    if (!userId) return null;
    const entry = (item?.completions || []).find((c) => String(c.userId) === String(userId));
    if (!entry) return null;
    const completedAt = entry.completedAt ? new Date(entry.completedAt) : null;
    if (!completedAt || Number.isNaN(completedAt.getTime())) return null;
    const completedToday = completedAt >= startOfToday;
    return { completedAt, completedToday };
  };

  const visiblePatientAssignments = useMemo(() => patientAssignments, [patientAssignments]);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const isAssignedToPatient = (assignment, patientId) =>
    (assignment.assignedTo || []).some((uid) => {
      if (uid && typeof uid === 'object' && uid._id) return String(uid._id) === patientId;
      return String(uid) === patientId;
    });

  const selectedPatientAssignments = selectedPatientId
    ? assignments.filter((a) => isAssignedToPatient(a, selectedPatientId))
    : [];

  const toggleAssignmentSelection = (id) => {
    setSelectedAssignmentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const resetSelection = () => setSelectedAssignmentIds(new Set());

  useEffect(() => {
    resetSelection();
  }, [selectedPatientId]);

  const splitPatientGames = useMemo(() => {
    const practiceReady = [];
    const scheduledAll = [];

    visiblePatientAssignments.forEach((g) => {
      const dueMs = g?.dueAt ? new Date(g.dueAt).getTime() : NaN;
      if (!Number.isFinite(dueMs)) {
        practiceReady.push(g);
      } else {
        scheduledAll.push(g);
      }
    });

    scheduledAll.sort((a, b) => {
      const aMs = a?.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      const bMs = b?.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      const aOverdue = Number.isFinite(aMs) && aMs < startOfToday.getTime();
      const bOverdue = Number.isFinite(bMs) && bMs < startOfToday.getTime();
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
      return aMs - bMs;
    });

    return { readyGames: practiceReady, scheduledGames: scheduledAll };
  }, [visiblePatientAssignments, startOfToday]);

  const canStartGame = (g) => {
    const dueMs = g?.dueAt ? new Date(g.dueAt).getTime() : NaN;
    if (!Number.isFinite(dueMs)) return true;
    if (dueMs > now.getTime()) return false;
    const completed = completionStatus(g);
    if (completed?.completedToday) return false;
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

  const sendAssignment = async () => {
    if (!selected.size) { push('Select at least one patient', 'error'); return; }
    const isScheduled = form.scheduleType === 'scheduled';
    if (isScheduled && !form.dueAt) { push('Pick a schedule date for this game', 'error'); return; }
    if (isScheduled) {
      const dateOnly = new Date(form.dueAt);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      if (dateOnly < today) { push('Scheduled date cannot be in the past', 'error'); return; }
    }
    setStatus('Sending...');
    try {
      const title = form.game === 'memory' ? 'Memory Match' : 'Stroop Test';
      const body = form.note || '';
      const payload = {
        title,
        description: body,
        assignedTo: Array.from(selected),
        metadata: { assignmentType: 'game', gameKey: form.game },
      };
      if (isScheduled && form.dueAt) payload.dueAt = form.dueAt;
      const r = await authFetch('http://localhost:5000/api/exercises', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      const j = await r.json();
      if (j.success) {
        push(`Game assigned`, 'success');
        setSelected(new Set());
        setForm({ ...form, note: '', dueAt: '' });
        setStatus('Sent');
        fetchAssignments();
      } else {
        push(j.message || 'Failed to assign game', 'error');
        setStatus('Error');
      }
    } catch (e) {
      console.error(e);
      push('Error assigning game', 'error');
      setStatus('Error');
    }
  };

  const handleDelete = async () => {
    if (!selectedPatientId || selectedAssignmentIds.size === 0) return;
    setStatus('Deleting...');
    try {
      const res = await authFetch(`http://localhost:5000/api/exercises/patient/${selectedPatientId}`, {
        method:'DELETE',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ exerciseIds: Array.from(selectedAssignmentIds) })
      });
      const data = await res.json();
      if (data.success) {
        const removedCount = (data.removedAssignments || 0) + (data.deletedExercises || 0);
        push(`Removed ${removedCount} game${removedCount === 1 ? '' : 's'}`, 'success');
        await fetchAssignments();
        resetSelection();
        setStatus('');
      } else {
        push(data.error || 'Failed to delete games', 'error');
        setStatus('Error');
      }
    } catch (err) {
      console.error('Failed to delete games', err);
      push('Failed to delete games', 'error');
      setStatus('Error');
    }
  };

  const navigate = useNavigate();
  const readyGames = splitPatientGames.readyGames;
  const scheduledGames = splitPatientGames.scheduledGames;

  const startGame = (g) => {
    if (!canStartGame(g)) {
      push(`This game is scheduled for ${g.dueAt ? new Date(g.dueAt).toLocaleString() : 'a future date'}`, 'info');
      return;
    }
    navigate(`/games/play/${g._id}`);
  };

  if (user?.role === 'therapist') {
    return (
      <main className="min-h-screen p-8 bg-gray-900 text-gray-100">
        <div className="max-w-3xl mx-auto bg-gray-800 p-6 rounded shadow space-y-4">
          <div>
            <h1 className="text-2xl font-bold">Assign Games</h1>
            <p className="text-gray-300">Pick a cognitive game and notify patients to complete it.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <label className="text-sm">
              Game
              <select value={form.game} onChange={e=>setForm({ ...form, game: e.target.value })} className="w-full bg-gray-700 p-2 rounded mt-1">
                <option value="memory">Memory Match</option>
                <option value="stroop">Stroop Test</option>
              </select>
            </label>
            <label className="text-sm">
              Note to patient (optional)
              <input value={form.note} onChange={e=>setForm({ ...form, note: e.target.value })} className="w-full bg-gray-700 p-2 rounded mt-1" placeholder="Instructions or due info" />
            </label>
            <label className="text-sm">
              Timing
              <select
                value={form.scheduleType}
                onChange={e=>setForm({ ...form, scheduleType: e.target.value, dueAt: e.target.value === 'practice' ? '' : form.dueAt })}
                className="w-full bg-gray-700 p-2 rounded mt-1"
              >
                <option value="practice">Practice</option>
                <option value="scheduled">Scheduled</option>
              </select>
            </label>
            {form.scheduleType === 'scheduled' && (
              <label className="text-sm">
                Schedule date
                <input
                  type="date"
                  value={form.dueAt}
                  min={new Date().toISOString().slice(0,10)}
                  onChange={e=>setForm({ ...form, dueAt: e.target.value })}
                  className="w-full bg-gray-700 p-2 rounded mt-1"
                />
              </label>
            )}
          </div>
          <div>
            <div className="text-sm text-gray-300 mb-1">Select recipients</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-auto bg-gray-900 p-2 rounded">
              {patients.map(p => (
                <label key={p._id} className={`flex items-center gap-2 p-2 rounded text-sm ${selected.has(p._id) ? 'bg-gray-700 ring-2 ring-indigo-500' : 'bg-gray-800'}`}>
                  <input type="checkbox" checked={selected.has(p._id)} onChange={()=>toggle(p._id)} />
                  <span>{p.name} ({p.age})</span>
                </label>
              ))}
              {patients.length === 0 && <div className="text-xs text-gray-400">No patients found.</div>}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={sendAssignment} className="bg-indigo-600 px-4 py-2 rounded text-white disabled:opacity-50" disabled={!patients.length}>Assign game</button>
            {status && <div className="text-xs text-gray-300 self-center">{status}</div>}
          </div>
          <div className="text-sm text-gray-400">Choose Practice for immediate availability, or Scheduled to lock the game until its date.</div>

          <div className="mt-8 border-t border-gray-700 pt-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
              <div>
                <h2 className="text-xl font-semibold">Delete games for a patient</h2>
                <p className="text-sm text-gray-400">Select a patient to view assigned games and remove them.</p>
              </div>
              <label className="text-sm">
                <span className="mr-2">Patient</span>
                <select value={selectedPatientId} onChange={(e)=>setSelectedPatientId(e.target.value)} className="bg-gray-700 p-2 rounded text-white">
                  <option value="">{patients.length ? 'Select patient' : 'No patients'}</option>
                  {patients.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                </select>
              </label>
            </div>
            {selectedPatientId && (
              <div className="mt-3">
                {assignmentsLoading ? <p>Loading...</p> : selectedPatientAssignments.length === 0 ? (
                  <p className="text-sm text-gray-400">No games assigned to this patient.</p>
                ) : (
                  <ul className="space-y-2">
                    {selectedPatientAssignments.map(a => (
                      <li key={a._id} className="p-3 bg-gray-900 rounded flex items-center justify-between">
                        <div>
                          <div className="font-semibold">{a.title}</div>
                          <div className="text-xs text-gray-400">Game: {a.metadata?.gameKey || 'game'}</div>
                          <div className="text-xs text-gray-500">
                            {a.dueAt ? `Scheduled: ${new Date(a.dueAt).toLocaleString()}` : 'Practice (no date)'}
                          </div>
                        </div>
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={selectedAssignmentIds.has(a._id)} onChange={()=>toggleAssignmentSelection(a._id)} />
                          <span>Delete</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={handleDelete}
                    disabled={selectedAssignmentIds.size === 0 || assignmentsLoading}
                    className={`px-4 py-2 rounded ${selectedAssignmentIds.size === 0 || assignmentsLoading ? 'bg-gray-700 text-gray-400' : 'bg-red-600 text-white'}`}
                  >
                    Delete selected ({selectedAssignmentIds.size})
                  </button>
                  <button onClick={resetSelection} className="px-3 py-2 rounded bg-gray-700 text-white">Clear selection</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    );
  }


  return (
    <main className="min-h-screen p-8 bg-gray-900 text-gray-100">
      <div className="max-w-5xl mx-auto">
        <div className="grid lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2 bg-gray-800 p-6 rounded shadow space-y-4">
            <div>
              <h1 className="text-2xl font-bold">Games</h1>
              <p className="text-gray-300">Practice games live here. Scheduled assignments stay on the right and unlock on their due date.</p>
            </div>
            {patientLoading ? (
              <p className="text-gray-400 text-sm">Loading assigned games...</p>
            ) : readyGames.length === 0 ? (
              <p className="text-gray-400 text-sm">No practice games right now. Check Scheduled for assigned games.</p>
            ) : (
              <ul className="space-y-3">
                {readyGames.map((g) => {
                  const completed = completionStatus(g);
                  const isPractice = !g.dueAt;
                  const canStart = canStartGame(g);
                  const label = (() => {
                    if (isPractice) return 'Play';
                    if (completed?.completedToday) return 'Completed';
                    return canStart ? 'Play' : 'Locked';
                  })();
                  const disabled = isPractice ? false : !canStart;
                  return (
                    <li key={g._id} className="p-3 bg-gray-900 rounded flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-white">{g.title}</div>
                        <div className="text-xs text-gray-400">Game: {g.metadata?.gameKey || 'game'}</div>
                        {g.description && <div className="text-xs text-gray-400 mt-1">{g.description}</div>}
                        {!isPractice && completed?.completedToday && <div className="text-[11px] text-green-300 mt-1">Performed today</div>}
                      </div>
                      <button
                        onClick={() => startGame(g)}
                        disabled={disabled}
                        className={`px-3 py-1 rounded text-sm ${disabled ? 'bg-gray-700 text-gray-400 cursor-not-allowed' : 'bg-indigo-600 text-white'}`}
                      >
                        {label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <aside className="bg-gray-800 p-6 rounded shadow space-y-3">
            <div>
              <h3 className="text-lg font-semibold">Scheduled</h3>
              <p className="text-sm text-gray-400">Assignments appear here first. A live timer shows when they unlock, and overdue items are marked in red.</p>
            </div>
            {patientLoading ? (
              <p className="text-gray-400 text-sm">Loading scheduled games...</p>
            ) : scheduledGames.length === 0 ? (
              <p className="text-gray-400 text-sm">Nothing scheduled yet.</p>
            ) : (
              <ul className="space-y-3">
                {scheduledGames.map((s) => {
                  const dueLabel = s.dueAt ? new Date(s.dueAt).toLocaleString() : 'Scheduled';
                  const completed = completionStatus(s);
                  const dueMs = s?.dueAt ? new Date(s.dueAt).getTime() : NaN;
                  const overdue = Number.isFinite(dueMs) && dueMs < startOfToday.getTime() && !completed?.completedToday;
                  const countdown = countdownFor(s.dueAt);
                  const statusText = completed?.completedToday
                    ? 'Performed today'
                    : overdue
                      ? 'Overdue'
                      : countdown === 'Ready now'
                        ? 'Ready now'
                        : `Starts in ${countdown}`;
                  const statusClass = overdue ? 'text-red-400' : 'text-indigo-300';
                  const disabled = !canStartGame(s);
                  return (
                    <li key={s._id || s.id} className="p-3 bg-gray-900 rounded border border-gray-700">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold">{s.title}</div>
                          <div className="text-xs text-gray-400">Game: {s.metadata?.gameKey || 'game'}</div>
                          <div className="text-xs text-gray-400 mt-1">Scheduled for {dueLabel}</div>
                          <div className={`text-[11px] mt-1 ${statusClass}`}>{statusText}</div>
                        </div>
                        <button
                          onClick={() => startGame(s)}
                          disabled={disabled}
                          className={`px-3 py-1 rounded text-sm ${disabled ? 'bg-gray-700 text-gray-400 cursor-not-allowed' : 'bg-indigo-600 text-white'}`}
                        >
                          {completed?.completedToday ? 'Completed' : disabled ? 'Locked' : 'Play'}
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
