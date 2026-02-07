import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import UnreadBadge from "../components/UnreadBadge";
import TrendChart from "../components/TrendChart";
import ExerciseCharts from "../components/ExerciseCharts";

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
const getScoreValue = (raw) => {
  if (!raw) return 0;
  if (typeof raw.score === 'number') return raw.score;
  if (typeof raw.value === 'number') return raw.value;
  const n = Number(raw.score);
  return Number.isFinite(n) ? n : 0;
};
const cognitiveTooltipLines = (raw, value) => ([
  `Score: ${Math.round(((Number.isFinite(value) ? value : getScoreValue(raw)) || 0) * 10) / 10}`,
  (() => {
    const key = raw?.metadata?.gameKey || raw?.gameKey || '';
    const label = labelForGame(key);
    return label ? `Game: ${label}` : null;
  })(),
  raw?.metadata?.avgRTms != null ? `Avg RT: ${raw.metadata.avgRTms} ms` : null,
  raw?.metadata?.moves != null ? `Moves: ${raw.metadata.moves}` : null,
  raw?.metadata?.timeSeconds != null ? `Time: ${raw.metadata.timeSeconds}s` : null,
  raw?.metadata?.trials != null ? `Trials: ${raw.metadata.trials}` : null,
  raw?.createdAt ? new Date(raw.createdAt).toLocaleString() : null
].filter(Boolean));
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

