import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import UnreadBadge from "../components/UnreadBadge";
import TrendChart from "../components/TrendChart";
import { Link } from "react-router-dom";

export default function PatientDashboard() {
  const { authFetch, user, logout, notificationsUnread, messagesUnread, refreshProfile } = useAuth();
  const [results, setResults] = useState([]);
  const [visibleCount, setVisibleCount] = useState(6);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [heartRate, setHeartRate] = useState(null);
  const [fallbackHR, setFallbackHR] = useState(null); // last available from prior days
  const [heartRateSource, setHeartRateSource] = useState(null); // live | summary | cached
  const [selectedDateExercise, setSelectedDateExercise] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedDateCognitive, setSelectedDateCognitive] = useState(() => new Date().toISOString().slice(0, 10));
  const [fitbitStatus, setFitbitStatus] = useState('checking'); // checking | connected | not-connected | error
  const maxTrendPoints = 20;

  const fetchResults = async () => {
    setLoading(true);
    try {
      const res = await authFetch("http://localhost:5000/api/results");
      const data = await res.json();
      if (data.success) setResults(data.results || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Ensure we have a fresh user profile (therapist assignment may have changed)
    if (refreshProfile) refreshProfile();
    fetchResults();
    // Poll heart rate every 20s
    let t;
    // (therapist name displayed from `user.therapistName` if available)
    const poll = async () => {
      try {
        // First check connection status
        const statusRes = await authFetch('http://localhost:5000/api/fitbit/me/status');
        const statusData = await statusRes.json();
        if (!statusData.connected) {
          setFitbitStatus('not-connected');
        } else {
          setFitbitStatus('connected');
          // Then fetch latest heart rate
          const hrRes = await authFetch('http://localhost:5000/api/fitbit/me/heart-rate/latest');
          if (hrRes.status === 404) { setHeartRate(null); setHeartRateSource(null); }
          else {
            const hrData = await hrRes.json();
            if (hrData.success) {
              // Preserve previous live value when rate-limited/no new data
              if (hrData.bpm != null) {
                setHeartRate(hrData.bpm);
                setHeartRateSource(hrData.source || null);
                if (hrData.source?.includes('cached') || (hrData.source || '').startsWith('summary')) {
                  setFallbackHR({ bpm: hrData.bpm, when: hrData.time || 'today' });
                }
              } else if (!hrData.rateLimited) {
                // only clear if not rate limited; otherwise keep last shown value
                setHeartRate(null);
                setHeartRateSource(hrData.source || null);
              }
            }
          }
          // If still null, try last-available once to show something
          if (!heartRate) {
            try {
              const laRes = await authFetch('http://localhost:5000/api/fitbit/me/heart-rate/last-available');
              const la = await laRes.json();
              if (la.success && la.found) {
                setFallbackHR({ bpm: la.found.bpm, when: `${la.found.date || 'recent'} ${la.found.time || ''}`.trim() });
                setHeartRateSource((s) => s || la.found.source || 'last-available');
              }
            } catch (_) {}
          }
        }
      } catch (e) { setFitbitStatus('error'); }
      t = setTimeout(poll, 20000);
    };
    poll();
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  

  const displayBpm = heartRate ?? fallbackHR?.bpm ?? '--';
  const isStale = (heartRateSource && heartRateSource.includes('cached')) || (heartRateSource || '').startsWith('summary') || (!heartRate && !!fallbackHR);

  

  return (
    <div className="min-h-screen p-8 bg-gray-900 text-gray-100">
      <div className="max-w-6xl mx-auto bg-transparent">
        <div className="grid grid-cols-12 gap-6">
          {/* Sidebar */}
          <aside className="col-span-3 bg-gray-800 p-4 rounded shadow-inner">
            <div className="mb-6 text-center">
              <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-green-600 to-teal-500 flex items-center justify-center text-xl font-bold">PT</div>
              <div className="mt-3 text-sm">{user?.name}</div>
              <div className="text-xs text-gray-400">Patient</div>
            </div>
            <nav className="space-y-2 text-sm">
              <Link to="/patient" className="block px-3 py-2 rounded bg-gradient-to-r from-green-600 to-teal-500">Dashboard</Link>
              <Link to="/games" className="block px-3 py-2 rounded hover:bg-gray-700">Games</Link>
              <Link to="/exercises" className="block px-3 py-2 rounded hover:bg-gray-700">Exercises</Link>
              <Link to="/calendar" className="block px-3 py-2 rounded hover:bg-gray-700">Calendar</Link>
              <Link to="/reports" className="block px-3 py-2 rounded hover:bg-gray-700">Reports</Link>
              <Link to="/notifications" className="flex items-center px-3 py-2 rounded hover:bg-gray-700">
                <span>Notifications</span>
                <UnreadBadge count={notificationsUnread} />
              </Link>
              <Link to="/messages" className="flex items-center px-3 py-2 rounded hover:bg-gray-700">
                <span>Messages</span>
                <UnreadBadge count={messagesUnread} />
              </Link>
              <Link to="/results" className="block px-3 py-2 rounded hover:bg-gray-700">Results</Link>
              <Link to="/settings" className="block px-3 py-2 rounded hover:bg-gray-700">Settings</Link>
              <button className="w-full text-left px-3 py-2 rounded hover:bg-gray-700 mt-4 text-red-300" onClick={logout}>Logout</button>
            </nav>
          </aside>

          {/* Main content */}
          <main className="col-span-9">
            <div className="bg-gray-800 p-6 rounded shadow">
              <div className="flex justify-between items-center mb-4">
                <h1 className="text-2xl font-bold">Patient Dashboard</h1>
                <div className="text-right">
                  <div className="mr-0 text-sm text-gray-100">{user?.name}</div>
                  <div className="mt-1 text-xs text-gray-200 bg-gray-800/50 inline-block px-3 py-1 rounded">Therapist: {user?.therapistName || 'None'}</div>
                </div>
              </div>

              <p className="mb-4 muted">Welcome — here's a quick snapshot of your recent progress.</p>

              <div className="mb-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                  <div className="p-4 bg-gradient-to-br from-indigo-600 to-purple-600 rounded shadow">
                    <div className="text-xs text-white/80">Last score</div>
                    <div className="text-2xl font-bold mt-1 text-white">{results[0]?.score ?? '--'}</div>
                    <div className="text-xs text-white/70 mt-1">{results[0] ? new Date(results[0].createdAt).toLocaleDateString() : ''}</div>
                  </div>
                  <div className="p-4 bg-gray-800 rounded shadow">
                    <div className="text-xs text-gray-300">Avg score (all)</div>
                    <div className="text-2xl font-bold mt-1">{results.length ? Math.round(results.reduce((s, r) => s + (r.score || 0), 0) / results.length) : '—'}</div>
                    <div className="text-xs text-gray-500 mt-1">{results.length} results</div>
                  </div>
                  <div className="p-4 bg-gray-800 rounded shadow">
                    <div className="text-xs text-gray-300">Exercises done</div>
                    <div className="text-2xl font-bold mt-1">{results.filter(r => r.type === 'exercise').length || 0}</div>
                    <div className="text-xs text-gray-500 mt-1">tracked</div>
                  </div>
                  <div className="p-4 bg-gray-800 rounded shadow">
                    <div className="text-xs text-gray-300">Heart rate</div>
                    <div className="text-2xl font-bold mt-1">
                      {fitbitStatus === 'connected' ? `${displayBpm} bpm` : fitbitStatus === 'checking' ? '...' : '--'}
                    </div>
                    <div className="text-xs mt-1 text-gray-300">
                      {fitbitStatus === 'connected' && (
                        <span>{isStale ? `Last: ${fallbackHR?.when ?? 'recent'} (stale)` : ''}</span>
                      )}
                      {fitbitStatus === 'not-connected' && (
                        <div>
                          <button onClick={() => {
                            const t = localStorage.getItem('token') || sessionStorage.getItem('token');
                            const url = `http://localhost:5000/api/fitbit/connect?token=${encodeURIComponent(t || '')}`;
                            window.open(url, '_blank');
                          }} className="text-indigo-300 underline">Connect Fitbit</button>
                        </div>
                      )}
                      {fitbitStatus === 'error' && <span className="text-red-400">error</span>}
                      {fitbitStatus === 'checking' && <span className="text-gray-400">checking...</span>}
                    </div>
                  </div>
                </div>

                <div className="bg-gray-800 rounded p-4 shadow">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm text-gray-200">Recent trends</div>
                  </div>

                  <div className="space-y-6">
                    <div className="rounded-lg overflow-hidden">
                      <div className="bg-gray-800 p-3 flex items-center justify-between">
                        <div className="text-sm text-gray-200 font-semibold">Exercise scores</div>
                        <div className="flex items-center gap-3">
                          <label className="text-xs text-gray-300">Date</label>
                          <input type="date" value={selectedDateExercise} onChange={(e)=>setSelectedDateExercise(e.target.value)} className="bg-gray-700 text-sm text-gray-100 px-2 py-1 rounded" />
                        </div>
                      </div>
                      <TrendChart label="Exercise scores" color="#7c3aed" data={results} types={["exercise", "physical"]} limit={60} height={320} yLabel="Score" showHeader={true} />
                      <div className="p-3 text-xs text-gray-300">
                        {(() => {
                          const day = selectedDateExercise;
                          const filtered = results.filter(r => r.createdAt && new Date(r.createdAt).toISOString().slice(0,10) === day && (r.type === 'exercise' || r.type === 'physical'));
                          if (filtered.length === 0) return (<div>No exercises on {day}.</div>);
                          const avg = Math.round((filtered.reduce((s, r) => s + (r.score || 0), 0) / filtered.length) || 0);
                          return (<div>Items: {filtered.length} • Avg: {avg}
                            <div className="mt-2">{filtered.map(fr => (<div key={fr._id} className="text-xs text-gray-200"><span className="font-semibold">{fr.title || fr.type}</span><span className="ml-2">{fr.score ?? '--'} pts</span><span className="ml-2 text-gray-400">{new Date(fr.createdAt).toLocaleTimeString()}</span></div>))}</div>
                          </div>);
                        })()}
                      </div>
                    </div>
                    <div className="rounded-lg overflow-hidden">
                      <div className="bg-gray-800 p-3 flex items-center justify-between">
                        <div className="text-sm text-gray-200 font-semibold">Cognitive game scores</div>
                        <div className="flex items-center gap-3">
                          <label className="text-xs text-gray-300">Date</label>
                          <input type="date" value={selectedDateCognitive} onChange={(e)=>setSelectedDateCognitive(e.target.value)} className="bg-gray-700 text-sm text-gray-100 px-2 py-1 rounded" />
                        </div>
                      </div>
                      <TrendChart label="Cognitive game scores" color="#22c55e" data={results} types={["game", "cognitive"]} limit={60} height={320} yLabel="Score" showHeader={true} />
                      <div className="p-3 text-xs text-gray-300">
                        {(() => {
                          const day = selectedDateCognitive;
                          const filtered = results.filter(r => r.createdAt && new Date(r.createdAt).toISOString().slice(0,10) === day && (r.type === 'game' || r.type === 'cognitive'));
                          if (filtered.length === 0) return (<div>No cognitive games on {day}.</div>);
                          const avg = Math.round((filtered.reduce((s, r) => s + (r.score || 0), 0) / filtered.length) || 0);
                          return (<div>Items: {filtered.length} • Avg: {avg}
                            <div className="mt-2">{filtered.map(fr => (<div key={fr._id} className="text-xs text-gray-200"><span className="font-semibold">{fr.title || fr.type}</span><span className="ml-2">{fr.score ?? '--'} pts</span><span className="ml-2 text-gray-400">{new Date(fr.createdAt).toLocaleTimeString()}</span></div>))}</div>
                          </div>);
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Diagnostics panel for Fitbit removed */}

              {/* Demo result generation removed — use actual exercises/games to produce results */}

              {/* Recent results moved to /results page */}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}






