// Renewal check: when a subscription's billing date has passed, ask PayPal if
// it's still ACTIVE and, if so, extend expires_at in Supabase by another month.
// Client (sb-data.js) POSTs { paypalSubscriptionId, userId }.
const { paypalGetSubscription, readBody } = require('./_paypal');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  try {
    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_SECRET || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(200).json({ ok: false, notConfigured: true });
    }
    const { paypalSubscriptionId, userId } = readBody(req);
    if (!paypalSubscriptionId || !userId) return res.status(400).json({ ok: false, error: 'Missing paypalSubscriptionId or userId' });

    const ppSub = await paypalGetSubscription(paypalSubscriptionId);

    if (ppSub.status === 'ACTIVE') {
      const newExpiresAt = new Date(Date.now() + 30 * 86400000).toISOString(); // +30 days
      const SUPABASE_URL = process.env.SUPABASE_URL || 'https://auvnwuliwghmjbhhovbo.supabase.co';
      const sbResp = await fetch(
        `${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(userId)}`,
        {
          method: 'PATCH',
          headers: {
            apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ expires_at: newExpiresAt }),
        }
      );
      if (!sbResp.ok) throw new Error(`Supabase update failed: ${sbResp.status}`);
      return res.status(200).json({ ok: true, renewed: true, expiresAt: newExpiresAt });
    }

    // Not active in PayPal (cancelled/expired) — report status, no DB change.
    return res.status(200).json({ ok: true, renewed: false, ppStatus: ppSub.status });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};
