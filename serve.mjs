import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Railway (and most hosts) assign the port via process.env.PORT — you MUST listen
// on it or the deploy is unreachable. Falls back to 3000 for local dev.
const PORT = process.env.PORT || 3000;

// ── Outbound connection pool ─────────────────────────────────────────────────
// Every outbound call this server makes (Supabase REST, Dropbox, Monday, PayPal)
// goes through https.request, which by default uses an agent with UNLIMITED
// concurrent sockets. Under load — e.g. a big tournament import firing many
// Dropbox link-creation calls — that can open hundreds of connections at once
// and get the server rate-limited or throttled by the upstream API.
//
// Install one shared keep-alive agent capped at a small pool so concurrent
// connections stay bounded and idle sockets are reused instead of reopened.
// maxSockets is Node's per-host cap (the standard HTTP connection-pool knob),
// so this is up to POOL_MAX simultaneous connections to each upstream host.
// Override with env POOL_MAX; clamped to the requested 10–20 range.
const POOL_MAX = Math.min(20, Math.max(10, parseInt(process.env.POOL_MAX || '15', 10) || 15));
const _outboundPool = new https.Agent({
  keepAlive: true,
  maxSockets: POOL_MAX,      // max concurrent connections per host
  maxFreeSockets: Math.ceil(POOL_MAX / 2),
  scheduling: 'fifo',
});
// None of this server's https.request calls pass their own agent, so making
// this the global agent transparently pools all of them.
https.globalAgent = _outboundPool;

// Parse .env for Dropbox credentials
let DROPBOX_REFRESH_TOKEN = process.env.DROPBOX_REFRESH_TOKEN || '';
let DROPBOX_APP_KEY       = process.env.DROPBOX_APP_KEY       || '';
let DROPBOX_APP_SECRET    = process.env.DROPBOX_APP_SECRET    || '';
// Legacy single-token fallback (still works if set)
let DROPBOX_TOKEN         = process.env.DROPBOX_TOKEN         || '';

// PayPal credentials for server-side subscription cancellation.
// Add these to .env when the live (or sandbox) app is ready:
//   PAYPAL_CLIENT_ID=...
//   PAYPAL_SECRET=...
//   PAYPAL_ENV=live   (or 'sandbox')
let PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || '';
let PAYPAL_SECRET    = process.env.PAYPAL_SECRET    || '';
let PAYPAL_ENV       = process.env.PAYPAL_ENV       || 'live';

// Supabase — service-role key is required to delete Auth users (can't be done
// from the browser). Add SUPABASE_SERVICE_ROLE_KEY to .env. URL defaults to the
// project used by the frontend (sb-data.js).
let SUPABASE_URL              = process.env.SUPABASE_URL              || 'https://auvnwuliwghmjbhhovbo.supabase.co';
let SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Monday CRM — used by /api/purchase-confirm to push a card with the player's
// editing folder link when they buy their photos.
let MONDAY_API_KEY   = process.env.MONDAY_API_KEY   || '';
let MONDAY_BOARD_ID  = process.env.MONDAY_BOARD_ID  || '';
let MONDAY_COLUMN_ID = process.env.MONDAY_COLUMN_ID || '';

const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split('\n').forEach(line => {
    const eq = line.indexOf('=');
    if (eq < 0) return;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    if (key === 'DROPBOX_REFRESH_TOKEN') DROPBOX_REFRESH_TOKEN = val;
    if (key === 'DROPBOX_APP_KEY')       DROPBOX_APP_KEY       = val;
    if (key === 'DROPBOX_APP_SECRET')    DROPBOX_APP_SECRET    = val;
    if (key === 'DROPBOX_TOKEN')         DROPBOX_TOKEN         = val;
    if (key === 'PAYPAL_CLIENT_ID')      PAYPAL_CLIENT_ID      = val;
    if (key === 'PAYPAL_SECRET')         PAYPAL_SECRET         = val;
    if (key === 'PAYPAL_ENV')            PAYPAL_ENV            = val;
    if (key === 'SUPABASE_URL')              SUPABASE_URL              = val;
    if (key === 'SUPABASE_SERVICE_ROLE_KEY') SUPABASE_SERVICE_ROLE_KEY = val;
    if (key === 'MONDAY_API_KEY')   MONDAY_API_KEY   = val;
    if (key === 'MONDAY_BOARD_ID')  MONDAY_BOARD_ID  = val;
    if (key === 'MONDAY_COLUMN_ID') MONDAY_COLUMN_ID = val;
  });
}

// Cached access token — auto-refreshed when it expires
let _cachedToken   = DROPBOX_TOKEN; // use legacy token as starting value if present
let _tokenExpiresAt = DROPBOX_TOKEN ? Date.now() + 4 * 60 * 60 * 1000 : 0;

