// POST /api/instagram-start
// Returns the Instagram authorization URL for the signed-in athlete to open.
//
// This has to be server-side: the URL carries a `state` signed with the app
// secret, which is what stops one person attaching their Instagram to another
// person's EyeScout account. See _instagram.js for the full reasoning.
//
// Body: { platform?: 'web' | 'app' }   — 'app' makes the callback deep-link back
// Header: Authorization: Bearer <supabase access token>
const { missingConfig, readBody, requireUser, authorizeUrl } = require('./_instagram');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const bad = missingConfig();
  if (bad) return res.status(200).json({ ok: false, notConfigured: true, error: bad });

  const who = await requireUser(req);
  if (who.error) return res.status(who.status).json({ ok: false, error: who.error });

  const { platform } = readBody(req);
  return res.status(200).json({ ok: true, url: authorizeUrl(who.userId, platform) });
};
