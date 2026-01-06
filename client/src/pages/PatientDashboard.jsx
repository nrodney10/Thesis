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
  const [therapists, setTherapists] = useState([]);
  const [selectedTherapist, setSelectedTherapist] = useState('');
  const [therapistRequestStatus, setTherapistRequestStatus] = useState('');
  const [currentTherapistName, setCurrentTherapistName] = useState('');
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
    fetchResults();
    fetchTherapists();
    if (user?.therapistId) {
      (async () => {
        try {
          const r = await authFetch(`/api/user/therapists`);
        } catch (_) {}
      })();
    }
    // Poll heart rate every 20s
    let t;
    // Fetch therapist name if available
    if (user?.therapistId && therapists.length) {
      const t = therapists.find(x => String(x._id) === String(user.therapistId));
      if (t) setCurrentTherapistName(t.name);
      else setCurrentTherapistName('');
    } else {
      setCurrentTherapistName('');
    }
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

  const fetchTherapists = async () => {
    try {
      const res = await authFetch('http://localhost:5000/api/patients/therapists');
      const j = await res.json();
      if (j.success) setTherapists(j.therapists || []);
    } catch (e) { console.error('fetch therapists', e); }
  };

  const displayBpm = heartRate ?? fallbackHR?.bpm ?? '--';
  const isStale = (heartRateSource && heartRateSource.includes('cached')) || (heartRateSource || '').startsWith('summary') || (!heartRate && !!fallbackHR);

  const buildTrend = (allResults, types = [], limit = 20) => {
    const filtered = Array.isArray(allResults)
      ? allResults.filter(r => types.includes((r.type || '').toLowerCase()) && typeof r.score === 'number')
      : [];
    const slice = filtered.slice(0, limit).reverse(); // oldest to newest
    if (!slice.length) return [];
    return slice.map((r, idx) => {
      const x = (idx / Math.max(1, slice.length - 1)) * 100;
      const score = Math.min(100, Math.max(0, r.score));
      const d = r.createdAt ? new Date(r.createdAt) : null;
      const label = d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : (r.title || r.type || 'Result');
      return { x, score, label };
    });
  };

  const TrendCard = ({ label, color, points }) => {
    const ticks = [0, 25, 50, 75, 100];
    const idSafe = label.replace(/\s+/g, '-').toLowerCase();
    const xLabels = points.length >= 3
      ? [points[0].label, points[Math.floor(points.length / 2)].label, points[points.length - 1].label]
      : points.map(p => p.label);
    const chartHeight = 60;
    const toY = (score) => chartHeight - (score / 100) * chartHeight;
    return (
      <div className="bg-gray-900 rounded p-3 border border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm text-gray-300">{label}</div>
          <div className="text-[11px] text-gray-400">{points.length ? `${points.length} pts` : 'No data'}</div>
        </div>
        <div className="w-full h-32">
          {points.length ? (
            <svg viewBox="0 0 110 80" preserveAspectRatio="none" className="w-full h-full">
              <defs>
                <linearGradient id={`grad-${idSafe}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity="0.15" />
                  <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
              </defs>
              {/* Grid */}
              {ticks.map(t => {
                const y = toY(t);
                return <line key={t} x1="0" y1={y} x2="100" y2={y} stroke="#374151" strokeWidth="0.3" />;
              })}
              {/* Axis labels (Y) */}
              {ticks.map(t => {
                const y = toY(t);
                return <text key={`y-${t}`} x="104" y={y + 2} fontSize="4" fill="#9CA3AF" textAnchor="start">{t}</text>;
              })}
              {/* Area & Line */}
              <polygon
                fill={`url(#grad-${idSafe})`}
                points={`${points.map(p=>`${p.x},${toY(p.score)}`).join(' ')} 100,${chartHeight} 0,${chartHeight}`}
              />
              <polyline
                fill="none"
                stroke={color}
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={points.map(p => `${p.x},${toY(p.score)}`).join(' ')}
              />
              {/* Dots */}
              {points.map((p, i) => (
                <circle key={i} cx={p.x} cy={toY(p.score)} r="1.2" fill={color} />
              ))}
              {/* X labels (first, middle, last) */}
              {xLabels.map((lbl, idx) => {
                const px = idx === 0 ? 0 : idx === 1 ? 50 : 100;
                return <text key={`x-${idx}`} x={px} y="78" fontSize="4" fill="#9CA3AF" textAnchor={idx === 0 ? 'start' : idx === 1 ? 'middle' : 'end'}>{lbl}</text>;
              })}
            </svg>
          ) : (
            <div className="text-xs text-gray-500">No data yet -- complete an activity to populate this chart.</div>
          )}
        </div>
      </div>
    );
  };

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

              <p className="mb-4 text-gray-300">Welcome -- here's a quick snapshot of your recent progress.</p>

              <div className="mb-4 flex flex-col md:flex-row md:items-start md:gap-4">
                <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 md:mb-0">
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

                <div className="flex-1 bg-gray-800 rounded p-3 shadow space-y-3">
                  <div className="text-sm text-gray-300">Recent trends</div>
                  <TrendCard label="Exercise scores" color="#7c3aed" points={buildTrend(results, ['exercise','physical'], maxTrendPoints)} />
                  <TrendCard label="Cognitive game scores" color="#22c55e" points={buildTrend(results, ['game','cognitive'], maxTrendPoints)} />
                  <div className="mt-3 p-3 bg-gray-900 rounded">
                    <div className="text-sm text-gray-300 mb-2">Therapist</div>
                    <div className="text-sm text-gray-200">{user?.therapistId ? (user.therapistName || 'Assigned therapist') : 'No therapist assigned'}</div>
                      <div className="text-sm text-gray-200">{currentTherapistName || 'No therapist assigned'}</div>
                    <div className="mt-3">
                      <select className="bg-gray-800 text-sm p-2 rounded w-full" value={selectedTherapist} onChange={(e)=>setSelectedTherapist(e.target.value)}>
                        <option value="">Select a therapist to request</option>
                        {therapists.map(t => <option key={t._id} value={t._id}>{t.name} — {t.email}</option>)}
                      </select>
                      <div className="mt-2 flex gap-2">
                        <button className="px-3 py-2 bg-green-600 rounded text-sm" onClick={async ()=>{
                          if (!selectedTherapist) return setTherapistRequestStatus('Pick a therapist');
                          setTherapistRequestStatus('Sending request...');
                          try {
                            const r = await authFetch(`http://localhost:5000/api/patients/therapists/${selectedTherapist}/request`, { method: 'POST' });
                            const j = await r.json();
                            if (j.success) setTherapistRequestStatus('Request sent'); else setTherapistRequestStatus(j.message || 'Failed');
                          } catch (e) { setTherapistRequestStatus('Error sending request'); }
                        }}>Request</button>
                        <button className="px-3 py-2 bg-gray-700 rounded text-sm" onClick={()=>{ setSelectedTherapist(''); setTherapistRequestStatus(''); }}>Clear</button>
                      </div>
                      {therapistRequestStatus && <div className="text-xs text-gray-400 mt-2">{therapistRequestStatus}</div>}
                    </div>
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
                              <div className="text-sm font-semibold text-white">{r.score ?? '--'}</div>
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
                                  <div>Avg angle: {r.metadata.poseMetrics.avgAngle ? Math.round(r.metadata.poseMetrics.avgAngle) + ' deg' : '—'}</div>
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