function _dropboxTokenExchange(withSecret) {
  const parts = [
    'grant_type=refresh_token',
    `refresh_token=${encodeURIComponent(DROPBOX_REFRESH_TOKEN)}`,
    `client_id=${encodeURIComponent(DROPBOX_APP_KEY)}`,
  ];
  if (withSecret && DROPBOX_APP_SECRET) parts.push(`client_secret=${encodeURIComponent(DROPBOX_APP_SECRET)}`);
  const body = parts.join('&');
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.dropboxapi.com',
      path: '/oauth2/token',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function getDropboxToken() {
  // Return cached token if still valid (refresh 5 minutes before expiry)
  if (_cachedToken && Date.now() < _tokenExpiresAt - 5 * 60 * 1000) {
    return _cachedToken;
  }
  if (!DROPBOX_REFRESH_TOKEN || !DROPBOX_APP_KEY) {
    throw new Error('Dropbox credentials not set in .env (need DROPBOX_REFRESH_TOKEN + DROPBOX_APP_KEY)');
  }
  // The refresh token was issued via the PKCE flow, which refreshes with the
  // app key alone — Dropbox rejects the exchange if a secret is also sent.
  // Try key-only first, then key+secret, so either flavor of token works.
  let data = await _dropboxTokenExchange(false);
  if (!data.access_token && DROPBOX_APP_SECRET) data = await _dropboxTokenExchange(true);
  if (!data.access_token) throw new Error('Token refresh failed: ' + JSON.stringify(data).slice(0, 200));
  _cachedToken    = data.access_token;
  _tokenExpiresAt = Date.now() + (data.expires_in || 14400) * 1000;
  console.log('✓ Dropbox access token refreshed');
  return _cachedToken;
}

async function dropboxApiPost(path, body) {
  const token = await getDropboxToken();
  const json = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.dropboxapi.com',
      path,
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) },
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        // Dropbox returns plain text (not JSON) for auth/scope errors — surface
        // it readably instead of a JSON parse failure.
        try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error('Dropbox: ' + raw.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(json);
    req.end();
  });
}

async function dropboxPullFolder(sharedUrl) {
  // Get metadata for the shared link (file or folder?)
  const meta = await dropboxApiPost('/2/sharing/get_shared_link_metadata', { url: sharedUrl });
  if (meta.error_summary) throw new Error('Dropbox metadata error: ' + meta.error_summary);

  if (meta['.tag'] === 'file') {
    // Single file — return direct image URL
    return [sharedUrl.split('?')[0] + '?raw=1'];
  }

  // It's a folder — list all image files in it
  const listing = await dropboxApiPost('/2/files/list_folder', {
    path: meta.path_lower,
    recursive: false,
    include_media_info: true,
  });
  if (listing.error_summary) throw new Error('List folder error: ' + listing.error_summary);

  const imageFiles = (listing.entries || []).filter(e =>
    e['.tag'] === 'file' && /\.(jpe?g|png|gif|webp)$/i.test(e.name)
  );

  const urls = [];
  for (const file of imageFiles) {
    try {
      const link = await dropboxApiPost('/2/sharing/create_shared_link_with_settings', {
        path: file.path_lower,
        settings: { requested_visibility: 'public' },
      });
      if (link.url) {
        urls.push(link.url.replace('?dl=0', '?raw=1'));
      } else if (link.error?.['.tag'] === 'shared_link_already_exists') {
        urls.push(link.error.shared_link_already_exists.metadata.url.replace('?dl=0', '?raw=1'));
      }
    } catch { /* skip files that fail */ }
  }
  return urls;
}

