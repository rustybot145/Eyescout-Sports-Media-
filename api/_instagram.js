// Shared plumbing for the Instagram auto-post feature.
//
// Underscore prefix = Vercel does NOT expose this as a route. Nothing here is
// reachable from the internet; the four instagram-*.js handlers require it.
//
// THE TWO THINGS THAT MUST NEVER LEAK
//   1. INSTAGRAM_APP_SECRET — only ever read here, server-side.
//   2. A user's Instagram access_token — it can post as them for ~60 days.
//      It is written to and read from the DB with the service role and is
//      never returned to any client, not even its owner. If you find yourself
//      adding it to a JSON response, stop.
//
// Env vars (Vercel → Settings → Environment Variables):
//   INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, SUPABASE_SERVICE_ROLE_KEY,
//   SUPABASE_URL (optional, defaults below)
const crypto = require('crypto');

const GRAPH = 'https://graph.instagram.com/v21.0';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://auvnwuliwghmjbhhovbo.supabase.co';

// The redirect URI registered in the Meta dashboard. It must match BYTE FOR BYTE
// on both the authorize call and the token exchange or Instagram rejects it.
const REDIRECT_URI = 'https://eyescoutsports.com/api/instagram-callback';

function appId()     { return process.env.INSTAGRAM_APP_ID; }
function appSecret() { return process.env.INSTAGRAM_APP_SECRET; }
function serviceKey(){ return process.env.SUPABASE_SERVICE_ROLE_KEY; }

/** Every handler calls this first, so a missing env var is a clear 200 rather
 *  than a confusing crash. Mirrors how delete-user.js reports notConfigured. */
function missingConfig() {
  const missing = ['INSTAGRAM_APP_ID', 'INSTAGRAM_APP_SECRET', 'SUPABASE_SERVICE_ROLE_KEY']
    .filter((k) => !process.env[k]);
  return missing.length ? `Server is missing: ${missing.join(', ')}` : null;
}

// ── Request body (Vercel may hand us a string, a buffer, or a parsed object) ──
function readBody(req) {
  const b = req.body;
  if (!b) return {};
  if (typeof b === 'object' && !Buffer.isBuffer(b)) return b;
  try { return JSON.parse(Buffer.isBuffer(b) ? b.toString('utf8') : String(b)); }
  catch (e) { return {}; }
}

// ── The `state` parameter ────────────────────────────────────────────────────
// This is the security hinge of the whole connect flow. The callback has no
// session of its own, so `state` is how it learns WHICH EyeScout account the
// returning Instagram authorization belongs to. If state were just the raw user
// id, anyone could hand us a state naming somebody else's id and attach their
// own Instagram to that athlete's account — every post that athlete made would
// then publish to the attacker's feed. So it is signed with the app secret and
// verified on the way back, and it expires.
const STATE_TTL_MS = 15 * 60 * 1000; // a connect flow that takes >15 min is dead

// `platform` rides along so the callback knows whether to bounce back into the
// phone app via a deep link or just render a page in the browser.
function signState(userId, platform) {
  const pf = platform === 'app' ? 'app' : 'web';
  const payload = Buffer.from(JSON.stringify({ uid: userId, ts: Date.now(), pf })).toString('base64url');
  const mac = crypto.createHmac('sha256', appSecret()).update(payload).digest('base64url');
  return `${payload}.${mac}`;
}

function verifyState(state) {
  if (typeof state !== 'string' || !state.includes('.')) return null;
  const [payload, mac] = state.split('.', 2);
  const expected = crypto.createHmac('sha256', appSecret()).update(payload).digest('base64url');
  // timingSafeEqual throws on length mismatch, hence the guard.
  const a = Buffer.from(mac), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let parsed;
  try { parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); }
  catch (e) { return null; }
  if (!parsed || !parsed.uid || typeof parsed.ts !== 'number') return null;
  if (Date.now() - parsed.ts > STATE_TTL_MS) return null;
  return { userId: parsed.uid, platform: parsed.pf === 'app' ? 'app' : 'web' };
}

