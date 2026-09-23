// POST /api/instagram-publish
//
// Publishes one EyeScout post to the athlete's own Instagram.
//
// Instagram publishing is two steps: create a "container" pointing at a public
// media URL, wait for Instagram to fetch and process it, then publish the
// container. Photos are ready almost immediately; video takes longer than a
// serverless function is allowed to live.
//
// So this endpoint is callable twice:
//   1. { mediaUrl, kind, target, caption }  → creates a container, waits a few
//      seconds, and either publishes or returns { pending, containerId }.
//   2. { containerId }                      → resumes waiting and publishes.
// The client just calls again while `pending` comes back.
//
// Header: Authorization: Bearer <supabase access token>
const {
  GRAPH, SUPABASE_URL, missingConfig, readBody, requireUser, getConnection, refreshIfStale,
} = require('./_instagram');

// Stay comfortably inside the platform's function timeout, then hand the wait
// back to the client rather than getting killed mid-flight.
const BUDGET_MS = 7000;
const POLL_EVERY_MS = 1200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Instagram fetches the media itself, so the URL must be public AND must be
 *  ours. Without this check a caller could make an athlete's account publish
 *  any image on the internet. */
function mediaUrlIsOurs(url) {
  let u;
  try { u = new URL(url); } catch (e) { return false; }
  if (u.protocol !== 'https:') return false;
  return u.origin === new URL(SUPABASE_URL).origin;
}

async function graph(path, params) {
  const r = await fetch(`${GRAPH}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (j.error && (j.error.error_user_msg || j.error.message)) || `Instagram error ${r.status}`;
    throw new Error(msg);
  }
  return j;
}

/** FINISHED → ready to publish. ERROR/EXPIRED → give up. IN_PROGRESS → wait. */
async function containerState(containerId, token) {
  const r = await fetch(`${GRAPH}/${encodeURIComponent(containerId)}?fields=status_code,status&access_token=${encodeURIComponent(token)}`);
  const j = await r.json().catch(() => ({}));
  return { code: j.status_code || 'IN_PROGRESS', detail: j.status || '' };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const bad = missingConfig();
  if (bad) return res.status(200).json({ ok: false, notConfigured: true, error: bad });

  const who = await requireUser(req);
  if (who.error) return res.status(who.status).json({ ok: false, error: who.error });

  const conn = await getConnection(who.userId);
  if (!conn) {
    return res.status(200).json({ ok: false, notConnected: true, error: 'Instagram is not connected yet.' });
  }

  const { mediaUrl, kind, target, caption, containerId: resumeId } = readBody(req);
  const isStory = (target || 'story') === 'story';

  try {
    const token = await refreshIfStale(conn);
    let containerId = resumeId;

    // ── First call: build the container ────────────────────────────────────
    if (!containerId) {
      if (!mediaUrlIsOurs(mediaUrl)) {
        return res.status(400).json({ ok: false, error: 'That media cannot be posted to Instagram.' });
      }
      const isVideo = kind === 'video';
      const params = { access_token: token };
      if (isVideo) params.video_url = mediaUrl; else params.image_url = mediaUrl;

      // Stories take no caption. A feed video has to go up as a Reel — Instagram
      // retired plain feed video.
      if (isStory) params.media_type = 'STORIES';
      else {
        if (isVideo) params.media_type = 'REELS';
        if (caption) params.caption = String(caption).slice(0, 2200);
      }

      const created = await graph(`/${encodeURIComponent(conn.ig_user_id)}/media`, params);
      containerId = created.id;
      if (!containerId) throw new Error('Instagram did not accept the media.');
    }

    // ── Wait for Instagram to finish fetching and processing it ───────────
    const deadline = Date.now() + BUDGET_MS;
    let state = await containerState(containerId, token);
    while (state.code === 'IN_PROGRESS' && Date.now() < deadline) {
      await sleep(POLL_EVERY_MS);
      state = await containerState(containerId, token);
    }

    if (state.code === 'ERROR' || state.code === 'EXPIRED') {
      return res.status(200).json({
        ok: false,
        error: state.detail || 'Instagram could not process that video. Try a shorter or smaller one.',
      });
    }
    if (state.code === 'IN_PROGRESS') {
      // Still working. Tell the client to call back with the container id.
      return res.status(200).json({ ok: true, pending: true, containerId });
    }

    // ── Publish ────────────────────────────────────────────────────────────
    const published = await graph(`/${encodeURIComponent(conn.ig_user_id)}/media_publish`, {
      creation_id: containerId,
      access_token: token,
    });

    return res.status(200).json({
      ok: true,
      pending: false,
      instagramPostId: published.id || null,
      username: conn.username || null,
    });
  } catch (e) {
    return res.status(200).json({
      ok: false,
      error: String((e && e.message) || 'Could not post to Instagram.').slice(0, 300),
    });
  }
};
