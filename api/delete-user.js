// Delete a Supabase Auth user by id via the admin API (service-role only, so it
// must run server-side). Client (settings.html / coach-settings.html) POSTs { userId }
// AND an `Authorization: Bearer <access_token>` header for the logged-in user.
//
// AUTHORIZATION: the caller must prove they own the account. We validate their
// access token with Supabase and require the token's user id to match `userId`,
// so nobody can delete an arbitrary account by guessing/reading its public id.
const { readBody } = require('./_paypal');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(200).json({ ok: false, notConfigured: true, error: 'SUPABASE_SERVICE_ROLE_KEY not set on the server.' });
    }
    const { userId } = readBody(req);
    if (!userId) return res.status(400).json({ ok: false, error: 'No userId provided' });

    // Require the caller's own Supabase access token.
    const authHeader = req.headers.authorization || req.headers.Authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) return res.status(401).json({ ok: false, error: 'Not authorized (missing session token)' });

    const SUPABASE_URL = process.env.SUPABASE_URL || 'https://auvnwuliwghmjbhhovbo.supabase.co';

    // Validate the token and resolve WHO it belongs to.
    const who = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
    });
    if (!who.ok) return res.status(401).json({ ok: false, error: 'Invalid or expired session' });
    const me = await who.json().catch(() => ({}));
    if (!me || !me.id || me.id !== userId) {
      return res.status(403).json({ ok: false, error: 'You can only delete your own account' });
    }

    // Ownership confirmed → delete.
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (resp.ok) return res.status(200).json({ ok: true });
    const t = await resp.text();
    return res.status(200).json({ ok: false, error: `Supabase returned ${resp.status}: ${t}` });
  } catch (err) {
    return res.status(200).json({ ok: false, error: err.message });
  }
};
