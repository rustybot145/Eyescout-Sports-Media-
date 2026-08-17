-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 13 — database hardening
--
-- Created 2026-08-16. NOTHING HERE HAS BEEN RUN. Review, then run section by
-- section in: supabase.com/dashboard -> project auvnwuliwghmjbhhovbo
--                                    -> SQL Editor -> New query
--
-- ⚠️  THE iOS APP (build 18) IS IN APPLE APP REVIEW RIGHT NOW.
-- Everything in this file is therefore ADDITIVE. No column is dropped, renamed
-- or retyped, and no constraint is added that would reject data the shipped app
-- already writes. Anything that could break a live client is COMMENTED OUT with
-- the reason, for you to decide on later.
--
-- Read sections 1 and 2 output BEFORE running anything that changes state.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT THIS FIXES, IN PRIORITY ORDER
--
--   §3  PRIVILEGE ESCALATION (child safety). `profiles_update` is
--       `USING (id = auth.uid())` with NO `WITH CHECK`. Postgres then reuses the
--       USING expression as the check — and `id = auth.uid()` is still true
--       after you change your own row. So any signed-in user can run:
--
--           UPDATE profiles SET verified = true  WHERE id = auth.uid();
--           UPDATE profiles SET role     = 'coach' WHERE id = auth.uid();
--
--       Coach verification is the control that decides which adults may browse
--       and message minors. It is also the control you described to App Review.
--       Today it is self-serve. This is the most serious item in this file.
--
--   §4  Indexes on the paths the app actually queries. None of this matters at
--       40 profiles and 2 posts; all of it matters at 10,000.
--
--   §5  Duplicate prevention (double-hype, double-follow).
--
--   §6  Storage bucket inspection.
--
--   §7  The `165lb lbs` data bug, as a safe backfill.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — LOOK FIRST (read-only)
-- ═════════════════════════════════════════════════════════════════════════════

-- 1a. Who can update profiles, and is there a WITH CHECK?
SELECT policyname, cmd, qual AS using_clause, with_check
FROM   pg_policies
WHERE  schemaname = 'public' AND tablename = 'profiles'
ORDER  BY policyname;

-- 1b. Which columns can `authenticated` currently UPDATE on profiles?
--     An empty result means table-level UPDATE is granted (no column limits).
SELECT grantee, privilege_type, column_name
FROM   information_schema.column_privileges
WHERE  table_schema = 'public' AND table_name = 'profiles'
  AND  grantee IN ('authenticated','anon')
ORDER  BY grantee, column_name;

-- 1c. Existing indexes, so section 4 does not duplicate work.
SELECT tablename, indexname, indexdef
FROM   pg_indexes
WHERE  schemaname = 'public'
ORDER  BY tablename, indexname;

-- 1d. Would the uniqueness constraints in section 5 fail on existing data?
--     Both MUST return zero rows before you run section 5.
SELECT user_id, post_id, count(*) FROM hypes
GROUP BY user_id, post_id HAVING count(*) > 1;

SELECT follower_id, followee_id, count(*) FROM follows
GROUP BY follower_id, followee_id HAVING count(*) > 1;

-- 1e. How many rows would section 7 rewrite?
SELECT count(*) AS weight_rows_to_normalise
FROM   profiles
WHERE  weight IS NOT NULL AND weight ~* '(lb|lbs)\s*$';


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — CONFIRM THE ESCALATION IS REAL (read-only)
--
-- Run as yourself in the SQL editor. This only PLANS the statement, it does not
-- execute it. If the plan comes back without a permissions error, the write
-- would be allowed for any authenticated user.
-- ═════════════════════════════════════════════════════════════════════════════