async function handleDropboxPullFolder(req, res) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', async () => {
    try {
      const { url } = JSON.parse(Buffer.concat(chunks).toString());
      if (!url) throw new Error('No url provided');
      const urls = await dropboxPullFolder(url);
      res.writeHead(200, cors);
      res.end(JSON.stringify({ urls }));
    } catch (err) {
      res.writeHead(500, cors);
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

// List every image file in a shared folder — WITH pagination, so folders with
// hundreds/thousands of photos are fully captured (the old pull only saw page 1).
async function dropboxListFolderFiles(sharedUrl) {
  const meta = await dropboxApiPost('/2/sharing/get_shared_link_metadata', { url: sharedUrl });
  if (meta.error_summary) throw new Error('Dropbox metadata error: ' + meta.error_summary);
  if (meta['.tag'] === 'file') {
    return { single: sharedUrl.split('?')[0] + '?raw=1', files: [] };
  }
  let entries = [];
  let resp = await dropboxApiPost('/2/files/list_folder', { path: meta.path_lower, recursive: false });
  if (resp.error_summary) throw new Error('List folder error: ' + resp.error_summary);
  entries = entries.concat(resp.entries || []);
  while (resp.has_more) {
    resp = await dropboxApiPost('/2/files/list_folder/continue', { cursor: resp.cursor });
    if (resp.error_summary) throw new Error('List continue error: ' + resp.error_summary);
    entries = entries.concat(resp.entries || []);
  }
  const files = entries
    .filter(e => e['.tag'] === 'file' && /\.(jpe?g|png|gif|webp)$/i.test(e.name))
    .map(e => ({ path: e.path_lower, name: e.name }));
  return { single: null, files };
}

async function dropboxCreateLink(path) {
  try {
    const link = await dropboxApiPost('/2/sharing/create_shared_link_with_settings', {
      path, settings: { requested_visibility: 'public' },
    });
    if (link.url) return link.url.replace('?dl=0', '?raw=1');
    if (link.error?.['.tag'] === 'shared_link_already_exists') {
      return link.error.shared_link_already_exists.metadata.url.replace('?dl=0', '?raw=1');
    }
  } catch { /* skip */ }
  return null;
}

// Step 1: list the folder (returns file paths + count) so the client can show a
// determinate progress bar and pull links in batches.
async function handleDropboxListFolder(req, res) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', async () => {
    try {
      const { url } = JSON.parse(Buffer.concat(chunks).toString());
      if (!url) throw new Error('No url provided');
      const out = await dropboxListFolderFiles(url);
      res.writeHead(200, cors);
      res.end(JSON.stringify(out));
    } catch (err) {
      res.writeHead(500, cors);
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

// Step 2: create/return public links for a batch of file paths.
async function handleDropboxLinkBatch(req, res) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', async () => {
    try {
      const { paths } = JSON.parse(Buffer.concat(chunks).toString());
      if (!Array.isArray(paths)) throw new Error('paths must be an array');
      const urls = [];
      for (const p of paths) urls.push(await dropboxCreateLink(p));
      res.writeHead(200, cors);
      res.end(JSON.stringify({ urls: urls.filter(Boolean) }));
    } catch (err) {
      res.writeHead(500, cors);
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

// ── Purchase → editor Dropbox folder + Monday CRM card ──────────────────────
// Fires when a player has BOTH paid and submitted their photo selection.
// 1. Resolves each selected share URL back to its Dropbox file path.
// 2. Creates /EyeScout/To-Edit/{First Last · Sport · #J · email} and copies the
//    selected shots into it.
// 3. Shares that folder and pushes a Monday card with the link so the editors
//    pick it up. Safe to re-run: existing folder/links are reused.

function mondayApiPost(query, variables) {
  const json = JSON.stringify({ query, variables });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.monday.com',
      path: '/v2',
      method: 'POST',
      headers: {
        Authorization: MONDAY_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(json),
      },
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(json);
    req.end();
  });
}

async function dropboxResolvePath(shareUrl) {
  // The gallery stores public share links (?raw=1). The copy API needs the
  // real file path, which the shared-link metadata still carries.
  const clean = shareUrl.replace('?raw=1', '?dl=0');
  const meta = await dropboxApiPost('/2/sharing/get_shared_link_metadata', { url: clean });
  if (meta.error_summary) throw new Error('Could not resolve photo path: ' + meta.error_summary);
  return meta.path_lower;
}

async function dropboxCreateFolder(folderPath) {
  const resp = await dropboxApiPost('/2/files/create_folder_v2', { path: folderPath, autorename: false });
  if (resp.metadata) return resp.metadata.path_lower;
  // Already exists → reuse it (re-push / retry case)
  if (resp.error?.path?.['.tag'] === 'conflict') return folderPath.toLowerCase();
  throw new Error('Create folder failed: ' + JSON.stringify(resp).slice(0, 200));
}

async function purchaseConfirm({ player, photoUrls }) {
  const first  = (player.first  || '').trim();
  const last   = (player.last   || '').trim();
  const sport  = (player.sport  || '').trim();
  const jersey = String(player.jersey || '').trim();
  const email  = (player.email  || '').trim();
  if (!first && !last) throw new Error('Player name is required');
  if (!Array.isArray(photoUrls) || !photoUrls.length) throw new Error('No selected photos provided');

  // Folder name: First Last · Sport · #J · email (strip chars Dropbox forbids)
  const label = [
    `${first} ${last}`.trim(),
    sport,
    jersey ? `#${jersey}` : '',
    email,
  ].filter(Boolean).join(' · ').replace(/[\\/:?*"<>|]/g, '_');

  const folderPath = await dropboxCreateFolder(`/EyeScout/To-Edit/${label}`);

  // Copy every selected shot into the editor folder
  const copied = [];
  const failed = [];
  for (const url of photoUrls) {
    try {
      const fromPath = await dropboxResolvePath(url);
      const name = fromPath.split('/').pop();
      const resp = await dropboxApiPost('/2/files/copy_v2', {
        from_path: fromPath,
        to_path: `${folderPath}/${name}`,
        autorename: false,
      });
      if (resp.metadata) copied.push(name);
      else if (resp.error?.to?.['.tag'] === 'conflict' || JSON.stringify(resp.error || {}).includes('conflict')) copied.push(name); // already copied on a previous run
      else failed.push(name || url);
    } catch (e) { failed.push(url); }
  }
  if (!copied.length) throw new Error('Could not copy any photos into the editing folder');

  // Share the folder (plain ?dl=0 link — the editors open it in Dropbox)
  let folderUrl = null;
  const link = await dropboxApiPost('/2/sharing/create_shared_link_with_settings', {
    path: folderPath, settings: { requested_visibility: 'public' },
  });
  if (link.url) folderUrl = link.url;
  else if (link.error?.['.tag'] === 'shared_link_already_exists') folderUrl = link.error.shared_link_already_exists.metadata.url;
  if (!folderUrl) throw new Error('Could not create a share link for the editing folder');

  // Push the Monday card — item named after the player, folder link in the
  // "Player Dropbox Folder" link column.
  let mondayOk = false, mondayError = null;
  if (MONDAY_API_KEY && MONDAY_BOARD_ID && MONDAY_COLUMN_ID) {
    try {
      const itemName = [`${first} ${last}`.trim(), sport, jersey ? `#${jersey}` : ''].filter(Boolean).join(' · ');
      const colVals = JSON.stringify({ [MONDAY_COLUMN_ID]: { url: folderUrl, text: 'Open Dropbox Folder' } });
      const resp = await mondayApiPost(
        `mutation ($board: ID!, $name: String!, $cols: JSON!) {
          create_item (board_id: $board, item_name: $name, column_values: $cols) { id }
        }`,
        { board: MONDAY_BOARD_ID, name: itemName, cols: colVals }
      );
      if (resp.data?.create_item?.id) mondayOk = true;
      else mondayError = JSON.stringify(resp.errors || resp).slice(0, 300);
    } catch (e) { mondayError = e.message; }
  } else {
    mondayError = 'Monday not configured (need MONDAY_API_KEY, MONDAY_BOARD_ID, MONDAY_COLUMN_ID in .env)';
  }

  return { ok: true, folderUrl, copied: copied.length, failed: failed.length, mondayOk, mondayError };
}

function handlePurchaseConfirm(req, res) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', async () => {
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      const result = await purchaseConfirm(body);
      console.log(`✓ Purchase pipeline: ${result.copied} photos → ${result.folderUrl} (Monday: ${result.mondayOk ? 'card created' : result.mondayError})`);
      res.writeHead(200, cors);
      res.end(JSON.stringify(result));
    } catch (err) {
      console.warn('✗ Purchase pipeline failed:', err.message);
      res.writeHead(500, cors);
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
  });
}

