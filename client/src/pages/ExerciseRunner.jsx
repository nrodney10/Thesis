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
  const [finished, setFinished] = useState(false);
  const [autoSubmitted, setAutoSubmitted] = useState(false);
  const [saveStatus, setSaveStatus] = useState('idle');

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const detectorRef = useRef(null);
  const poseLoopRef = useRef(null);
  const submitResultRef = useRef(null);
  const makePoseMetrics = () => ({
    reps: 0,
    lastAngle: null,
    state: 'down',
    smoothedAngle: null,
    lastRepTime: 0,
    
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
    correctReps: 0,
    incorrectReps: 0,
    outOfRangeCount: 0,
    prevInRange: null,
    pendingRepScore: null,
  });
  const poseMetricsRef = useRef(makePoseMetrics());
  const repQualityRef = useRef([]);
  const [, setFeedback] = useState({ level: 'info', message: 'Ready' });
  const [repStats, setRepStats] = useState({ correct: 0, incorrect: 0 });
  const [, setBackend] = useState('');
  const [poseDiag, setPoseDiag] = useState({ lastError: null, attempted: [], backend: null });
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [heartRate, setHeartRate] = useState(null);
  const [fallbackHR, setFallbackHR] = useState(null);
  const [fitbitStatus, setFitbitStatus] = useState('unknown');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const lastSpeakRef = useRef({ t: 0, text: '' });

  const countdownFor = (targetMs) => {
    if (!Number.isFinite(targetMs)) return '';
    const diff = targetMs - nowMs;
    if (diff <= 0) return 'Ready now';
    const totalSeconds = Math.floor(diff / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (days > 0) return `${days}d ${hours}h`;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const markComplete = useCallback(async () => {
    try {
      if (!ex || !ex._id) return false;
      const res = await authFetch(`http://localhost:5000/api/exercises/${ex._id}/complete`, { method:'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        push('Failed to mark exercise complete', 'error');
        return false;
      }
      return true;
    } catch (e) {
      console.warn('markComplete failed', e);
      push('Failed to mark exercise complete', 'error');
      return false;
    }
  }, [authFetch, ex, push]);

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

  const stopPoseDetector = useCallback(async () => {
    try {
      if (poseLoopRef.current) cancelAnimationFrame(poseLoopRef.current);
      if (detectorRef.current?.dispose) detectorRef.current.dispose();
    } catch (e) { console.warn(e); }
    detectorRef.current = null;
    poseLoopRef.current = null;
  }, []);

  const stopMedia = useCallback(() => {
    try { if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop(); } catch (e) {}
    try { if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach((t) => t.stop()); mediaStreamRef.current = null; } } catch (e) {}
    if (videoRef.current) videoRef.current.srcObject = null;
    stopPoseDetector();
  }, [stopPoseDetector]);

  useEffect(() => {
    let t;
    if (running && timeLeft > 0) t = setInterval(() => setTimeLeft((s) => s - 1), 1000);
    if (timeLeft === 0 && running) {
      setRunning(false);
      stopMedia();
      setFinished(true);
      setFeedback({ level: 'info', message: 'Session complete. Save results or restart.' });
      push('Session complete. Save results or restart.', 'info');
      if (!autoSubmitted) {
        setAutoSubmitted(true);
        submitResultRef.current?.({ completed: true, navigateOnSave: false, auto: true });
      }
    }
    return () => clearInterval(t);
  }, [running, timeLeft, stopMedia, push, autoSubmitted]);

  useEffect(() => {
    return () => { stopMedia(); };
  }, [stopMedia]);
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
    
  }, [authFetch, heartRate]);

  useEffect(() => {
    return () => {
      if (recordingBlobUrl) URL.revokeObjectURL(recordingBlobUrl);
    };
  }, [recordingBlobUrl]);
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
      
      setTimeout(() => {
        const v = videoRef.current, c = canvasRef.current;
        if (v && c) { const r = v.getBoundingClientRect(); c.width = r.width; c.height = r.height; }
      }, 120);
      recordedChunksRef.current = [];
      const mr = new MediaRecorder(stream, { mimeType: 'video/webm' });
      mr.ondataavailable = (e) => { if (e.data && e.data.size) recordedChunksRef.current.push(e.data); };
      mr.onstop = () => { const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' }); setRecordingBlobUrl(URL.createObjectURL(blob)); };
      mediaRecorderRef.current = mr;
      
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
      const pd = await import('@tensorflow-models/pose-detection');
      const tf = await import('@tensorflow/tfjs');

      const attempted = [];
      let chosen = null;

      try {
        attempted.push('webgl');
        try { await import('@tensorflow/tfjs-backend-webgl'); } catch (_) { }
        await tf.setBackend('webgl');
        await tf.ready();
        chosen = 'webgl';
      } catch (eWeb) {
        console.warn('webgl failed', eWeb);
        
        try {
          attempted.push('wasm');
          try { await import('@tensorflow/tfjs-backend-wasm'); } catch (_) { }
          await tf.setBackend('wasm');
          await tf.ready();
          chosen = 'wasm';
        } catch (eWasm) {
          console.warn('wasm failed', eWasm);
         
          try {
            attempted.push('cpu');
            await tf.setBackend('cpu');
            await tf.ready();
            chosen = 'cpu';
          } catch (eCpu) {
            console.error('cpu backend failed', eCpu);
            throw eCpu;
          }
        }
      }

      try { setBackend(tf.getBackend()); } catch (_) {}
      setPoseDiag({ lastError: null, attempted, backend: chosen });

      const detector = await pd.createDetector(pd.SupportedModels.MoveNet, {
        modelType: pd.movenet?.modelType?.SINGLEPOSE_LIGHTNING || 'SINGLEPOSE_LIGHTNING'
      });
      detectorRef.current = detector;
      poseLoopRef.current = requestAnimationFrame(poseFrame);
      push(`Pose detector initialized (backend: ${chosen})`, 'success');
    } catch (e) {
      console.error('Pose detector failed to initialize', e);
      const msg = e && e.message ? e.message : String(e);
      setPoseDiag((d) => ({ lastError: msg, attempted: d.attempted || [], backend: d.backend || null }));
      push(`Pose estimation unavailable: ${msg}`, 'error');
      setEnablePose(false);
    }
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
    
    let guessedJoints = baseCfg.joints || (/(arm|elbow)/i.test(ex.title || '') ? 'arm' : 'knee');
    if (baseCfg.targets?.type === 'tpose') guessedJoints = 'arm';
    if (baseCfg.targets?.type === 'squat') guessedJoints = 'knee';
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
    const targetType = cfg.targets?.type;
    const isStaticHold = targetType === 'tpose';
    
    
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
      
      [a, b, c] = pickSide(['left_hip','left_knee','left_ankle'], ['right_hip','right_knee','right_ankle']);
    } else if (cfg.joints === 'arm') {
      
      [a, b, c] = pickSide(['left_shoulder','left_elbow','left_wrist'], ['right_shoulder','right_elbow','right_wrist']);
    } else {
      
      [a, b, c] = pickSide(['left_shoulder','left_hip','left_knee'], ['right_shoulder','right_hip','right_knee']);
    }

    if (!a || !b || !c || a.score < 0.3 || b.score < 0.3 || c.score < 0.3) return;
    
    let angle = calcAngle(a, b, c);
    if (angle == null) return;
    
    if (cfg.joints === 'arm') angle = 180 - angle;

    const metrics = poseMetricsRef.current;
    
    
    const alpha = typeof cfg.smoothing === 'number' ? cfg.smoothing : 0.2;
    const prev = metrics.smoothedAngle ?? angle;
    const smoothed = alpha * angle + (1 - alpha) * prev;
    metrics.smoothedAngle = smoothed;
    metrics.lastAngle = smoothed;
    
    if (!metrics.usedSide) metrics.usedSide = chosenSide;
    
    metrics.minAngle = Math.min(metrics.minAngle, smoothed);
    metrics.maxAngle = Math.max(metrics.maxAngle, smoothed);
    metrics.sumAngle += smoothed;
    metrics.sampleCount += 1;

    
    if (!isStaticHold) {
      const upThreshold = cfg.upAngle ?? 90;
      const downThreshold = cfg.downAngle ?? 140;
      const minRepTime = cfg.minRepTimeMs ?? 400;
      const now = Date.now();

      if (metrics.state === 'down' && smoothed < upThreshold) {
        metrics.state = 'up';
        if (targetType === 'squat') {
          const fb = evaluateForm(smoothed, cfg, key, { chosenSide, rawAngle: angle });
          const score = fb.inRange ? 1 : 0.2;
          metrics.pendingRepScore = score;
        }
        
        if (smoothed < upThreshold - 10) speak(cfg.joints === 'arm' ? 'Raise your arm higher.' : 'Go lower.');
      } else if (metrics.state === 'up' && smoothed > downThreshold) {
        
        if ((now - metrics.lastRepTime) > minRepTime) {
          
          let score;
          if (targetType === 'squat' && typeof metrics.pendingRepScore === 'number') {
            score = metrics.pendingRepScore;
          } else {
            const fb = evaluateForm(smoothed, cfg, key, { chosenSide, rawAngle: angle });
            score = targetType === 'squat' ? (fb.inRange ? 1 : 0.2) : (fb.level === 'good' ? 1 : fb.level === 'caution' ? 0.6 : 0.2);
          }
          repQualityRef.current.push(score);
          metrics.reps += 1;
          if (score >= 0.8) metrics.correctReps += 1; else metrics.incorrectReps += 1;
          metrics.lastRepTime = now;
          metrics.pendingRepScore = null;
          setReps(metrics.reps);
          setRepStats({ correct: metrics.correctReps, incorrect: metrics.incorrectReps });
          speak('Good job!', { minGapMs: 1200 });
        }
        metrics.state = 'down';
      }
    } else {
      metrics.state = 'hold';
    }

    
    const cont = evaluateForm(smoothed, cfg, key, { chosenSide, rawAngle: angle });
    const now2 = Date.now();
    const lastT = metrics.lastSampleTime ?? now2;
    const dt = Math.max(0, now2 - lastT);
    const target = cfg.targets && Array.isArray(cfg.targets.targetRange) ? cfg.targets.targetRange : null;
    const isInRange = typeof cont.inRange === 'boolean'
      ? cont.inRange
      : target
        ? (smoothed >= target[0] && smoothed <= target[1])
        : (cont.level === 'good');
    if (targetType === 'squat' && metrics.state === 'up') {
      if (isInRange) metrics.pendingRepScore = 1;
      else if (metrics.pendingRepScore == null) metrics.pendingRepScore = 0.2;
    }
    if (targetType === 'tpose') {
      if (metrics.prevInRange === true && !isInRange) {
        metrics.outOfRangeCount += 1;
      }
      metrics.prevInRange = isInRange;
    }
    if (isInRange) metrics.timeInTargetMs += dt;
    metrics.lastSampleTime = now2;
    
    const prevLevel = metrics.prevLevel || null;
    if (cont.level !== prevLevel) {
      if (cont.level === 'good') {
        speak(cont.message, { minGapMs: 1200 });
      } else {
        
        speak(cont.message);
      }
      metrics.prevLevel = cont.level;
    }
    setFeedback((prev) => (prev.level === cont.level && prev.message === cont.message ? prev : cont));
  }

  function calcAngle(a, b, c) {
    
    const ab = { x: a.x - b.x, y: a.y - b.y };
    const cb = { x: c.x - b.x, y: c.y - b.y };
    const dot = ab.x * cb.x + ab.y * cb.y;
    const mag = Math.sqrt((ab.x * ab.x + ab.y * ab.y) * (cb.x * cb.x + cb.y * cb.y));
    if (mag === 0) return null;
    const cos = Math.min(1, Math.max(-1, dot / mag));
    return (Math.acos(cos) * 180) / Math.PI;
  }

  function evaluateForm(smoothedAngle, cfg, keypoints, extra = {}) {
    const by = (n) => keypoints.find(k => k.name === n || k.part === n);
    const minScore = typeof cfg.targets?.minScore === 'number' ? cfg.targets.minScore : 0.35;
    const targetType = cfg.targets?.type;

    if (targetType === 'tpose') {
      const ls = by('left_shoulder'), rs = by('right_shoulder');
      const lw = by('left_wrist'), rw = by('right_wrist');
      if (!ls || !rs || !lw || !rw) return { level: 'info', message: 'Move into frame', inRange: false };
      if ([ls, rs, lw, rw].some(p => (p.score || 0) < minScore)) {
        return { level: 'info', message: 'Move closer to the camera', inRange: false };
      }

      const tiltDeg = (shoulder, wrist) => {
        const dx = wrist.x - shoulder.x;
        const dy = wrist.y - shoulder.y;
        return Math.abs(Math.atan2(Math.abs(dy), Math.abs(dx)) * 180 / Math.PI);
      };
      const leftTilt = tiltDeg(ls, lw);
      const rightTilt = tiltDeg(rs, rw);
      const allowedTilt = typeof cfg.targets.allowedRotation === 'number' ? cfg.targets.allowedRotation : 12;
      const leftTiltOk = leftTilt <= allowedTilt;
      const rightTiltOk = rightTilt <= allowedTilt;

        
      const le = by('left_elbow');
      const re = by('right_elbow');
      const elbowTol = typeof cfg.targets?.elbowTol === 'number' ? cfg.targets.elbowTol : 12;
      const elbowsVisible = le && re && (le.score || 0) >= minScore && (re.score || 0) >= minScore;

      if (elbowsVisible) {
        const leftElbowAngle = calcAngle(ls, le, lw);
        const rightElbowAngle = calcAngle(rs, re, rw);
        const leftElbowFlexion = leftElbowAngle != null ? Math.max(0, 180 - leftElbowAngle) : null;
        const rightElbowFlexion = rightElbowAngle != null ? Math.max(0, 180 - rightElbowAngle) : null;
        const leftElbowOk = leftElbowFlexion != null && leftElbowFlexion <= elbowTol;
        const rightElbowOk = rightElbowFlexion != null && rightElbowFlexion <= elbowTol;

        if (leftTiltOk && rightTiltOk && leftElbowOk && rightElbowOk) {
          return { level: 'good', message: cfg.targets?.correctMsg || 'Hold your arms straight out to the sides.', inRange: true, details: { leftTilt, rightTilt, leftElbowFlexion, rightElbowFlexion } };
        }

        const base = cfg.targets?.incorrectMsg;
        if (!leftElbowOk && !rightElbowOk) return { level: 'bad', message: base || `Both elbows look bent; aim for straight arms (<= ${elbowTol} deg flexion).`, inRange: false, details: { leftTilt, rightTilt, leftElbowFlexion, rightElbowFlexion } };
        if (!leftElbowOk) return { level: 'caution', message: base || `Left elbow: ${leftElbowFlexion != null ? Math.round(leftElbowFlexion) + ' deg flex' : 'unseen'} - straighten toward 0 deg.`, inRange: false, details: { leftTilt, rightTilt, leftElbowFlexion } };
        if (!rightElbowOk) return { level: 'caution', message: base || `Right elbow: ${rightElbowFlexion != null ? Math.round(rightElbowFlexion) + ' deg flex' : 'unseen'} - straighten toward 0 deg.`, inRange: false, details: { leftTilt, rightTilt, rightElbowFlexion } };
      }

      
      const leftDy = lw.y - ls.y;
      const rightDy = rw.y - rs.y;
      const base = cfg.targets?.incorrectMsg;
      if (!leftTiltOk && !rightTiltOk) return { level: 'bad', message: base || 'Raise or lower both arms until they are level with your shoulders.', inRange: false, details: { leftTilt, rightTilt } };
      if (!leftTiltOk) return { level: 'caution', message: base || (leftDy < 0 ? 'Lower your left arm slightly.' : 'Raise your left arm to shoulder height.'), inRange: false, details: { leftTilt, rightTilt } };
      return { level: 'caution', message: base || (rightDy < 0 ? 'Lower your right arm slightly.' : 'Raise your right arm to shoulder height.'), inRange: false, details: { leftTilt, rightTilt } };
    }

    if (targetType === 'squat') {
      const side = extra.chosenSide || 'left';
      const shoulder = by(`${side}_shoulder`);
      const hip = by(`${side}_hip`);
      const knee = by(`${side}_knee`);
      const ankle = by(`${side}_ankle`);
      if (!shoulder || !hip || !knee || !ankle) return { level: 'info', message: 'Step fully into view', inRange: false };
      if ([shoulder, hip, knee, ankle].some(p => (p.score || 0) < minScore)) {
        return { level: 'info', message: 'Move closer so joints are clearer', inRange: false };
      }

      const kneeAngle = calcAngle(hip, knee, ankle);
      const hipAngle = calcAngle(shoulder, hip, knee);
      const torsoLeanDeg = (() => {
        const dx = shoulder.x - hip.x; const dy = hip.y - shoulder.y;
        return Math.abs(Math.atan2(dx, dy) * 180 / Math.PI);
      })();
      const wrist = by(`${side}_wrist`);
      const armTilt = wrist ? Math.abs(Math.atan2(Math.abs((wrist.y - shoulder.y)), Math.abs((wrist.x - shoulder.x))) * 180 / Math.PI) : null;

      const [minKnee, maxKnee] = cfg.targets.kneeRange || [80, 110];
      const hipRange = cfg.targets.hipRange;
      const backMin = cfg.targets.backMin;
      const maxLean = typeof cfg.targets.torsoMaxLean === 'number'
        ? cfg.targets.torsoMaxLean
        : typeof backMin === 'number'
          ? Math.max(0, 180 - backMin)
          : 25;
      const maxArmTilt = cfg.targets.armMaxTilt ?? 25;

      let level = 'good';
      const cues = [];
      const setLevel = (sev) => {
        if (sev === 'bad') level = 'bad';
        else if (level === 'good') level = sev;
      };

      if (torsoLeanDeg > maxLean) { setLevel('caution'); cues.push(`Keep your chest up; limit torso lean to ${maxLean} deg.`); }
      if (Array.isArray(hipRange)) {
        const [minHip, maxHip] = hipRange;
        if (hipAngle < minHip) { setLevel('caution'); cues.push(`Open your hip a bit more (aim ${minHip}-${maxHip} deg).`); }
        if (hipAngle > maxHip) { setLevel('caution'); cues.push(`Do not drop hips past ${maxHip} deg.`); }
      }
      if (kneeAngle > maxKnee) { setLevel('caution'); cues.push(`Bend your knees more (aim ${minKnee}-${maxKnee} deg).`); }
      if (kneeAngle < minKnee - 5) { setLevel('bad'); cues.push('Squat is too deep - rise a bit.'); }
      if (armTilt != null && armTilt > maxArmTilt) { setLevel('caution'); cues.push('Lift your arms to shoulder height.'); }

      const inRange = kneeAngle >= minKnee && kneeAngle <= maxKnee && torsoLeanDeg <= maxLean
        && (!hipRange || (hipAngle >= hipRange[0] && hipAngle <= hipRange[1]));
      return {
        level: cues.length ? level : 'good',
        message: cues[0] || 'Hold that squat position.',
        inRange,
        details: { kneeAngle, hipAngle, torsoLeanDeg, armTilt, side }
      };
    }

    const targets = cfg.targets || (cfg.joints === 'arm'
      ? { targetRange: [45, 60] }
      : { bottomRange: [70, 100], topRange: [150, 180] }
    );
    if (smoothedAngle == null) return { level: 'info', message: 'Move into frame' };
    if (targets.targetRange && Array.isArray(targets.targetRange)) {
      const [minA, maxA] = targets.targetRange;
      if (smoothedAngle >= minA && smoothedAngle <= maxA) {
        return { level: 'good', message: `Great - hold ${minA}-${maxA} deg.`, inRange: true };
      }
      if (smoothedAngle < minA) {
        return { level: 'caution', message: 'Extend your elbow slightly.', inRange: false };
      }
      return { level: 'caution', message: 'Bend your elbow a bit more.', inRange: false };
    }
    const [minBottom, maxBottom] = targets.bottomRange || [70, 100];
    const [minTop] = targets.topRange || [150, 180];
    let level = 'good';
    let message = 'Good form';
    if (keypoints && keypoints.length) {
      const sh = by('left_shoulder') || by('right_shoulder');
      const hip = by('left_hip') || by('right_hip');
      if (sh && hip && sh.score > 0.3 && hip.score > 0.3) {
        const dx = sh.x - hip.x; const dy = hip.y - sh.y;
        const torsoDeg = Math.abs(Math.atan2(dx, dy)) * 180 / Math.PI;
        if (torsoDeg > 25) {
          return { level: 'caution', message: 'Keep your back straight.', inRange: false };
        }
      }
    }
    if (poseMetricsRef.current.state === 'up') {
      if (smoothedAngle > minTop) { level = 'good'; message = 'Fully extend'; }
      else if (smoothedAngle > minTop - 15) { level = 'caution'; message = 'Extend a bit more'; }
      else { level = 'bad'; message = 'Not fully extended'; }
    } else {
      if (smoothedAngle >= minBottom && smoothedAngle <= maxBottom) { level = 'good'; message = 'Depth looks good'; }
      else if (smoothedAngle < minBottom) { level = 'bad'; message = 'Too deep - protect your joints'; }
      else { level = 'caution'; message = 'Go a bit deeper'; }
    }
    return { level, message, inRange: level === 'good' };
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
    const angle = poseMetricsRef.current.smoothedAngle;
    
    const cfg = getPoseConfig();
    const fb = evaluateForm(angle, cfg, pose.keypoints || [], { chosenSide: poseMetricsRef.current.usedSide });
    const levelColor = fb.level === 'good' ? '#22c55e' : fb.level === 'caution' ? '#f59e0b' : fb.level === 'bad' ? '#ef4444' : '#38bdf8';
    const edges = [
      ['left_shoulder','right_shoulder'],
      ['left_shoulder','left_elbow'],['left_elbow','left_wrist'],
      ['right_shoulder','right_elbow'],['right_elbow','right_wrist'],
      ['left_hip','right_hip'],
      ['left_hip','left_knee'],['left_knee','left_ankle'],
      ['right_hip','right_knee'],['right_knee','right_ankle']
    ];
    ctx.strokeStyle = levelColor;
    edges.forEach(([a,b]) => {
      const pa = get(a), pb = get(b);
      if (!pa || !pb || pa.score < scoreMin || pb.score < scoreMin) return;
      ctx.beginPath(); ctx.moveTo(pa.x * sx, pa.y * sy); ctx.lineTo(pb.x * sx, pb.y * sy); ctx.stroke();
    });
    ctx.fillStyle = levelColor;
    ['left_hip','right_hip','left_knee','right_knee','left_ankle','right_ankle','left_shoulder','right_shoulder','left_elbow','right_elbow','left_wrist','right_wrist']
      .forEach(n => { const p = get(n); if (!p || p.score < scoreMin) return; ctx.beginPath(); ctx.arc(p.x * sx, p.y * sy, 3, 0, Math.PI*2); ctx.fill(); });
    ctx.fillStyle = fb.level === 'good' ? 'rgba(16,185,129,0.75)' : fb.level === 'caution' ? 'rgba(234,179,8,0.75)' : fb.level === 'bad' ? 'rgba(239,68,68,0.75)' : 'rgba(59,130,246,0.75)';
    ctx.fillRect(0, 0, c.width, 44);
    ctx.fillStyle = '#0b1020';
    ctx.font = 'bold 14px ui-sans-serif, system-ui, -apple-system';
    const m = poseMetricsRef.current;
    const inRangeSec = (m.timeInTargetMs || 0) / 1000;
    const minA = isFinite(m.minAngle) ? m.minAngle.toFixed(0) : '--';
    const maxA = isFinite(m.maxAngle) ? m.maxAngle.toFixed(0) : '--';
    const outCount = m.outOfRangeCount || 0;
    const correct = m.correctReps || 0;
    const incorrect = m.incorrectReps || 0;
    ctx.fillText(`Angle: ${angle != null ? angle.toFixed(0) + ' deg' : '--'} | In-range: ${inRangeSec.toFixed(1)}s | Out-of-range: ${outCount} | Correct/Wrong: ${correct}/${incorrect} | Min/Max: ${minA}/${maxA}`, 8, 19);

    
    ctx.font = 'bold 12px ui-sans-serif, system-ui, -apple-system';
    ctx.fillStyle = '#0f172a';
    let infoLine = fb.message || '';
    if (fb.details?.leftTilt != null) {
      if (fb.details.leftElbowFlexion != null || fb.details.rightElbowFlexion != null) {
        infoLine = `T-pose: left tilt ${fb.details.leftTilt.toFixed(0)} deg, right tilt ${fb.details.rightTilt?.toFixed(0) ?? '--'} deg | flex L:${fb.details.leftElbowFlexion != null ? Math.round(fb.details.leftElbowFlexion)+' deg' : '--'}, R:${fb.details.rightElbowFlexion != null ? Math.round(fb.details.rightElbowFlexion)+' deg' : '--'}`;
      } else {
        infoLine = `T-pose: left tilt ${fb.details.leftTilt.toFixed(0)} deg, right tilt ${fb.details.rightTilt?.toFixed(0) ?? '--'} deg`;
      }
    } else if (fb.details?.kneeAngle != null) {
      infoLine = `Squat: knee ${fb.details.kneeAngle.toFixed(0)} deg, torso lean ${fb.details.torsoLeanDeg?.toFixed(0) ?? '--'} deg, arms tilt ${fb.details.armTilt != null ? fb.details.armTilt.toFixed(0) : '--'} deg`;
    } else if (cfg.targets?.type === 'tpose') {
      
      const allowedTilt = typeof cfg.targets.allowedRotation === 'number' ? cfg.targets.allowedRotation : 12;
      const elbowTol = typeof cfg.targets.elbowTol === 'number' ? cfg.targets.elbowTol : 12;
      infoLine = `T-pose target: flex <= ${elbowTol} deg; tilt <= ${allowedTilt} deg`;
      if (fb.details?.leftElbowFlexion != null || fb.details?.rightElbowFlexion != null) {
        infoLine += ` | flex L:${fb.details.leftElbowFlexion != null ? Math.round(fb.details.leftElbowFlexion)+' deg' : '--'}, R:${fb.details.rightElbowFlexion != null ? Math.round(fb.details.rightElbowFlexion)+' deg' : '--'}`;
      }
      if (fb.details?.leftTilt != null) {
        infoLine += ` | tilt L:${fb.details.leftTilt.toFixed(0)} deg, R:${fb.details.rightTilt?.toFixed(0) ?? '--'} deg`;
      }
    } else if (cfg.joints === 'arm' && !cfg.targets?.type) {
      infoLine = 'Target: 45-60 deg (elbow flexion)';
    }
    if (infoLine) ctx.fillText(infoLine, 8, 36);
  }

  const handleStart = async () => {
    poseMetricsRef.current = makePoseMetrics();
    repQualityRef.current = [];
    setRepStats({ correct: 0, incorrect: 0 });
    setReps(0);
    setFeedback((prev) => ({ ...prev, message: 'Starting...', level: 'info' }));
    setTimeLeft(initialTime);
    if (includeVideo) { await startMedia(); try { mediaRecorderRef.current?.start(); } catch (e) { console.warn('recorder start failed', e); } }
    setRunning(true);
    setFinished(false);
    setAutoSubmitted(false);
    setSaveStatus('idle');
    push('Exercise started', 'info');
  };

  const handlePause = () => { setRunning(false); try { mediaRecorderRef.current?.pause?.(); } catch (e) {} push('Paused', 'info'); };
  const handleReset = () => {
    setRunning(false);
    setTimeLeft(initialTime);
    setReps(0);
    poseMetricsRef.current = makePoseMetrics();
    repQualityRef.current = [];
    setRepStats({ correct: 0, incorrect: 0 });
    setFinished(false);
    setAutoSubmitted(false);
    setSaveStatus('idle');
    stopMedia();
    setRecordingBlobUrl(null);
    setFeedback({ level: 'info', message: 'Reset. Ready when you are.' });
    push('Reset', 'info');
  };
  const handleStop = () => { setRunning(false); try { mediaRecorderRef.current?.stop(); } catch (e) {} stopMedia(); push('Stopped', 'info'); };

  const handleRestart = async () => {
    setRunning(false);
    setTimeLeft(initialTime);
    setReps(0);
    poseMetricsRef.current = makePoseMetrics();
    repQualityRef.current = [];
    setRepStats({ correct: 0, incorrect: 0 });
    setFinished(false);
    setAutoSubmitted(false);
    setSaveStatus('idle');
    stopMedia();
    setRecordingBlobUrl(null);
    setFeedback({ level: 'info', message: 'Restarting...' });
    if (includeVideo) { await startMedia(); try { mediaRecorderRef.current?.start(); } catch (e) { console.warn('recorder start failed', e); } }
    setRunning(true);
    push('Exercise restarted', 'info');
  };

  const submitResult = useCallback(async ({ completed = true, score = null, navigateOnSave = true, auto = false } = {}) => {
    if (!ex) return push('No exercise selected', 'error');
    if (saveStatus === 'saved') {
      if (!auto) push('Results already saved for this session.', 'info');
      return true;
    }
    let saved = false;
    try {
      setSaveStatus('saving');
      const poseMetricsRaw = poseMetricsRef.current || { reps: 0 };
      
      const avgAngle = poseMetricsRaw.sampleCount > 0 ? (poseMetricsRaw.sumAngle / poseMetricsRaw.sampleCount) : null;
      const durationSec = Math.max(1, initialTime - timeLeft);
      const cadence = reps / (durationSec / 60);
      const poseType = ex?.poseConfig?.targets?.type
        || (/t-?pose/i.test(ex?.title || '') ? 'tpose' : /squat/i.test(ex?.title || '') ? 'squat' : undefined);
      const poseMetrics = {
        reps: poseMetricsRaw.reps ?? reps,
        lastAngle: Number.isFinite(poseMetricsRaw.lastAngle) ? poseMetricsRaw.lastAngle : undefined,
        state: poseMetricsRaw.state || undefined,
        minAngle: Number.isFinite(poseMetricsRaw.minAngle) ? poseMetricsRaw.minAngle : undefined,
        maxAngle: Number.isFinite(poseMetricsRaw.maxAngle) ? poseMetricsRaw.maxAngle : undefined,
        avgAngle: avgAngle ?? undefined,
        timeInTargetMs: Number.isFinite(poseMetricsRaw.timeInTargetMs) ? poseMetricsRaw.timeInTargetMs : undefined,
        usedSide: poseMetricsRaw.usedSide || undefined,
        cadence,
        quality: repQualityRef.current,
        correctReps: poseMetricsRaw.correctReps ?? repStats.correct ?? undefined,
        incorrectReps: poseMetricsRaw.incorrectReps ?? repStats.incorrect ?? undefined,
        outOfRangeCount: typeof poseMetricsRaw.outOfRangeCount === 'number' ? poseMetricsRaw.outOfRangeCount : undefined
      };
      const metadata = {
        reps,
        difficulty,
        duration: durationSec,
        video: !!recordingBlobUrl,
        poseMetrics,
        poseType,
        exerciseTitle: ex?.title || undefined,
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
        if (data.success) { push('Result uploaded', 'success'); saved = true; await markComplete(); } else push('Upload failed', 'error');
      } else {
        const res = await authFetch('http://localhost:5000/api/results', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        if (data.success) { push('Result saved', 'success'); saved = true; await markComplete(); } else push('Failed to save result', 'error');
      }
    } catch (err) {
      console.error('Submit result error', err);
      push('Error submitting result', 'error');
    }
    if (saved) {
      setSaveStatus('saved');
      if (navigateOnSave) navigate('/exercises', { state: { refresh: true } });
    } else {
      setSaveStatus('error');
    }
    return saved;
  }, [authFetch, ex, saveStatus, initialTime, timeLeft, reps, difficulty, recordingBlobUrl, repStats, push, navigate, heartRate, markComplete]);

  useEffect(() => {
    submitResultRef.current = submitResult;
  }, [submitResult]);

  if (!ex) return <main className="min-h-screen p-8 bg-gray-900 text-gray-100"><div className="max-w-2xl mx-auto">No exercise selected</div></main>;

  const lockedUntil = ex?.dueAt ? new Date(ex.dueAt).getTime() : NaN;
  const locked = Number.isFinite(lockedUntil) && lockedUntil > nowMs;
  if (locked) {
    const countdown = countdownFor(lockedUntil);
    return (
      <main className="min-h-screen p-8 bg-gray-900 text-gray-100">
        <div className="max-w-2xl mx-auto bg-gray-800 p-6 rounded shadow text-center">
          <div className="text-xl font-semibold mb-2">Scheduled exercise</div>
          <div className="text-sm text-gray-300 mb-2">This exercise unlocks on {new Date(lockedUntil).toLocaleString()}.</div>
          <div className="text-xs text-indigo-300 mb-4">Starts in {countdown}</div>
          <button onClick={()=>navigate('/exercises')} className="bg-indigo-600 px-4 py-2 rounded text-white">Back to Exercises</button>
        </div>
      </main>
    );
  }

  const liveMetrics = poseMetricsRef.current || {};
  const inRangeSec = ((liveMetrics.timeInTargetMs || 0) / 1000);
  const outOfRangeCount = liveMetrics.outOfRangeCount || 0;
  const correctCount = liveMetrics.correctReps ?? repStats.correct;
  const incorrectCount = liveMetrics.incorrectReps ?? repStats.incorrect;

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
            {poseDiag?.lastError && (
              <div className="mt-2 bg-red-800 text-white p-2 rounded text-sm">
                <div><strong>Pose init error:</strong> {poseDiag.lastError}</div>
                <div className="text-xs text-gray-200 mt-1">Attempted: {poseDiag.attempted?.join(', ') || 'none'}. Backend: {poseDiag.backend || 'unknown'}</div>
                <div className="mt-2 flex gap-2">
                  <button onClick={async ()=>{
                    
                    try {
                      const tf = await import('@tensorflow/tfjs');
                      await tf.setBackend('cpu');
                      await tf.ready();
                      setBackend(tf.getBackend());
                      setPoseDiag({ lastError: null, attempted: ['cpu-forced'], backend: 'cpu' });
                      const pd = await import('@tensorflow-models/pose-detection');
                      const detector = await pd.createDetector(pd.SupportedModels.MoveNet, { modelType: pd.movenet?.modelType?.SINGLEPOSE_LIGHTNING || 'SINGLEPOSE_LIGHTNING' });
                      detectorRef.current = detector;
                      poseLoopRef.current = requestAnimationFrame(poseFrame);
                      push('Pose detector initialized (cpu)', 'success');
                      setEnablePose(true);
                    } catch (err) {
                      console.error('Force CPU failed', err);
                      const m = err && err.message ? err.message : String(err);
                      setPoseDiag((d)=>({ ...d, lastError: m }));
                      push(`Force CPU failed: ${m}`, 'error');
                      setEnablePose(false);
                    }
                  }} className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700">Force CPU & retry</button>
                  <button onClick={()=>{ console.log('Pose diag', poseDiag); push('Diagnostics printed to console', 'info'); }} className="px-2 py-1 rounded bg-gray-700">Show details</button>
                </div>
              </div>
            )}
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
                    const t = localStorage.getItem('token') || sessionStorage.getItem('token');
                    const url = `http://localhost:5000/api/fitbit/connect?token=${encodeURIComponent(t||'')}`;
                    window.open(url, '_blank');
                  }} className="text-indigo-300 underline">Connect Fitbit</button>
                ) : fitbitStatus === 'error' ? (
                  <span className="text-red-400">Error</span>
                ) : (
                  <span className="text-gray-400">Checking...</span>
                )}
              </div>
              <div className="mt-2 text-xs text-gray-300">
                <div>In-range time: {inRangeSec.toFixed(1)}s</div>
                <div>Out-of-range count: {outOfRangeCount}</div>
                <div>Correct squats: {correctCount} | Wrong squats: {incorrectCount}</div>
              </div>
            </div>
            <div className="flex gap-2 mb-2">
              {!finished && (!running ? (
                <button onClick={handleStart} className="bg-green-600 px-3 py-2 rounded">Start</button>
              ) : (
                <button onClick={handlePause} className="bg-yellow-500 px-3 py-2 rounded">Pause</button>
              ))}
              {!finished && <button onClick={handleStop} className="bg-red-600 px-3 py-2 rounded">Stop</button>}
              <button onClick={handleReset} className="bg-gray-700 px-3 py-2 rounded">Reset</button>
            </div>
            {finished && (
              <div className="mb-2 p-3 rounded border border-green-700 bg-gray-800">
                <div className="font-semibold text-green-300">Session complete</div>
                <div className="text-xs text-gray-300 mt-1">
                  {saveStatus === 'saving'
                    ? 'Saving results...'
                    : saveStatus === 'saved'
                      ? 'Results saved and sent to your therapist.'
                      : saveStatus === 'error'
                        ? 'Failed to save results. Please try again.'
                        : 'Results are ready to save.'}
                </div>
                <div className="mt-2 flex gap-2">
                  <button onClick={handleRestart} className="bg-indigo-600 px-3 py-2 rounded">Restart</button>
                  <button
                    onClick={()=>submitResult({completed:true, navigateOnSave:false})}
                    disabled={saveStatus === 'saving' || saveStatus === 'saved'}
                    className={`px-3 py-2 rounded ${saveStatus === 'saving' || saveStatus === 'saved' ? 'bg-gray-700 text-gray-400' : 'bg-green-600 text-white'}`}
                  >
                    {saveStatus === 'saved' ? 'Saved' : 'Save Results'}
                  </button>
                  <button onClick={()=>navigate('/exercises', { state: { refresh: true } })} className="bg-gray-700 px-3 py-2 rounded">Exit</button>
                </div>
              </div>
            )}

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
          <button
            onClick={()=>submitResult({completed:true})}
            disabled={saveStatus === 'saving' || saveStatus === 'saved'}
            className={`px-4 py-2 rounded ${saveStatus === 'saving' || saveStatus === 'saved' ? 'bg-gray-700 text-gray-400' : 'bg-green-600 text-white'}`}
          >
            {saveStatus === 'saved' ? 'Saved' : saveStatus === 'saving' ? 'Saving...' : 'Save Results'}
          </button>
        </section>
      </div>
    </main>
  );
}
