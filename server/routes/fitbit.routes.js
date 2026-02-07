import express from 'express';
import { verifyToken } from '../middleware/authMiddleware.js';
import User from '../models/User.js';
import crypto from 'crypto';

const router = express.Router();

const FITBIT_AUTH_URL = 'https://www.fitbit.com/oauth2/authorize';
const FITBIT_TOKEN_URL = 'https://api.fitbit.com/oauth2/token';
const FITBIT_API = 'https://api.fitbit.com';

const pkceStore = new Map();

function b64(str) { return Buffer.from(str, 'utf8').toString('base64'); }
function base64url(buf) { return Buffer.from(buf).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function genPkce(){ const v = base64url(crypto.randomBytes(32)); const c = base64url(crypto.createHash('sha256').update(v).digest()); return { verifier:v, challenge:c }; }
function escapeHtml(str){ return str.replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[s])); }

function getEnv(){
  const FITBIT_CLIENT_ID = (process.env.FITBIT_CLIENT_ID||'').trim();
  const FITBIT_CLIENT_SECRET = (process.env.FITBIT_CLIENT_SECRET||'').trim();
  const FITBIT_REDIRECT_URI = (process.env.FITBIT_REDIRECT_URI||'').trim();
  if (!FITBIT_CLIENT_ID || !FITBIT_CLIENT_SECRET || !FITBIT_REDIRECT_URI) {
    throw new Error('Fitbit env not configured (FITBIT_CLIENT_ID, FITBIT_CLIENT_SECRET, FITBIT_REDIRECT_URI)');
  }
  return { FITBIT_CLIENT_ID, FITBIT_CLIENT_SECRET, FITBIT_REDIRECT_URI };
}

function extractSummaryBpm(data) {
  try {
    const arr = data?.['activities-heart'];
    if (!Array.isArray(arr) || !arr.length) return null;
    for (const entry of arr) {
      const bpm = entry?.value?.restingHeartRate;
      if (typeof bpm === 'number' && !Number.isNaN(bpm)) {
        return { bpm, time: entry?.dateTime || null, source: 'summary:resting' };
      }
    }
  } catch (_) {}
  return null;
}

router.get('/connect', verifyToken, async (req, res) => {
  try {
    const { FITBIT_CLIENT_ID, FITBIT_REDIRECT_URI } = getEnv();
    const scope = encodeURIComponent('heartrate profile');
    const state = encodeURIComponent(req.user.id);
    const { verifier, challenge } = genPkce();
    pkceStore.set(req.user.id, verifier);
    await User.findByIdAndUpdate(req.user.id, { $set: { 'fitbit.pkceVerifier': verifier, 'fitbit.pkceCreatedAt': new Date() } });
    const url = `${FITBIT_AUTH_URL}?response_type=code&client_id=${FITBIT_CLIENT_ID}&redirect_uri=${encodeURIComponent(FITBIT_REDIRECT_URI)}&scope=${scope}&prompt=consent&state=${state}&code_challenge=${challenge}&code_challenge_method=S256`;
    res.redirect(url);
  } catch (e) {
    console.error('fitbit/connect error', e);
    res.status(500).json({ success:false, error:'Fitbit not configured' });
  }
});

router.get('/connect/for/:email', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'therapist') return res.status(403).json({ success:false, error:'Forbidden: therapist only' });
    const patient = await User.findOne({ email: req.params.email, role:'patient' });
    if (!patient) return res.status(404).json({ success:false, error:'Patient not found' });
    const { FITBIT_CLIENT_ID, FITBIT_REDIRECT_URI } = getEnv();
    const scope = encodeURIComponent('heartrate profile');
    const state = encodeURIComponent(patient._id.toString());
    const { verifier, challenge } = genPkce();
    pkceStore.set(patient._id.toString(), verifier);
    await User.findByIdAndUpdate(patient._id, { $set: { 'fitbit.pkceVerifier': verifier, 'fitbit.pkceCreatedAt': new Date() } });
    const url = `${FITBIT_AUTH_URL}?response_type=code&client_id=${FITBIT_CLIENT_ID}&redirect_uri=${encodeURIComponent(FITBIT_REDIRECT_URI)}&scope=${scope}&prompt=consent&state=${state}&code_challenge=${challenge}&code_challenge_method=S256`;
    res.redirect(url);
  } catch (e) {
    console.error('fitbit/connect-for error', e);
    res.status(500).json({ success:false, error:'Server error' });
  }
});

