// GET /api/instagram-go?state=<signed state from /api/instagram-start>
//
// Bounces the athlete to Instagram's permission screen from OUR domain instead
// of linking there directly.
//
// WHY THIS EXISTS
//   On a phone, any instagram.com link is claimed by the installed Instagram
//   app (a universal link on iOS, an app link on Android). The app has no
//   screen for /oauth/authorize, so it opens to the feed and the Allow dialog
//   never appears. On a laptop there is no app to claim it, which is why the
//   same flow works there.
//
//   A link that arrives by server redirect is generally NOT handed off, so the
//   permission screen stays in the browser where it belongs.
//
// NOT an open redirect: the destination is built here from our own app id and
// redirect URI. Nothing in the query string can change where this goes.
const { missingConfig, verifyState, authorizeUrl } = require('./_instagram');

module.exports = async function handler(req, res) {
  if (missingConfig()) return res.status(503).send('Instagram posting is not configured.');

  // The state is HMAC-signed and short-lived, so this cannot be used to start a
  // connection for someone else's account. A fresh state is minted for the hop
  // rather than replaying this one.
  const claim = verifyState((req.query || {}).state);
  if (!claim) {
    return res.status(400).send('This connection link is no longer valid. Open EyeScout and tap Connect Instagram again.');
  }

  res.writeHead(302, {
    Location: authorizeUrl(claim.userId, claim.platform),
    'Cache-Control': 'no-store',
  });
  res.end();
};