async function dropboxUpload(fileBuffer, filename, folder) {
  const token = await getDropboxToken();
  const safeName = filename.replace(/[^a-zA-Z0-9.\-_ ]/g, '_');
  const uploadPath = `${folder}/${safeName}`;

  // Step 1: Upload file bytes to Dropbox
  const uploaded = await new Promise((resolve, reject) => {
    const arg = JSON.stringify({ path: uploadPath, mode: 'add', autorename: true, mute: true });
    const req = https.request({
      hostname: 'content.dropboxapi.com',
      path: '/2/files/upload',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': arg,
        'Content-Length': fileBuffer.length,
      },
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(new Error('Dropbox upload raw: ' + raw.slice(0, 300))); }
      });
    });
    req.on('error', reject);
    req.write(fileBuffer);
    req.end();
  });

  if (!uploaded.path_lower) throw new Error('Upload failed: ' + JSON.stringify(uploaded).slice(0, 200));

  // Step 2: Create a public shared link
  const linkBody = JSON.stringify({ path: uploaded.path_lower, settings: { requested_visibility: 'public' } });
  const linked = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.dropboxapi.com',
      path: '/2/sharing/create_shared_link_with_settings',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(linkBody),
      },
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch (e) { reject(new Error('Dropbox link parse error')); }
      });
    });
    req.on('error', reject);
    req.write(linkBody);
    req.end();
  });

  let sharedUrl;
  if (linked.url) {
    sharedUrl = linked.url;
  } else if (linked.error?.['.tag'] === 'shared_link_already_exists') {
    sharedUrl = linked.error.shared_link_already_exists.metadata.url;
  } else {
    throw new Error('Shared link failed: ' + JSON.stringify(linked).slice(0, 200));
  }

  // Convert to direct image URL (raw=1 serves the file directly)
  return sharedUrl.replace('?dl=0', '?raw=1');
}

