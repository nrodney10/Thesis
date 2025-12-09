import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

const EMOJIS = [
  "🧠","🧩","🎯","🕹️","🧮","🧪","🎲","🔔","⭐","🌟","🍀","🍎","🐶","🐱","🚀","🌈"
];

export default function MemoryGame() {
  const navigate = useNavigate();
  const { authFetch } = useAuth();

  const [difficulty, setDifficulty] = useState("easy");
  const pairsByDifficulty = { easy: 4, medium: 6, hard: 8 };
  const totalPairs = pairsByDifficulty[difficulty] || 4;

  const deck = useMemo(() => {
    const emojis = EMOJIS.slice(0, totalPairs);
    const cards = shuffle([...emojis, ...emojis]).map((value, idx) => ({
      id: idx,
      value,
      matched: false,
    }));
    return cards;
  }, [totalPairs]);

  const [cards, setCards] = useState(deck);
  const [flipped, setFlipped] = useState([]);
  const [moves, setMoves] = useState(0);
  const [matchedCount, setMatchedCount] = useState(0);
  const [startTime, setStartTime] = useState(null);
  const [time, setTime] = useState(0);
  const intervalRef = useRef(null);
  const [focusedIndex, setFocusedIndex] = useState(0);

  useEffect(() => {
    setCards(deck);
    setFlipped([]);
    setMoves(0);
    setMatchedCount(0);
    setStartTime(null);
    setTime(0);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [deck]);

  useEffect(() => {
    if (startTime && !intervalRef.current) {
      intervalRef.current = setInterval(() => setTime(Math.floor((Date.now() - startTime) / 1000)), 500);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [startTime]);

  useEffect(() => {
    if (matchedCount === totalPairs && totalPairs > 0) {
      // finished
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    // safe: only depends on matchedCount/totalPairs
  }, [matchedCount, totalPairs]);

  const handleFlip = (card) => {
    if (!startTime) setStartTime(Date.now());
    if (flipped.find((f) => f.id === card.id) || card.matched) return;
    const newFlipped = [...flipped, card];
    setFlipped(newFlipped);
    if (newFlipped.length === 2) {
      setMoves((m) => m + 1);
      const [a, b] = newFlipped;
      if (a.value === b.value) {
        // mark matched
        setCards((prev) => prev.map((c) => (c.value === a.value ? { ...c, matched: true } : c)));
        setMatchedCount((mc) => mc + 1);
        setFlipped([]);
      } else {
        // flip back after short delay
        setTimeout(() => setFlipped([]), 700);
      }
    }
  };
  // keyboard support: arrow keys navigate, Enter flips
  const allMatched = matchedCount === totalPairs && totalPairs > 0;

  // keyboard support: arrow keys navigate, Enter flips
  useEffect(() => {
    const onKey = (e) => {
      if (allMatched) return;
      if (e.key === 'ArrowRight') setFocusedIndex((i) => Math.min(cards.length - 1, i + 1));
      if (e.key === 'ArrowLeft') setFocusedIndex((i) => Math.max(0, i - 1));
      if (e.key === 'Enter') handleFlip(cards[focusedIndex]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, focusedIndex, allMatched, flipped]);

  const restart = () => {
    const shuffled = shuffle([...EMOJIS.slice(0, totalPairs), ...EMOJIS.slice(0, totalPairs)]).map((value, idx) => ({ id: idx, value, matched: false }));
    setCards(shuffled);
    setFlipped([]);
    setMoves(0);
    setMatchedCount(0);
    setStartTime(null);
    setTime(0);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const computeScore = () => {
    const timePenalty = time; // seconds
    const movePenalty = moves * 2;
    const base = 100;
    let score = Math.max(5, Math.round(base - timePenalty - movePenalty));
    return score;
  };

  const { push } = useToast();

  const submitResult = async () => {
    const score = computeScore();
    const payload = {
      exerciseId: `memory-match-${difficulty}`,
      type: "cognitive",
      score,
      metadata: { difficulty, moves, timeSeconds: time },
    };

    try {
      const res = await authFetch("http://localhost:5000/api/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        push("Result submitted! Score: " + score, 'success');
        navigate('/patient');
      } else {
        push('Failed to submit result', 'error');
      }
    } catch (err) {
      console.error(err);
      push('Error submitting result', 'error');
    }
  };

  return (
    <div className="min-h-screen flex items-start justify-center bg-gray-900 p-8 text-white">
      <div className="w-full max-w-3xl">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Memory Match</h1>
          <div className="flex items-center gap-3">
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="bg-gray-800 text-white px-3 py-2 rounded">
              <option value="easy">Easy (4 pairs)</option>
              <option value="medium">Medium (6 pairs)</option>
              <option value="hard">Hard (8 pairs)</option>
            </select>
            <button onClick={restart} className="bg-indigo-600 px-3 py-2 rounded">Restart</button>
          </div>
        </div>

        <div className="mb-4 text-sm text-gray-300">Moves: {moves} • Time: {time}s</div>

        <div className={`grid gap-3 ${totalPairs<=4 ? 'grid-cols-4' : totalPairs<=6 ? 'grid-cols-6' : 'grid-cols-8'}`}>
          {cards.map((card, idx) => {
            const isFlipped = !!flipped.find((f) => f.id === card.id) || card.matched;
            const isFocused = focusedIndex === idx;
            return (
              <div
                key={card.id}
                onClick={() => handleFlip(card)}
                tabIndex={0}
                className={`w-16 h-16 md:w-20 md:h-20 flex items-center justify-center rounded cursor-pointer select-none text-2xl md:text-3xl ${isFlipped ? 'bg-indigo-500' : 'bg-gray-800 hover:bg-gray-700'} ${isFocused ? 'ring-2 ring-indigo-400' : ''}`}
                onFocus={() => setFocusedIndex(idx)}
              >
                {isFlipped ? card.value : '❓'}
              </div>
            );
          })}
        </div>

        <div className="mt-6">
          {allMatched ? (
            <div className="bg-gray-800 p-4 rounded">
              <div className="text-lg">Finished! Score: {computeScore()}</div>
              <div className="mt-3 flex gap-2">
                <button onClick={submitResult} className="bg-green-600 px-3 py-2 rounded">Submit Result</button>
                <button onClick={restart} className="bg-indigo-600 px-3 py-2 rounded">Play Again</button>
                <button onClick={() => navigate('/patient')} className="bg-gray-600 px-3 py-2 rounded">Back</button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
