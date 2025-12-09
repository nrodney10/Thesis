import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Link, useNavigate } from 'react-router-dom';

export default function Exercises() {
  const { user, authFetch } = useAuth();
  const { push } = useToast();
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(false);

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

  const navigate = useNavigate();

  useEffect(() => {
    fetchExercises();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          <div>
            <h2 className="text-lg font-semibold mb-2">Existing exercises</h2>
            {loading ? <p>Loading...</p> : exercises.length === 0 ? <p className="text-gray-400">No exercises yet.</p> : (
              <ul className="space-y-2">
                {exercises.map((ex) => (
                  <li key={ex._id} className="p-2 bg-gray-900 rounded">
                    <div className="font-medium">{ex.title}</div>
                    <div className="text-xs text-gray-400">{ex.description}</div>
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
