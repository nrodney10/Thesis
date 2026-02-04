import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const PERIOD_OPTIONS = [
  { value: '7', label: 'Last 7 days', days: 7 },
  { value: '30', label: 'Last 30 days', days: 30 },
  { value: 'all', label: 'All time', days: null }
];

const toDate = (value) => (value ? new Date(value) : null);
const fmtDate = (value) => {
  const d = toDate(value);
  return d ? d.toLocaleDateString() : '--';
};
const fmtTime = (value) => {
  const d = toDate(value);
  return d ? d.toLocaleTimeString() : '--';
};
const fmtDateTime = (value) => {
  const d = toDate(value);
  return d ? d.toLocaleString() : '--';
};
const safeFilename = (value) => String(value || 'report')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/(^-|-$)/g, '');

const inferPoseType = (r) => {
  const meta = r?.metadata || {};
  const pose = String(meta.poseType || meta.poseMetrics?.poseType || '').toLowerCase();
  if (pose) return pose;
  const title = String(meta.exerciseTitle || r.title || '').toLowerCase();
  if (title.includes('tpose') || title.includes('t-pose') || title.includes('t pose')) return 'tpose';
  if (title.includes('squat')) return 'squat';
  return '';
};

const labelForGame = (gameKey) => {
  const key = String(gameKey || '').toLowerCase();
  if (key === 'memory') return 'Memory Match';
  if (key === 'stroop') return 'Stroop Test';
  return key || null;
};

const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

