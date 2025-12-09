import express from 'express';
import { verifyToken } from '../middleware/authMiddleware.js';
import User from '../models/User.js';
import crypto from 'crypto';

const router = express.Router();

const FITBIT_AUTH_URL = 'https://www.fitbit.com/oauth2/authorize';
const FITBIT_TOKEN_URL = 'https://api.fitbit.com/oauth2/token';
const FITBIT_API = 'https://api.fitbit.com';

// Simple in-memory PKCE store for local dev (maps state/userId -> code_verifier)
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

// Connect Fitbit for the currently logged-in user
router.get('/connect', verifyToken, async (req, res) => {
  try {
    const { FITBIT_CLIENT_ID, FITBIT_REDIRECT_URI } = getEnv();
    const scope = encodeURIComponent('heartrate profile');
    const state = encodeURIComponent(req.user.id);
    const { verifier, challenge } = genPkce();
    pkceStore.set(req.user.id, verifier);
    // Persist verifier to DB so callback works even after restart
    await User.findByIdAndUpdate(req.user.id, { $set: { 'fitbit.pkceVerifier': verifier, 'fitbit.pkceCreatedAt': new Date() } });
    const url = `${FITBIT_AUTH_URL}?response_type=code&client_id=${FITBIT_CLIENT_ID}&redirect_uri=${encodeURIComponent(FITBIT_REDIRECT_URI)}&scope=${scope}&prompt=consent&state=${state}&code_challenge=${challenge}&code_challenge_method=S256`;
    res.redirect(url);
  } catch (e) {
    console.error('fitbit/connect error', e);
    res.status(500).json({ success:false, error:'Fitbit not configured' });
  }
});

// Therapist connects Fitbit on behalf of a patient (by email)
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

// OAuth callback
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
    // Retrieve code_verifier from memory or DB
    let verifier = pkceStore.get(stateUserId);
    if (!verifier) {
      try {
        const u = await User.findById(stateUserId).lean();
        verifier = u?.fitbit?.pkceVerifier || null;
      } catch (_) {}
    }
    if (verifier) body.set('code_verifier', verifier);

    // Attempt with Basic header (server app)
    let r = await fetch(FITBIT_TOKEN_URL, { method:'POST', headers:{ 'Authorization':`Basic ${b64(`${FITBIT_CLIENT_ID}:${FITBIT_CLIENT_SECRET}`)}`, 'Content-Type':'application/x-www-form-urlencoded' }, body: body.toString() });
    let data = await r.json();

    // Fallback: PKCE only (client/personal app)
    if (!r.ok && r.status === 401) {
      const body2 = new URLSearchParams(body.toString()); body2.delete('client_secret');
      r = await fetch(FITBIT_TOKEN_URL, { method:'POST', headers:{ 'Content-Type':'application/x-www-form-urlencoded' }, body: body2.toString() });
      data = await r.json();
    }

    if (!r.ok) {
      // If the code was already used/expired, consider success if the user already has tokens
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
  await User.findByIdAndUpdate(userId, { $set: { fitbit: { accessToken: data.access_token, refreshToken: data.refresh_token || user.fitbit.refreshToken, scope: data.scope || user.fitbit.scope, expiresAt: newExpires, fitbitUserId: user.fitbit.fitbitUserId } } });
  return data.access_token;
}

// Latest heart rate with graceful fallbacks (1sec -> 1min -> summary)
router.get('/me/heart-rate/latest', verifyToken, async (req,res) => {
  try {
    const access = await ensureAccessToken(req.user.id);
    const candidateUrls = [
      `${FITBIT_API}/1/user/-/activities/heart/date/today/1d/1sec.json`, // may fail / be empty for unapproved apps
      `${FITBIT_API}/1/user/-/activities/heart/date/today/1d/1min.json`,
      `${FITBIT_API}/1/user/-/activities/heart/date/today/1d.json` // summary only
    ];
    let last = null; let used = null; let rawResponses = [];
    for (const url of candidateUrls) {
      const r = await fetch(url, { headers:{ 'Authorization':`Bearer ${access}` } });
      const data = await r.json(); rawResponses.push({ url, status:r.status, ok:r.ok, sample: data['activities-heart-intraday'] ? { len: data['activities-heart-intraday'].dataset?.length } : Object.keys(data) });
      if (!r.ok) continue;
      const series = data['activities-heart-intraday']?.dataset || [];
      if (series.length) { last = series[series.length-1]; used = url; break; }
      // If summary endpoint, break even if empty to avoid extra loops
      if (!data['activities-heart-intraday']) { used = url; break; }
    }
    // Persist last known heart-rate for fallback
    try {
      if (last) {
        await User.findByIdAndUpdate(req.user.id, { $set: { 'fitbit.lastHeartRate': { bpm: last.value, time: last.time, recordedAt: new Date() } } });
      }
    } catch (e) { console.warn('Could not persist lastHeartRate', e.message); }

    // If no live data, try cached lastHeartRate from DB
    if (!last) {
      try {
        const u = await User.findById(req.user.id).lean();
        const cached = u?.fitbit?.lastHeartRate || null;
        if (cached) {
          return res.json({ success:true, bpm: cached.bpm, time: cached.time, source: 'cached', cachedAt: cached.recordedAt });
        }
      } catch (e) { /* ignore */ }
    }

    const quotaExhausted = rawResponses.some(rr => rr.status === 429);
    res.json({ success:true, bpm: last ? last.value : null, time: last ? last.time : null, source: used, quotaExhausted, debug: process.env.NODE_ENV==='development' ? rawResponses : undefined });
  } catch (e) {
    if (String(e.message||'').includes('Not connected')) return res.status(404).json({ success:false, error:'Not connected' });
    console.error('fitbit latest hr error', e); res.status(500).json({ success:false, error:'Server error', details: e.message });
  }
});

