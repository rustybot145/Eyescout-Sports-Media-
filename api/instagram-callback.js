// GET /api/instagram-callback?code=...&state=...
//
// Where Instagram sends the athlete back after they allow (or deny) access.
// This URL is registered in the Meta dashboard and must stay byte-identical
// there, in _instagram.js REDIRECT_URI, and here.
//
// It has no session of its own. `state` is the only thing telling us which
// EyeScout account this belongs to, which is why it is signed and verified
// rather than trusted.
//
// It renders a page rather than returning JSON, because a person is looking at
// it. From the phone app it also deep-links back so the browser sheet closes.
const {
  missingConfig, verifyState, exchangeCode, toLongLived, fetchUsername, saveConnection,
} = require('./_instagram');

// `detail` can carry text straight from the query string (Instagram appends
// error_description when the athlete declines). Anyone can craft a callback URL
// with their own valid state and any error_description they like, so this page
// must treat every interpolated value as hostile. The site's CSP is
// report-only, which means it would NOT stop an injected script.
function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function page({ ok, heading, detail, platform }) {
  const accent = ok ? '#39D353' : '#f87171';
  // On the phone, hop straight back into the app. Harmless on the web, where
  // the scheme is unknown and the link simply never fires.
  const deepLink = platform === 'app'
    ? `<script>setTimeout(function(){ location.replace('eyescout://instagram-${ok ? 'connected' : 'failed'}'); }, 400);</script>`
    : '';
  const back = platform === 'app'
    ? '<p class="hint">You can close this window and return to EyeScout.</p>'
    : '<p class="hint"><a href="/social-app/settings.html">Back to settings</a></p>';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>EyeScout — Instagram</title><style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0d0d0d;color:#fff;font-family:system-ui,-apple-system,sans-serif;
       min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{max-width:420px;text-align:center}
  .dot{width:64px;height:64px;border-radius:50%;margin:0 auto 22px;background:${accent}1f;
       border:1px solid ${accent}55;display:flex;align-items:center;justify-content:center;font-size:28px}
  h1{font-family:Impact,'Arial Narrow',Arial,sans-serif;font-size:26px;letter-spacing:.05em;
     text-transform:uppercase;margin-bottom:10px}
  p{font-size:14px;color:rgba(255,255,255,.7);line-height:1.65}
  .hint{margin-top:22px;font-size:13px}
  a{color:#1E90FF}
</style></head><body><div class="card">
  <div class="dot">${ok ? '✓' : '!'}</div>
  <h1>${esc(heading)}</h1><p>${esc(detail)}</p>${back}
</div>${deepLink}</body></html>`;
}

module.exports = async function handler(req, res) {
  const send = (status, body) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(status).send(body);
  };

  const bad = missingConfig();
  if (bad) {
    return send(200, page({ ok: false, platform: 'web', heading: 'Not set up yet',
      detail: 'Instagram posting is not configured on the server.' }));
  }

  const q = req.query || {};

  // Verify state FIRST, before anything else is trusted, so we know who this is
  // and can render the right kind of page.
  const claim = verifyState(q.state);
  if (!claim) {
    return send(400, page({ ok: false, platform: 'web', heading: 'Link expired',
      detail: 'This connection link is no longer valid. Open EyeScout and tap Connect Instagram again.' }));
  }
  const { userId, platform } = claim;

  // The athlete tapped Cancel, or Instagram refused.
  if (!q.code) {
    const reason = q.error_description || q.error_reason || q.error;
    return send(200, page({ ok: false, platform, heading: 'Not connected',
      detail: reason ? String(reason).slice(0, 200) : 'You cancelled before granting access. Nothing was changed.' }));
  }

  try {
    const { token: shortToken, igUserId } = await exchangeCode(String(q.code));
    const { token, expiresIn } = await toLongLived(shortToken);
    const username = await fetchUsername(igUserId, token);

    await saveConnection({
      user_id: userId,
      ig_user_id: igUserId,
      username,
      access_token: token,
      expires_at: new Date(Date.now() + (expiresIn || 0) * 1000).toISOString(),
    });

    return send(200, page({
      ok: true, platform,
      heading: 'Instagram connected',
      detail: username
        ? `EyeScout can now post to @${username} when you switch it on.`
        : 'EyeScout can now post to your Instagram when you switch it on.',
    }));
  } catch (e) {
    return send(200, page({ ok: false, platform, heading: "Couldn't connect",
      detail: String((e && e.message) || 'Instagram did not complete the connection. Please try again.').slice(0, 220) }));
  }
};