async function handleDropboxUpload(req, res) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (!DROPBOX_TOKEN && !DROPBOX_REFRESH_TOKEN) {
    res.writeHead(500, cors);
    res.end(JSON.stringify({ error: 'Dropbox not configured — add DROPBOX_REFRESH_TOKEN + DROPBOX_APP_KEY + DROPBOX_APP_SECRET to .env' }));
    return;
  }
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', async () => {
    try {
      const fileBuffer = Buffer.concat(chunks);
      const filename = decodeURIComponent(req.headers['x-filename'] || `photo-${Date.now()}.jpg`);
      const folder = req.headers['x-folder'] || '/EyeScout/uploads';
      const url = await dropboxUpload(fileBuffer, filename, folder);
      res.writeHead(200, cors);
      res.end(JSON.stringify({ url }));
    } catch (err) {
      res.writeHead(500, cors);
      res.end(JSON.stringify({ error: err.message }));
    }
  });
  req.on('error', err => {
    res.writeHead(500, cors);
    res.end(JSON.stringify({ error: err.message }));
  });
}

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

// ── One-time Dropbox OAuth setup (PKCE) ─────────────────────────────────────
// Step 1: visit http://localhost:3000/dropbox-auth
// Step 2: authorize on Dropbox
// Step 3: refresh token is saved to .env automatically
let _pkceVerifier = '';

function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

async function handleDropboxOAuthCallback(req, res) {
  const qs = new URLSearchParams(req.url.split('?')[1] || '');
  const code = qs.get('code');
  const error = qs.get('error');
  if (error || !code) {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end(`<h2>Dropbox auth error: ${error || 'no code'}</h2>`);
    return;
  }
  const body = [
    'grant_type=authorization_code',
    `code=${encodeURIComponent(code)}`,
    `client_id=${encodeURIComponent(DROPBOX_APP_KEY)}`,
    `redirect_uri=${encodeURIComponent(`http://localhost:${PORT}/dropbox-callback`)}`,
    `code_verifier=${encodeURIComponent(_pkceVerifier)}`,
  ].join('&');
  const data = await new Promise((resolve, reject) => {
    const req2 = https.request({
      hostname: 'api.dropboxapi.com',
      path: '/oauth2/token',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    }, r => {
      const chunks = [];
      r.on('data', c => chunks.push(c));
      r.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch(e) { reject(e); } });
    });
    req2.on('error', reject);
    req2.write(body);
    req2.end();
  });
  if (!data.refresh_token) {
    res.writeHead(500, { 'Content-Type': 'text/html' });
    res.end(`<h2>Token exchange failed</h2><pre>${JSON.stringify(data, null, 2)}</pre>`);
    return;
  }
  // Save to .env
  DROPBOX_REFRESH_TOKEN = data.refresh_token;
  _cachedToken = data.access_token;
  _tokenExpiresAt = Date.now() + (data.expires_in || 14400) * 1000;
  const envPath = path.join(__dirname, '.env');
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  if (envContent.includes('DROPBOX_REFRESH_TOKEN=')) {
    envContent = envContent.replace(/DROPBOX_REFRESH_TOKEN=.*/g, `DROPBOX_REFRESH_TOKEN=${data.refresh_token}`);
  } else {
    envContent += `\nDROPBOX_REFRESH_TOKEN=${data.refresh_token}\n`;
  }
  fs.writeFileSync(envPath, envContent);
  console.log('✓ Dropbox refresh token saved to .env');
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;background:#0a0a0a;color:#fff;">
    <h2 style="color:#00C9A7;">✓ Dropbox connected!</h2>
    <p>Refresh token saved to <code>.env</code>. Photo uploads will now work forever.</p>
    <p style="color:rgba(255,255,255,0.4);font-size:13px;">You can close this tab.</p>
  </body></html>`);
}

// ── PayPal subscription cancellation ─────────────────────────────────────────
// The secret must never touch the browser, so cancellation runs here on the
// server. Flow: OAuth2 client-credentials → POST /v1/billing/subscriptions/{id}/cancel.
function paypalHost() {
  return PAYPAL_ENV === 'sandbox' ? 'api-m.sandbox.paypal.com' : 'api-m.paypal.com';
}

function getPayPalToken() {
  return new Promise((resolve, reject) => {
    const creds = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString('base64');
    const body = 'grant_type=client_credentials';
    const r = https.request({
      hostname: paypalHost(),
      path: '/v1/oauth2/token',
      method: 'POST',
      headers: {
        Authorization: `Basic ${creds}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, resp => {
      const chunks = [];
      resp.on('data', c => chunks.push(c));
      resp.on('end', () => {
        try {
          const j = JSON.parse(Buffer.concat(chunks).toString());
          if (j.access_token) resolve(j.access_token);
          else reject(new Error(j.error_description || 'PayPal auth failed'));
        } catch (e) { reject(new Error('PayPal auth parse error')); }
      });
    });
    r.on('error', reject);
    r.write(body);
    r.end();
  });
}