export default function Reports() {
  const { authFetch, user } = useAuth();
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  const queryUserId = query.get('userId') || '';

  const [period, setPeriod] = useState('7');
  const [patients, setPatients] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState(queryUserId);
  const [patientInfo, setPatientInfo] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) return;
    if (user.role === 'therapist') {
      const loadPatients = async () => {
        try {
          const r = await authFetch('http://localhost:5000/api/patients');
          const j = await r.json();
          if (j.success) setPatients(j.patients || []);
        } catch (e) { /* ignore */ }
      };
      loadPatients();
    }
  }, [authFetch, user]);

  useEffect(() => {
    if (queryUserId) setSelectedPatientId(queryUserId);
  }, [queryUserId]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        if (user.role === 'therapist') {
          if (!selectedPatientId) {
            setResults([]);
            setPatientInfo(null);
            return;
          }
          const [resResults, resPatient] = await Promise.all([
            authFetch(`http://localhost:5000/api/results?userId=${encodeURIComponent(selectedPatientId)}`),
            authFetch(`http://localhost:5000/api/patients/${encodeURIComponent(selectedPatientId)}`)
          ]);
          const resultsJson = await resResults.json();
          const patientJson = await resPatient.json();
          setResults(resultsJson.success ? (resultsJson.results || []) : []);
          setPatientInfo(patientJson.success ? patientJson.patient : null);
        } else {
          const resResults = await authFetch('http://localhost:5000/api/results');
          const resultsJson = await resResults.json();
          setResults(resultsJson.success ? (resultsJson.results || []) : []);
          setPatientInfo(user);
        }
      } catch (e) {
        setError('Failed to load report data.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [authFetch, selectedPatientId, user]);

  useEffect(() => {
    if (user?.role === 'patient') {
      setPatientInfo(user);
    }
  }, [user]);

  const periodMeta = PERIOD_OPTIONS.find((p) => p.value === period) || PERIOD_OPTIONS[0];
  const filteredResults = useMemo(() => {
    if (!results.length) return [];
    if (!periodMeta.days) return results;
    const since = new Date();
    since.setDate(since.getDate() - periodMeta.days);
    return results.filter((r) => toDate(r.createdAt) >= since);
  }, [results, periodMeta.days]);

  const lastActivity = useMemo(() => {
    if (!results.length) return null;
    const sorted = [...results].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return sorted[0]?.createdAt || null;
  }, [results]);

  const cognitiveResults = filteredResults.filter((r) => r.type === 'cognitive');
  const physicalResults = filteredResults.filter((r) => r.type === 'physical');
  const tposeResults = physicalResults.filter((r) => inferPoseType(r) === 'tpose');
  const squatResults = physicalResults.filter((r) => inferPoseType(r) === 'squat');
  const tposeResultsSorted = useMemo(
    () => [...tposeResults].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [tposeResults]
  );

  const cognitiveScores = cognitiveResults.map((r) => r.score).filter((v) => Number.isFinite(v));
  const avgCognitiveScore = cognitiveScores.length ? Math.round(avg(cognitiveScores)) : null;
  const bestCognitiveScore = cognitiveScores.length ? Math.max(...cognitiveScores) : null;
  const latestCognitiveScore = (() => {
    if (!cognitiveResults.length) return null;
    const sorted = [...cognitiveResults].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return sorted[0]?.score ?? null;
  })();

  const tposeTimes = tposeResultsSorted.map((r) => (r.metadata?.poseMetrics?.timeInTargetMs || 0) / 1000);
  const tposeBreaks = tposeResultsSorted.map((r) => r.metadata?.poseMetrics?.outOfRangeCount || 0);
  const avgTposeTime = tposeTimes.length ? avg(tposeTimes) : 0;
  const avgTposeBreaks = tposeBreaks.length ? avg(tposeBreaks) : 0;
  const bestTposeTime = tposeTimes.length ? Math.max(...tposeTimes) : 0;

  const totalSquatCorrect = squatResults.reduce((sum, r) => sum + (r.metadata?.poseMetrics?.correctReps || 0), 0);
  const totalSquatIncorrect = squatResults.reduce((sum, r) => sum + (r.metadata?.poseMetrics?.incorrectReps || 0), 0);
  const totalSquatReps = totalSquatCorrect + totalSquatIncorrect;
  const squatAccuracy = totalSquatReps > 0 ? Math.round((totalSquatCorrect / totalSquatReps) * 100) : 0;

  const insights = useMemo(() => {
    const notes = [];
    if (tposeTimes.length >= 3) {
      const recent = tposeTimes.slice(0, 3);
      const prev = tposeTimes.slice(3, 6);
      if (prev.length) {
        const recentAvg = avg(recent);
        const prevAvg = avg(prev);
        if (recentAvg > prevAvg * 1.08) notes.push('Posture stability improved over last 3 sessions.');
        else if (recentAvg < prevAvg * 0.92) notes.push('Posture stability declined compared to previous sessions.');
      }
    }
    if (squatResults.length >= 2) {
      const sorted = [...squatResults].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const latest = sorted[0];
      const latestIncorrect = latest.metadata?.poseMetrics?.incorrectReps || 0;
      const priorIncorrectAvg = avg(sorted.slice(1, 4).map((r) => r.metadata?.poseMetrics?.incorrectReps || 0));
      if (latestIncorrect > priorIncorrectAvg && latestIncorrect > 0) {
        notes.push('Increased squat errors detected in latest session.');
      }
    }
    return notes;
  }, [tposeTimes, squatResults]);

  const sessionRows = useMemo(() => {
    return [...filteredResults]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map((r) => {
        const meta = r.metadata || {};
        const poseType = inferPoseType(r);
        const gameLabel = labelForGame(meta.gameKey);
        const exerciseLabel = meta.exerciseTitle || gameLabel || r.title || r.type || 'Session';
        let keyResult = '--';
        if (poseType === 'tpose') {
          const sec = Math.round(((meta.poseMetrics?.timeInTargetMs || 0) / 1000));
          const breaks = meta.poseMetrics?.outOfRangeCount ?? 0;
          keyResult = `${sec} s / ${breaks} breaks`;
        } else if (poseType === 'squat') {
          const correct = meta.poseMetrics?.correctReps || 0;
          const incorrect = meta.poseMetrics?.incorrectReps || 0;
          const total = correct + incorrect;
          keyResult = `${correct}/${total} correct`;
        } else if (r.type === 'cognitive') {
          const score = r.score ?? '--';
          if (String(meta.gameKey || '').toLowerCase() === 'stroop' && meta.avgRTms != null) {
            keyResult = `Score ${score} - Avg RT ${meta.avgRTms} ms`;
          } else if (String(meta.gameKey || '').toLowerCase() === 'memory' && meta.moves != null) {
            keyResult = `Score ${score} - ${meta.moves} moves`;
          } else {
            keyResult = `Score ${score}`;
          }
        } else if (r.score != null) {
          keyResult = `Score ${r.score}`;
        }
        return {
          id: r._id || r.id,
          date: fmtDate(r.createdAt),
          time: fmtTime(r.createdAt),
          exercise: exerciseLabel,
          keyResult,
          status: 'Completed'
        };
      });
  }, [filteredResults]);

  const therapistName = user?.role === 'therapist' ? (user?.name || 'Therapist') : (patientInfo?.therapistName || null);
  const patientName = patientInfo?.name || (user?.name || 'Patient');
  const patientAge = patientInfo?.age != null ? patientInfo.age : '--';

  const reportTitle = `${patientName} - Patient Report`;
  const reportPeriodLabel = periodMeta.label;
  const baseFilename = `${safeFilename(patientName)}-${safeFilename(reportPeriodLabel) || 'report'}`;

  const buildReportHtml = () => {
    const summaryRows = [
      ['Patient', patientName],
      ['Age', patientAge],
      ['Report period', reportPeriodLabel],
      ['Last activity', lastActivity ? fmtDateTime(lastActivity) : '--'],
      ['Therapist', therapistName || 'Not assigned']
    ];
    const cognitiveRows = [
      ['Total cognitive sessions', cognitiveResults.length],
      ['Average cognitive score', avgCognitiveScore != null ? avgCognitiveScore : '--'],
      ['Best cognitive score', bestCognitiveScore != null ? bestCognitiveScore : '--'],
      ['Latest cognitive score', latestCognitiveScore != null ? latestCognitiveScore : '--']
    ];
    const tposeRows = [
      ['Total T-pose sessions', tposeResults.length],
      ['Average correct pose duration (s)', Math.round(avgTposeTime)],
      ['Average posture deviations', Math.round(avgTposeBreaks)],
      ['Best session time in pose (s)', Math.round(bestTposeTime)]
    ];
    const squatRows = [
      ['Total squat sessions', squatResults.length],
      ['Squat accuracy', `${squatAccuracy}%`],
      ['Total correct squats', totalSquatCorrect],
      ['Total incorrect squats', totalSquatIncorrect]
    ];
    const sessionRowsHtml = sessionRows.map((row) => `
      <tr>
        <td>${row.date}</td>
        <td>${row.time}</td>
        <td>${row.exercise}</td>
        <td>${row.keyResult}</td>
        <td>${row.status}</td>
      </tr>
    `).join('');

    const table = (title, rows) => `
      <h3>${title}</h3>
      <table>
        <tbody>
          ${rows.map((r) => `<tr><th>${r[0]}</th><td>${r[1]}</td></tr>`).join('')}
        </tbody>
      </table>
    `;

    return `
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${reportTitle}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
            h1 { font-size: 22px; margin-bottom: 8px; }
            h2 { font-size: 16px; margin-top: 24px; }
            h3 { font-size: 14px; margin-top: 16px; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; }
            th, td { border: 1px solid #e2e8f0; padding: 6px 8px; font-size: 12px; text-align: left; }
            th { background: #f8fafc; width: 40%; }
            .note { font-size: 12px; color: #475569; margin-top: 6px; }
          </style>
        </head>
        <body>
          <h1>${reportTitle}</h1>
          <div class="note">Generated ${new Date().toLocaleString()}</div>
          ${table('Patient Overview', summaryRows)}
          ${table('Cognitive Rehabilitation Summary', cognitiveRows)}
          ${table('T-Pose Exercise Summary', tposeRows)}
          ${table('Squat Exercise Summary', squatRows)}
          <h2>Exercise Session Log</h2>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Time</th>
                <th>Exercise</th>
                <th>Key Result</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${sessionRowsHtml || '<tr><td colspan="5">No sessions found for this period.</td></tr>'}
            </tbody>
          </table>
        </body>
      </html>
    `;
  };

  const downloadExcel = () => {
    const html = buildReportHtml();
    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseFilename || 'patient-report'}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPdf = () => {
    const html = buildReportHtml();
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  };

  return (
    <main className="min-h-screen p-8 bg-gray-900 text-gray-100">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="bg-gray-800 p-6 rounded shadow">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">Patient Report</h1>
              <p className="text-sm text-gray-300">Clinical summary of rehabilitation performance and history.</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-sm text-gray-300">Report period</label>
              <select value={period} onChange={(e) => setPeriod(e.target.value)} className="bg-gray-700 p-2 rounded text-sm">
                {PERIOD_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              <button onClick={downloadExcel} className="bg-green-600 px-3 py-2 rounded text-sm">Download Excel</button>
              <button onClick={downloadPdf} className="bg-indigo-600 px-3 py-2 rounded text-sm">Download PDF</button>
            </div>
          </div>

          {user?.role === 'therapist' && (
            <div className="mt-4">
              <label className="text-sm text-gray-300">Patient</label>
              <select
                value={selectedPatientId}
                onChange={(e) => setSelectedPatientId(e.target.value)}
                className="bg-gray-700 p-2 rounded text-sm w-full mt-1"
              >
                <option value="">Select patient</option>
                {patients.map((p) => (
                  <option key={p._id} value={p._id}>{p.name} - {p.email}</option>
                ))}
              </select>
            </div>
          )}

          <div className="mt-5 grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
            <div className="bg-gray-900 p-3 rounded">
              <div className="text-xs text-gray-400">Patient</div>
              <div className="font-semibold">{patientName}</div>
              <div className="text-xs text-gray-400">Age: {patientAge}</div>
            </div>
            <div className="bg-gray-900 p-3 rounded">
              <div className="text-xs text-gray-400">Report period</div>
              <div className="font-semibold">{periodMeta.label}</div>
              <div className="text-xs text-gray-400">Last activity: {lastActivity ? fmtDateTime(lastActivity) : '--'}</div>
            </div>
            <div className="bg-gray-900 p-3 rounded">
              <div className="text-xs text-gray-400">Therapist</div>
              <div className="font-semibold">{therapistName || 'Not assigned'}</div>
              <div className="text-xs text-gray-400">Status: {results.length ? 'Active' : 'No sessions yet'}</div>
            </div>
            <div className="bg-gray-900 p-3 rounded">
              <div className="text-xs text-gray-400">Summary</div>
              <div className="font-semibold">{results.length} total sessions</div>
              <div className="text-xs text-gray-400">{filteredResults.length} in selected period</div>
            </div>
          </div>
        </div>

        {loading && <div className="text-sm text-gray-400">Loading report...</div>}
        {error && <div className="text-sm text-red-400">{error}</div>}
        {!loading && user?.role === 'therapist' && !selectedPatientId && (
          <div className="bg-gray-800 p-6 rounded shadow text-sm text-gray-300">
            Select a patient to view their report.
          </div>
        )}

        {!loading && (user?.role !== 'therapist' || selectedPatientId) && (
          <>
            <section className="bg-gray-800 p-6 rounded shadow">
              <h2 className="text-lg font-semibold mb-2">Cognitive Rehabilitation Summary</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                <div className="bg-gray-900 p-3 rounded">
                  <div className="text-xs text-gray-400">Total sessions</div>
                  <div className="font-semibold">{cognitiveResults.length}</div>
                </div>
                <div className="bg-gray-900 p-3 rounded">
                  <div className="text-xs text-gray-400">Average score</div>
                  <div className="font-semibold">{avgCognitiveScore != null ? avgCognitiveScore : '--'}</div>
                </div>
                <div className="bg-gray-900 p-3 rounded">
                  <div className="text-xs text-gray-400">Best score</div>
                  <div className="font-semibold">{bestCognitiveScore != null ? bestCognitiveScore : '--'}</div>
                </div>
                <div className="bg-gray-900 p-3 rounded">
                  <div className="text-xs text-gray-400">Latest score</div>
                  <div className="font-semibold">{latestCognitiveScore != null ? latestCognitiveScore : '--'}</div>
                </div>
              </div>
              <div className="mt-3 text-xs text-gray-400">
                Cognitive performance remains stable with regular task completion.
              </div>
            </section>

            <section className="bg-gray-800 p-6 rounded shadow">
              <h2 className="text-lg font-semibold mb-3">Physical Rehabilitation Summary</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-900 p-4 rounded">
                  <div className="text-sm font-semibold mb-2">T-Pose Exercise Summary</div>
                  <div className="text-sm text-gray-300">Total T-pose sessions: <span className="font-semibold">{tposeResults.length}</span></div>
                  <div className="text-sm text-gray-300">Average correct pose duration: <span className="font-semibold">{Math.round(avgTposeTime)} s</span></div>
                  <div className="text-sm text-gray-300">Average posture deviations: <span className="font-semibold">{Math.round(avgTposeBreaks)}</span> per session</div>
                  <div className="text-sm text-gray-300">Best session time in pose: <span className="font-semibold">{Math.round(bestTposeTime)} s</span></div>
                </div>
                <div className="bg-gray-900 p-4 rounded">
                  <div className="text-sm font-semibold mb-2">Squat Exercise Summary</div>
                  <div className="text-sm text-gray-300">Total squat sessions: <span className="font-semibold">{squatResults.length}</span></div>
                  <div className="text-sm text-gray-300">Squat accuracy: <span className="font-semibold">{squatAccuracy}%</span></div>
                  <div className="text-sm text-gray-300">Total correct squats: <span className="font-semibold">{totalSquatCorrect}</span></div>
                  <div className="text-sm text-gray-300">Total incorrect squats: <span className="font-semibold">{totalSquatIncorrect}</span></div>
                </div>
              </div>
            </section>

            <section className="bg-gray-800 p-6 rounded shadow">
              <h2 className="text-lg font-semibold mb-3">Exercise Session Log</h2>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-300">
                      <th className="py-2 pr-3">Date</th>
                      <th className="py-2 pr-3">Time</th>
                      <th className="py-2 pr-3">Exercise</th>
                      <th className="py-2 pr-3">Key Result</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessionRows.map((row) => (
                      <tr key={row.id} className="border-t border-gray-700">
                        <td className="py-2 pr-3">{row.date}</td>
                        <td className="py-2 pr-3">{row.time}</td>
                        <td className="py-2 pr-3">{row.exercise}</td>
                        <td className="py-2 pr-3">{row.keyResult}</td>
                        <td className="py-2">{row.status}</td>
                      </tr>
                    ))}
                    {sessionRows.length === 0 && (
                      <tr>
                        <td colSpan="5" className="py-3 text-gray-400">No sessions found for this period.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="bg-gray-800 p-6 rounded shadow">
              <h2 className="text-lg font-semibold mb-2">Automated Insights</h2>
              {insights.length ? (
                <ul className="text-sm text-gray-300 space-y-1">
                  {insights.map((note, idx) => (
                    <li key={`insight-${idx}`}>{note}</li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-gray-400">Not enough data for automated insights yet.</div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
