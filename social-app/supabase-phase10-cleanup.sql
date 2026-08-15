-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 10 — close the anon exposure left behind by the Pro removal, then tidy.
--
-- HOW THIS WAS DETERMINED
-- Every `.rpc(...)`, `.from(...)` and `.storage.from(...)` call in all three
-- clients (eyescout-site/social-app, eyescout-admin, eyescout-mobile/src) was
-- cross-referenced against the migrations in eyescout-mobile/supabase/migrations
-- and against the live API, probed read-only with the public publishable key.
--
-- Findings are labelled [VERIFIED LIVE] (probed the running database) or
-- [FROM CODE] (inferred by reading the clients — not confirmed server-side).
-- Do not treat a [FROM CODE] line as fact.
--
-- SECTION 1 IS A SECURITY FIX AND IS THE REASON THIS FILE EXISTS.
-- Sections 2-4 are cleanup and can wait.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 0 — LOOK FIRST (read-only; run these on their own, change nothing)
-- ═════════════════════════════════════════════════════════════════════════════
-- Who can execute what. This is the query that surfaced the problem below —
-- it lists every function anon/public may call.
--
--   SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args,
--          p.prosecdef AS security_definer,
--          array_to_string(p.proacl, E'\n') AS grants,
--          COALESCE(p.proconfig::text, '(no search_path pinned)') AS config
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public'
--   ORDER BY p.prosecdef DESC, p.proname;
--
-- Every RLS policy, so you can see what actually guards each table:
--   SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
--   FROM pg_policies WHERE schemaname='public' ORDER BY tablename, policyname;
--
-- Tables with RLS OFF — anything listed here is readable/writable by anyone
-- holding the publishable key, which ships in the app. Expect ZERO rows:
--   SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
--   WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity;
--
-- Row counts, to spot tables nothing writes any more:
--   SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC;
--
-- Storage buckets and whether they are public:
--   SELECT id, name, public FROM storage.buckets;


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — SECURITY FIX: two SECURITY DEFINER functions answer anonymous
--             callers with a minor's name and photo. RUN THIS ONE.
-- ═════════════════════════════════════════════════════════════════════════════
--
-- [VERIFIED LIVE, 2026-08-15] With no account and nothing but the publishable
-- key that ships inside the web and mobile clients:
--
--   POST /rest/v1/rpc/feed_preview  {}
--     → 200, and returns real rows: author_name ("Quinten Perez"), author_jersey,
--       sport, and a public media URL for the video. These are minors.
--
--   POST /rest/v1/rpc/active_pro_player_ids  {}
--     → 200, and returns 36 user UUIDs.
--
-- Every TABLE is correctly locked down — profiles returns 42501 to anon and the
-- rest return zero rows. These two functions are SECURITY DEFINER, so they run
-- as the owner and bypass RLS entirely. They are the hole in an otherwise sound
-- setup, and they were reachable the whole time the paywall existed.
--
-- They are now ALSO dead: feed_preview was the non-Pro teaser and
-- active_pro_player_ids was the coach-discovery filter. Since Pro was switched
-- off (2026-08-15) no client calls either one. So this costs nothing.
--
-- Revoked rather than dropped, so switching Pro back on stays a client change.
--
-- ── WHY IT HAPPENED, WHICH IS THE PART WORTH FIXING ─────────────────────────
-- Nobody granted anon access to these. **Postgres grants EXECUTE to PUBLIC on
-- every new function automatically.** Unless you revoke it, every function you
-- create is born callable by anon — and a SECURITY DEFINER function ignores RLS
-- by design. So RLS on the tables was never the weak point; the default grant
-- on the functions was. Any future helper would have had the same hole.
--
-- Step 1c is therefore the fix that actually matters: it changes the default so
-- new functions are NOT auto-granted, and it is what stops this recurring.

BEGIN;

-- ── 1a. Close the two that are leaking right now ────────────────────────────
REVOKE EXECUTE ON FUNCTION public.feed_preview()               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.active_pro_player_ids()      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public._es_viewer_has_feed_access() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.feed_preview()                TO authenticated;
GRANT EXECUTE ON FUNCTION public.active_pro_player_ids()       TO authenticated;
GRANT EXECUTE ON FUNCTION public._es_viewer_has_feed_access()  TO authenticated;

-- ── 1b. Put feed_preview UNDER RLS instead of above it ──────────────────────
-- This is the belt-and-braces half, and the reason a repeat can't leak data.
-- SECURITY DEFINER means "run as the owner, ignore RLS". SECURITY INVOKER means
-- "run as the caller, obey RLS". feed_preview only needed DEFINER because the
-- old paywall policy hid posts from non-subscribers. That policy is gone —
-- phase 9 replaced it with posts_read_authenticated (TO authenticated) — so as
-- an INVOKER function it now returns rows to a signed-in user and NOTHING to an
-- anonymous one, enforced by RLS itself rather than by a grant someone could
-- undo by accident.
ALTER FUNCTION public.feed_preview() SECURITY INVOKER;

