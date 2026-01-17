import React, { useEffect, useMemo, useState } from 'react';
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
  const [blockedUntil, setBlockedUntil] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const startOfToday = useMemo(() => {
    const d = new Date(now);
    d.setHours(0,0,0,0);
    return d;
  }, [now]);

  const countdownFor = (targetMs) => {
    if (!Number.isFinite(targetMs)) return '';
    const diff = targetMs - now;
    if (diff <= 0) return 'Ready now';
    const totalSeconds = Math.floor(diff / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (days > 0) return `${days}d ${hours}h`;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

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
        const match = list.find((ex) => String(ex._id) === String(id) && uid && (ex.assignedTo || []).map(String).includes(String(uid)));
        if (!match) {
          setError('Game not found or not assigned to you.');
        } else {
          const dueMs = match?.dueAt ? new Date(match.dueAt).getTime() : NaN;
          if (Number.isFinite(dueMs) && dueMs > Date.now()) setBlockedUntil(dueMs);
          else setBlockedUntil(null);
          const completion = (match.completions || []).find((c) => String(c.userId) === String(uid));
          if (completion) {
            const at = completion.completedAt ? new Date(completion.completedAt) : null;
            if (at && at >= startOfToday) {
              setError('You already performed this game today.');
              setLoading(false);
              return;
            }
          }
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
  if (assignment && blockedUntil && blockedUntil > now) {
    const countdown = countdownFor(blockedUntil);
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white p-6">
        <div className="bg-gray-800 p-6 rounded shadow max-w-md text-center">
          <div className="text-lg font-semibold mb-2">Scheduled game</div>
          <div className="text-sm text-gray-300 mb-2">This game unlocks on {new Date(blockedUntil).toLocaleString()}.</div>
          <div className="text-xs text-indigo-300 mb-4">Starts in {countdown}</div>
          <button onClick={()=>navigate('/games')} className="bg-indigo-600 px-4 py-2 rounded">Back to Games</button>
        </div>
      </div>
    );
  }

  const markComplete = async () => {
    if (!assignment?._id) return;
    try { await authFetch(`http://localhost:5000/api/exercises/${assignment._id}/complete`, { method:'POST' }); } catch (e) { console.warn('mark complete failed', e); }
  };

  const gameKey = (assignment?.metadata?.gameKey || '').toLowerCase();
  const commonProps = {
    assignmentId: assignment?._id,
    assignmentTitle: assignment?.title,
    gameKey,
    onFinished: async () => { await markComplete(); navigate('/games'); }
  };

  if (gameKey === 'stroop') return <StroopGame {...commonProps} />;
  return <MemoryGame {...commonProps} />;
}