router.get('/callback', async (req, res) => {
  try {
    const code = req.query.code; const stateUserId = req.query.state;
    const { FITBIT_CLIENT_ID, FITBIT_CLIENT_SECRET, FITBIT_REDIRECT_URI } = getEnv();
    if (!code || !stateUserId) return res.status(400).send('Missing code/state');

    const body = new URLSearchParams();
    body.set('client_id', FITBIT_CLIENT_ID);
    body.set('client_secret', FITBIT_CLIENT_SECRET);
    body.set('grant_type', 'authorization_code');
    body.set('redirect_uri', FITBIT_REDIRECT_URI);
    body.set('code', code);
    let verifier = pkceStore.get(stateUserId);
    if (!verifier) {
      try {
        const u = await User.findById(stateUserId).lean();
        verifier = u?.fitbit?.pkceVerifier || null;
      } catch (_) {}
    }
    if (verifier) body.set('code_verifier', verifier);
    let r = await fetch(FITBIT_TOKEN_URL, { method:'POST', headers:{ 'Authorization':`Basic ${b64(`${FITBIT_CLIENT_ID}:${FITBIT_CLIENT_SECRET}`)}`, 'Content-Type':'application/x-www-form-urlencoded' }, body: body.toString() });
    let data = await r.json();

    if (!r.ok && r.status === 401) {
      const body2 = new URLSearchParams(body.toString()); body2.delete('client_secret');
      r = await fetch(FITBIT_TOKEN_URL, { method:'POST', headers:{ 'Content-Type':'application/x-www-form-urlencoded' }, body: body2.toString() });
      data = await r.json();
    }

    if (!r.ok) {
      const msg = JSON.stringify(data);
      if (r.status === 400 && /invalid_grant/i.test(msg) && /authorization code invalid|authorization code expired/i.test(msg)) {
        try {
          const existing = await User.findById(stateUserId).lean();
          if (existing?.fitbit?.accessToken) {
            return res.send('<html><body style="font-family:system-ui;background:#0f172a;color:#e2e8f0;padding:20px;"><h2>Fitbit already connected</h2><p>You can close this tab and return to the app.</p></body></html>');
          }
        } catch (_) {}
      }
      const authHeader = `Basic ${b64(`${FITBIT_CLIENT_ID}:${FITBIT_CLIENT_SECRET}`)}`;
      const hadVerifier = Boolean(verifier);
      console.error('fitbit token exchange failed', { status:r.status, data, hadVerifier, authHeaderPreview: authHeader.slice(0,20)+'...' });
      return res.status(500).send(`<html><body style="font-family:system-ui;background:#0f172a;color:#e2e8f0;padding:18px"><h2>Fitbit token exchange failed</h2><pre style="white-space:pre-wrap;font-size:12px;">Status: ${r.status}\n${escapeHtml(JSON.stringify(data,null,2))}\ncode_verifier_present: ${hadVerifier}</pre><p>This link can only be used once. If you refreshed this page, close it and click Connect Fitbit again.</p></body></html>`);
    }

    const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000);
    await User.findByIdAndUpdate(stateUserId, { 
      $set: { 
        'fitbit.accessToken': data.access_token,
        'fitbit.refreshToken': data.refresh_token,
        'fitbit.scope': data.scope,
        'fitbit.expiresAt': expiresAt,
        'fitbit.fitbitUserId': data.user_id
      },
      $unset: { 'fitbit.pkceVerifier': 1, 'fitbit.pkceCreatedAt': 1 }
    });
    pkceStore.delete(stateUserId);
    res.send('<html><body style="font-family:system-ui;background:#0f172a;color:#e2e8f0;padding:20px;"><h2>Fitbit connected</h2><p>You can close this tab and return to the app.</p></body></html>');
  } catch (e) {
    console.error('fitbit/callback error', e);
    res.status(500).send(`<html><body style="font-family:system-ui;background:#0f172a;color:#e2e8f0;padding:18px"><h2>Server error</h2><pre>${escapeHtml(String(e.stack||e))}</pre></body></html>`);
  }
});

