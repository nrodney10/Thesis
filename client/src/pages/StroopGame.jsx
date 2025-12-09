import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

const COLORS = ["red", "green", "blue", "orange", "purple"];

export default function StroopGame() {
  const navigate = useNavigate();
  const { authFetch } = useAuth();
  const { push } = useToast();

  const [current, setCurrent] = useState({ word: "", color: "" });
  const [score, setScore] = useState(0);
  const [trial, setTrial] = useState(0);
  const [startTime, setStartTime] = useState(null);
  const [times, setTimes] = useState([]);
  const [selectedOption, setSelectedOption] = useState(null);

  useEffect(() => {
    next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const next = () => {
    const word = COLORS[Math.floor(Math.random() * COLORS.length)];
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    setCurrent({ word, color });
    setStartTime(Date.now());
  };

  const handleAnswer = (choice) => {
    const rt = Date.now() - startTime;
    const correct = choice === current.color;
    setScore((s) => s + (correct ? 1 : 0));
    setTimes((t) => [...t, rt]);
    setTrial((tr) => tr + 1);
    if (trial >= 14) finish([...times, rt]);
    else next();
  };

  const finish = async (allTimes) => {
    const avg = Math.round(allTimes.reduce((a, b) => a + b, 0) / allTimes.length);
    const payload = { exerciseId: 'stroop', type: 'cognitive', score: score, metadata: { avgRTms: avg, trials: allTimes.length } };
    try {
      const res = await authFetch('http://localhost:5000/api/results', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (data.success) push('Stroop result submitted', 'success');
      else push('Failed to submit Stroop result', 'error');
    } catch (err) {
      console.error(err);
      push('Error submitting Stroop result', 'error');
    }
    navigate('/patient');
  };

  // keyboard support: Enter to start/next, 1/2/3 to choose option, Space to toggle selected
  useEffect(() => {
    const onKey = (e) => {
      const running = startTime !== null;
      // Enter: if not started, start (advance to first); if running, submit selected option
      if (!running && e.key === 'Enter') {
        next();
        return;
      }
      if (running && e.key === 'Enter') {
        const choice = selectedOption !== null ? COLORS[selectedOption] : COLORS[0];
        handleAnswer(choice);
        return;
      }
      // number keys 1-5 map to COLORS indices
      if (['1', '2', '3', '4', '5'].includes(e.key)) setSelectedOption(Number(e.key) - 1);
      // Space cycles selection
      if (e.code === 'Space') setSelectedOption((s) => (s === null ? 0 : (s + 1) % COLORS.length));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOption, startTime, trial, startTime]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white p-8">
      <div className="bg-gray-800 p-6 rounded shadow max-w-lg w-full text-center">
        <h2 className="text-xl mb-4">Stroop Test</h2>
        <div className="mb-4">
          <div style={{ color: current.color }} className="text-4xl font-bold">{current.word.toUpperCase()}</div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {COLORS.map((c) => (
            <button key={c} onClick={() => handleAnswer(c)} className="py-2 rounded" style={{ background: c, color: 'white' }}>{c}</button>
          ))}
        </div>
        <div className="mt-4 text-sm text-gray-300">Trial: {trial+1}/15 • Score: {score}</div>
      </div>
    </div>
  );
}
