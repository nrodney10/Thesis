import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Link, useNavigate } from 'react-router-dom';

export default function Exercises() {
  const { user, authFetch } = useAuth();
  const { push } = useToast();
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(false);
  const [patients, setPatients] = useState([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [selectedExerciseIds, setSelectedExerciseIds] = useState(new Set());
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchExercises = async () => {
    setLoading(true);
    try {
      // server endpoint may be implemented later; this is optimistic
      const res = await authFetch('http://localhost:5000/api/exercises');
      const data = await res.json();
      if (data.success) setExercises(data.exercises || []);
      else setExercises([]);
    } catch (err) {
      console.error('Failed to fetch exercises', err);
      push('Failed to load exercises', 'error');
    }
    setLoading(false);
  };

  const fetchPatients = async () => {
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
  };

  const navigate = useNavigate();

  useEffect(() => {
    fetchExercises();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user?.role === 'therapist') {
      fetchPatients();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  const isAssignedToPatient = (exercise, patientId) =>
    (exercise.assignedTo || []).some((uid) => {
      if (uid && typeof uid === 'object' && uid._id) return String(uid._id) === patientId;
      return String(uid) === patientId;
    });

  const patientExercises = selectedPatientId
    ? exercises.filter((ex) => isAssignedToPatient(ex, selectedPatientId))
    : [];

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Therapist view: create and manage exercises
  if (user?.role === 'therapist') {
    return (
      <main role="main" className="min-h-screen p-8 bg-gray-900 text-gray-100">
        <div className="max-w-3xl mx-auto bg-gray-800 p-6 rounded shadow">
          <h1 className="text-2xl font-bold mb-2">Exercises</h1>
          <p className="text-gray-300 mb-4">Create and assign exercises to patients.</p>
          <div className="mb-4">
            <Link to="/exercises/new" className="bg-indigo-600 text-white px-4 py-2 rounded">Create Exercise</Link>
            <button onClick={fetchExercises} className="ml-3 bg-gray-700 text-white px-3 py-2 rounded">Refresh</button>
            <Link to="/templates" className="ml-3 bg-gray-700 text-white px-3 py-2 rounded">Templates</Link>
          </div>
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
            <h2 className="text-lg font-semibold mb-2">Existing exercises</h2>
            {loading ? <p>Loading...</p> : exercises.length === 0 ? <p className="text-gray-400">No exercises yet.</p> : (
              <ul className="space-y-2">
                {exercises.map((ex) => (
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

  // Patient view: list assigned exercises (read-only)
  return (
    <main role="main" className="min-h-screen p-8 bg-gray-900 text-gray-100">
      <div className="max-w-3xl mx-auto bg-gray-800 p-6 rounded shadow">
        <h1 className="text-2xl font-bold mb-2">Exercises</h1>
        <p className="text-gray-300 mb-4">Exercises assigned to you by your therapist. Complete them and your progress will be tracked here.</p>
        {loading ? <p>Loading...</p> : exercises.length === 0 ? (
          <p className="text-gray-400">No exercises assigned yet.</p>
        ) : (
          <ul className="space-y-3">
            {exercises.map((ex) => (
              <li key={ex._id} className="p-3 bg-gray-900 rounded">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-medium text-white">{ex.title}</div>
                    <div className="text-xs text-gray-400">{ex.description}</div>
                  </div>
                  <div className="text-sm">
                    <button onClick={() => navigate('/exercises/run', { state: { exercise: ex } })} className="bg-indigo-600 px-3 py-1 rounded text-white">Start</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