async function paypalCancelSubscription(subscriptionId, reason) {
  const token = await getPayPalToken();
  const body = JSON.stringify({ reason: reason || 'Canceled by user' });
  return new Promise((resolve, reject) => {
    const r = https.request({
      hostname: paypalHost(),
      path: `/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, resp => {
      const chunks = [];
      resp.on('data', c => chunks.push(c));
      resp.on('end', () => {
        // PayPal returns 204 No Content on a successful cancel
        if (resp.statusCode === 204) return resolve({ ok: true });
        const raw = Buffer.concat(chunks).toString();
        reject(new Error(`PayPal cancel failed (${resp.statusCode}): ${raw.slice(0, 300)}`));
      });
    });
    r.on('error', reject);
    r.write(body);
    r.end();
  });
}

async function paypalGetSubscription(subscriptionId) {
  const token = await getPayPalToken();
  return new Promise((resolve, reject) => {
    const r = https.request({
      hostname: paypalHost(),
      path: `/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }, resp => {
      const chunks = [];
      resp.on('data', c => chunks.push(c));
      resp.on('end', () => {
        if (resp.statusCode === 200) {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString()));
          } catch (e) { reject(e); }
        } else {
          const raw = Buffer.concat(chunks).toString();
          reject(new Error(`PayPal get subscription failed (${resp.statusCode}): ${raw.slice(0, 300)}`));
        }
      });
    });
    r.on('error', reject);
    r.end();
  });
}

function handlePayPalCancel(req, res) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', async () => {
    try {
      // Keys not added yet → tell the client so it can fall back to a local cancel.
      if (!PAYPAL_CLIENT_ID || !PAYPAL_SECRET) {
        res.writeHead(200, cors);
        res.end(JSON.stringify({ ok: false, notConfigured: true, error: 'PayPal credentials not set on the server yet.' }));
        return;
      }
      const { subscriptionId, reason } = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      if (!subscriptionId) throw new Error('No subscriptionId provided');
      await paypalCancelSubscription(subscriptionId, reason);
      res.writeHead(200, cors);
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(500, cors);
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
  });
}

// ── PayPal subscription renewal check ───────────────────────────────────────
// When a subscription is active and the billing date has passed, check PayPal
// to see if it's still active (and thus should be renewed). If so, bump the
// expires_at in Supabase to extend access for another month.
function handleSubscriptionCheck(req, res) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', async () => {
    try {
      if (!PAYPAL_CLIENT_ID || !PAYPAL_SECRET || !SUPABASE_SERVICE_ROLE_KEY) {
        res.writeHead(200, cors);
        res.end(JSON.stringify({ ok: false, notConfigured: true }));
        return;
      }
      const { paypalSubscriptionId, userId } = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      if (!paypalSubscriptionId || !userId) throw new Error('Missing paypalSubscriptionId or userId');

      // Query PayPal for the subscription status
      const ppSub = await paypalGetSubscription(paypalSubscriptionId);

      // If it's still active in PayPal, extend the expires_at in Supabase
      if (ppSub.status === 'ACTIVE') {
        const newExpiresAt = new Date(Date.now() + 30 * 86400000).toISOString(); // +30 days
        const host = SUPABASE_URL.replace(/^https?:\/\//, '');
        await new Promise((resolve, reject) => {
          const sbReq = https.request({
            hostname: host,
            path: `/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(userId)}`,
            method: 'PATCH',
            headers: {
              apikey: SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
            },
          }, sbResp => {
            const body = [];
            sbResp.on('data', d => body.push(d));
            sbResp.on('end', () => {
              if (sbResp.statusCode >= 200 && sbResp.statusCode < 300) resolve();
              else reject(new Error(`Supabase update failed: ${sbResp.statusCode}`));
            });
          });
          sbReq.on('error', reject);
          sbReq.write(JSON.stringify({ expires_at: newExpiresAt }));
          sbReq.end();
        });
        res.writeHead(200, cors);
        res.end(JSON.stringify({ ok: true, renewed: true, expiresAt: newExpiresAt }));
      } else {
        // Subscription is not active in PayPal (cancelled, etc)
        res.writeHead(200, cors);
        res.end(JSON.stringify({ ok: true, renewed: false, ppStatus: ppSub.status }));
      }
    } catch (err) {
      res.writeHead(500, cors);
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
  });
}

