// Shared PayPal REST helpers for the Vercel serverless functions.
// Underscore prefix → Vercel does NOT expose this as an endpoint; it's import-only.
// Uses global fetch (available in Vercel's Node 18/20/22 runtime).

function paypalHost() {
  return process.env.PAYPAL_ENV === 'sandbox' ? 'api-m.sandbox.paypal.com' : 'api-m.paypal.com';
}

// OAuth2 client-credentials → short-lived access token.
async function getPayPalToken() {
  const creds = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`).toString('base64');
  const resp = await fetch(`https://${paypalHost()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const j = await resp.json().catch(() => ({}));
  if (!resp.ok || !j.access_token) throw new Error(j.error_description || 'PayPal auth failed');
  return j.access_token;
}

// GET a subscription's current state (used to verify it's really ACTIVE/APPROVED).
async function paypalGetSubscription(subscriptionId) {
  const token = await getPayPalToken();
  const resp = await fetch(
    `https://${paypalHost()}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`,
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
  const text = await resp.text();
  if (!resp.ok) throw new Error(`PayPal get subscription failed (${resp.status}): ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

// Cancel a subscription. PayPal returns 204 No Content on success.
async function paypalCancelSubscription(subscriptionId, reason) {
  const token = await getPayPalToken();
  const resp = await fetch(
    `https://${paypalHost()}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason || 'Canceled by user' }),
    }
  );
  if (resp.status === 204) return { ok: true };
  const text = await resp.text();
  throw new Error(`PayPal cancel failed (${resp.status}): ${text.slice(0, 300)}`);
}

// Read a JSON body whether Vercel pre-parsed it (object) or handed us a raw string.
function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body || '{}'); } catch { return {}; } }
  return {};
}

module.exports = { getPayPalToken, paypalGetSubscription, paypalCancelSubscription, readBody };
