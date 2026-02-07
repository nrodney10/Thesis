import express from 'express';
import { verifyToken } from '../middleware/authMiddleware.js';
import User from '../models/User.js';
import crypto from 'crypto';

const router = express.Router();

const FITBIT_AUTH_URL = 'https://www.fitbit.com/oauth2/authorize';
const FITBIT_TOKEN_URL = 'https://api.fitbit.com/oauth2/token';
const FITBIT_API = 'https://api.fitbit.com';

const pkceStore = new Map();

function b64(str) {
  return Buffer.from(str, 'utf8').toString('base64');
}

function getEnv() {
  const FITBIT_CLIENT_ID = (process.env.FITBIT_CLIENT_ID || '').trim();
  const FITBIT_CLIENT_SECRET = (process.env.FITBIT_CLIENT_SECRET || '').trim();
  const FITBIT_REDIRECT_URI = (process.env.FITBIT_REDIRECT_URI || '').trim();
  if (!FITBIT_CLIENT_ID || !FITBIT_CLIENT_SECRET || !FITBIT_REDIRECT_URI) {
    throw new Error('Fitbit env not configured (FITBIT_CLIENT_ID, FITBIT_CLIENT_SECRET, FITBIT_REDIRECT_URI)');
  }
  return { FITBIT_CLIENT_ID, FITBIT_CLIENT_SECRET, FITBIT_REDIRECT_URI };
}

router.get('/connect', verifyToken, async (req, res) => {
  try {
    const { FITBIT_CLIENT_ID, FITBIT_REDIRECT_URI } = getEnv();
    const scope = encodeURIComponent('heartrate profile');
    const state = encodeURIComponent(req.user.id);
    const { verifier, challenge } = genPkce();
    pkceStore.set(req.user.id, verifier);
    const url = `${FITBIT_AUTH_URL}?response_type=code&client_id=${FITBIT_CLIENT_ID}&redirect_uri=${encodeURIComponent(FITBIT_REDIRECT_URI)}&scope=${scope}&prompt=consent&state=${state}&code_challenge=${challenge}&code_challenge_method=S256`;
    res.redirect(url);
  } catch (e) {
    console.error('fitbit/connect error', e);
    res.status(500).json({ success: false, error: 'Fitbit not configured' });
  }
});

