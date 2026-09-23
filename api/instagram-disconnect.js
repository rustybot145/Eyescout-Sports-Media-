// POST /api/instagram-disconnect
// Forgets the athlete's Instagram token. Their EyeScout posts stay untouched;
// anything already published to Instagram stays on Instagram.
//
// Meta's platform terms require an app to let people revoke access, and App
// Review looks for it, so this is not optional garnish.
//
// Header: Authorization: Bearer <supabase access token>
const { missingConfig, requireUser, deleteConnection } = require('./_instagram');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const bad = missingConfig();
  if (bad) return res.status(200).json({ ok: false, notConfigured: true, error: bad });

  const who = await requireUser(req);
  if (who.error) return res.status(who.status).json({ ok: false, error: who.error });

  // Only ever deletes the caller's own row — the id comes from their verified
  // token, never from the request body.
  await deleteConnection(who.userId);
  return res.status(200).json({ ok: true, connected: false });
};
