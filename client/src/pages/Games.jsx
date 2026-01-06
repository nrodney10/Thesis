import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useNavigate } from 'react-router-dom';

export default function Games() {
  const { user, authFetch } = useAuth();
  const { push } = useToast();
  const [patients, setPatients] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [form, setForm] = useState({ game: 'memory', note: '' });
  const [status, setStatus] = useState('');
  const [assignments, setAssignments] = useState([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState(new Set());
  const [patientAssignments, setPatientAssignments] = useState([]);
  const [patientLoading, setPatientLoading] = useState(false);

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

  const fetchAssignments = async () => {
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
  };

  useEffect(() => {
    fetchAssignments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

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
  }, [authFetch, user?.role]);

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

  const sendAssignment = async () => {
    if (!selected.size) { push('Select at least one patient', 'error'); return; }
    setStatus('Sending...');
    try {
      const title = form.game === 'memory' ? 'Memory Match' : 'Stroop Test';
      const body = form.note || '';
      const payload = {
        title,
        description: body,
        assignedTo: Array.from(selected),
        metadata: { assignmentType: 'game', gameKey: form.game }
      };
      const r = await authFetch('http://localhost:5000/api/exercises', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      const j = await r.json();
      if (j.success) {
        push(`Game assigned`, 'success');
        setSelected(new Set());
        setForm({ ...form, note: '' });
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

  if (user?.role === 'therapist') {
    return (
      <main className="min-h-screen p-8 bg-gray-900 text-gray-100">
        <div className="max-w-3xl mx-auto bg-gray-800 p-6 rounded shadow space-y-4">
          <div>
            <h1 className="text-2xl font-bold">Assign Games</h1>
            <p className="text-gray-300">Pick a cognitive game and notify patients to complete it.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
          <div className="text-sm text-gray-400">Games are assigned via notifications; patients can launch games from the Games page.</div>

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
      <div className="max-w-3xl mx-auto bg-gray-800 p-6 rounded shadow space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Games</h1>
          <p className="text-gray-300">Your therapist assigns cognitive games when needed. You cannot start new games on your own.</p>
        </div>
        {patientLoading ? (
          <p className="text-gray-400 text-sm">Loading assigned games...</p>
        ) : patientAssignments.length === 0 ? (
          <p className="text-gray-400 text-sm">No games assigned yet. You’ll see them here once your therapist assigns one.</p>
        ) : (
          <ul className="space-y-3">
            {patientAssignments.map((g) => (
              <li key={g._id} className="p-3 bg-gray-900 rounded border border-gray-700">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-white">{g.title}</div>
                    <div className="text-xs text-gray-400">Game: {g.metadata?.gameKey || 'game'}</div>
                    {g.description && <div className="text-xs text-gray-400 mt-1">{g.description}</div>}
                  </div>
                  <button onClick={()=>navigate(`/games/play/${g._id}`)} className="bg-indigo-600 px-3 py-1 rounded text-sm">Play</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