// ── Who is calling? ──────────────────────────────────────────────────────────
// Same approach as delete-user.js: the caller proves who they are with their own
// Supabase access token, and we ask Supabase to resolve it. We never trust a
// user id sent in the body.
async function requireUser(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return { error: 'Not signed in', status: 401 };
  const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: serviceKey(), Authorization: `Bearer ${token}` },
  });
  if (!who.ok) return { error: 'Session expired — sign in again', status: 401 };
  const me = await who.json().catch(() => null);
  if (!me || !me.id) return { error: 'Session expired — sign in again', status: 401 };
  return { userId: me.id };
}

// ── The instagram_accounts table (service role only; see phase-14 SQL) ───────
const TABLE = `${SUPABASE_URL}/rest/v1/instagram_accounts`;
const sbHeaders = () => ({
  apikey: serviceKey(),
  Authorization: `Bearer ${serviceKey()}`,
  'Content-Type': 'application/json',
});

async function getConnection(userId) {
  const r = await fetch(`${TABLE}?user_id=eq.${encodeURIComponent(userId)}&select=*`, { headers: sbHeaders() });
  if (!r.ok) return null;
  const rows = await r.json().catch(() => []);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function saveConnection(row) {
  const r = await fetch(`${TABLE}?on_conflict=user_id`, {
    method: 'POST',
    headers: { ...sbHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error(`Could not save the connection (${r.status}): ${await r.text().catch(() => '')}`);
}

async function deleteConnection(userId) {
  await fetch(`${TABLE}?user_id=eq.${encodeURIComponent(userId)}`, { method: 'DELETE', headers: sbHeaders() });
}

// ── Instagram OAuth ──────────────────────────────────────────────────────────
function authorizeUrl(userId, platform) {
  const q = new URLSearchParams({
    client_id: appId(),
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'instagram_business_basic,instagram_business_content_publish',
    state: signState(userId, platform),
  });
  return `https://www.instagram.com/oauth/authorize?${q.toString()}`;
}

/** code → short-lived token (1 hour) + the Instagram user id. */
async function exchangeCode(code) {
  const body = new URLSearchParams({
    client_id: appId(),
    client_secret: appSecret(),
    grant_type: 'authorization_code',
    redirect_uri: REDIRECT_URI,
    code,
  });
  const r = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) {
    throw new Error(j.error_message || j.error_description || 'Instagram refused the sign-in');
  }
  return { token: j.access_token, igUserId: String(j.user_id || '') };
}

/** short-lived → long-lived (~60 days). */
async function toLongLived(shortToken) {
  const q = new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_secret: appSecret(),
    access_token: shortToken,
  });
  const r = await fetch(`https://graph.instagram.com/access_token?${q.toString()}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('Instagram would not issue a long-lived token');
  return { token: j.access_token, expiresIn: Number(j.expires_in || 0) };
}

/** Called before publishing when the token is close to expiry. Instagram only
 *  refreshes tokens that are at least 24h old, so a brand-new one is skipped. */
async function refreshIfStale(conn) {
  if (!conn.expires_at) return conn.access_token;
  const msLeft = new Date(conn.expires_at).getTime() - Date.now();
  if (msLeft > 7 * 24 * 60 * 60 * 1000) return conn.access_token; // >7 days left, fine
  try {
    const q = new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: conn.access_token });
    const r = await fetch(`https://graph.instagram.com/refresh_access_token?${q.toString()}`);
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.access_token) {
      await saveConnection({
        user_id: conn.user_id,
        ig_user_id: conn.ig_user_id,
        username: conn.username,
        access_token: j.access_token,
        expires_at: new Date(Date.now() + Number(j.expires_in || 0) * 1000).toISOString(),
      });
      return j.access_token;
    }
  } catch (e) { /* fall through and try the old token */ }
  return conn.access_token;
}

async function fetchUsername(igUserId, token) {
  try {
    const r = await fetch(`${GRAPH}/${encodeURIComponent(igUserId)}?fields=username&access_token=${encodeURIComponent(token)}`);
    const j = await r.json().catch(() => ({}));
    return j.username || null;
  } catch (e) { return null; }
}

module.exports = {
  GRAPH, SUPABASE_URL, REDIRECT_URI,
  missingConfig, readBody, requireUser,
  signState, verifyState, authorizeUrl,
  getConnection, saveConnection, deleteConnection,
  exchangeCode, toLongLived, refreshIfStale, fetchUsername,
};
