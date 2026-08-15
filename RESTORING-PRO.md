# Turning Pro back on

Pro was switched off on **2026-08-15** so that everything is free until there
are enough users to charge. Nothing was rewritten to be free — the gates were
opened and the sales UI was removed. Putting it back is a handful of reversals,
not a rebuild.

The website was done first. **iOS is next; Android after that.** Until those
ship, the store builds still sell a subscription.

## The switch

Two functions in `social-app/sb-data.js` are the whole client-side gate. Both
have their original body kept in a comment directly above them.

| Function | Now | Restore to |
|---|---|---|
| `_subHasAccess(sub)` | `return true` | the commented body above it |
| `_sbActiveProIds()` | `return null` | the commented body above it |

Every `isSubscribed()` / `isPro()` / `isCoachPro()` on every page delegates to
`_subHasAccess`, so those two edits re-gate the feed, search, stories, posting,
messaging and coach discovery at once. The old `if (!isSubscribed())` branches
were left in place throughout — they are unreachable today and become live again
the moment the gate closes.

## The database

`social-app/supabase-phase9-free-access.sql` dropped the phase 5 RLS paywall on
`posts` and replaced it with "any signed-in user can read". To charge again,
restore a policy that requires an active subscription and drop
`posts_read_authenticated`. The phase 4/5 SQL is not in this repo — it was run
directly in the Supabase dashboard, so **write the new policy from what
`pg_policies` shows, not from a file that does not exist.**

`feed_preview()` and `active_pro_player_ids()` were deliberately left deployed
and untouched, so the teaser and the discovery filter work again with no SQL.

## What has to be rebuilt rather than reverted

These were deleted, so pull them from git history at **`02ea10e`**:

- `social-app/subscription.html` — the paywall / plan comparison page
- `social-app/checkout.html` — player PayPal checkout
- `social-app/coach-checkout.html` — coach PayPal checkout
- `api/subscription-activate.js` — the only writer of `subscriptions` (verifies
  with PayPal, then upserts with the service-role key)
- `api/subscription-check.js` — renewal extender
- the `Subscription` section + cancel modal in `settings.html`
- the subscription card + cancel modal in `coach-settings.html`
- the `nav-upgrade` sidebar link on the four coach pages
- `_checkSubscriptionRenewal()` in `sb-data.js`, and its call in the `'sub'`
  sync case

Each of the three retired pages is now a redirect stub whose HTML comment names
what it used to be and which PayPal plan it sold.

`api/paypal-cancel.js` and `api/_paypal.js` were **kept** — cancel is how you
stop billing a legacy subscriber, and `_paypal.js` still exports `readBody()`
for `api/delete-user.js`.

## Deliberately left alone

The legal copy still describes the subscription: Terms §5, the Privacy processor
table (PayPal / RevenueCat), Support's "How do I cancel EyeScout Pro?",
`delete-account.html`, and the same blocks embedded in `social-app/login.html`
and `social-app/settings.html`.

That is on purpose, not an oversight. **Ben's call 2026-08-15:** the App Store
and Play builds still sell the $15/mo auto-renewing subscription, so those terms
have to stay accurate while they are live (Apple 3.1.2), and Support's cancel
instructions are the page a current subscriber needs. Strip all of it in one
pass once the mobile apps ship without Pro.

## Side effect worth knowing about

Coach discovery used to be filtered to Pro athletes only — a non-Pro athlete
was invisible in coach search and could not be followed. With `_sbActiveProIds()`
returning null, **every athlete is now discoverable and followable by any
verified coach.** That is what "free" means here, and coach *verification* is
untouched and still gates the whole coach side (an unverified coach still sees
only the Pending Verification lock). But it is a real change in who can see
minors' profiles, so it should be a decision, not a surprise.

## Do not forget the money

Turning the product free does not stop a payment. As of the switch, **36
accounts held Pro.** Anyone on a live PayPal plan keeps getting billed until the
plans are deactivated and the subscribers cancelled in the PayPal dashboard:

- player — `P-6PY978212M678402UNJHMG2Q`
- coach — `P-40L9540196378042KNJHMG7A`

Same for the App Store / Play subscriptions once the mobile apps ship without
them. The `subscriptions` table was left intact on purpose: it is the record of
who paid, and refunds and cancellation questions get answered from it.
