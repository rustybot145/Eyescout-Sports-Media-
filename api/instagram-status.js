// POST /api/instagram-status
// "Am I connected, and as whom?" Used to decide whether the post screen shows a
// real Instagram switch or the old share-sheet fallback.
//
// Deliberately returns ONLY { connected, username }. The access token stays on
// the server. Never add it to this response.
//
// Header: Authorization: Bearer <supabase access token>
const { missingConfig, requireUser, getConnection } = require('./_instagram');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  // Not configured is not an error the athlete can act on — report it as simply
  // "not connected" so the app falls back to the share sheet instead of showing
  // them a server problem.
  if (missingConfig()) return res.status(200).json({ ok: true, connected: false });

  const who = await requireUser(req);
  if (who.error) return res.status(who.status).json({ ok: false, error: who.error });

  const conn = await getConnection(who.userId);
  return res.status(200).json({
    ok: true,
    connected: !!conn,
    username: conn ? conn.username || null : null,
  });
};
