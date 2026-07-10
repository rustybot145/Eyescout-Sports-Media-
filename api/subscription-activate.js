// Grant Pro AFTER verifying with PayPal that the subscription is real + active.
// RLS blocks client writes to `subscriptions`, so this service-role path is the
// only writer. Client (checkout.html) POSTs { paypalSubscriptionId, userId, plan }.
const { paypalGetSubscription, readBody } = require('./_paypal');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  try {
    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_SECRET || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(200).json({ ok: false, notConfigured: true, error: 'PayPal or Supabase service key not set on the server.' });
    }
    const { paypalSubscriptionId, userId, plan } = readBody(req);
    if (!paypalSubscriptionId || !userId) return res.status(400).json({ ok: false, error: 'Missing paypalSubscriptionId or userId' });

    // 1) Confirm the subscription is genuinely active/approved in PayPal.
    const ppSub = await paypalGetSubscription(paypalSubscriptionId);
    if (ppSub.status !== 'ACTIVE' && ppSub.status !== 'APPROVED') {
      return res.status(402).json({ ok: false, error: `PayPal subscription is not active (status: ${ppSub.status || 'unknown'})` });
    }

    // 2) Upsert the row with the service-role key (bypasses RLS). Conflict on user_id.
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 86400000).toISOString(); // +30 days
    const SUPABASE_URL = process.env.SUPABASE_URL || 'https://auvnwuliwghmjbhhovbo.supabase.co';
    const row = {
      user_id: userId, status: 'active', plan: plan || 'pro', price: 15,
      started_at: now.toISOString(), expires_at: expiresAt,
      paypal_subscription_id: paypalSubscriptionId,
    };
    const sbResp = await fetch(`${SUPABASE_URL}/rest/v1/subscriptions?on_conflict=user_id`, {
      method: 'POST',
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(row),
    });
    if (!sbResp.ok) {
      const t = await sbResp.text();
      throw new Error(`Supabase upsert failed (${sbResp.status}): ${t.slice(0, 200)}`);
    }
    return res.status(200).json({ ok: true, expiresAt });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};