// Activate a Pro subscription AFTER verifying with PayPal that the subscription
// is real and active. The browser can no longer grant Pro itself — RLS blocks
// client writes to `subscriptions`, so this service-role path is the only writer.
// Flow: client passes the PayPal subscription id from onApprove → we confirm it
// with PayPal → we upsert the row with the service-role key.
function handleSubscriptionActivate(req, res) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', async () => {
    try {
      if (!PAYPAL_CLIENT_ID || !PAYPAL_SECRET || !SUPABASE_SERVICE_ROLE_KEY) {
        res.writeHead(200, cors);
        res.end(JSON.stringify({ ok: false, notConfigured: true, error: 'PayPal or Supabase service key not set on the server.' }));
        return;
      }
      const { paypalSubscriptionId, userId, plan } = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      if (!paypalSubscriptionId || !userId) throw new Error('Missing paypalSubscriptionId or userId');

      // 1) Confirm the subscription is genuinely active/approved in PayPal.
      const ppSub = await paypalGetSubscription(paypalSubscriptionId);
      if (ppSub.status !== 'ACTIVE' && ppSub.status !== 'APPROVED') {
        res.writeHead(402, cors);
        res.end(JSON.stringify({ ok: false, error: `PayPal subscription is not active (status: ${ppSub.status || 'unknown'})` }));
        return;
      }

      // 2) Write the row with the service-role key (bypasses RLS). Upsert on user_id.
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 86400000).toISOString(); // +30 days
      const row = {
        user_id: userId, status: 'active', plan: plan || 'pro', price: 15,
        started_at: now.toISOString(), expires_at: expiresAt,
        paypal_subscription_id: paypalSubscriptionId,
      };
      const host = SUPABASE_URL.replace(/^https?:\/\//, '');
      await new Promise((resolve, reject) => {
        const sbReq = https.request({
          hostname: host,
          path: `/rest/v1/subscriptions?on_conflict=user_id`,
          method: 'POST',
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates',
          },
        }, sbResp => {
          const body = [];
          sbResp.on('data', d => body.push(d));
          sbResp.on('end', () => {
            if (sbResp.statusCode >= 200 && sbResp.statusCode < 300) resolve();
            else reject(new Error(`Supabase upsert failed (${sbResp.statusCode}): ${Buffer.concat(body).toString().slice(0, 200)}`));
          });
        });
        sbReq.on('error', reject);
        sbReq.write(JSON.stringify(row));
        sbReq.end();
      });

      res.writeHead(200, cors);
      res.end(JSON.stringify({ ok: true, expiresAt }));
    } catch (err) {
      res.writeHead(500, cors);
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
  });
}

// Delete a Supabase Auth user by id. Requires the service-role key (admin API),
// which is why this must run on the server and never in the browser.
function handleDeleteAuthUser(req, res) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    try {
      if (!SUPABASE_SERVICE_ROLE_KEY) {
        // Key not set yet → tell the client so it can still finish the local delete.
        res.writeHead(200, cors);
        res.end(JSON.stringify({ ok: false, notConfigured: true, error: 'SUPABASE_SERVICE_ROLE_KEY not set on the server.' }));
        return;
      }
      const { userId } = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      if (!userId) throw new Error('No userId provided');

      const host = SUPABASE_URL.replace(/^https?:\/\//, '');
      const areq = https.request({
        hostname: host,
        path: `/auth/v1/admin/users/${encodeURIComponent(userId)}`,
        method: 'DELETE',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }, ar => {
        const body = [];
        ar.on('data', c => body.push(c));
        ar.on('end', () => {
          const text = Buffer.concat(body).toString();
          if (ar.statusCode >= 200 && ar.statusCode < 300) {
            res.writeHead(200, cors);
            res.end(JSON.stringify({ ok: true }));
          } else {
            res.writeHead(200, cors);
            res.end(JSON.stringify({ ok: false, error: `Supabase returned ${ar.statusCode}: ${text}` }));
          }
        });
      });
      areq.on('error', err => { res.writeHead(200, cors); res.end(JSON.stringify({ ok: false, error: err.message })); });
      areq.end();
    } catch (err) {
      res.writeHead(200, cors);
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
  });
}