// Find the most recent available BPM by scanning back up to 7 days (minute-level)
router.get('/me/heart-rate/last-available', verifyToken, async (req,res) => {
  try {
    const access = await ensureAccessToken(req.user.id);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; // hint to client, Fitbit uses account TZ
    const today = new Date();
    let found = null;
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
      const series = data['activities-heart-intraday']?.dataset || [];
      if (series.length) {
        const last = series[series.length-1];
        found = { bpm: last.value, time: last.time, date: dateStr };
        break;
      }
    }
      // If nothing found in the scanned days, try cached lastHeartRate on the user record
      if (!found) {
        try {
          const u = await User.findById(req.user.id).lean();
          const cached = u?.fitbit?.lastHeartRate || null;
          if (cached) {
            found = { bpm: cached.bpm, time: cached.time, date: null, source: 'cached', cachedAt: cached.recordedAt };
          }
        } catch (e) { /* ignore */ }
      }
      res.json({ success:true, found, timeZone: tz });
  } catch (e) {
    if (String(e.message||'').includes('Not connected')) return res.status(404).json({ success:false, error:'Not connected' });
    res.status(500).json({ success:false, error:e.message });
  }
});

// Connection/status introspection
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

// Raw heart data (1min) for debugging
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

// Return safe Fitbit metadata for the current user (no tokens)
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

// Try to refresh the stored refresh token (will not return tokens)
router.post('/me/force-refresh', verifyToken, async (req, res) => {
  try {
    const u = await User.findById(req.user.id).lean();
    if (!u?.fitbit?.refreshToken) return res.status(400).json({ success:false, message: 'No refresh token stored' });
    try {
      const access = await ensureAccessToken(req.user.id);
      // If ensureAccessToken returns, refresh succeeded and access token is valid now
      return res.json({ success:true, refreshed: true, message: 'Refresh succeeded (access token updated).' });
    } catch (e) {
      console.error('force-refresh failed', e.message);
      return res.status(500).json({ success:false, refreshed:false, error: e.message });
    }
  } catch (e) { console.error('fitbit force-refresh error', e); res.status(500).json({ success:false, error:'Server error' }); }
});

// Convenience GET variant so developers can call from a browser with ?token=<JWT>
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

// Reset/disconnect current user's Fitbit connection
router.post('/me/disconnect', verifyToken, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, { $unset: {
      'fitbit.accessToken': 1,
      'fitbit.refreshToken': 1,
      'fitbit.expiresAt': 1,
      'fitbit.scope': 1,
      'fitbit.fitbitUserId': 1,
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

// Convenience: reset then redirect to connect in one step
router.get('/reset-and-connect', verifyToken, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, { $unset: {
      'fitbit.accessToken': 1,
      'fitbit.refreshToken': 1,
      'fitbit.expiresAt': 1,
      'fitbit.scope': 1,
      'fitbit.fitbitUserId': 1,
      'fitbit.pkceVerifier': 1,
      'fitbit.pkceCreatedAt': 1
    }});
    pkceStore.delete(req.user.id);
    // Reuse connect flow
    const token = req.query.token; // verifyToken already accepted this token; reuse for redirect link
    const suffix = token ? `?token=${encodeURIComponent(token)}` : '';
    res.redirect(`/api/fitbit/connect${suffix}`);
  } catch (e) {
    console.error('fitbit reset-and-connect error', e);
    res.status(500).json({ success:false, error:'Server error' });
  }
});

export default router;
