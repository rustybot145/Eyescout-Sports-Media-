// POST /api/process-video
//
// Shrinks an uploaded video, and optionally makes a second copy stamped
// "Posted on EyeScout Sports" for Instagram.
//
// WHY THIS EXISTS
//   Videos arrive straight off a phone at roughly 47 MB per minute, about four
//   times what they need. That is what filled the Supabase storage plan and
//   blew the egress allowance. Re-encoding at 720p cuts a 49.6 MB clip to
//   11.5 MB with no visible difference on a phone screen.
//
//   Instagram's API cannot draw anything on a story, so branding has to be
//   burned into the pixels. Both outputs come from ONE ffmpeg run: the video is
//   decoded and scaled once, then encoded twice. Two separate runs cost 327
//   CPU-seconds on a 90-second clip; this costs 269.
//
// MEASURED on the largest real video in the app (49.6 MB, 90s, 1080x1920 HEVC):
//   clean 11.5 MB · branded 16.2 MB · 269 CPU-seconds
//   A 2-minute clip is ~357 CPU-seconds, which is why maxDuration is 300 and
//   memory is raised in vercel.json — Vercel scales vCPU with memory, and on a
//   single core a long clip would not finish.
//
// FAILURE IS NOT FATAL. If anything here goes wrong the caller keeps the
// original upload and posts that. Compression is an optimisation; losing
// someone's post over it would not be a trade worth making.
//
// Body:   { sourceUrl, brand?: boolean }
// Header: Authorization: Bearer <supabase access token>
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { SUPABASE_URL, readBody, requireUser } = require('./_instagram');

const ffmpegPath = require('ffmpeg-static');
const BANNER = path.join(__dirname, 'assets', 'banner-720.png');

// Long edge of the output. 720 is where the real saving is: full resolution
// only reached 2.2x and ran far slower, and Instagram re-encodes anyway.
// Over-long clips are caught by the run() timeout, and the apps cap length at
// pick time, so there is no separate duration check here.
const LONG_EDGE = 720;

function serviceKey() { return process.env.SUPABASE_SERVICE_ROLE_KEY; }

/** Same-origin check as the publish endpoint: we only ever process our own
 *  storage, never an arbitrary URL someone hands us. */
function ours(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.origin === new URL(SUPABASE_URL).origin;
  } catch (e) { return false; }
}

/** "…/object/public/posts/<uid>/<file>.mp4" → { bucket, key } */
function storagePath(url) {
  const m = new URL(url).pathname.match(/\/object\/public\/([^/]+)\/(.+)$/);
  return m ? { bucket: m[1], key: decodeURIComponent(m[2]) } : null;
}

function run(args, budgetMs) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d.toString(); if (err.length > 4000) err = err.slice(-4000); });
    const kill = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('Video processing took too long')); }, budgetMs);
    p.on('error', (e) => { clearTimeout(kill); reject(e); });
    p.on('close', (code) => {
      clearTimeout(kill);
      code === 0 ? resolve() : reject(new Error(err.split('\n').filter(Boolean).pop() || `ffmpeg exited ${code}`));
    });
  });
}

async function upload(bucket, key, file, contentType) {
  const body = fs.readFileSync(file);
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${encodeURI(key)}`, {
    method: 'POST',
    headers: {
      apikey: serviceKey(),
      Authorization: `Bearer ${serviceKey()}`,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body,
  });
  if (!r.ok) throw new Error(`Upload failed (${r.status})`);
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${encodeURI(key)}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  if (!serviceKey()) return res.status(200).json({ ok: false, skipped: true, error: 'Not configured' });

  const who = await requireUser(req);
  if (who.error) return res.status(who.status).json({ ok: false, error: who.error });

  const { sourceUrl, brand } = readBody(req);
  if (!ours(sourceUrl)) return res.status(400).json({ ok: false, error: 'Unknown media location.' });
  const loc = storagePath(sourceUrl);
  if (!loc) return res.status(400).json({ ok: false, error: 'Unknown media location.' });

  // Only ever touches the caller's own folder. Without this, a signed-in user
  // could pass another athlete's media URL and have it overwritten or deleted.
  //
  // startsWith alone is NOT enough: "<my-uid>/../../someone-else/clip.mp4"
  // passes it and then walks straight out of the folder. Every segment is
  // checked, so a traversal attempt is refused rather than normalised away.
  const segments = loc.key.split('/');
  const ownFolder = segments[0] === who.userId;
  const traversal = segments.some((seg) => seg === '..' || seg === '.' || seg === '' || seg.includes('\\'));
  if (!ownFolder || traversal || segments.length < 2) {
    return res.status(403).json({ ok: false, error: 'That media is not yours.' });
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vid-'));
  const src = path.join(tmp, 'in.mp4');
  const clean = path.join(tmp, 'clean.mp4');
  const branded = path.join(tmp, 'branded.mp4');
  const cleanup = () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} };

  try {
    const dl = await fetch(sourceUrl);
    if (!dl.ok) throw new Error('Could not read the uploaded video');
    fs.writeFileSync(src, Buffer.from(await dl.arrayBuffer()));

    // Scale the LONG edge to 720 and leave the short edge to follow, so portrait
    // and landscape are both handled without stretching. `-map 0:a?` keeps audio
    // only when there is any — plenty of phone clips are silent, and without the
    // `?` ffmpeg aborts on those.
    const scale = `scale='if(gt(iw,ih),-2,${LONG_EDGE})':'if(gt(iw,ih),${LONG_EDGE},-2)'`;
    const args = ['-y', '-v', 'error', '-i', src];
    if (brand) args.push('-i', BANNER);

    args.push(
      '-filter_complex',
      brand
        ? `[0:v]${scale},split=2[v1][v2];[v2][1:v]overlay=0:H-h-40[vb]`
        : `[0:v]${scale}[v1]`,
      '-map', '[v1]', '-map', '0:a?',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26',
      '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '96k',
      clean,
    );
    if (brand) {
      args.push(
        '-map', '[vb]', '-map', '0:a?',
        '-c:v', 'libx264', '-preset', 'superfast', '-crf', '27',
        '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '96k',
        branded,
      );
    }

    await run(args, 280000); // leave headroom inside the 300s function limit

    // Written back OVER the original key, not to a new one.
    //
    // The first version uploaded to "<name>-c.mp4" and deleted the original.
    // That quietly made the post depend on this request finishing: if the
    // caller navigated away mid-encode, the server still completed, deleted the
    // original, and the post kept a URL that no longer existed. Overwriting in
    // place means the URL a post was saved with stays valid no matter what
    // happens here, and there is nothing to delete.
    const cleanUrl = await upload(loc.bucket, loc.key, clean, 'video/mp4');
    const base = loc.key.replace(/\.[^./]+$/, '');
    const brandedUrl = brand ? await upload(loc.bucket, `${base}-ig.mp4`, branded, 'video/mp4') : null;

    const sizes = { before: fs.statSync(src).size, after: fs.statSync(clean).size };
    cleanup();
    return res.status(200).json({ ok: true, cleanUrl, brandedUrl, ...sizes });
  } catch (e) {
    cleanup();
    // Caller falls back to the original upload. Nothing is lost.
    return res.status(200).json({
      ok: false,
      skipped: true,
      error: String((e && e.message) || 'Could not process the video').slice(0, 200),
    });
  }
};