http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, X-Filename, X-Folder, Content-Length',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    });
    res.end();
    return;
  }

  // Silence the browser's automatic favicon request
  if (urlPath === '/favicon.ico') { res.writeHead(204); res.end(); return; }

  // Dropbox one-time OAuth setup
  if (req.method === 'GET' && urlPath === '/dropbox-auth') {
    if (!DROPBOX_APP_KEY) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end('<h2>Add DROPBOX_APP_KEY to your .env file first</h2>');
      return;
    }
    const { verifier, challenge } = generatePKCE();
    _pkceVerifier = verifier;
    const authUrl = `https://www.dropbox.com/oauth2/authorize?` + [
      `client_id=${encodeURIComponent(DROPBOX_APP_KEY)}`,
      `response_type=code`,
      `token_access_type=offline`,
      `redirect_uri=${encodeURIComponent(`http://localhost:${PORT}/dropbox-callback`)}`,
      `code_challenge=${challenge}`,
      `code_challenge_method=S256`,
    ].join('&');
    res.writeHead(302, { Location: authUrl });
    res.end();
    return;
  }
  if (req.method === 'GET' && urlPath === '/dropbox-callback') {
    handleDropboxOAuthCallback(req, res).catch(e => {
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(`<h2>Error: ${e.message}</h2>`);
    });
    return;
  }

  // Dropbox upload proxy
  if (req.method === 'POST' && urlPath === '/api/dropbox-upload') {
    handleDropboxUpload(req, res);
    return;
  }

  // Dropbox folder pull — list images in a shared folder and return direct URLs
  if (req.method === 'POST' && urlPath === '/api/dropbox-pull-folder') {
    handleDropboxPullFolder(req, res);
    return;
  }

  // Dropbox import in two steps (list + batched links) so the admin can show a
  // real progress bar and handle folders of any size.
  if (req.method === 'POST' && urlPath === '/api/dropbox-list-folder') {
    handleDropboxListFolder(req, res);
    return;
  }
  if (req.method === 'POST' && urlPath === '/api/dropbox-link-batch') {
    handleDropboxLinkBatch(req, res);
    return;
  }

  // Purchase confirmed — create the editor Dropbox folder, copy the selection,
  // and push the Monday CRM card (the automated step 5 of the photo pipeline).
  if (req.method === 'POST' && urlPath === '/api/purchase-confirm') {
    handlePurchaseConfirm(req, res);
    return;
  }

  // PayPal — cancel a subscription for real (needs PAYPAL_CLIENT_ID/SECRET in .env)
  if (req.method === 'POST' && urlPath === '/api/paypal-cancel') {
    handlePayPalCancel(req, res);
    return;
  }

  // Subscription check — if active and past billing date, check PayPal for renewal
  if (req.method === 'POST' && urlPath === '/api/subscription-check') {
    handleSubscriptionCheck(req, res);
    return;
  }

  // Subscription activate — verify the PayPal subscription, then grant Pro
  // server-side (the browser can no longer self-grant; RLS blocks client writes).
  if (req.method === 'POST' && urlPath === '/api/subscription-activate') {
    handleSubscriptionActivate(req, res);
    return;
  }

  // Delete a Supabase Auth user (needs SUPABASE_SERVICE_ROLE_KEY in .env)
  if (req.method === 'POST' && urlPath === '/api/delete-user') {
    handleDeleteAuthUser(req, res);
    return;
  }

  // Static file serving
  const rel = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath);
  const filePath = path.normalize(path.join(__dirname, rel));

  // Security: never serve files outside the project root (path traversal)
  // and never serve dotfiles / secrets / source that isn't a public asset.
  const rootWithSep = __dirname.endsWith(path.sep) ? __dirname : __dirname + path.sep;
  const base = path.basename(filePath);
  const blockedExt = new Set(['.env', '.mjs', '.sql', '.log', '.pem', '.key']);
  const ext = path.extname(filePath);
  if (
    !filePath.startsWith(rootWithSep) ||       // escaped the root
    base.startsWith('.') ||                     // dotfiles (.env, .git, ...)
    base === '.env' ||
    blockedExt.has(ext) ||                      // server source / secrets / db schema
    filePath.includes(`${path.sep}node_modules${path.sep}`)
  ) {
    res.writeHead(403); res.end('Forbidden');
    return;
  }

  const contentType = MIME[ext] || 'text/plain';

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  if (!DROPBOX_TOKEN && !DROPBOX_REFRESH_TOKEN) {
    console.warn('⚠  Dropbox not configured — add DROPBOX_REFRESH_TOKEN, DROPBOX_APP_KEY, DROPBOX_APP_SECRET to .env');
  } else if (DROPBOX_REFRESH_TOKEN) {
    console.log('✓ Dropbox configured with refresh token (auto-renewing)');
  } else {
    console.log('✓ Dropbox configured with static token (will expire — switch to refresh token)');
  }
});