async function ensureAccessToken(userId){
  const { FITBIT_CLIENT_ID, FITBIT_CLIENT_SECRET } = getEnv();
  const user = await User.findById(userId);
  if (!user?.fitbit?.accessToken) throw new Error('Not connected');
  const expiresAt = user.fitbit.expiresAt ? new Date(user.fitbit.expiresAt).getTime() : 0;
  if (Date.now() < expiresAt - 30000) return user.fitbit.accessToken;
  const body = new URLSearchParams(); body.set('grant_type','refresh_token'); body.set('refresh_token', user.fitbit.refreshToken); body.set('client_id', FITBIT_CLIENT_ID); body.set('client_secret', FITBIT_CLIENT_SECRET);
  const r = await fetch(FITBIT_TOKEN_URL, { method:'POST', headers:{ 'Authorization':`Basic ${b64(`${FITBIT_CLIENT_ID}:${FITBIT_CLIENT_SECRET}`)}`, 'Content-Type':'application/x-www-form-urlencoded' }, body: body.toString() });
  const data = await r.json(); if (!r.ok) throw new Error('Failed to refresh Fitbit token');
  const newExpires = new Date(Date.now() + (data.expires_in || 3600) * 1000);
  await User.findByIdAndUpdate(userId, { $set: {
    'fitbit.accessToken': data.access_token,
    'fitbit.refreshToken': data.refresh_token || user.fitbit.refreshToken,
    'fitbit.scope': data.scope || user.fitbit.scope,
    'fitbit.expiresAt': newExpires,
    'fitbit.fitbitUserId': user.fitbit.fitbitUserId
  }});
  return data.access_token;
}

async function ensureTherapistAccessToPatient(therapistId, patientId) {
  const patient = await User.findById(patientId).lean();
  if (!patient || patient.role !== 'patient') {
    const err = new Error('Patient not found');
    err.status = 404;
    throw err;
  }
  if (String(patient.therapistId || '') !== String(therapistId)) {
    const err = new Error('Forbidden: not assigned');
    err.status = 403;
    throw err;
  }
  return patient;
}

async function latestHeartRateForUser(userId) {
  const access = await ensureAccessToken(userId);
  const candidateUrls = [
    `${FITBIT_API}/1/user/-/activities/heart/date/today/1d/1sec.json`,
    `${FITBIT_API}/1/user/-/activities/heart/date/today/1d/1min.json`,
    `${FITBIT_API}/1/user/-/activities/heart/date/today/1d.json`
  ];
  let last = null; let used = null; let rawResponses = []; let summaryFallback = null; let rateLimited = false;
  for (const url of candidateUrls) {
    const r = await fetch(url, { headers:{ 'Authorization':`Bearer ${access}` } });
    const data = await r.json();
    if (r.status === 429) rateLimited = true;
    const summary = extractSummaryBpm(data);
    if (summary && !summaryFallback) summaryFallback = summary;
    rawResponses.push({
      url,
      status: r.status,
      ok: r.ok,
      sample: data['activities-heart-intraday']
        ? { len: data['activities-heart-intraday'].dataset?.length }
        : (summary || Object.keys(data))
    });
    if (!r.ok) continue;
    const series = data['activities-heart-intraday']?.dataset || [];
    if (series.length) { last = series[series.length-1]; used = url; break; }
    if (!data['activities-heart-intraday']) {
      used = url;
      if (!last && summary) {
        last = { value: summary.bpm, time: summary.time, source: summary.source };
      }
      break;
    }
  }
  const bpm = (last && typeof last.value === 'number') ? last.value : (summaryFallback?.bpm ?? null);
  const bpmTime = last?.time || summaryFallback?.time || null;
  const bpmSource = last?.source || used || summaryFallback?.source || null;
  try {
    if (bpm != null) {
      await User.findByIdAndUpdate(userId, { $set: { 'fitbit.lastHeartRate': { bpm, time: bpmTime, recordedAt: new Date(), source: bpmSource } } });
    }
  } catch (e) { console.warn('Could not persist lastHeartRate', e.message); }

  if (bpm == null) {
    try {
      const u = await User.findById(userId).lean();
      const cached = u?.fitbit?.lastHeartRate || null;
      if (cached) {
        return {
          success:true,
          bpm: cached.bpm,
          time: cached.time,
          source: rateLimited ? 'cached-rate-limit' : 'cached',
          cachedAt: cached.recordedAt,
          quotaExhausted: rateLimited,
          rateLimited
        };
      }
    } catch (e) { }
  }

  const quotaExhausted = rawResponses.some(rr => rr.status === 429);
  return {
    success:true,
    bpm,
    time: bpmTime,
    source: bpmSource,
    quotaExhausted,
    rateLimited,
    summaryUsed: summaryFallback?.source,
    debug: process.env.NODE_ENV==='development' ? rawResponses : undefined
  };
}

