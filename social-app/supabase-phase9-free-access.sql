-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 9 — turn EyeScout free. Undoes the phase 4/5 server-side paywall.
--
-- WHY THIS FILE IS NOT OPTIONAL.
-- The Pro paywall was never only a client-side gate. Phase 5
-- (supabase-phase5-server-paywall.sql) put it in Postgres: RLS on `posts` only
-- returns rows to a viewer who has an active subscription. That is why
-- feed_preview() exists at all — it was the 2-post teaser for everyone else.
--
-- The client half of this change makes every viewer "subscribed", which means
-- the app stops calling feed_preview(). If the RLS policy below is NOT updated,
-- the result is worse than the paywall: a logged-in user with no subscription
-- row selects from `posts`, RLS returns zero rows, and they see a completely
-- EMPTY feed with no teaser and no explanation. Ship both halves together.
--
-- Verified against production 2026-08-15: feed_preview() returns rows and
-- active_pro_player_ids() returns 36 accounts, so both phases are live.
--
-- RUN IT: Supabase dashboard → SQL Editor → paste → Run.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 0. Look before you leap ──────────────────────────────────────────────────
-- Run this FIRST on its own and read the output. It prints every policy that
-- currently gates a table on the subscriptions table, so you can see exactly
-- what step 1 is about to drop — including any table this file doesn't know
-- about (stories, hypes, follows) if the paywall was applied more widely.
--
--   SELECT schemaname, tablename, policyname, cmd, qual
--   FROM pg_policies
--   WHERE schemaname = 'public'
--     AND (qual ILIKE '%subscription%' OR with_check ILIKE '%subscription%')
--   ORDER BY tablename, policyname;

BEGIN;

-- ── 1. Drop the subscription-gated policies ──────────────────────────────────
-- Matched by definition rather than by name on purpose: the phase 5 SQL is not
-- in either repo (it was run straight in the dashboard), so the exact policy
-- names are not knowable from the code. Anything whose USING/WITH CHECK clause
-- mentions subscriptions is a paywall policy.
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (qual ILIKE '%subscription%' OR with_check ILIKE '%subscription%')
  LOOP
    RAISE NOTICE 'dropping paywall policy %.% ', p.tablename, p.policyname;
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $$;

-- ── 2. Signed-in users can read every post ───────────────────────────────────
-- TO authenticated, NOT TO public: free means "free once you log in", not
-- "the whole athlete feed is open to anonymous scraping". These are minors'
-- photos and video — keeping anon out is the child-safety posture the site
-- already had, and nothing in going free should relax it.
DROP POLICY IF EXISTS posts_read_authenticated ON public.posts;
CREATE POLICY posts_read_authenticated
  ON public.posts FOR SELECT
  TO authenticated
  USING (true);

COMMIT;

-- ── 3. Left in place on purpose ──────────────────────────────────────────────
-- feed_preview()          — harmless, unused while access is free, and the
--                           teaser you'd want back on day one of charging again.
-- active_pro_player_ids() — same; the client now ignores it via _sbActiveProIds().
-- shared_post() / create_share_link() — nothing to do with Pro.
-- The subscriptions table and its rows — 36 accounts still have history there.
--   Do NOT delete it: it is the record of who paid you, and it is what an
--   existing subscriber's refund or cancellation question gets answered from.

-- ── 4. What this file does NOT do ────────────────────────────────────────────
-- Nothing here stops a payment. Money keeps moving until you also:
--   * deactivate the two live PayPal plans (P-6PY978212M678402UNJHMG2Q player,
--     P-40L9540196378042KNJHMG7A coach) in the PayPal dashboard, and
--   * cancel the existing PayPal subscribers, and
--   * remove the subscription from App Store Connect / Play Console when the
--     mobile builds that sell it are replaced.
-- Removing the checkout page only stops NEW signups. Anyone already on a plan
-- keeps getting charged for a product that is now free for everyone else.