-- active_pro_player_ids stays SECURITY DEFINER on purpose: reading OTHER users'
-- subscription state is exactly what it is for, and RLS correctly forbids that.
-- The revoke above is its protection. Do not flip this one to INVOKER — it would
-- silently return only your own row if Pro is ever restored.

-- ── 1c. Stop it happening again ─────────────────────────────────────────────
-- Kill the automatic PUBLIC grant on functions created from here on. New
-- functions will need an explicit GRANT, which makes exposing one a decision
-- rather than an accident. Applied for both roles that create objects here.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

COMMIT;

-- ── 1d. VERIFY — run this after the COMMIT ──────────────────────────────────
-- Lists every SECURITY DEFINER function anon can still call. Anything that
-- comes back is a function that bypasses RLS for an anonymous caller: it should
-- be an empty result, or contain ONLY shared_post (a share link has to work for
-- a logged-out recipient — that one is deliberate).
--
--   SELECT p.proname, array_to_string(p.proacl, E'\n') AS grants
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.prosecdef
--     AND (p.proacl IS NULL OR array_to_string(p.proacl, ',') LIKE '%anon=X%'
--                           OR array_to_string(p.proacl, ',') LIKE '%=X/%')
--   ORDER BY p.proname;
--
-- NOTE: proacl IS NULL means "default privileges" — i.e. PUBLIC can execute it.
-- Those are the dangerous ones and they will not look obviously wrong.
--
-- Then confirm from outside, as a stranger would. Expect an error, not data:
--   curl -s -X POST 'https://auvnwuliwghmjbhhovbo.supabase.co/rest/v1/rpc/feed_preview' \
--     -H 'apikey: sb_publishable_7qKzHagsIYotquLIiARBqg_cbTSv9C5' \
--     -H 'Content-Type: application/json' --data-binary '{}'


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — CHECK, THEN DECIDE (commented out; each needs your answer first)
-- ═════════════════════════════════════════════════════════════════════════════

-- 2a. SECURITY DEFINER functions without a pinned search_path.
--     [FROM CODE — confirm with the Section 0 query.] A SECURITY DEFINER
--     function that does not pin search_path can be hijacked by a caller who
--     creates a same-named object in a schema earlier on the path. Every
--     admin_* function is SECURITY DEFINER and bypasses RLS, so this matters.
--     For each one the Section 0 query reports as "(no search_path pinned)":
--
--   ALTER FUNCTION public.<name>(<args>) SET search_path = public, pg_temp;

-- 2b. `shared_post` / `create_share_link` are intentionally anon-reachable —
--     a share link has to work for a logged-out recipient. Worth confirming
--     shared_post still returns ONLY media + attribution and never author_id
--     or caption, since that was its whole design constraint:
--
--   SELECT prosrc FROM pg_proc WHERE proname = 'shared_post';

-- 2c. `_es_has_active_sub()` — referenced only in comments now.
--     [FROM CODE] If Section 0 shows nothing depends on it, it can go:
--
--   -- DROP FUNCTION IF EXISTS public._es_has_active_sub();

-- 2d. The `seen_stories` and `coach_saved` tables are written by the web and
--     admin but never read by mobile. Not dead — just asymmetric. Left alone.


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — DO NOT DROP
-- ═════════════════════════════════════════════════════════════════════════════
--
-- `subscriptions` table and every row in it
--     36 accounts have payment history here. It is the record of who paid you
--     and the only thing a refund or chargeback question can be answered from.
--     Ben's explicit instruction: keep it.
--
-- feed_preview() / active_pro_player_ids() / _es_viewer_has_feed_access()
--     Dormant on purpose. Section 1 locks them down WITHOUT dropping them, so
--     turning Pro back on stays a client-side change plus one migration.
--
-- shared_post() / create_share_link()
--     Nothing to do with Pro. Live — share.html depends on both.
--
-- get_weekly_hype_winners()
--     Live in all three clients.
--
-- delete_my_account()
--     Live, and load-bearing for child safety. Derives its target from
--     auth.uid(), so it can only ever delete the caller — this is the correct
--     pattern and the web endpoint should look more like it, not less.
--
-- my_contact() / player_contact()
--     Live in web + admin (opt-in contact reveal).
--
-- The 24 admin_* functions
--     All live. Verified live 2026-08-15 that they reject an anonymous caller
--     with "Invalid admin credentials" (P0001), which is the single most
--     important authorization result in this system.
--
-- posts_read_authenticated (the phase 9 policy)
--     This is what makes the free product work. Dropping it empties every feed.
