-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 12 — finish making EyeScout free (the half phase 9 never applied)
--
-- Created 2026-08-16.
--
-- THE PROBLEM
-- ───────────
-- The app went free on 2026-08-15: `fetchHasPro()` returns true on mobile and
-- `_subHasAccess()` does the same on web, so every client believes the user is
-- unlocked. The SERVER never got the matching change.
--
-- `_es_viewer_has_feed_access()` still requires an active subscription:
--
--   SELECT EXISTS (
--     SELECT 1 FROM profiles p
--     WHERE p.id = auth.uid()
--       AND ( (p.role = 'player' AND _es_has_active_sub(p.id))
--          OR (p.role = 'coach' AND coalesce(p.verified,false) AND _es_has_active_sub(p.id)) )
--   )
--
-- Six live RLS policies call it. For a NEW user with no subscription row:
--
--   follows_insert    -> cannot follow anyone
--   posts_insert      -> cannot post at all
--   messages_insert   -> a verified coach cannot send messages
--   messages_select   -> a verified coach cannot read messages
--   messages_update   -> a verified coach cannot update messages
--   posts_select      -> superseded (see below), reading still works
--
-- Reading the feed SURVIVES: a second permissive policy,
-- `posts_read_authenticated USING (true)`, is OR'd with `posts_select`. So the
-- feed is not empty — but nobody new can post, follow, or coach-message.
--
-- WHY IT WAS INVISIBLE
-- ────────────────────
-- Both App Review demo accounts carry `subscriptions` rows with
-- status='active', plan='pro' dated 2026-07-31. They pass the gate. So does
-- App Review. Only real new signups hit the wall.
--
-- THE FIX
-- ───────
-- Replace the function body, do NOT drop the six policies. Every other
-- condition they carry (author_id = auth.uid(), player_id = auth.uid(), the
-- coach-verified requirement) stays exactly as it is, and re-enabling Pro later
-- is a one-line revert to section 4.
--
-- WHAT IS DELIBERATELY KEPT
-- ─────────────────────────
-- The `role = 'coach' AND verified = true` requirement stays. That is a CHILD
-- SAFETY control, not a paywall: an unapproved coach must not be able to browse
-- or message minors, and App Review was explicitly told this in the submission
-- notes. Only the `_es_has_active_sub()` calls are removed.
--
-- WHERE TO RUN THIS
-- ─────────────────
--   supabase.com/dashboard
--     -> project auvnwuliwghmjbhhovbo
--     -> SQL Editor (left sidebar)
--     -> New query
--     -> paste ONE SECTION AT A TIME, press Run, read the output
--
-- Run sections 1 and 2 first and READ THE OUTPUT before running section 3.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — LOOK FIRST (read-only, changes nothing)
-- Copy the result somewhere. It is your rollback source of truth, and it tells
-- you the exact attributes (language / volatility / security / search_path)
-- that section 3 must match.
-- ═════════════════════════════════════════════════════════════════════════════

SELECT pg_get_functiondef(oid) AS current_definition
FROM   pg_proc
WHERE  proname = '_es_viewer_has_feed_access';


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — WHAT IS CURRENTLY GATED (read-only, changes nothing)
-- Expect roughly six rows. These are the policies about to start passing for
-- users who have no subscription row.
-- ═════════════════════════════════════════════════════════════════════════════

SELECT tablename, policyname, cmd, qual, with_check
FROM   pg_policies
WHERE  schemaname = 'public'
  AND  (qual       ILIKE '%_es_viewer_has_feed_access%'
    OR  with_check ILIKE '%_es_viewer_has_feed_access%')
ORDER  BY tablename, policyname;


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — THE FIX
--
-- ONLY change vs. the original: both `_es_has_active_sub(p.id)` calls removed.
--
-- IMPORTANT: if section 1 showed attributes different from the ones below
-- (for example `SET search_path = public`), add them here before running, so
-- you replace the body without silently changing how the function executes.
--
-- This only ever WIDENS access, so it cannot lock out anyone who works today —
-- including your demo accounts, which already pass. Safe to run while the app
-- is in review.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION _es_viewer_has_feed_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   profiles p
    WHERE  p.id = auth.uid()
      AND (
             p.role = 'player'
          OR (p.role = 'coach' AND coalesce(p.verified, false) = true)
      )
  )
$$;


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 4 — VERIFY (read-only)
--
-- Expect: the printed definition no longer mentions `_es_has_active_sub`,
-- and `still_gated_on_subscription` reads FALSE.
-- ═════════════════════════════════════════════════════════════════════════════

SELECT pg_get_functiondef(oid) AS new_definition,
       pg_get_functiondef(oid) ILIKE '%_es_has_active_sub%' AS still_gated_on_subscription
FROM   pg_proc
WHERE  proname = '_es_viewer_has_feed_access';

-- Sanity check as yourself. Should return true.
SELECT _es_viewer_has_feed_access() AS my_access;


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 5 — ROLLBACK (do NOT run unless you are re-enabling Pro)
--
-- This is the original body, verbatim, as captured on 2026-08-16. Running it
-- restores the paywall at the database level. Pair it with restoring
-- `fetchHasPro()` in the mobile app and `_subHasAccess()` on web — see
-- RESTORING-PRO.md. Restoring only this half locks free users out again.
-- ═════════════════════════════════════════════════════════════════════════════

-- CREATE OR REPLACE FUNCTION _es_viewer_has_feed_access()
-- RETURNS boolean
-- LANGUAGE sql
-- STABLE
-- SECURITY DEFINER
-- AS $$
--   SELECT EXISTS (
--     SELECT 1
--     FROM   profiles p
--     WHERE  p.id = auth.uid()
--       AND (
--             (p.role = 'player' AND _es_has_active_sub(p.id))
--          OR (p.role = 'coach'  AND coalesce(p.verified, false) = true
--                                AND _es_has_active_sub(p.id))
--       )
--   )
-- $$;


-- ═════════════════════════════════════════════════════════════════════════════
-- AFTERWARDS
-- ═════════════════════════════════════════════════════════════════════════════
-- Regenerate the RLS snapshot so this is visible in version control instead of
-- only in the dashboard, then commit it:
--
--   npx supabase db query "select schemaname,tablename,policyname,cmd,roles::text,qual,with_check from pg_policies where schemaname in ($$public$$,$$storage$$) order by 1,2,3" --linked
--
-- Then confirm end to end: create a throwaway account in the app, and check it
-- can post and follow. That is the only test that proves a user with no
-- subscription row is genuinely unblocked.
