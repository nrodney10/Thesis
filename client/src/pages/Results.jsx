import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Link, useLocation } from "react-router-dom";
import UnreadBadge from "../components/UnreadBadge";

export default function Results() {
  const { authFetch, messagesUnread, notificationsUnread, user } = useAuth();
  const [results, setResults] = useState([]);
  const [activities, setActivities] = useState([]);
  const [activitiesError, setActivitiesError] = useState(null);
  const [visibleCount, setVisibleCount] = useState(6);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const location = useLocation();

  const query = new URLSearchParams(location.search);
  const userId = query.get('userId');
  const prefetched = location.state || {};
  const [patientName, setPatientName] = useState(null);

  const fetchResults = React.useCallback(async () => {
    setLoading(true);
    try {
      const url = userId ? `http://localhost:5000/api/results?userId=${encodeURIComponent(userId)}` : `http://localhost:5000/api/results`;
      const res = await authFetch(url);
      const data = await res.json();
      if (data.success) {
        const list = data.results || [];
        const uniq = (() => {
          const seen = new Set();
          return list.filter(r => {
            const id = r._id || r.id;
            if (!id) return false;
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
          });
        })();
        setResults(uniq);
        if (userId) setVisibleCount(uniq.length);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [authFetch, userId]);

  const fetchActivities = React.useCallback(async () => {
    try {
      setActivitiesError(null);
      if (!user) return;
      let url;
      if (user.role === 'patient') url = `http://localhost:5000/api/calendar/patient`;
      else if (user.role === 'therapist' && userId) url = `http://localhost:5000/api/calendar/patient/${encodeURIComponent(userId)}`;
      else if (user.role === 'therapist') url = `http://localhost:5000/api/calendar/therapist`;
      else return;

      console.debug('Fetching activities from', url);
      const r = await authFetch(url);
      let j;
      try {
        j = await r.json();
      } catch (e) {
        const text = await r.text();
        console.error('Non-JSON response from activities endpoint', r.status, text);
        setActivitiesError(`Server returned ${r.status}`);
        return;
      }
      if (!r.ok) {
        console.error('Activities fetch failed', r.status, j);
        setActivitiesError(j && j.error ? String(j.error) : `Status ${r.status}`);
        return;
      }
      if (j && j.success) {
        setActivities(j.items || []);
      } else {
        console.warn('Activities fetch returned no success', j);
        setActivitiesError(j && j.error ? String(j.error) : 'No activities');
      }
    } catch (e) {
      console.error('fetchActivities error', e);
      setActivitiesError(String(e));
    }
  }, [authFetch, user, userId]);

  useEffect(() => {
    if (prefetched.prefetchedResults) {
      const list = prefetched.prefetchedResults || [];
      const seen = new Set();
      const uniq = list.filter(r => {
        const id = r._id || r.id;
        if (!id) return false;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      setResults(uniq);
      if (userId) setVisibleCount(uniq.length);
    } else {
      fetchResults();
    }

    const fetchPatientName = async () => {
      try {
        if (!userId) return;
        if (prefetched.prefetchedPatientName) {
          setPatientName(prefetched.prefetchedPatientName);
          return;
        }
        const r = await authFetch(`http://localhost:5000/api/patients/${encodeURIComponent(userId)}`);
        if (!r.ok) return;
        const j = await r.json();
        if (j && j.success && j.patient) setPatientName(j.patient.name || null);
      } catch (e) { }
    };
    fetchPatientName();
  }, [location.search, fetchResults, authFetch, prefetched.prefetchedPatientName, prefetched.prefetchedResults, userId]);

  useEffect(() => {
    if (prefetched.prefetchedActivities) {
      const list = prefetched.prefetchedActivities || [];
      const seen = new Set();
      const uniq = list.filter(a => {
        const id = a.id || a._id;
        if (!id) return false;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      setActivities(uniq);
    } else {
      fetchActivities();
    }
  }, [user, userId, fetchActivities, prefetched.prefetchedActivities]);

  return (
    <div className="min-h-screen p-8 bg-gray-900 text-gray-100">
      <div className="max-w-4xl mx-auto bg-transparent">
        <div className="bg-gray-800 p-6 rounded shadow">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-bold">{userId ? `Results for ${patientName || userId}` : 'Recent Results'}</h1>
            <div className="flex items-center gap-3">
              <Link to="/notifications" className="text-sm">Notifications <UnreadBadge count={notificationsUnread} /></Link>
              <Link to="/messages" className="text-sm">Messages <UnreadBadge count={messagesUnread} /></Link>
            </div>
          </div>

          {loading ? (
            <p>Loading...</p>
          ) : (
            <>
              <div className="text-xs text-gray-400 mt-2">Activities: {activities.length}{activitiesError ? ` • Error: ${activitiesError}` : ''}</div>

              {results.length === 0 ? (
                <p className="text-gray-400">No results yet.</p>
              ) : (
                <div>
                  <ul className="space-y-2">
                    {results.slice(0, visibleCount).map((r) => {
                      const meta = r.metadata || {};
                      const poseMetrics = meta.poseMetrics;
                      const gameKey = String(meta.gameKey || '').toLowerCase();
                      const gameLabel = gameKey === 'memory' ? 'Memory Match' : gameKey === 'stroop' ? 'Stroop Test' : (gameKey ? gameKey : null);
                      const poseType = String(meta.poseType || '').toLowerCase();
                      const poseLabel = poseType === 'tpose' ? 'T-pose' : poseType === 'squat' ? 'Squat' : (poseType ? poseType : null);
                      const title = meta.exerciseTitle || gameLabel || r.title || r.type || 'Result';
                      const detailRows = [];
                      const addRow = (label, value) => {
                        if (value === null || value === undefined) return;
                        if (typeof value === 'string' && value.trim() === '') return;
                        detailRows.push({ label, value });
                      };
                      addRow('Type', r.type);
                      addRow('Game', gameLabel);
                      addRow('Pose', poseLabel);
                      addRow('Score', r.score);
                      addRow('Difficulty', meta.difficulty);
                      addRow('Duration', meta.duration != null ? `${meta.duration}s` : null);
                      addRow('Reps', meta.reps);
                      addRow('Heart rate', meta.heartRate != null ? `${meta.heartRate} bpm` : null);
                      addRow('Moves', meta.moves);
                      addRow('Time', meta.timeSeconds != null ? `${meta.timeSeconds}s` : null);
                      addRow('Avg reaction time', meta.avgRTms != null ? `${meta.avgRTms} ms` : null);
                      addRow('Trials', meta.trials);
                      if (poseMetrics) {
                        addRow('Pose reps', poseMetrics.reps ?? 0);
                        addRow('Avg angle', poseMetrics.avgAngle != null ? `${Math.round(poseMetrics.avgAngle)} deg` : null);
                        addRow('Cadence', poseMetrics.cadence != null ? `${Math.round(poseMetrics.cadence)}/min` : null);
                        if (poseType === 'tpose') {
                          addRow('Time in correct pose', poseMetrics.timeInTargetMs != null ? `${(poseMetrics.timeInTargetMs / 1000).toFixed(1)} s` : '0 s');
                          addRow('Out of range count', poseMetrics.outOfRangeCount ?? 0);
                        }
                        if (poseType === 'squat') {
                          addRow('Correct squats', poseMetrics.correctReps ?? 0);
                          addRow('Incorrect squats', poseMetrics.incorrectReps ?? 0);
                        }
                        if (!poseType && (poseMetrics.correctReps != null || poseMetrics.incorrectReps != null)) {
                          addRow('Correct squats', poseMetrics.correctReps ?? 0);
                          addRow('Incorrect squats', poseMetrics.incorrectReps ?? 0);
                        }
                        if (poseMetrics.quality) {
                          addRow('Quality', Array.isArray(poseMetrics.quality) ? poseMetrics.quality.join(', ') : String(poseMetrics.quality));
                        }
                      }
                      const hasDetails = detailRows.length > 0;
                      const isOpen = expandedIds.has(r._id);
                      return (
                        <li key={r._id} className="card result-card flex flex-col bg-gray-900 p-3 rounded">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm text-gray-200 font-medium">{title}</div>
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
                              {hasDetails ? (
                                <div className="text-sm text-gray-300 space-y-1">
                                  {detailRows.map((row, idx) => (
                                    <div key={`${row.label}-${idx}`}>{row.label}: {row.value}</div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-sm text-gray-400">No stats recorded for this session yet.</div>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