async function lastAvailableHeartRateForUser(userId) {
  const access = await ensureAccessToken(userId);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = new Date();
  let found = null; let summaryFallback = null;
  for (let i = 0; i < 7; i++) {
    const d = new Date(today.getTime() - i*24*60*60*1000);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    const url = `${FITBIT_API}/1/user/-/activities/heart/date/${dateStr}/1d/1min.json`;
    const r = await fetch(url, { headers:{ 'Authorization':`Bearer ${access}` } });
    const data = await r.json();
    if (!r.ok) continue;
    const summary = extractSummaryBpm(data);
    if (summary && !summaryFallback) summaryFallback = { bpm: summary.bpm, time: summary.time, date: dateStr, source: summary.source };
    const series = data['activities-heart-intraday']?.dataset || [];
    if (series.length) {
      const last = series[series.length-1];
      found = { bpm: last.value, time: last.time, date: dateStr };
      break;
    }
  }
  if (!found && summaryFallback) {
    found = summaryFallback;
  }
  if (!found) {
    try {
      const u = await User.findById(userId).lean();
      const cached = u?.fitbit?.lastHeartRate || null;
      if (cached) {
        found = { bpm: cached.bpm, time: cached.time, date: null, source: 'cached', cachedAt: cached.recordedAt };
      }
    } catch (e) {  }
  }
  if (found?.bpm != null) {
    try {
      await User.findByIdAndUpdate(userId, { $set: { 'fitbit.lastHeartRate': { bpm: found.bpm, time: found.time, recordedAt: new Date(), source: found.source || 'last-available' } } });
    } catch (e) { console.warn('Could not persist lastHeartRate from last-available', e.message); }
  }
  return { success:true, found, timeZone: tz };
}

router.get('/me/heart-rate/latest', verifyToken, async (req,res) => {
  try {
    const result = await latestHeartRateForUser(req.user.id);
    res.json(result);
  } catch (e) {
    if (String(e.message||'').includes('Not connected')) return res.status(404).json({ success:false, error:'Not connected' });
    console.error('fitbit latest hr error', e); res.status(500).json({ success:false, error:'Server error', details: e.message });
  }
});

router.get('/me/heart-rate/last-available', verifyToken, async (req,res) => {
  try {
    const result = await lastAvailableHeartRateForUser(req.user.id);
    res.json(result);
  } catch (e) {
    if (String(e.message||'').includes('Not connected')) return res.status(404).json({ success:false, error:'Not connected' });
    res.status(500).json({ success:false, error:e.message });
  }
});

