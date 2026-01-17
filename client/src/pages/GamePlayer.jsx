import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import MemoryGame from './MemoryGame';
import StroopGame from './StroopGame';

export default function GamePlayer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { authFetch, user } = useAuth();
  const [assignment, setAssignment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await authFetch('http://localhost:5000/api/exercises');
        const data = await res.json();
        if (!data.success) throw new Error('Failed to load assignments');
        const list = (data.exercises || []).filter((ex) => (ex.metadata?.assignmentType || '').toLowerCase() === 'game');
        const uid = user?.id || user?._id;
        let match = list.find((ex) => String(ex._id) === String(id) && uid && (ex.assignedTo || []).map(String).includes(String(uid)));
        if (!match) {
          // fall back to scheduled calendar items so we can show the countdown instead of an error
          try {
            const calRes = await authFetch('http://localhost:5000/api/calendar/patient');
            const cal = await calRes.json();
            if (cal.success) {
              const fromCal = (cal.items || []).find(it => String(it.id || it._id) === String(id) && (it.metadata?.assignmentType || it.type || '').toLowerCase() === 'game');
              if (fromCal) match = { ...fromCal, _id: fromCal._id || fromCal.id };
            }
          } catch (_) { /* ignore */ }
        }
        if (!match) {
          setError('Game not found or not assigned to you.');
        } else {
          setAssignment(match);
        }
      } catch (e) {
        console.error(e);
        setError('Could not load game assignment.');
      }
      setLoading(false);
    };
    load();
  }, [authFetch, id, user?.id]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">Loading game...</div>;
  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white p-6">
      <div className="bg-gray-800 p-6 rounded shadow max-w-md text-center">
        <div className="text-lg font-semibold mb-2">Unable to open game</div>
        <div className="text-sm text-gray-300 mb-4">{error}</div>
        <button onClick={()=>navigate('/games')} className="bg-indigo-600 px-4 py-2 rounded">Back to Games</button>
      </div>
    </div>
  );

  const gameKey = (assignment?.metadata?.gameKey || '').toLowerCase();
  const commonProps = {
    assignmentId: assignment?._id,
    assignmentTitle: assignment?.title,
    gameKey,
    onFinished: () => navigate('/games')
  };

  if (gameKey === 'stroop') return <StroopGame {...commonProps} />;
  return <MemoryGame {...commonProps} />;
}
