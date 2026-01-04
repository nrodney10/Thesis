import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import UnreadBadge from "../components/UnreadBadge";
import { Link } from "react-router-dom";

export default function PatientDashboard() {
  const { authFetch, user, logout, notificationsUnread, messagesUnread } = useAuth();
  const [results, setResults] = useState([]);
  const [visibleCount, setVisibleCount] = useState(6);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [heartRate, setHeartRate] = useState(null);
  const [fallbackHR, setFallbackHR] = useState(null); // last available from prior days
  const [heartRateSource, setHeartRateSource] = useState(null); // live | summary | cached
  const [fitbitStatus, setFitbitStatus] = useState('checking'); // checking | connected | not-connected | error

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
    fetchResults();
    // Poll heart rate every 20s
    let t;
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
              <Link to="/settings" className="block px-3 py-2 rounded hover:bg-gray-700">Settings</Link>
              <button className="w-full text-left px-3 py-2 rounded hover:bg-gray-700 mt-4 text-red-300" onClick={logout}>Logout</button>
            </nav>
          </aside>

          {/* Main content */}
          <main className="col-span-9">
            <div className="bg-gray-800 p-6 rounded shadow">
              <div className="flex justify-between items-center mb-4">
                <h1 className="text-2xl font-bold">Patient Dashboard</h1>
                <div>
                  <span className="mr-4 text-sm text-gray-300">{user?.name}</span>
                </div>
              </div>

              <p className="mb-4 text-gray-300">Welcome — here's a quick snapshot of your recent progress.</p>

              <div className="mb-4 flex flex-col md:flex-row md:items-start md:gap-4">
                <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 md:mb-0">
                  <div className="p-4 bg-gradient-to-br from-indigo-600 to-purple-600 rounded shadow">
                    <div className="text-xs text-white/80">Last score</div>
                    <div className="text-2xl font-bold mt-1 text-white">{results[0]?.score ?? '—'}</div>
                    <div className="text-xs text-white/70 mt-1">{results[0] ? new Date(results[0].createdAt).toLocaleDateString() : ''}</div>
                  </div>
                  <div className="p-4 bg-gray-800 rounded shadow">
                    <div className="text-xs text-gray-300">Avg score (all)</div>
                    <div className="text-2xl font-bold mt-1">{results.length ? Math.round(results.reduce((s, r) => s + (r.score || 0), 0) / results.length) : '—'}</div>
                    <div className="text-xs text-gray-500 mt-1">{results.length} results</div>
                  </div>
                  <div className="p-4 bg-gray-800 rounded shadow">
                    <div className="text-xs text-gray-300">Exercises done</div>
                    <div className="text-2xl font-bold mt-1">{results.filter(r=>r.type==='exercise').length || 0}</div>
                    <div className="text-xs text-gray-500 mt-1">tracked</div>
                  </div>
                  <div className="p-4 bg-gray-800 rounded shadow">
                    <div className="text-xs text-gray-300">Heart rate</div>
                    <div className="text-2xl font-bold mt-1">
                      {fitbitStatus === 'connected'
                        ? displayBpm
                        : fitbitStatus === 'checking'
                          ? '...'
                          : '--'}
                      {fitbitStatus === 'connected' && ' bpm'}
                    </div>
                    <div className="text-xs mt-1">
                      {fitbitStatus === 'connected' && (
                        <>
                          {isStale
                            ? <span className="text-yellow-300">last: {fallbackHR?.bpm ?? heartRate} bpm{fallbackHR?.when ? ` (${fallbackHR.when})` : ''}</span>
                            : heartRate != null
                              ? <span className="text-green-400">live</span>
                              : fallbackHR
                                ? <span className="text-yellow-300">last: {fallbackHR.bpm} bpm ({fallbackHR.when})</span>
                                : <span className="text-gray-400">waiting for sync...</span>}
                          <button onClick={()=>{
                            const t = localStorage.getItem('token') || sessionStorage.getItem('token');
                            const url = `http://localhost:5000/api/fitbit/reset-and-connect?token=${encodeURIComponent(t||'')}`;
                            window.open(url, '_blank');
                          }} className="ml-2 text-indigo-300 underline">Reconnect</button>
                        </>
                      )}
                      {fitbitStatus === 'not-connected' && (
                        <button onClick={()=> {
                          const t = localStorage.getItem('token') || sessionStorage.getItem('token');
                          const url = `http://localhost:5000/api/fitbit/connect?token=${encodeURIComponent(t||'')}`;
                          window.open(url, '_blank');
                        }} className="text-indigo-300 underline">Connect Fitbit</button>
                      )}
                      {fitbitStatus === 'error' && <span className="text-red-400">error</span>}
                      {fitbitStatus === 'checking' && <span className="text-gray-400">checking...</span>}
                    </div>
                  </div>
                </div>

                <div className="flex-1 bg-gray-800 rounded p-3 shadow">
                  <div className="text-sm text-gray-300">Recent trend</div>
                  <div className="mt-2 w-full h-20">
                    {results.length ? (
                      <svg viewBox="0 0 100 20" preserveAspectRatio="none" className="w-full h-full">
                        <polyline
                          fill="none"
                          stroke="#7c3aed"
                          strokeWidth="1.5"
                          points={results.slice(0, 30).map((r, i) => {
                            const x = (i / Math.max(1, Math.min(29, results.length - 1))) * 100;
                            const y = 20 - Math.min(20, ((r.score || 0) / 100) * 20);
                            return `${x},${y}`;
                          }).join(' ')}
                        />
                      </svg>
                    ) : (
                      <div className="text-xs text-gray-500">No data yet — play some games or complete exercises to populate this chart.</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Diagnostics panel for Fitbit removed */}

              {/* Demo result generation removed — use actual exercises/games to produce results */}

              <h2 className="text-lg font-semibold mb-2">Recent Results</h2>
              {loading ? (
                <p>Loading...</p>
              ) : results.length === 0 ? (
                <p className="text-gray-400">No results yet.</p>
              ) : (
                <div>
                  <ul className="space-y-2">
                    {results.slice(0, visibleCount).map((r) => {
                      const isOpen = expandedIds.has(r._id);
                      return (
                        <li key={r._id} className="card result-card flex flex-col">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm text-gray-200 font-medium">{r.title || r.type || 'Result'}</div>
                              <div className="text-xs text-gray-400">{new Date(r.createdAt).toLocaleString()}</div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-sm font-semibold text-white">{r.score ?? '—'}</div>
                              <button
                                onClick={() => {
                                  const s = new Set(expandedIds);
                                  if (s.has(r._id)) s.delete(r._id); else s.add(r._id);
                                  setExpandedIds(s);
                                }}
                                className="text-sm px-2 py-1 rounded bg-gray-800 hover:bg-gray-700"
                              >
                                {isOpen ? 'Hide' : 'Details'}
                              </button>
                            </div>
                          </div>

                          <div className={`collapse mt-2 ${isOpen ? 'open' : ''}`}>
                            <div className="collapse-inner">
                              {r.metadata?.video && (
                                <div className="text-sm text-gray-300 mb-2">Video: <a href={r.metadata.video} target="_blank" rel="noreferrer" className="text-indigo-300 underline">View clip</a></div>
                              )}
                              {r.metadata?.poseMetrics && (
                                <div className="text-sm text-gray-300">
                                  <div>Reps: {r.metadata.poseMetrics.reps ?? 0}</div>
                                  <div>Avg angle: {r.metadata.poseMetrics.avgAngle ? Math.round(r.metadata.poseMetrics.avgAngle) + '°' : '—'}</div>
                                  <div>Cadence: {r.metadata.poseMetrics.cadence ? Math.round(r.metadata.poseMetrics.cadence) + '/min' : '—'}</div>
                                  {r.metadata.poseMetrics.quality && (
                                    <div>Quality: {Array.isArray(r.metadata.poseMetrics.quality) ? r.metadata.poseMetrics.quality.join(', ') : String(r.metadata.poseMetrics.quality)}</div>
                                  )}
                                </div>
                              )}
                              {(!r.metadata?.video && !r.metadata?.poseMetrics) && (
                                <div className="text-sm text-gray-400">No extra details available.</div>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  <div className="mt-3 text-center">
                    {visibleCount < results.length ? (
                      <button
                        onClick={() => setVisibleCount(Math.min(results.length, visibleCount + 6))}
                        className="px-3 py-1 rounded bg-gray-800 hover:bg-gray-700 text-sm"
                      >
                        Load more (+6)
                      </button>
                    ) : results.length > 6 ? (
                      <button
                        onClick={() => { setVisibleCount(6); setExpandedIds(new Set()); }}
                        className="px-3 py-1 rounded bg-gray-800 hover:bg-gray-700 text-sm"
                      >
                        Show less
                      </button>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