router.get('/patients/:id/status', verifyToken, async (req,res) => {
  try {
    if (req.user.role !== 'therapist') return res.status(403).json({ success:false, error:'Forbidden' });
    const patient = await ensureTherapistAccessToPatient(req.user.id, req.params.id);
    const connected = Boolean(patient.fitbit?.accessToken);
    const expiresInMs = patient.fitbit?.expiresAt ? (new Date(patient.fitbit.expiresAt).getTime() - Date.now()) : null;
    res.json({ success:true, connected, scope:patient.fitbit?.scope, expiresAt:patient.fitbit?.expiresAt, expiresInMs, fitbitUserId: patient.fitbit?.fitbitUserId });
  } catch (e) {
    if (e.status === 404) return res.status(404).json({ success:false, error:'Patient not found' });
    if (e.status === 403) return res.status(403).json({ success:false, error:'Not assigned to this patient' });
    res.status(500).json({ success:false, error:e.message });
  }
});

router.get('/patients/:id/heart-rate/latest', verifyToken, async (req,res) => {
  try {
    if (req.user.role !== 'therapist') return res.status(403).json({ success:false, error:'Forbidden' });
    await ensureTherapistAccessToPatient(req.user.id, req.params.id);
    const result = await latestHeartRateForUser(req.params.id);
    res.json(result);
  } catch (e) {
    if (e.status === 404) return res.status(404).json({ success:false, error:'Patient not found' });
    if (e.status === 403) return res.status(403).json({ success:false, error:'Not assigned to this patient' });
    if (String(e.message||'').includes('Not connected')) return res.status(404).json({ success:false, error:'Not connected' });
    res.status(500).json({ success:false, error:'Server error', details: e.message });
  }
});

router.get('/patients/:id/heart-rate/last-available', verifyToken, async (req,res) => {
  try {
    if (req.user.role !== 'therapist') return res.status(403).json({ success:false, error:'Forbidden' });
    await ensureTherapistAccessToPatient(req.user.id, req.params.id);
    const result = await lastAvailableHeartRateForUser(req.params.id);
    res.json(result);
  } catch (e) {
    if (e.status === 404) return res.status(404).json({ success:false, error:'Patient not found' });
    if (e.status === 403) return res.status(403).json({ success:false, error:'Not assigned to this patient' });
    if (String(e.message||'').includes('Not connected')) return res.status(404).json({ success:false, error:'Not connected' });
    res.status(500).json({ success:false, error:e.message });
  }
});

router.get('/me/status', verifyToken, async (req,res) => {
  try {
    const user = await User.findById(req.user.id).lean();
    if (!user?.fitbit?.accessToken) return res.json({ connected:false });
    const expiresInMs = user.fitbit.expiresAt ? (new Date(user.fitbit.expiresAt).getTime() - Date.now()) : null;
    res.json({ connected:true, scope:user.fitbit.scope, expiresAt:user.fitbit.expiresAt, expiresInMs, fitbitUserId:user.fitbit.fitbitUserId });
  } catch (e) {
    res.status(500).json({ connected:false, error:e.message });
  }
});

router.get('/me/heart-rate/raw', verifyToken, async (req,res) => {
  try {
    const access = await ensureAccessToken(req.user.id);
    const url = `${FITBIT_API}/1/user/-/activities/heart/date/today/1d/15min.json`;
    const r = await fetch(url, { headers:{ 'Authorization':`Bearer ${access}` } });
    const data = await r.json();
    return res.status(r.status || 200).json({ ok:r.ok, status:r.status, data });
  } catch (e) {
    if (String(e.message||'').includes('Not connected')) return res.status(404).json({ ok:false, error:'Not connected' });
    res.status(500).json({ ok:false, error:e.message });
  }
});

router.get('/debug', (req,res) => {
  try {
    const { FITBIT_CLIENT_ID, FITBIT_CLIENT_SECRET, FITBIT_REDIRECT_URI } = getEnv();
    const secretLen = FITBIT_CLIENT_SECRET.length; const secretHash = crypto.createHash('sha256').update(FITBIT_CLIENT_SECRET).digest('hex');
    const headerSample = b64(`${FITBIT_CLIENT_ID}:${FITBIT_CLIENT_SECRET}`).slice(0,16)+'...';
    res.json({ success:true, clientId: FITBIT_CLIENT_ID, redirect: FITBIT_REDIRECT_URI, secretLength: secretLen, secretSha256: secretHash, basicHeaderPrefix: headerSample });
  } catch (e) { res.status(500).json({ success:false, error:e.message }); }
});