export default function TherapistDashboard() {
  const { user, authFetch, logout, notificationsUnread, messagesUnread } = useAuth();
  const [patients, setPatients] = useState([]);
  const [availablePatients, setAvailablePatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [recentResults, setRecentResults] = useState([]);
  const [loadingResults, setLoadingResults] = useState(false);
  const [schedule, setSchedule] = useState([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedDateCognitive, setSelectedDateCognitive] = useState(() => new Date().toISOString().slice(0, 10));
  const [therapistLink, setTherapistLink] = useState({ patientId: '', status: '' });
  const [removeLink, setRemoveLink] = useState({ patientId: '', status: '' });
  const [patientHeartRate, setPatientHeartRate] = useState(null);
  const [patientHeartRateFallback, setPatientHeartRateFallback] = useState(null);
  const [patientHeartRateSource, setPatientHeartRateSource] = useState(null);
  const [patientFitbitStatus, setPatientFitbitStatus] = useState('idle');
  const navigate = useNavigate();
  const { push } = useToast();

  const fetchAvailablePatients = useCallback(async () => {
    try {
      const r2 = await authFetch('http://localhost:5000/api/patients/available');
      const j2 = await r2.json();
      if (j2.success) setAvailablePatients(j2.patients || []);
      else setAvailablePatients([]);
    } catch (e) {
      console.warn('failed to load available patients', e);
      setAvailablePatients([]);
    }
  }, [authFetch]);

  const fetchPatientResults = useCallback(async (patientId) => {
    setLoadingResults(true);
    try {
      const res = await authFetch(`http://localhost:5000/api/results?userId=${patientId}`);
      const data = await res.json();
      if (data.success) setRecentResults(data.results || []);
    } catch (err) {
      console.error("Failed to fetch patient results", err);
    }
    setLoadingResults(false);
  }, [authFetch]);

  

  

  

  
  useEffect(() => {
    let cancelled = false;
    let timer;
    const poll = async () => {
      if (cancelled) return;
      await fetchAvailablePatients();
      if (cancelled) return;
      timer = setTimeout(poll, 30000);
    };
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [fetchAvailablePatients]);

  
  const fetchPatients = async () => {
    try {
      const res = await authFetch("http://localhost:5000/api/patients");
      const data = await res.json();
      if (data.success) {
        setPatients(data.patients || []);
        fetchSchedule();
      }
    } catch (err) {
      console.error("Failed to fetch patients", err);
    }
  };

  
  const assignExercise = (patientId) => {
    if (!patientId) return;
    navigate(`/exercises?patientId=${patientId}`);
  };

  const viewResultsForPatient = async (patientId) => {
    if (!patientId) return;
    try {
      console.debug('viewResultsForPatient: fetching patient results and activities', patientId);
      const [resR, resA] = await Promise.all([
        authFetch(`http://localhost:5000/api/results?userId=${patientId}`),
        authFetch(`http://localhost:5000/api/calendar/patient/${patientId}`)
      ]);
      let prefetchedResults = [];
      let prefetchedActivities = [];

      if (resR.ok) {
        try { const resultsJson = await resR.json(); if (resultsJson && resultsJson.success) prefetchedResults = resultsJson.results || []; }
        catch(e){ console.warn('Failed to parse results JSON', e); }
      } else {
        console.warn('results fetch not ok', resR.status);
      }

      
      if (recentResults && recentResults.length) {
        prefetchedActivities = recentResults.map(r => ({
          id: r._id,
          title: r.title || r.type || 'Result',
          description: r.type || '',
          dueAt: r.createdAt,
          dailyReminder: false,
          assignedTo: selectedPatient ? { name: selectedPatient.name } : undefined
        }));
      } else {
        if (resA.ok) {
          try { const activitiesJson = await resA.json(); if (activitiesJson && activitiesJson.success) prefetchedActivities = activitiesJson.items || []; }
          catch(e){ console.warn('Failed to parse activities JSON', e); }
        } else {
          console.warn('activities fetch not ok', resA.status);
        }
      }

      navigate(`/results?userId=${patientId}`, { state: { prefetchedResults, prefetchedActivities } });
    } catch (e) {
      console.error('prefetch view results failed', e);
      
      navigate(`/results?userId=${patientId}`);
    }
  };

  const buildQuickReportHtml = ({ patient, therapistName, results, periodLabel }) => {
    const list = Array.isArray(results) ? results : [];
    const lastActivity = (() => {
      if (!list.length) return null;
      const sorted = [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return sorted[0]?.createdAt || null;
    })();
    const cognitiveResults = list.filter((r) => r.type === 'cognitive');
    const physicalResults = list.filter((r) => r.type === 'physical');
    const tposeResults = physicalResults.filter((r) => inferPoseType(r) === 'tpose');
    const squatResults = physicalResults.filter((r) => inferPoseType(r) === 'squat');

    const cognitiveScores = cognitiveResults.map((r) => r.score).filter((v) => Number.isFinite(v));
    const avgCognitiveScore = cognitiveScores.length ? Math.round(avg(cognitiveScores)) : '--';
    const bestCognitiveScore = cognitiveScores.length ? Math.max(...cognitiveScores) : '--';
    const latestCognitiveScore = (() => {
      if (!cognitiveResults.length) return '--';
      const sorted = [...cognitiveResults].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return sorted[0]?.score ?? '--';
    })();

    const tposeTimes = tposeResults.map((r) => (r.metadata?.poseMetrics?.timeInTargetMs || 0) / 1000);
    const tposeBreaks = tposeResults.map((r) => r.metadata?.poseMetrics?.outOfRangeCount || 0);
    const avgTposeTime = tposeTimes.length ? Math.round(avg(tposeTimes)) : 0;
    const avgTposeBreaks = tposeBreaks.length ? Math.round(avg(tposeBreaks)) : 0;
    const bestTposeTime = tposeTimes.length ? Math.round(Math.max(...tposeTimes)) : 0;

    const totalSquatCorrect = squatResults.reduce((sum, r) => sum + (r.metadata?.poseMetrics?.correctReps || 0), 0);
    const totalSquatIncorrect = squatResults.reduce((sum, r) => sum + (r.metadata?.poseMetrics?.incorrectReps || 0), 0);
    const totalSquatReps = totalSquatCorrect + totalSquatIncorrect;
    const squatAccuracy = totalSquatReps > 0 ? Math.round((totalSquatCorrect / totalSquatReps) * 100) : 0;

    const sessionRows = list
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
          date: fmtDate(r.createdAt),
          time: fmtTime(r.createdAt),
          exercise: exerciseLabel,
          keyResult,
          status: 'Completed'
        };
      });

    const summaryRows = [
      ['Patient', patient?.name || 'Patient'],
      ['Age', patient?.age ?? '--'],
      ['Report period', periodLabel],
      ['Last activity', lastActivity ? fmtDateTime(lastActivity) : '--'],
      ['Therapist', therapistName || 'Therapist']
    ];
    const cognitiveRows = [
      ['Total cognitive sessions', cognitiveResults.length],
      ['Average cognitive score', avgCognitiveScore],
      ['Best cognitive score', bestCognitiveScore],
      ['Latest cognitive score', latestCognitiveScore]
    ];
    const tposeRows = [
      ['Total T-pose sessions', tposeResults.length],
      ['Average correct pose duration (s)', avgTposeTime],
      ['Average posture deviations', avgTposeBreaks],
      ['Best session time in pose (s)', bestTposeTime]
    ];
    const squatRows = [
      ['Total squat sessions', squatResults.length],
      ['Squat accuracy', `${squatAccuracy}%`],
      ['Total correct squats', totalSquatCorrect],
      ['Total incorrect squats', totalSquatIncorrect]
    ];

    const table = (title, rows) => `
      <h3>${title}</h3>
      <table>
        <tbody>
          ${rows.map((r) => `<tr><th>${r[0]}</th><td>${r[1]}</td></tr>`).join('')}
        </tbody>
      </table>
    `;

    const sessionRowsHtml = sessionRows.map((row) => `
      <tr>
        <td>${row.date}</td>
        <td>${row.time}</td>
        <td>${row.exercise}</td>
        <td>${row.keyResult}</td>
        <td>${row.status}</td>
      </tr>
    `).join('');

    return `
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${patient?.name || 'Patient'} - Report</title>
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
          <h1>${patient?.name || 'Patient'} - Patient Report</h1>
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

  const downloadQuickReportExcel = async () => {
    if (!selectedPatient?._id) {
      push('Select a patient first', 'error');
      return;
    }
    let list = recentResults;
    if (!list.length) {
      try {
        const res = await authFetch(`http://localhost:5000/api/results?userId=${selectedPatient._id}`);
        const data = await res.json();
        list = data.success ? (data.results || []) : [];
      } catch (e) {
        console.error('quick report fetch failed', e);
      }
    }
    const html = buildQuickReportHtml({
      patient: selectedPatient,
      therapistName: user?.name || 'Therapist',
      results: list,
      periodLabel: 'All time'
    });
    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeFilename(selectedPatient.name)}-quick-report.xls`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadQuickReportPdf = async () => {
    if (!selectedPatient?._id) {
      push('Select a patient first', 'error');
      return;
    }
    let list = recentResults;
    if (!list.length) {
      try {
        const res = await authFetch(`http://localhost:5000/api/results?userId=${selectedPatient._id}`);
        const data = await res.json();
        list = data.success ? (data.results || []) : [];
      } catch (e) {
        console.error('quick report fetch failed', e);
      }
    }
    const html = buildQuickReportHtml({
      patient: selectedPatient,
      therapistName: user?.name || 'Therapist',
      results: list,
      periodLabel: 'All time'
    });
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  };

  const assignTherapistToPatient = async () => {
    if (!therapistLink.patientId) {
      setTherapistLink((s)=>({ ...s, status:'Pick a patient first' }));
      return;
    }
    setTherapistLink((s)=>({ ...s, status:'Assigning...' }));
    try {
      const res = await authFetch(`http://localhost:5000/api/patients/${therapistLink.patientId}/assign-therapist`, { method:'POST' });
      const data = await res.json();
      if (data.success) {
      setTherapistLink((s)=>({ ...s, status:'You are assigned as therapist' }));
      fetchPatients();
      fetchAvailablePatients();
    } else {
      setTherapistLink((s)=>({ ...s, status: data.message || 'Failed to assign' }));
    }
  } catch (e) {
      console.error('assign therapist', e);
      setTherapistLink((s)=>({ ...s, status:'Error assigning therapist' }));
    }
  };

  const removeTherapistFromPatient = async () => {
    if (!removeLink.patientId) {
      setRemoveLink((s)=>({ ...s, status:'Pick a patient first' }));
      return;
    }
    setRemoveLink((s)=>({ ...s, status:'Removing...' }));
    try {
      const res = await authFetch(`http://localhost:5000/api/patients/${removeLink.patientId}/unassign-therapist`, { method:'POST' });
      const data = await res.json();
      if (data.success) {
        setRemoveLink((s)=>({ ...s, status:'Removed link' }));
        fetchPatients();
        fetchAvailablePatients();
      } else {
        setRemoveLink((s)=>({ ...s, status: data.message || 'Failed to remove' }));
      }
    } catch (e) {
      console.error('remove therapist', e);
      setRemoveLink((s)=>({ ...s, status:'Error removing therapist' }));
    }
  };

  const fetchSchedule = useCallback(async () => {
    setScheduleLoading(true);
    try {
      const res = await authFetch('http://localhost:5000/api/calendar/therapist');
      const data = await res.json();
      if (data.success) {
        const items = (data.items || []).map(it => {
          const when = it.dueAt ? new Date(it.dueAt) : null;
          const hh = when ? String(when.getHours()).padStart(2, '0') : 'Any';
          const mm = when ? String(when.getMinutes()).padStart(2, '0') : 'time';
          const assignees = Array.isArray(it.assignedTo) ? it.assignedTo.map(p => p.name || p.email).join(', ') : '';
          return {
            id: it.id,
            time: when ? `${hh}:${mm}` : 'Anytime',
            title: it.title || 'Activity',
            patient: assignees || 'Patient',
            note: it.dailyReminder ? 'Daily reminder' : 'Scheduled activity',
            when: when ? when.getTime() : Number.MAX_SAFE_INTEGER
          };
        }).sort((a, b) => a.when - b.when);
        setSchedule(items);
      } else {
        setSchedule([]);
      }
    } catch (e) {
      console.error('Failed to fetch schedule', e);
      setSchedule([]);
    }
    setScheduleLoading(false);
  }, [authFetch]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await authFetch("http://localhost:5000/api/patients");
        const data = await res.json();
        if (data.success) {
          setPatients(data.patients || []);
          if (data.patients && data.patients.length) {
            setSelectedPatient(data.patients[0]);
            fetchPatientResults(data.patients[0]._id);
          }
        }
        fetchAvailablePatients();
        fetchSchedule();
      } catch (err) {
        console.error("Failed to load patients", err);
      }
    };
    load();
  }, [authFetch, fetchAvailablePatients, fetchPatientResults, fetchSchedule]);

  const filteredPatients = useMemo(() => {
    if (!search.trim()) return patients;
    const q = search.toLowerCase();
    return patients.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.email || '').toLowerCase().includes(q)
    );
  }, [patients, search]);

  useEffect(() => {
    if (filteredPatients.length === 0) {
      setSelectedPatient(null);
      setRecentResults([]);
      return;
    }
    if (!selectedPatient || !filteredPatients.find(p => p._id === selectedPatient._id)) {
      const first = filteredPatients[0];
      setSelectedPatient(first);
      fetchPatientResults(first._id);
    }
  }, [filteredPatients, selectedPatient, fetchPatientResults]);

  useEffect(() => {
    let cancelled = false;
    let timer;
    const pollHeartRate = async () => {
      if (!selectedPatient?._id) {
        if (cancelled) return;
        setPatientHeartRate(null);
        setPatientHeartRateFallback(null);
        setPatientHeartRateSource(null);
        setPatientFitbitStatus('idle');
        return;
      }
      if (cancelled) return;
      setPatientFitbitStatus((s) => (s === 'connected' ? s : 'checking'));
      try {
        const statusRes = await authFetch(`http://localhost:5000/api/fitbit/patients/${selectedPatient._id}/status`);
        const statusData = await statusRes.json();
        if (!statusData.connected) {
          if (!cancelled) {
            setPatientFitbitStatus('not-connected');
            setPatientHeartRate(null);
            setPatientHeartRateFallback(null);
            setPatientHeartRateSource(null);
          }
        } else {
          const hrRes = await authFetch(`http://localhost:5000/api/fitbit/patients/${selectedPatient._id}/heart-rate/latest`);
          if (hrRes.status === 404) {
            if (!cancelled) {
              setPatientFitbitStatus('not-connected');
              setPatientHeartRate(null);
              setPatientHeartRateFallback(null);
              setPatientHeartRateSource(null);
            }
          } else {
            const hrData = await hrRes.json();
            if (!cancelled && hrData.success) {
              if (hrData.bpm != null) {
                setPatientHeartRate(hrData.bpm);
                setPatientHeartRateSource(hrData.source || null);
                if (hrData.source?.includes('cached') || (hrData.source || '').startsWith('summary')) {
                  setPatientHeartRateFallback({ bpm: hrData.bpm, when: hrData.time || 'today' });
                } else {
                  setPatientHeartRateFallback(null);
                }
              } else {
                setPatientHeartRate(null);
                setPatientHeartRateSource(hrData.source || null);
              }
              setPatientFitbitStatus('connected');
              if (hrData.bpm == null) {
                try {
                  const laRes = await authFetch(`http://localhost:5000/api/fitbit/patients/${selectedPatient._id}/heart-rate/last-available`);
                  const la = await laRes.json();
                  if (!cancelled && la.success && la.found) {
                    setPatientHeartRateFallback({ bpm: la.found.bpm, when: `${la.found.date || 'recent'} ${la.found.time || ''}`.trim() });
                    setPatientHeartRateSource((s) => s || la.found.source || 'last-available');
                  }
                } catch (_) { }
              }
            }
          }
        }
      } catch (e) {
        if (!cancelled) {
          console.error('therapist heart rate fetch error', e);
          setPatientFitbitStatus('error');
        }
      }
      timer = setTimeout(pollHeartRate, 20000);
    };
    pollHeartRate();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [selectedPatient, authFetch]);

  const patientHrDisplay = patientHeartRate ?? patientHeartRateFallback?.bpm ?? '--';
  const patientHrStale = (patientHeartRateSource && patientHeartRateSource.includes('cached')) || (patientHeartRateSource || '').startsWith('summary') || (!patientHeartRate && !!patientHeartRateFallback);

  const cognitiveForDate = (date) => recentResults.filter(r => {
    if (!r.createdAt) return false;
    const d = new Date(r.createdAt).toISOString().slice(0, 10);
    return d === date && (r.type === 'game' || r.type === 'cognitive');
  });

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <div className="container mx-auto p-6">
        <div className="grid grid-cols-12 gap-6">
          {}
          <aside className="col-span-2 bg-gray-800 rounded-lg p-4 shadow-inner">
            <div className="mb-6 text-center">
              <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-purple-600 to-indigo-500 flex items-center justify-center text-xl font-bold">TR</div>
              <div className="mt-3 text-sm">{user?.name || 'Therapist'}</div>
              <div className="text-xs text-gray-400">Logged in</div>
            </div>
            <nav className="space-y-2 text-sm">
              <button className="w-full text-left px-3 py-2 rounded bg-gradient-to-r from-indigo-700 to-purple-600">Dashboard</button>
              <Link className="block px-3 py-2 rounded hover:bg-gray-700" to="/games">Games</Link>
              <Link className="block px-3 py-2 rounded hover:bg-gray-700" to="/exercises">Exercises</Link>
              <Link className="block px-3 py-2 rounded hover:bg-gray-700" to="/therapist/calendar">Calendar</Link>
              <Link className="block px-3 py-2 rounded hover:bg-gray-700" to="/reports">Patient Reports</Link>
              <Link className="block px-3 py-2 rounded hover:bg-gray-700" to="/therapist/reports">Summary</Link>
              <Link className="flex items-center px-3 py-2 rounded hover:bg-gray-700" to="/therapist/notifications">
                <span>Notify Patients</span>
                <UnreadBadge count={notificationsUnread} />
              </Link>
              <Link className="flex items-center px-3 py-2 rounded hover:bg-gray-700" to="/messages">
                <span>Messages</span>
                <UnreadBadge count={messagesUnread} />
              </Link>
              <div className="mt-4 text-xs text-gray-400 px-2">Patients</div>
              <div className="max-h-48 overflow-auto mt-2">
                {filteredPatients.map((p) => (
                  <div
                    key={p._id}
                    onClick={() => { setSelectedPatient(p); fetchPatientResults(p._id); }}
                    className={`cursor-pointer p-2 rounded mb-2 ${selectedPatient?._id === p._id ? 'bg-gray-700' : 'hover:bg-gray-700'}`}
                  >
                    <div className="text-sm font-medium">{p.name}</div>
                    <div className="text-xs text-gray-400">Age: {p.age}</div>
                  </div>
                ))}
              </div>
              <button className="w-full text-left px-3 py-2 rounded hover:bg-gray-700 mt-3" onClick={() => { fetchPatients(); fetchAvailablePatients(); }}>Refresh</button>
              <button className="w-full text-left px-3 py-2 rounded hover:bg-gray-700 text-red-300 mt-4" onClick={logout}>Logout</button>
            </nav>
          </aside>

          {}
          <main className="col-span-7">
            <div className="text-center mb-4">
              <img
                src="/rodrecover-logo.png"
                alt="RodRecover"
                className="mx-auto w-48 max-w-full h-auto object-contain"
              />
            </div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-semibold">Dashboard</h2>
              <div className="flex items-center gap-3">
                <input
                  className="px-3 py-2 rounded bg-gray-800 text-sm"
                  placeholder="Search patients..."
                  value={search}
                  onChange={(e)=>setSearch(e.target.value)}
                />
                <button className="px-3 py-2 bg-indigo-600 rounded text-sm" onClick={()=>navigate('/register')}>
                  New Patient
                </button>
                {}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="col-span-1 bg-gradient-to-br from-indigo-700 to-purple-600 rounded-lg p-4 shadow">
                <div className="text-xs text-gray-200">Active Patients</div>
                <div className="text-2xl font-bold mt-2">{patients.length}</div>
              </div>
              <div className="col-span-1 bg-gray-800 rounded-lg p-4 shadow">
                <div className="text-xs text-gray-400">Avg Cognitive Score (30d)</div>
                <div className="text-2xl font-bold mt-2">72%</div>
              </div>
              <div className="col-span-1 bg-gray-800 rounded-lg p-4 shadow">
                <div className="text-xs text-gray-400">Avg Physical Score (30d)</div>
                <div className="text-2xl font-bold mt-2">78%</div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 mb-4">
              <div className="bg-gray-800 rounded-lg p-4 shadow">
                <div className="space-y-6 mb-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm text-gray-200 font-semibold">Cognitive trends</div>
                      <div className="flex items-center gap-3">
                        <label className="text-xs text-gray-300">Date</label>
                        <input type="date" value={selectedDateCognitive} onChange={(e)=>setSelectedDateCognitive(e.target.value)} className="bg-gray-700 text-sm text-gray-100 px-2 py-1 rounded" />
                      </div>
                    </div>
                    <div className="text-xs text-gray-900 mb-2">
                      {(() => {
                        const list = cognitiveForDate(selectedDateCognitive);
                        if (!list.length) return (<div className="text-xs text-gray-700">No cognitive games on {selectedDateCognitive}.</div>);
                        const sorted = [...list].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                        return (
                          <div className="space-y-2">
                            {sorted.map((item, idx) => (
                              <div key={item._id || item.createdAt || idx} className="bg-white border border-gray-200 rounded px-3 py-2 text-black">
                                {cognitiveTooltipLines(item).map((line, lineIdx) => (
                                  <div key={lineIdx} className={lineIdx === 0 ? "font-semibold" : "text-[11px] text-gray-700"}>{line}</div>
                                ))}
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                    {loadingResults ? (
                      <div className="w-full h-40 flex items-center justify-center">Loading...</div>
                      ) : (
                      <TrendChart
                        label="Cognitive trends"
                        color="#10B981"
                        data={recentResults}
                        types={["game","cognitive"]}
                        limit={60}
                        height={320}
                        yLabel="Score"
                        showHeader={true}
                        showFullLabel={true}
                        tooltipLines={(raw, value) => cognitiveTooltipLines(raw, value)}
                      />
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm text-gray-200 font-semibold">Exercise trends</div>
                    </div>
                    {loadingResults ? (
                      <div className="w-full h-40 flex items-center justify-center">Loading...</div>
                    ) : (
                      <ExerciseCharts results={recentResults} compact />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {}
          </main>

          {}
          <aside className="col-span-3">
            <div className="bg-gradient-to-br from-gray-800 to-gray-700 rounded-lg p-4 mb-4 shadow">
              <h4 className="text-sm text-gray-300">Selected patient</h4>
              {selectedPatient ? (
                <div className="mt-3">
                  <div className="text-lg font-bold">{selectedPatient.name}</div>
                  <div className="text-xs text-gray-400">Age: {selectedPatient.age}</div>
                  <div className="text-xs text-gray-400">Last active: {selectedPatient.lastActive}</div>

                  <div className="mt-4 flex gap-2">
                    <button onClick={() => assignExercise(selectedPatient._id)} className="px-3 py-2 bg-indigo-600 rounded">Assign Exercise</button>
                    <button onClick={() => viewResultsForPatient(selectedPatient._id)} className="px-3 py-2 bg-gray-600 rounded">View Results</button>
                    <button onClick={async ()=>{
                      if (!selectedPatient || !selectedPatient._id) return;
                      if (!window.confirm(`Remove ${selectedPatient.name} from your patients? This will unassign the patient.`)) return;
                      try {
                        const res = await authFetch(`http://localhost:5000/api/patients/${selectedPatient._id}/unassign-therapist`, { method: 'POST' });
                        const j = await res.json();
                        if (j.success) {
                          push('Patient unassigned', 'success');
                          try { const r = await authFetch('http://localhost:5000/api/patients'); const j2 = await r.json(); if (j2.success) setPatients(j2.patients||[]); } catch(_){}
                          setSelectedPatient(null);
                          setRecentResults([]);
                        } else {
                          push(j.message || 'Failed to unassign', 'error');
                        }
                      } catch (e) { console.error('unassign error', e); push('Error unassigning patient', 'error'); }
                    }} className="px-3 py-2 bg-red-600 rounded">Remove patient</button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 text-gray-400">No patient selected</div>
              )}
            </div>

            <div className="bg-gray-800 rounded-lg p-4 mb-4 shadow">
              <h4 className="text-sm text-gray-300">Heart rate</h4>
              <div className="flex items-center justify-between mt-3">
                <div>
                  <div className="text-2xl font-bold">
                    {patientFitbitStatus === 'connected'
                      ? `${patientHrDisplay} bpm`
                      : patientFitbitStatus === 'checking'
                        ? '...'
                        : '--'}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {patientFitbitStatus === 'not-connected' && 'Patient has not connected Fitbit.'}
                    {patientFitbitStatus === 'error' && 'Error fetching heart rate.'}
                    {patientFitbitStatus === 'connected' && patientHrStale && (
                      <span>Last: {patientHeartRateFallback?.when || 'recent'}</span>
                    )}
                    {patientFitbitStatus === 'connected' && !patientHrStale && 'Live or recent reading'}
                    {patientFitbitStatus === 'idle' && 'Select a patient to view heart rate.'}
                  </div>
                </div>
                <div className="text-right text-xs text-gray-400">
                  <div className="uppercase tracking-wide text-[10px] text-gray-500">Patient</div>
                  <div className="text-sm text-gray-200">{selectedPatient?.name || '—'}</div>
                </div>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-4 mb-4 shadow">
              <h4 className="text-sm text-gray-300">Schedule</h4>
              {scheduleLoading ? (
                <div className="text-gray-400 text-sm mt-2">Loading schedule...</div>
              ) : (
                <ul className="mt-3 text-sm text-gray-200 space-y-2">
                  {schedule.length === 0 ? (
                    <li className="text-gray-400">No upcoming sessions.</li>
                  ) : (
                    schedule.slice(0, 6).map((s) => (
                      <li key={s.id || `${s.time}-${s.title}`} className="flex items-center justify-between bg-gray-900/60 p-2 rounded">
                        <div>
                          <div className="text-xs text-gray-400">{s.time}</div>
                          <div className="font-semibold">{s.title}</div>
                          <div className="text-xs text-gray-400">{s.patient}</div>
                        </div>
                        <div className="text-[11px] text-gray-400">{s.note}</div>
                      </li>
                    ))
                  )}
                </ul>
              )}
              <button onClick={fetchSchedule} className="mt-3 text-xs text-indigo-300 underline">Refresh schedule</button>
            </div>

            <div className="bg-gradient-to-br from-indigo-700 to-purple-600 rounded-lg p-4 shadow">
              <h4 className="text-sm text-white">Quick reports</h4>
                <div className="mt-3 space-y-2">
                <button onClick={downloadQuickReportExcel} className="w-full bg-white/10 text-white px-3 py-2 rounded text-sm">Download Excel</button>
                <button onClick={downloadQuickReportPdf} className="w-full bg-white/10 text-white px-3 py-2 rounded text-sm">Download PDF</button>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-4 shadow mt-4">
              <h4 className="text-sm text-gray-300">Assign yourself as therapist</h4>
              <div className="flex items-center gap-2 mt-2">
                <select value={therapistLink.patientId} onChange={e=>setTherapistLink({...therapistLink, patientId: e.target.value})} className="bg-gray-700 p-2 rounded text-sm w-full">
                  <option value="">Select patient</option>
                  {availablePatients.map(p=> <option key={p._id} value={p._id}>{p.name} — {p.email}</option>)}
                </select>
                <button onClick={assignTherapistToPatient} className="bg-green-600 px-3 py-2 rounded text-sm whitespace-nowrap">Assign</button>
              </div>
              <div className="text-xs text-gray-400 mt-2">
                Available patients: <span className="font-medium text-gray-200">{availablePatients.length}</span>
              </div>
              {therapistLink.status && <div className="text-xs text-gray-300 mt-1">{therapistLink.status}</div>}
              <div className="text-[11px] text-gray-400 mt-1">Patient will get a request and must accept you as their therapist.</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-4 shadow mt-4">
              <h4 className="text-sm text-gray-300">Remove patient link</h4>
              <div className="flex items-center gap-2 mt-2">
                <select value={removeLink.patientId} onChange={e=>setRemoveLink({...removeLink, patientId: e.target.value})} className="bg-gray-700 p-2 rounded text-sm w-full">
                  <option value="">Select patient</option>
                  {patients.map(p=> <option key={p._id} value={p._id}>{p.name} — {p.email}</option>)}
                </select>
                <button onClick={removeTherapistFromPatient} className="bg-red-600 px-3 py-2 rounded text-sm whitespace-nowrap">Remove</button>
              </div>
              {removeLink.status && <div className="text-xs text-gray-300 mt-1">{removeLink.status}</div>}
              <div className="text-[11px] text-gray-400 mt-1">Removes you as therapist for that patient.</div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