-- EXPLAIN UPDATE profiles SET verified = true WHERE id = auth.uid();


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — CLOSE THE PRIVILEGE ESCALATION   ★ most important section ★
--
-- Column-level REVOKE rather than a new policy or a trigger. It is the smallest
-- possible change, it cannot be bypassed by a future policy edit, and it leaves
-- every other profile update (bio, position, photo, stats, prefs) working
-- exactly as it does today.
--
-- BEFORE YOU RUN THIS, CONFIRM:
--   • Your ADMIN panel updates `verified` using the SERVICE ROLE key, not a
--     normal signed-in session. Service role bypasses RLS and column grants, so
--     admin approval keeps working. If your admin approves coaches over a plain
--     user session, this WILL break approvals — fix the admin first.
--   • Signup writes `role` via INSERT, not UPDATE (confirmed in
--     eyescout-mobile/src/lib/auth.ts and social-app/login.html), so signup is
--     unaffected.
-- ═════════════════════════════════════════════════════════════════════════════

REVOKE UPDATE (verified, role) ON public.profiles FROM authenticated;
REVOKE UPDATE (verified, role) ON public.profiles FROM anon;

-- Belt and braces: make the intent explicit in the policy too, so that a future
-- `GRANT UPDATE ON profiles TO authenticated` does not silently reopen the hole.
DROP   POLICY IF EXISTS profiles_no_self_elevate ON public.profiles;
CREATE POLICY profiles_no_self_elevate ON public.profiles
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND verified IS NOT DISTINCT FROM (SELECT p.verified FROM public.profiles p WHERE p.id = auth.uid())
    AND role     IS NOT DISTINCT FROM (SELECT p.role     FROM public.profiles p WHERE p.id = auth.uid())
  );


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 4 — INDEXES
--
-- ⚠️  CREATE INDEX CONCURRENTLY CANNOT RUN INSIDE A TRANSACTION BLOCK.
-- The Supabase SQL editor wraps multi-statement runs in a transaction, so run
-- the statements in this section ONE AT A TIME, each on its own.
--
-- CONCURRENTLY keeps the table writable while the index builds. At your current
-- row counts a plain CREATE INDEX would also be instant — but running it this
-- way now means the same script is still safe when the tables are large.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_created_at    ON public.posts      (created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_author_id     ON public.posts      (author_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_author_created ON public.posts     (author_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hypes_post_id       ON public.hypes      (post_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hypes_user_id       ON public.hypes      (user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_follows_follower    ON public.follows    (follower_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_follows_followee    ON public.follows    (followee_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_player     ON public.messages   (player_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_coach      ON public.messages   (coach_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_blocks_blocker      ON public.blocks     (blocker_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user  ON public.notifications (user_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_role       ON public.profiles   (role);

-- If any statement above errors with "column ... does not exist", that table
-- uses a different column name. Check section 1c output and adjust — do not
-- guess. A wrong index is harmless; a wrong assumption about your schema is not.


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 5 — PREVENT DUPLICATES
--
-- ONLY run this after section 1d returned ZERO rows for both queries.
-- If it returned rows, de-duplicate first or these will fail (harmlessly —
-- a failed constraint creation changes nothing).
-- ═════════════════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_hypes_user_post
  ON public.hypes (user_id, post_id);

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_follows_pair
  ON public.follows (follower_id, followee_id);


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 6 — STORAGE BUCKET AUDIT (read-only)
--
-- The `posts` bucket holds minors' photos. Confirm anon cannot write or delete.
-- Any policy below whose roles include `anon` for INSERT/UPDATE/DELETE is a hole.
-- ═════════════════════════════════════════════════════════════════════════════

SELECT id, name, public FROM storage.buckets ORDER BY name;

SELECT policyname, cmd, roles::text, qual, with_check
FROM   pg_policies
WHERE  schemaname = 'storage' AND tablename = 'objects'
ORDER  BY policyname;


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 7 — NORMALISE `weight`  (the "165lb lbs" bug)
--
-- app/(coach)/scout.tsx:293 renders `${player.weight} lbs`, so a stored value of
-- "165lb" displays as "165lb lbs" — visible today in your App Store screenshots.
--
-- The column stays TEXT. Retyping it to integer would break the shipped app,
-- which reads and writes it as a string.
--
-- Preview first (read-only), then run the UPDATE.
-- ═════════════════════════════════════════════════════════════════════════════

-- 7a. Preview — read this before running 7b.
SELECT id, weight AS before,
       regexp_replace(weight, '\s*(lbs|lb)\s*$', '', 'i') AS after
FROM   profiles
WHERE  weight IS NOT NULL AND weight ~* '(lb|lbs)\s*$';

-- 7b. Apply. Idempotent — running it twice changes nothing the second time.
UPDATE profiles
SET    weight = regexp_replace(weight, '\s*(lbs|lb)\s*$', '', 'i')
WHERE  weight IS NOT NULL AND weight ~* '(lb|lbs)\s*$';


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 8 — CONSIDERED AND DELIBERATELY LEFT OUT
--
-- Each of these would break a live client or needs a decision you should make
-- consciously. They are here so the reasoning is not lost, not as a to-do list.
-- ═════════════════════════════════════════════════════════════════════════════

-- 8a. Foreign keys with ON DELETE CASCADE on posts.author_id, hypes.post_id,
--     follows.*, messages.*. Correct in principle. NOT included because
--     `delete_my_account` already deletes dependents explicitly, and adding
--     cascades underneath it could change deletion ORDER in ways that are hard
--     to predict while the app is in review. Revisit after approval, and test
--     account deletion on a throwaway immediately afterwards.

-- 8b. NOT NULL on profiles.role and profiles.email. Almost certainly already
--     true for every row, but a single legacy NULL would make the migration
--     fail mid-run. If you want it:
--         SELECT count(*) FROM profiles WHERE role IS NULL OR email IS NULL;
--     and only if that returns 0:
--         ALTER TABLE profiles ALTER COLUMN role  SET NOT NULL;
--         ALTER TABLE profiles ALTER COLUMN email SET NOT NULL;

-- 8c. CHECK constraint on profiles.role IN ('player','coach'). Same reasoning —
--     safe only once you have confirmed no other value exists:
--         SELECT DISTINCT role FROM profiles;

-- 8d. Tightening profiles_select. It currently exposes player rows to any
--     viewer passing _es_viewer_has_feed_access(), which after phase 12 is
--     every signed-in user. For a minors platform, consider whether a coach
--     should see parent contact details. Left alone because narrowing it WOULD
--     remove access the app currently depends on — that needs a client change
--     shipped first, and the client is in review.


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 9 — ROLLBACK (commented; run only if something misbehaves)
-- ═════════════════════════════════════════════════════════════════════════════

-- Undo section 3 (this REOPENS the self-verification hole):
-- DROP POLICY IF EXISTS profiles_no_self_elevate ON public.profiles;
-- GRANT UPDATE (verified, role) ON public.profiles TO authenticated;

-- Undo section 4 / 5 indexes:
-- DROP INDEX CONCURRENTLY IF EXISTS idx_posts_created_at;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_posts_author_id;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_posts_author_created;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_hypes_post_id;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_hypes_user_id;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_follows_follower;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_follows_followee;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_messages_player;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_messages_coach;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_blocks_blocker;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_notifications_user;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_profiles_role;
-- DROP INDEX CONCURRENTLY IF EXISTS uq_hypes_user_post;
-- DROP INDEX CONCURRENTLY IF EXISTS uq_follows_pair;

-- Section 7 is not reversible (the original "165lb" strings are gone). It is
-- also purely cosmetic, so there is nothing to restore.


-- ═════════════════════════════════════════════════════════════════════════════
-- AFTERWARDS
-- ═════════════════════════════════════════════════════════════════════════════
-- Regenerate the RLS snapshot and commit it, so this shows up in review:
--
--   npx supabase db query "select schemaname,tablename,policyname,cmd,roles::text,qual,with_check from pg_policies where schemaname in ($$public$$,$$storage$$) order by 1,2,3" --linked
--
-- Then verify by hand:
--   • A coach account can still be approved from the admin panel
--   • A signed-in user CANNOT self-verify (try it on a throwaway account)
--   • Signup, posting, following and messaging all still work