router.get('/me/debug', verifyToken, async (req, res) => {
  try {
    const u = await User.findById(req.user.id).lean();
    if (!u) return res.status(404).json({ success:false });
    const f = u.fitbit || {};
    res.json({
      success: true,
      connected: Boolean(f.accessToken),
      hasRefreshToken: Boolean(f.refreshToken),
      expiresAt: f.expiresAt || null,
      fitbitUserId: f.fitbitUserId || null,
      pkceStored: Boolean(f.pkceVerifier),
      pkceCreatedAt: f.pkceCreatedAt || null
    });
  } catch (e) { console.error('fitbit me debug error', e); res.status(500).json({ success:false, error:'Server error' }); }
});

router.post('/me/force-refresh', verifyToken, async (req, res) => {
  try {
    const u = await User.findById(req.user.id).lean();
    if (!u?.fitbit?.refreshToken) return res.status(400).json({ success:false, message: 'No refresh token stored' });
    try {
      const access = await ensureAccessToken(req.user.id);
      return res.json({ success:true, refreshed: true, message: 'Refresh succeeded (access token updated).' });
    } catch (e) {
      console.error('force-refresh failed', e.message);
      return res.status(500).json({ success:false, refreshed:false, error: e.message });
    }
  } catch (e) { console.error('fitbit force-refresh error', e); res.status(500).json({ success:false, error:'Server error' }); }
});

router.get('/me/force-refresh', verifyToken, async (req, res) => {
  try {
    const u = await User.findById(req.user.id).lean();
    if (!u?.fitbit?.refreshToken) return res.status(400).json({ success:false, message: 'No refresh token stored' });
    try {
      const access = await ensureAccessToken(req.user.id);
      return res.json({ success:true, refreshed: true, message: 'Refresh succeeded (access token updated).' });
    } catch (e) {
      console.error('force-refresh (GET) failed', e.message);
      return res.status(500).json({ success:false, refreshed:false, error: e.message });
    }
  } catch (e) { console.error('fitbit force-refresh (GET) error', e); res.status(500).json({ success:false, error:'Server error' }); }
});

router.post('/me/disconnect', verifyToken, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, { $unset: {
      'fitbit.accessToken': 1,
      'fitbit.refreshToken': 1,
      'fitbit.expiresAt': 1,
      'fitbit.scope': 1,
      'fitbit.fitbitUserId': 1,
      'fitbit.lastHeartRate': 1,
      'fitbit.pkceVerifier': 1,
      'fitbit.pkceCreatedAt': 1
    }});
    pkceStore.delete(req.user.id);
    res.json({ success:true, message:'Disconnected. Use /api/fitbit/connect to start again.' });
  } catch (e) {
    console.error('fitbit disconnect error', e);
    res.status(500).json({ success:false, error:'Server error' });
  }
});


router.get('/reset-and-connect', verifyToken, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, { $unset: {
      'fitbit.accessToken': 1,
      'fitbit.refreshToken': 1,
      'fitbit.expiresAt': 1,
      'fitbit.scope': 1,
      'fitbit.fitbitUserId': 1,
      'fitbit.lastHeartRate': 1,
      'fitbit.pkceVerifier': 1,
      'fitbit.pkceCreatedAt': 1
    }});
    pkceStore.delete(req.user.id);
    const token = req.query.token;
    const suffix = token ? `?token=${encodeURIComponent(token)}` : '';
    res.redirect(`/api/fitbit/connect${suffix}`);
  } catch (e) {
    console.error('fitbit reset-and-connect error', e);
    res.status(500).json({ success:false, error:'Server error' });
  }
});

export default router;