router.get('/connect/for/:email', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'therapist') {
      return res.status(403).json({ success: false, error: 'Forbidden: therapist only' });
    }
    const patientEmail = req.params.email;
    const patient = await User.findOne({ email: patientEmail, role: 'patient' });
    if (!patient) {
      return res.status(404).json({ success: false, error: 'Patient not found' });
    }
    const { FITBIT_CLIENT_ID, FITBIT_REDIRECT_URI } = getEnv();
    const scope = encodeURIComponent('heartrate profile');
    const state = encodeURIComponent(patient._id.toString());
    const { verifier, challenge } = genPkce();
    pkceStore.set(patient._id.toString(), verifier);
    const url = `${FITBIT_AUTH_URL}?response_type=code&client_id=${FITBIT_CLIENT_ID}&redirect_uri=${encodeURIComponent(FITBIT_REDIRECT_URI)}&scope=${scope}&prompt=consent&state=${state}&code_challenge=${challenge}&code_challenge_method=S256`;
    res.redirect(url);
  } catch (e) {
    console.error('fitbit/connect-for error', e);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.get('/callback', async (req, res) => {
  try {
    const code = req.query.code;
    const stateUserId = req.query.state;
    const { FITBIT_CLIENT_ID, FITBIT_CLIENT_SECRET, FITBIT_REDIRECT_URI } = getEnv();
    if (!code || !stateUserId) return res.status(400).send('Missing code/state');

    const body = new URLSearchParams();
    body.set('client_id', FITBIT_CLIENT_ID);
    body.set('client_secret', FITBIT_CLIENT_SECRET);
    body.set('grant_type', 'authorization_code');
    body.set('redirect_uri', FITBIT_REDIRECT_URI);
    body.set('code', code);
    const verifier = pkceStore.get(stateUserId);
    if (verifier) body.set('code_verifier', verifier);

    let r = await fetch(FITBIT_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${b64(`${FITBIT_CLIENT_ID}:${FITBIT_CLIENT_SECRET}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });
    let data = await r.json();

    if (!r.ok && r.status === 401) {
      const body2 = new URLSearchParams(body.toString());
      body2.delete('client_secret');
      r = await fetch(FITBIT_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body2.toString()
      });
      data = await r.json();
    }

    if (!r.ok) {
      const authHeader = `Basic ${b64(`${FITBIT_CLIENT_ID}:${FITBIT_CLIENT_SECRET}`)}`;
      console.error('fitbit token exchange failed', { status: r.status, data, authHeaderPreview: authHeader.slice(0,20)+'...' });
      return res.status(500).send(`<html><body style="font-family:system-ui;background:#0f172a;color:#e2e8f0;padding:18px"><h2>Fitbit token exchange failed</h2><pre style="white-space:pre-wrap;font-size:12px;">Status: ${r.status}\n${escapeHtml(JSON.stringify(data,null,2))}</pre><p>Check client id/secret, redirect URI EXACT match, scopes, and that the code has not already been used (one-time).</p></body></html>`);
    }

    const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000);
    await User.findByIdAndUpdate(stateUserId, {
      $set: {
        fitbit: {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          scope: data.scope,
          expiresAt,
          fitbitUserId: data.user_id
        }
      }
    });

    pkceStore.delete(stateUserId);

    res.send('<html><body style="font-family:system-ui;background:#0f172a;color:#e2e8f0;padding:20px;"><h2>Fitbit connected</h2><p>You can close this tab and return to the app.</p></body></html>');
  } catch (e) {
    console.error('fitbit/callback error', e);
    res.status(500).send(`<html><body style="font-family:system-ui;background:#0f172a;color:#e2e8f0;padding:18px"><h2>Server error</h2><pre>${escapeHtml(String(e.stack||e))}</pre></body></html>`);
  }
});

async function ensureAccessToken(userId) {
  const { FITBIT_CLIENT_ID, FITBIT_CLIENT_SECRET } = getEnv();
  const user = await User.findById(userId);
  if (!user?.fitbit?.accessToken) throw new Error('Not connected');
  const expiresAt = user.fitbit.expiresAt ? new Date(user.fitbit.expiresAt).getTime() : 0;
  if (Date.now() < expiresAt - 30000) return user.fitbit.accessToken;

  const body = new URLSearchParams();
  body.set('grant_type', 'refresh_token');
  body.set('refresh_token', user.fitbit.refreshToken);
  body.set('client_id', FITBIT_CLIENT_ID);
  body.set('client_secret', FITBIT_CLIENT_SECRET);

  const r = await fetch(FITBIT_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${b64(`${FITBIT_CLIENT_ID}:${FITBIT_CLIENT_SECRET}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  });
  const data = await r.json();
  if (!r.ok) { throw new Error('Failed to refresh Fitbit token'); }
  const newExpires = new Date(Date.now() + (data.expires_in || 3600) * 1000);
  await User.findByIdAndUpdate(userId, {
    $set: {
      fitbit: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || user.fitbit.refreshToken,
        scope: data.scope || user.fitbit.scope,
        expiresAt: newExpires,
        fitbitUserId: user.fitbit.fitbitUserId
      }
    }
  });
  return data.access_token;
}

router.get('/me/heart-rate/latest', verifyToken, async (req, res) => {
  try {
    const access = await ensureAccessToken(req.user.id);
    const url = `${FITBIT_API}/1/user/-/activities/heart/date/today/1d/1sec.json`;
    const r = await fetch(url, { headers: { 'Authorization': `Bearer ${access}` } });
    const data = await r.json();
    if (!r.ok) {
      console.error('fitbit hr fetch failed', data);
      return res.status(400).json({ success: false, error: 'Fitbit API error', details: data });
    }
    const series = data['activities-heart-intraday']?.dataset || [];
    const last = series[series.length - 1] || null;
    res.json({ success: true, bpm: last ? last.value : null, time: last ? last.time : null });
  } catch (e) {
    if (String(e.message || '').includes('Not connected')) return res.status(404).json({ success: false, error: 'Not connected' });
    console.error('fitbit latest hr error', e);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

router.get('/debug', (req, res) => {
  try {
    const { FITBIT_CLIENT_ID, FITBIT_CLIENT_SECRET, FITBIT_REDIRECT_URI } = getEnv();
    const secretLen = FITBIT_CLIENT_SECRET.length;
    const secretHash = crypto.createHash('sha256').update(FITBIT_CLIENT_SECRET).digest('hex');
    const headerSample = b64(`${FITBIT_CLIENT_ID}:${FITBIT_CLIENT_SECRET}`).slice(0, 16) + '...';
    res.json({
      success: true,
      clientId: FITBIT_CLIENT_ID,
      redirect: FITBIT_REDIRECT_URI,
      secretLength: secretLen,
      secretSha256: secretHash,
      basicHeaderPrefix: headerSample
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;

function base64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function genPkce() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}
function escapeHtml(str) {
  return str.replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}
import express from 'express';
import { verifyToken } from '../middleware/authMiddleware.js';
import User from '../models/User.js';
const pkceStore = new Map();
import crypto from 'crypto';

const router = express.Router();

const FITBIT_AUTH_URL = 'https://www.fitbit.com/oauth2/authorize';
const FITBIT_TOKEN_URL = 'https://api.fitbit.com/oauth2/token';
const FITBIT_API = 'https://api.fitbit.com';
    const state = encodeURIComponent(req.user.id);
    const { verifier, challenge } = genPkce();
    pkceStore.set(req.user.id, verifier);
    const url = `${FITBIT_AUTH_URL}?response_type=code&client_id=${FITBIT_CLIENT_ID}&redirect_uri=${encodeURIComponent(FITBIT_REDIRECT_URI)}&scope=${scope}&prompt=consent&state=${state}&code_challenge=${challenge}&code_challenge_method=S256`;
function b64(str){
  return Buffer.from(str, 'utf8').toString('base64');
}

function getEnv() {
  const FITBIT_CLIENT_ID = (process.env.FITBIT_CLIENT_ID || '').trim();
  const FITBIT_CLIENT_SECRET = (process.env.FITBIT_CLIENT_SECRET || '').trim();
  const FITBIT_REDIRECT_URI = (process.env.FITBIT_REDIRECT_URI || '').trim();
  if (!FITBIT_CLIENT_ID || !FITBIT_CLIENT_SECRET || !FITBIT_REDIRECT_URI) {
    throw new Error('Fitbit env not configured (FITBIT_CLIENT_ID, FITBIT_CLIENT_SECRET, FITBIT_REDIRECT_URI)');
  }
  return { FITBIT_CLIENT_ID, FITBIT_CLIENT_SECRET, FITBIT_REDIRECT_URI };
}

router.get('/connect', verifyToken, async (req, res) => {
  try {
    const { FITBIT_CLIENT_ID, FITBIT_REDIRECT_URI } = getEnv();
    const state = encodeURIComponent(patient._id.toString());
    const { verifier, challenge } = genPkce();
    pkceStore.set(patient._id.toString(), verifier);
    const url = `${FITBIT_AUTH_URL}?response_type=code&client_id=${FITBIT_CLIENT_ID}&redirect_uri=${encodeURIComponent(FITBIT_REDIRECT_URI)}&scope=${scope}&prompt=consent&state=${state}&code_challenge=${challenge}&code_challenge_method=S256`;
    const state = encodeURIComponent(req.user.id);
    const url = `${FITBIT_AUTH_URL}?response_type=code&client_id=${FITBIT_CLIENT_ID}&redirect_uri=${encodeURIComponent(FITBIT_REDIRECT_URI)}&scope=${scope}&prompt=consent&state=${state}`;
    res.redirect(url);
  } catch (e) {
    console.error('fitbit/connect error', e);
    res.status(500).json({ success: false, error: 'Fitbit not configured' });
  }
});

router.get('/connect/for/:email', verifyToken, async (req, res) => {
  try {
    if (req.user.role !== 'therapist') {
      return res.status(403).json({ success: false, error: 'Forbidden: therapist only' });
    }
    const patientEmail = req.params.email;
    const patient = await User.findOne({ email: patientEmail, role: 'patient' });
    if (!patient) {
      return res.status(404).json({ success: false, error: 'Patient not found' });
    }
    const { FITBIT_CLIENT_ID, FITBIT_REDIRECT_URI } = getEnv();
    const verifier = pkceStore.get(stateUserId);
    if (verifier) body.set('code_verifier', verifier);
    const scope = encodeURIComponent('heartrate profile');
    const state = encodeURIComponent(patient._id.toString());
    const url = `${FITBIT_AUTH_URL}?response_type=code&client_id=${FITBIT_CLIENT_ID}&redirect_uri=${encodeURIComponent(FITBIT_REDIRECT_URI)}&scope=${scope}&prompt=consent&state=${state}`;
    res.redirect(url);
  } catch (e) {
    console.error('fitbit/connect-for error', e);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});
    let data = await r.json();
    if (!r.ok && r.status === 401) {
      const body2 = new URLSearchParams(body.toString());
      body2.delete('client_secret');
      r = await fetch(FITBIT_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body2.toString()
      });
      data = await r.json();
    }
    if (!r.ok) {
router.get('/callback', async (req, res) => {
  try {
    const code = req.query.code;
    const stateUserId = req.query.state;
    const { FITBIT_CLIENT_ID, FITBIT_CLIENT_SECRET, FITBIT_REDIRECT_URI } = getEnv();
    if (!code || !stateUserId) return res.status(400).send('Missing code/state');

  const body = new URLSearchParams();
  body.set('client_id', FITBIT_CLIENT_ID);
  body.set('client_secret', FITBIT_CLIENT_SECRET);
  body.set('grant_type', 'authorization_code');
  body.set('redirect_uri', FITBIT_REDIRECT_URI);
  body.set('code', code);

    const r = await fetch(FITBIT_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${b64(`${FITBIT_CLIENT_ID}:${FITBIT_CLIENT_SECRET}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });
    const data = await r.json();
    if (!r.ok) {
      const authHeader = `Basic ${b64(`${FITBIT_CLIENT_ID}:${FITBIT_CLIENT_SECRET}`)}`;
      console.error('fitbit token exchange failed', { status: r.status, data, authHeaderPreview: authHeader.slice(0,20)+'...' });
      return res.status(500).send(`<html><body style="font-family:system-ui;background:#0f172a;color:#e2e8f0;padding:18px"><h2>Fitbit token exchange failed</h2><pre style="white-space:pre-wrap;font-size:12px;">Status: ${r.status}\n${escapeHtml(JSON.stringify(data,null,2))}</pre><p>Check client id/secret, redirect URI EXACT match, scopes, and that the code has not already been used (one-time).</p></body></html>`);
    }

    const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000);
    await User.findByIdAndUpdate(stateUserId, {
      $set: {
        fitbit: {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          scope: data.scope,
          expiresAt,
          fitbitUserId: data.user_id
        }
      }
    });

    res.send('<html><body style="font-family:system-ui;background:#0f172a;color:#e2e8f0;padding:20px;"><h2>Fitbit connected</h2><p>You can close this tab and return to the app.</p></body></html>');
  } catch (e) {
    console.error('fitbit/callback error', e);
    res.status(500).send(`<html><body style="font-family:system-ui;background:#0f172a;color:#e2e8f0;padding:18px"><h2>Server error</h2><pre>${escapeHtml(String(e.stack||e))}</pre></body></html>`);
  }
});

async function ensureAccessToken(userId) {
  const { FITBIT_CLIENT_ID, FITBIT_CLIENT_SECRET } = getEnv();
  const user = await User.findById(userId);
  if (!user?.fitbit?.accessToken) throw new Error('Not connected');
  const expiresAt = user.fitbit.expiresAt ? new Date(user.fitbit.expiresAt).getTime() : 0;
  if (Date.now() < expiresAt - 30000) return user.fitbit.accessToken;
  const body = new URLSearchParams();
  body.set('grant_type', 'refresh_token');
  body.set('refresh_token', user.fitbit.refreshToken);
  body.set('client_id', FITBIT_CLIENT_ID);
  body.set('client_secret', FITBIT_CLIENT_SECRET);

  const r = await fetch(FITBIT_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${b64(`${FITBIT_CLIENT_ID}:${FITBIT_CLIENT_SECRET}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  });
  const data = await r.json();
  if (!r.ok) { throw new Error('Failed to refresh Fitbit token'); }
  const newExpires = new Date(Date.now() + (data.expires_in || 3600) * 1000);
  await User.findByIdAndUpdate(userId, {
    $set: {
      fitbit: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || user.fitbit.refreshToken,
        scope: data.scope || user.fitbit.scope,
        expiresAt: newExpires,
        fitbitUserId: user.fitbit.fitbitUserId
      }
    }
  });
  return data.access_token;
}

router.get('/me/heart-rate/latest', verifyToken, async (req, res) => {
  try {
    const access = await ensureAccessToken(req.user.id);
    const url = `${FITBIT_API}/1/user/-/activities/heart/date/today/1d/1sec.json`;
    const r = await fetch(url, { headers: { 'Authorization': `Bearer ${access}` } });
    const data = await r.json();
    if (!r.ok) {
      console.error('fitbit hr fetch failed', data);
      return res.status(400).json({ success: false, error: 'Fitbit API error', details: data });
    }
    const series = data['activities-heart-intraday']?.dataset || [];
    const last = series[series.length - 1] || null;
    res.json({ success: true, bpm: last ? last.value : null, time: last ? last.time : null });
  } catch (e) {
    if (String(e.message || '').includes('Not connected')) return res.status(404).json({ success: false, error: 'Not connected' });
    console.error('fitbit latest hr error', e);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

export default router;

function base64url(buf){
  return Buffer.from(buf).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function genPkce(){
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function escapeHtml(str){
  return str.replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[s]));
}

router.get('/debug', (req,res) => {
  try {
    const { FITBIT_CLIENT_ID, FITBIT_CLIENT_SECRET, FITBIT_REDIRECT_URI } = getEnv();
    const secretLen = FITBIT_CLIENT_SECRET.length;
    const secretHash = crypto.createHash('sha256').update(FITBIT_CLIENT_SECRET).digest('hex');
    const headerSample = b64(`${FITBIT_CLIENT_ID}:${FITBIT_CLIENT_SECRET}`).slice(0,16)+'...';
    res.json({
      success: true,
      clientId: FITBIT_CLIENT_ID,
      redirect: FITBIT_REDIRECT_URI,
      secretLength: secretLen,
      secretSha256: secretHash,
      basicHeaderPrefix: headerSample
    });
  } catch (e) {
    res.status(500).json({ success:false, error: e.message });
  }
});
