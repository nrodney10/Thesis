import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function ExerciseRunner() {
  const { authFetch } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const loc = useLocation();
  const ex = loc.state?.exercise;

  const [running, setRunning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);
  const [initialTime, setInitialTime] = useState(60);
  const [reps, setReps] = useState(0);
  const [difficulty, setDifficulty] = useState('medium');
  const [includeVideo, setIncludeVideo] = useState(false);
  const [enablePose, setEnablePose] = useState(false);
  const [recordingBlobUrl, setRecordingBlobUrl] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const detectorRef = useRef(null);
  const poseLoopRef = useRef(null);
  const poseMetricsRef = useRef({
    reps: 0,
    lastAngle: null,
    state: 'down',
    smoothedAngle: null,
    lastRepTime: 0,
    // progress metrics
    minAngle: Infinity,
    maxAngle: -Infinity,
    sumAngle: 0,
    sampleCount: 0,
    timeInTargetMs: 0,
    lastSampleTime: null,
    inRange: false,
    usedSide: null,
    prevLevel: null,
    praised: false,
  });
  const repQualityRef = useRef([]);
  const [, setFeedback] = useState({ level: 'info', message: 'Ready' });
  const [backend, setBackend] = useState('');
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [heartRate, setHeartRate] = useState(null);
  const [fallbackHR, setFallbackHR] = useState(null);
  const [fitbitStatus, setFitbitStatus] = useState('unknown'); // unknown | connected | not-connected | error
  const lastSpeakRef = useRef({ t: 0, text: '' });

  const speak = useCallback((text, opts = {}) => {
    try {
      if (!voiceEnabled) return;
      if (typeof window === 'undefined' || !window.speechSynthesis) return;
      const now = Date.now();
      const minGap = opts.minGapMs ?? 1800;
      if (lastSpeakRef.current.text === text && (now - lastSpeakRef.current.t) < minGap) return;
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05; u.pitch = 1; u.volume = 1;
      window.speechSynthesis.speak(u);
      lastSpeakRef.current = { t: now, text };
    } catch (_) {}
  }, [voiceEnabled]);

  // Stable stopMedia handler (place before effects to avoid TDZ on first render)
  const stopMedia = useCallback(() => {
    try { if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop(); } catch (e) {}
    try { if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach((t) => t.stop()); mediaStreamRef.current = null; } } catch (e) {}
    if (videoRef.current) videoRef.current.srcObject = null;
    // stop pose detector if running
    stopPoseDetector();
  }, []);

  useEffect(() => {
    let t;
    if (running && timeLeft > 0) t = setInterval(() => setTimeLeft((s) => s - 1), 1000);
    if (timeLeft === 0 && running) setRunning(false);
    return () => clearInterval(t);
  }, [running, timeLeft]);

  // Stop media on unmount
  useEffect(() => {
    return () => { stopMedia(); };
  }, [stopMedia]);

  // Poll Fitbit latest heart rate if connected
  useEffect(() => {
    let timer;
    const poll = async () => {
      try {
        const statusRes = await authFetch('http://localhost:5000/api/fitbit/me/status');
        const statusData = await statusRes.json();
        if (!statusData.connected) {
          setFitbitStatus('not-connected');
        } else {
          setFitbitStatus('connected');
          const hrRes = await authFetch('http://localhost:5000/api/fitbit/me/heart-rate/latest');
          if (hrRes.status !== 404) {
            const hrData = await hrRes.json();
            if (hrData.success) setHeartRate(hrData.bpm);
          }
          if (!heartRate) {
            try {
              const laRes = await authFetch('http://localhost:5000/api/fitbit/me/heart-rate/last-available');
              const la = await laRes.json();
              if (la.success && la.found) setFallbackHR({ bpm: la.found.bpm, when: `${la.found.date} ${la.found.time}` });
            } catch (_) {}
          }
        }
      } catch (e) { setFitbitStatus('error'); }
      timer = setTimeout(poll, 15000);
    };
    poll();
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Revoke any recording blob URL when it changes or on unmount
  useEffect(() => {
    return () => {
      if (recordingBlobUrl) URL.revokeObjectURL(recordingBlobUrl);
    };
  }, [recordingBlobUrl]);

  // Keep overlay canvas sized to the video display
  useEffect(() => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) return;
    const onResize = () => {
      const rect = v.getBoundingClientRect();
      if (rect.width && rect.height) { c.width = rect.width; c.height = rect.height; }
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  async function startMedia() {
    if (!includeVideo) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      mediaStreamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      // after video attaches, size the overlay canvas to match displayed size
      setTimeout(() => {
        const v = videoRef.current, c = canvasRef.current;
        if (v && c) { const r = v.getBoundingClientRect(); c.width = r.width; c.height = r.height; }
      }, 120);
      recordedChunksRef.current = [];
      const mr = new MediaRecorder(stream, { mimeType: 'video/webm' });
      mr.ondataavailable = (e) => { if (e.data && e.data.size) recordedChunksRef.current.push(e.data); };
      mr.onstop = () => { const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' }); setRecordingBlobUrl(URL.createObjectURL(blob)); };
      mediaRecorderRef.current = mr;
      // If pose estimation is enabled, lazy-load detector and start processing
      if (enablePose) await startPoseDetector();
    } catch (err) {
      console.error('Media start error', err);
      push('Unable to access camera. Please allow camera permissions or disable video.', 'error');
      setIncludeVideo(false);
    }
  }

  async function startPoseDetector() {
    if (!videoRef.current) return;
    if (detectorRef.current) return;
    try {
      // Load TF core and register backends, prefer webgl then wasm then cpu
      const pd = await import('@tensorflow-models/pose-detection');
      const tf = await import('@tensorflow/tfjs');
      try { await import('@tensorflow/tfjs-backend-webgl'); } catch (_) {}
      let backendSet = false;
      try {
        await tf.setBackend('webgl');
        await tf.ready();
        backendSet = true;
      } catch (e) {
        console.warn('webgl backend failed, trying wasm', e);
        try {
          await import('@tensorflow/tfjs-backend-wasm');
          await tf.setBackend('wasm');
          await tf.ready();
          backendSet = true;
        } catch (e2) {
          console.warn('wasm backend failed, falling back to cpu', e2);
          try {
            await tf.setBackend('cpu');
            await tf.ready();
            backendSet = true;
          } catch (e3) {
            console.error('cpu backend failed', e3);
          }
        }
      }
  if (!backendSet) throw new Error('No TF backend available');
  try { setBackend(tf.getBackend()); } catch (_) {}

      const detector = await pd.createDetector(pd.SupportedModels.MoveNet, {
        modelType: pd.movenet?.modelType?.SINGLEPOSE_LIGHTNING || 'SINGLEPOSE_LIGHTNING'
      });
      detectorRef.current = detector;
      poseLoopRef.current = requestAnimationFrame(poseFrame);
    } catch (e) {
      console.error('Pose detector failed to initialize', e);
      push('Pose estimation unavailable on this device.', 'error');
      setEnablePose(false);
    }
  }

  async function stopPoseDetector() {
    try {
      if (poseLoopRef.current) cancelAnimationFrame(poseLoopRef.current);
      if (detectorRef.current?.dispose) detectorRef.current.dispose();
    } catch (e) { console.warn(e); }
    detectorRef.current = null;
    poseLoopRef.current = null;
    poseMetricsRef.current = { reps: 0, lastAngle: null, state: 'down', smoothedAngle: null, lastRepTime: 0, minAngle: Infinity, maxAngle: -Infinity, sumAngle: 0, sampleCount: 0, timeInTargetMs: 0, lastSampleTime: null, inRange: false, usedSide: null };
  }

  async function poseFrame() {
    try {
      if (!detectorRef.current || !videoRef.current) return;
      const v = videoRef.current;
      const poses = await detectorRef.current.estimatePoses(v, { maxPoses: 1, flipHorizontal: false });
  if (poses && poses.length) { processPose(poses[0]); drawOverlay(poses[0]); }
      else { clearOverlay(); }
    } catch (e) { console.error('pose_frame_err', e); }
    poseLoopRef.current = requestAnimationFrame(poseFrame);
  }

  function getPoseConfig() {
    const baseCfg = ex.poseConfig || {};
    const guessedJoints = baseCfg.joints || (/(arm|elbow)/i.test(ex.title || '') ? 'arm' : 'knee');
    return {
      joints: guessedJoints,
      upAngle: baseCfg.upAngle ?? 90,
      downAngle: baseCfg.downAngle ?? 140,
      smoothing: baseCfg.smoothing ?? 0.2,
      minRepTimeMs: baseCfg.minRepTimeMs ?? 400,
      targets: baseCfg.targets
    };
  }

  function processPose(pose) {
    const cfg = getPoseConfig();
    
    // Select keypoints based on joint config; choose the better-visible side
    const key = pose.keypoints || [];
    const byName = (name) => key.find(k => k.name === name || k.part === name);

    let a, b, c; let chosenSide = 'left';
    const pickSide = (leftNames, rightNames) => {
      const l = leftNames.map(byName);
      const r = rightNames.map(byName);
      const lMin = Math.min(...l.map(p => (p?.score ?? 0)));
      const rMin = Math.min(...r.map(p => (p?.score ?? 0)));
      if (rMin > lMin) { chosenSide = 'right'; return r; } else { chosenSide = 'left'; return l; }
    };

    if (cfg.joints === 'knee') {
      // choose side by knee visibility
      [a, b, c] = pickSide(['left_hip','left_knee','left_ankle'], ['right_hip','right_knee','right_ankle']);
    } else if (cfg.joints === 'arm') {
      // choose side by elbow visibility
      [a, b, c] = pickSide(['left_shoulder','left_elbow','left_wrist'], ['right_shoulder','right_elbow','right_wrist']);
    } else {
      // shoulder/knee chain, pick better side by hip/knee visibility
      [a, b, c] = pickSide(['left_shoulder','left_hip','left_knee'], ['right_shoulder','right_hip','right_knee']);
    }

  if (!a || !b || !c || a.score < 0.3 || b.score < 0.3 || c.score < 0.3) return;
    
  let angle = calcAngle(a, b, c);
    if (angle == null) return;
  // For elbow coaching, use elbow flexion degrees (0=straight, higher=bent)
  if (cfg.joints === 'arm') angle = 180 - angle;

    const metrics = poseMetricsRef.current;
    
    // EMA smoothing
    const alpha = typeof cfg.smoothing === 'number' ? cfg.smoothing : 0.2;
    const prev = metrics.smoothedAngle ?? angle;
    const smoothed = alpha * angle + (1 - alpha) * prev;
  metrics.smoothedAngle = smoothed;
    metrics.lastAngle = smoothed;
  // record side if not set
  if (!metrics.usedSide) metrics.usedSide = chosenSide;
  // update min/max/avg
  metrics.minAngle = Math.min(metrics.minAngle, smoothed);
  metrics.maxAngle = Math.max(metrics.maxAngle, smoothed);
  metrics.sumAngle += smoothed;
  metrics.sampleCount += 1;

    // State machine with debouncing
    const upThreshold = cfg.upAngle ?? 90;
    const downThreshold = cfg.downAngle ?? 140;
    const minRepTime = cfg.minRepTimeMs ?? 400;
    const now = Date.now();

    if (metrics.state === 'down' && smoothed < upThreshold) {
      metrics.state = 'up';
      // encourage user to lift further if near threshold
      if (smoothed < upThreshold - 10) speak(cfg.joints === 'arm' ? 'Raise your arm higher.' : 'Go lower.');
    } else if (metrics.state === 'up' && smoothed > downThreshold) {
      // Check debounce before counting rep
      if ((now - metrics.lastRepTime) > minRepTime) {
        // record quality for this rep
        const fb = evaluateForm(smoothed, cfg, key);
        const score = fb.level === 'good' ? 1 : fb.level === 'caution' ? 0.6 : 0.2;
        repQualityRef.current.push(score);
        metrics.reps += 1;
        metrics.lastRepTime = now;
        setReps(metrics.reps);
        speak('Good job!', { minGapMs: 1200 });
      }
      metrics.state = 'down';
    }

    // Continuous feedback each frame + time-in-target accumulation
    const cont = evaluateForm(smoothed, cfg, key);
    const now2 = Date.now();
    const lastT = metrics.lastSampleTime ?? now2;
    const dt = Math.max(0, now2 - lastT);
    const target = cfg.targets && Array.isArray(cfg.targets.targetRange) ? cfg.targets.targetRange : null;
    const isInRange = target ? (smoothed >= target[0] && smoothed <= target[1]) : (cont.level === 'good');
    if (isInRange) metrics.timeInTargetMs += dt;
    metrics.lastSampleTime = now2;
    // Speak only when level changes to avoid repeated chatter. Praise on entry to 'good'.
    const prevLevel = metrics.prevLevel || null;
    if (cont.level !== prevLevel) {
      if (cont.level === 'good') {
        speak(cont.message, { minGapMs: 1200 });
      } else {
        // caution/bad -> immediate correction
        speak(cont.message);
      }
      metrics.prevLevel = cont.level;
    }
    setFeedback(cont);
  }

  function calcAngle(a, b, c) {
    // angle at point b formed by a-b-c
    const ab = { x: a.x - b.x, y: a.y - b.y };
    const cb = { x: c.x - b.x, y: c.y - b.y };
    const dot = ab.x * cb.x + ab.y * cb.y;
    const mag = Math.sqrt((ab.x * ab.x + ab.y * ab.y) * (cb.x * cb.x + cb.y * cb.y));
    if (mag === 0) return null;
    const cos = Math.min(1, Math.max(-1, dot / mag));
    return (Math.acos(cos) * 180) / Math.PI;
  }

  function evaluateForm(smoothedAngle, cfg, keypoints) {
    // Custom T-pose evaluator when template requests it
    if (cfg.targets && cfg.targets.type === 'tpose') {
      // Determine left/right wrist vs shoulder horizontal angle
      const by = (n) => keypoints.find(k => k.name === n || k.part === n);
      const ls = by('left_shoulder'), rs = by('right_shoulder');
      const lw = by('left_wrist'), rw = by('right_wrist');
      if (!ls || !rs || !lw || !rw) return { level: 'info', message: 'Move into frame' };
      const calcDeg = (shoulder, wrist) => {
        const dx = wrist.x - shoulder.x; const dy = wrist.y - shoulder.y; // y downwards
        const ang = Math.atan2(dy, dx) * 180 / Math.PI; // angle from shoulder->wrist
        // angle relative to horizontal: 0 -> perfectly horizontal to right, 180/-180 -> left
        const rel = Math.abs(ang);
        // normalize to 0..180
        return Math.min(rel, 360 - rel);
      };
      const leftDeg = calcDeg(ls, lw);
      const rightDeg = calcDeg(rs, rw);
      const allowed = typeof cfg.targets.allowedRotation === 'number' ? cfg.targets.allowedRotation : 15;
      const leftOk = Math.abs(leftDeg - 90) <= allowed; // when arm points sideways angle approx 90 deg from vertical? adjust using experiments
      const rightOk = Math.abs(rightDeg - 90) <= allowed;
      const bothOk = leftOk && rightOk;
      if (bothOk) return { level: 'good', message: cfg.targets?.correctMsg || 'Good — hold the T position' };
      // choose corrective message depending on which side is off
      if (!leftOk && !rightOk) return { level: 'bad', message: cfg.targets?.incorrectMsg || 'Both arms out of position — raise or lower both arms' };
      if (!leftOk) return { level: 'caution', message: cfg.targets?.incorrectMsg || 'Adjust your left arm' };
      return { level: 'caution', message: cfg.targets?.incorrectMsg || 'Adjust your right arm' };
    }
    // For a quick demo targeting elbow flexion of 45-60°, default to that for arm exercises
    const targets = cfg.targets || (cfg.joints === 'arm'
      ? { targetRange: [45, 60] }
      : { bottomRange: [70, 100], topRange: [150, 180] }
    );
    if (smoothedAngle == null) return { level: 'info', message: 'Move into frame' };
    // If a targetRange is provided, evaluate against that directly (range coach mode)
    if (targets.targetRange && Array.isArray(targets.targetRange)) {
      const [minA, maxA] = targets.targetRange;
      if (smoothedAngle >= minA && smoothedAngle <= maxA) {
        return { level: 'good', message: `Great — hold ${minA}–${maxA}°` };
      }
      // For elbow: angle too small => over-bent, ask to extend; too large => ask to bend
      if (smoothedAngle < minA) {
        return { level: 'caution', message: 'Extend your elbow slightly' };
      }
      return { level: 'caution', message: 'Bend your elbow a bit more' };
    }
    const [minBottom, maxBottom] = targets.bottomRange || [70, 100];
    const [minTop] = targets.topRange || [150, 180];
    let level = 'good';
    let message = 'Good form';
    // Torso straightness (shoulder over hip). If leaning > ~20deg, cue.
    if (keypoints && keypoints.length) {
      const by = (n) => keypoints.find(k => k.name === n || k.part === n);
      const sh = by('left_shoulder') || by('right_shoulder');
      const hip = by('left_hip') || by('right_hip');
      if (sh && hip && sh.score > 0.3 && hip.score > 0.3) {
        const dx = sh.x - hip.x; const dy = hip.y - sh.y; // vertical up is positive dy
        const torsoDeg = Math.abs(Math.atan2(dx, dy)) * 180 / Math.PI;
        if (torsoDeg > 25) {
          return { level: 'caution', message: 'Maintain back straight.' };
        }
      }
    }
    if (poseMetricsRef.current.state === 'up') {
      if (smoothedAngle > minTop) { level = 'good'; message = 'Fully extend'; }
      else if (smoothedAngle > minTop - 15) { level = 'caution'; message = 'Extend a bit more'; }
      else { level = 'bad'; message = 'Not fully extended'; }
    } else {
      if (smoothedAngle >= minBottom && smoothedAngle <= maxBottom) { level = 'good'; message = 'Depth looks good'; }
      else if (smoothedAngle < minBottom) { level = 'bad'; message = 'Too deep — protect your joints'; }
      else { level = 'caution'; message = 'Go a bit deeper'; }
    }
    return { level, message };
  }

  function clearOverlay() {
    const c = canvasRef.current; if (!c) return; const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
  }

  function drawOverlay(pose) {
    const v = videoRef.current, c = canvasRef.current; if (!v || !c) return;
    const ctx = c.getContext('2d');
    const vw = v.videoWidth || c.width, vh = v.videoHeight || c.height;
    const sx = c.width / vw, sy = c.height / vh;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.lineWidth = 2;
    const kp = pose.keypoints || [];
    const scoreMin = 0.3;
    const get = (name) => kp.find(k => (k.name === name || k.part === name));
    const edges = [
      ['left_shoulder','right_shoulder'],
      ['left_shoulder','left_elbow'],['left_elbow','left_wrist'],
      ['right_shoulder','right_elbow'],['right_elbow','right_wrist'],
      ['left_hip','right_hip'],
      ['left_hip','left_knee'],['left_knee','left_ankle'],
      ['right_hip','right_knee'],['right_knee','right_ankle']
    ];
    ctx.strokeStyle = '#4ade80';
    edges.forEach(([a,b]) => {
      const pa = get(a), pb = get(b);
      if (!pa || !pb || pa.score < scoreMin || pb.score < scoreMin) return;
      ctx.beginPath(); ctx.moveTo(pa.x * sx, pa.y * sy); ctx.lineTo(pb.x * sx, pb.y * sy); ctx.stroke();
    });
    ctx.fillStyle = '#93c5fd';
    ['left_hip','right_hip','left_knee','right_knee','left_ankle','right_ankle','left_shoulder','right_shoulder','left_elbow','right_elbow','left_wrist','right_wrist']
      .forEach(n => { const p = get(n); if (!p || p.score < scoreMin) return; ctx.beginPath(); ctx.arc(p.x * sx, p.y * sy, 3, 0, Math.PI*2); ctx.fill(); });
    // banner with angle + feedback + backend
  const angle = poseMetricsRef.current.smoothedAngle;
  // Derive fresh feedback for drawing to avoid state lag
  const cfg = getPoseConfig();
  const fb = evaluateForm(angle, cfg, pose.keypoints || []);
    ctx.fillStyle = fb.level === 'good' ? 'rgba(16,185,129,0.75)' : fb.level === 'caution' ? 'rgba(234,179,8,0.75)' : fb.level === 'bad' ? 'rgba(239,68,68,0.75)' : 'rgba(59,130,246,0.75)';
    ctx.fillRect(0, 0, c.width, 28);
    ctx.fillStyle = '#0b1020';
    ctx.font = 'bold 14px ui-sans-serif, system-ui, -apple-system';
  // quick HUD: angle • in-range time • min/max
  const m = poseMetricsRef.current;
  const inRangeSec = (m.timeInTargetMs || 0) / 1000;
  const minA = isFinite(m.minAngle) ? m.minAngle.toFixed(0) : '--';
  const maxA = isFinite(m.maxAngle) ? m.maxAngle.toFixed(0) : '--';
  ctx.fillText(`Angle: ${angle != null ? angle.toFixed(0) : '--'}°  •  In‑range: ${inRangeSec.toFixed(1)}s  •  Min/Max: ${minA}/${maxA}°  •  Backend: ${backend || '...'}`, 8, 19);

    // Optional: draw simple target range markers for elbow demo (45–60°)
    if (cfg.joints === 'arm') {
      // Draw text guide under banner
      ctx.font = 'bold 12px ui-sans-serif, system-ui, -apple-system';
      ctx.fillStyle = '#e5e7eb';
      ctx.fillText('Target: 45–60° (elbow flexion)', 8, 38);
    }
  }

  

  const handleStart = async () => {
    setTimeLeft(initialTime);
    if (includeVideo) { await startMedia(); try { mediaRecorderRef.current?.start(); } catch (e) { console.warn('recorder start failed', e); } }
    setRunning(true);
    push('Exercise started', 'info');
  };

  const handlePause = () => { setRunning(false); try { mediaRecorderRef.current?.pause?.(); } catch (e) {} push('Paused', 'info'); };
  const handleReset = () => { setRunning(false); setTimeLeft(initialTime); setReps(0); stopMedia(); setRecordingBlobUrl(null); push('Reset', 'info'); };
  const handleStop = () => { setRunning(false); try { mediaRecorderRef.current?.stop(); } catch (e) {} stopMedia(); push('Stopped', 'info'); };

  const submitResult = async ({ completed = true, score = null } = {}) => {
    if (!ex) return push('No exercise selected', 'error');
    try {
  const poseMetrics = poseMetricsRef.current || { reps: 0 };
  // finalize averages and cadence
  const avgAngle = poseMetrics.sampleCount > 0 ? (poseMetrics.sumAngle / poseMetrics.sampleCount) : null;
  const durationSec = Math.max(1, initialTime - timeLeft);
  const cadence = reps / (durationSec / 60);
  const metadata = {
    reps,
    difficulty,
    duration: durationSec,
    video: !!recordingBlobUrl,
    poseMetrics: {
      ...poseMetrics,
      avgAngle: avgAngle ?? undefined,
      cadence,
      quality: repQualityRef.current
    },
    heartRate: heartRate ?? null
  };
      const payload = { exerciseId: ex._id || ex.id || 'unknown', type: 'physical', score: score ?? Math.round((reps / Math.max(1, initialTime)) * 100), metadata };
      if (recordingBlobUrl) {
        const blobResp = await fetch(recordingBlobUrl);
        const blob = await blobResp.blob();
        const fd = new FormData();
        fd.append('video', blob, `exercise-${Date.now()}.webm`);
        fd.append('payload', JSON.stringify(payload));
        const res = await authFetch('http://localhost:5000/api/results/upload', { method: 'POST', body: fd });
        const data = await res.json();
        if (data.success) push('Result uploaded', 'success'); else push('Upload failed', 'error');
      } else {
        const res = await authFetch('http://localhost:5000/api/results', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        if (data.success) push('Result saved', 'success'); else push('Failed to save result', 'error');
      }
    } catch (err) {
      console.error('Submit result error', err);
      push('Error submitting result', 'error');
    }
    navigate('/exercises');
  };

  if (!ex) return <main className="min-h-screen p-8 bg-gray-900 text-gray-100"><div className="max-w-2xl mx-auto">No exercise selected</div></main>;

  return (
    <main className="min-h-screen h-screen bg-gray-900 text-gray-100">
      <div className="w-full h-full max-w-[1400px] mx-auto p-4 md:p-6">
        <h1 className="text-2xl font-bold mb-2">{ex.title}</h1>
        <p className="text-gray-300 mb-4">{ex.description}</p>

        <section aria-labelledby="instructions" className="mb-4">
          <h2 id="instructions" className="font-semibold">Instructions</h2>
          <p className="text-sm text-gray-300">Follow the instructions from your therapist. Use the timer below and optionally enable video capture for clinician review.</p>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-4 items-start">
          <div className="space-y-3 lg:col-span-2">
            <label className="block text-sm">Duration (seconds)</label>
            <input aria-label="duration seconds" type="number" value={initialTime} onChange={(e)=>{const v=Math.max(5,Number(e.target.value)||60); setInitialTime(v); setTimeLeft(v);}} className="w-32 p-2 rounded bg-gray-700" />

            <label className="block text-sm">Repetitions (observed)</label>
            <input aria-label="reps" type="number" value={reps} onChange={(e)=>setReps(Math.max(0, Number(e.target.value)||0))} className="w-32 p-2 rounded bg-gray-700" />

            <label className="block text-sm">Difficulty</label>
            <select value={difficulty} onChange={(e)=>setDifficulty(e.target.value)} className="w-40 p-2 rounded bg-gray-700">
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>

            <label className="inline-flex items-center">
              <input type="checkbox" checked={includeVideo} onChange={async (e)=>{ setIncludeVideo(e.target.checked); if (e.target.checked) await startMedia(); else stopMedia(); }} className="mr-2" />
              <span className="text-sm">Enable video capture (optional)</span>
            </label>
            <label className="inline-flex items-center">
              <input type="checkbox" checked={enablePose} onChange={async (e)=>{
                const want = e.target.checked;
                setEnablePose(want);
                if (want) {
                  if (includeVideo) await startPoseDetector(); else push('Enable video capture to use pose estimation', 'info');
                } else {
                  stopPoseDetector();
                }
              }} className="mr-2" />
              <span className="text-sm">Enable pose estimation (rep counting)</span>
            </label>
            <label className="inline-flex items-center">
              <input type="checkbox" checked={voiceEnabled} onChange={(e)=>setVoiceEnabled(e.target.checked)} className="mr-2" />
              <span className="text-sm">Voice feedback (audio coach)</span>
            </label>
          </div>

          <div className="lg:col-span-3">
            <div className="mb-2">
              <div className="text-sm">Timer</div>
              <div className="text-4xl font-mono">{timeLeft}s</div>
              <div className="mt-1 text-sm text-gray-300 flex items-center gap-3">
                <span className="opacity-80">Heart rate:</span>
                {fitbitStatus === 'connected' ? (
                  <span className="font-semibold">
                    {heartRate != null ? `${heartRate} bpm` : fallbackHR ? `${fallbackHR.bpm} bpm (last)` : '-- bpm'}
                  </span>
                ) : fitbitStatus === 'not-connected' ? (
                  <button onClick={()=> {
                    // open connect route with token query param for auth
                    const t = localStorage.getItem('token') || sessionStorage.getItem('token');
                    const url = `http://localhost:5000/api/fitbit/connect?token=${encodeURIComponent(t||'')}`;
                    window.open(url, '_blank');
                  }} className="text-indigo-300 underline">Connect Fitbit</button>
                ) : fitbitStatus === 'error' ? (
                  <span className="text-red-400">Error</span>
                ) : (
                  <span className="text-gray-400">Checking…</span>
                )}
              </div>
            </div>
            <div className="flex gap-2 mb-2">
              {!running ? (
                <button onClick={handleStart} className="bg-green-600 px-3 py-2 rounded">Start</button>
              ) : (
                <button onClick={handlePause} className="bg-yellow-500 px-3 py-2 rounded">Pause</button>
              )}
              <button onClick={handleStop} className="bg-red-600 px-3 py-2 rounded">Stop</button>
              <button onClick={handleReset} className="bg-gray-700 px-3 py-2 rounded">Reset</button>
            </div>

            <div className="mb-2">
              <div className="text-sm">Recorded video</div>
              <div className="mt-2 bg-black rounded p-2 shadow-lg">
                {includeVideo ? (
                  <div className="relative">
                    <video ref={videoRef} autoPlay muted playsInline className="w-full h-[60vh] object-cover bg-gray-900 rounded" />
                    <canvas ref={canvasRef} className="absolute inset-0 w-full h-[60vh] pointer-events-none" />
                  </div>
                ) : (
                  <div className="text-xs text-gray-400">Video disabled</div>
                )}
              </div>
              {recordingBlobUrl && (
                <div className="mt-2">
                  <a href={recordingBlobUrl} target="_blank" rel="noreferrer" className="text-blue-400 underline">Download clip</a>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="flex gap-2 justify-end">
          <button onClick={()=>navigate('/exercises')} className="bg-gray-700 px-4 py-2 rounded">Back</button>
          <button onClick={()=>submitResult({completed:true})} className="bg-green-600 px-4 py-2 rounded">Mark Complete & Save</button>
        </section>
      </div>
    </main>
  );
}
