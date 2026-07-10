// Cancel a live PayPal subscription. Client (sb-data.js) POSTs { subscriptionId, reason }.
// notConfigured lets the client fall back to a local-only cancel.
const { paypalCancelSubscription, readBody } = require('./_paypal');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  try {
    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_SECRET) {
      return res.status(200).json({ ok: false, notConfigured: true, error: 'PayPal credentials not set on the server yet.' });
    }
    const { subscriptionId, reason } = readBody(req);
    if (!subscriptionId) return res.status(400).json({ ok: false, error: 'No subscriptionId provided' });
    await paypalCancelSubscription(subscriptionId, reason);
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};
