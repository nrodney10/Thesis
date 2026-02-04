import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

const COLORS = ["red", "green", "blue", "orange", "purple"];

export default function StroopGame({ assignmentId, assignmentTitle, gameKey = 'stroop', isScheduled = false, onFinished }) {
  const navigate = useNavigate();
  const { authFetch } = useAuth();
  const { push } = useToast();

  const [current, setCurrent] = useState({ word: "", color: "" });
  const [score, setScore] = useState(0);
  const [trial, setTrial] = useState(0);
  const [startTime, setStartTime] = useState(null);
  const [times, setTimes] = useState([]);
  const [selectedOption, setSelectedOption] = useState(null);
  const [finished, setFinished] = useState(false);
  const [saveStatus, setSaveStatus] = useState('idle'); // idle | saving | saved | error
  const [finalStats, setFinalStats] = useState(null);
  const [pendingPayload, setPendingPayload] = useState(null);

  const markComplete = async () => {
    if (!isScheduled || !assignmentId) return;
    try { await authFetch(`http://localhost:5000/api/exercises/${assignmentId}/complete`, { method: 'POST' }); } catch (_) {}
  };

  useEffect(() => {
    next();
  }, [next]);

  const next = () => {
    const word = COLORS[Math.floor(Math.random() * COLORS.length)];
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    setCurrent({ word, color });
    setStartTime(Date.now());
  };

  const handleAnswer = (choice) => {
    if (finished) return;
    const rt = Date.now() - startTime;
    const correct = choice === current.color;
    setScore((s) => s + (correct ? 1 : 0));
    setTimes((t) => [...t, rt]);
    setTrial((tr) => tr + 1);
    if (trial >= 14) finish([...times, rt]);
    else next();
  };

  const submitPayload = async (payload) => {
    try {
      if (isScheduled) {
        setSaveStatus('saving');
        const res = await authFetch('http://localhost:5000/api/results', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        if (data.success) { push('Stroop result submitted', 'success'); setSaveStatus('saved'); await markComplete(); }
        else { push('Failed to submit Stroop result', 'error'); setSaveStatus('error'); }
      } else {
        push('Practice round finished. Result not submitted (practice mode).', 'info');
      }
    } catch (err) {
      console.error(err);
      push('Error submitting Stroop result', 'error');
      setSaveStatus('error');
    }
  };

  const finish = async (allTimes) => {
    const avg = Math.round(allTimes.reduce((a, b) => a + b, 0) / allTimes.length);
    const finalScore = score;
    setFinished(true);
    setFinalStats({ score: finalScore, avg, trials: allTimes.length });
    const payload = { exerciseId: assignmentId || 'stroop', type: 'cognitive', score: finalScore, metadata: { avgRTms: avg, trials: allTimes.length, gameKey } };
    setPendingPayload(payload);
    await submitPayload(payload);
  };

  const restart = () => {
    setScore(0);
    setTrial(0);
    setTimes([]);
    setSelectedOption(null);
    setFinished(false);
    setSaveStatus('idle');
    setFinalStats(null);
    setPendingPayload(null);
    next();
  };

  useEffect(() => {
    const onKey = (e) => {
      const running = startTime !== null;
      if (!running && e.key === 'Enter') {
        next();
        return;
      }
      if (running && e.key === 'Enter') {
        const choice = selectedOption !== null ? COLORS[selectedOption] : COLORS[0];
        handleAnswer(choice);
        return;
      }
      if (['1', '2', '3', '4', '5'].includes(e.key)) setSelectedOption(Number(e.key) - 1);
      if (e.code === 'Space') setSelectedOption((s) => (s === null ? 0 : (s + 1) % COLORS.length));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedOption, startTime, trial, handleAnswer, next]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white p-8">
      <div className="bg-gray-800 p-6 rounded shadow max-w-lg w-full text-center">
        <h2 className="text-xl mb-4">{assignmentTitle || 'Stroop Test'}</h2>
        <div className="mb-4">
          <div style={{ color: current.color }} className="text-4xl font-bold">{current.word.toUpperCase()}</div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {COLORS.map((c) => (
            <button key={c} onClick={() => handleAnswer(c)} disabled={finished} className="py-2 rounded" style={{ background: c, color: 'white', opacity: finished ? 0.6 : 1 }}>{c}</button>
          ))}
        </div>
        <div className="mt-4 text-sm text-gray-300">Trial: {trial+1}/15  Score: {score}</div>
        {finished && (
          <div className="mt-4 bg-gray-900 p-3 rounded border border-gray-700 text-left">
            <div className="text-sm text-green-300 font-semibold">Session complete</div>
            <div className="text-xs text-gray-300 mt-1">
              {isScheduled
                ? (saveStatus === 'saving'
                  ? 'Saving results...'
                  : saveStatus === 'saved'
                    ? 'Results saved and sent to your therapist.'
                    : saveStatus === 'error'
                      ? 'Failed to save results. Please try again.'
                      : 'Results are ready to save.')
                : 'Practice round finished.'}
            </div>
            {finalStats && (
              <div className="text-xs text-gray-400 mt-2">
                Score: {finalStats.score} • Avg RT: {finalStats.avg} ms • Trials: {finalStats.trials}
              </div>
            )}
            <div className="mt-3 flex gap-2">
              <button onClick={restart} className="bg-indigo-600 px-3 py-2 rounded text-white">Restart</button>
              {isScheduled && (
                <button
                  onClick={() => pendingPayload && submitPayload(pendingPayload)}
                  disabled={saveStatus === 'saving' || saveStatus === 'saved' || !pendingPayload}
                  className={`px-3 py-2 rounded ${saveStatus === 'saving' || saveStatus === 'saved' || !pendingPayload ? 'bg-gray-700 text-gray-400' : 'bg-green-600 text-white'}`}
                >
                  {saveStatus === 'saved' ? 'Saved' : saveStatus === 'saving' ? 'Saving...' : 'Save Results'}
                </button>
              )}
              <button onClick={() => (onFinished ? onFinished() : navigate('/games', { replace: true }))} className="bg-gray-700 px-3 py-2 rounded">Exit</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
