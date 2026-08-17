-- ═════════════════════════════════════════════════════════════════════════════
-- EyeScout — Phase 13 hardening — ONE-SHOT VERSION
--
-- Paste this ENTIRE file into: supabase.com/dashboard
--                                -> project auvnwuliwghmjbhhovbo
--                                -> SQL Editor -> New query -> Run
--
-- Safe to run more than once. Every step is idempotent and self-guarding: the
-- risky ones check the data first and skip themselves rather than fail.
--
-- The final SELECT prints a report card. Read it — that is your confirmation.
--
-- Prerequisite already confirmed 2026-08-16: every `admin_*` function is
-- SECURITY DEFINER, so admin coach-approval keeps working after step 1.
--
-- Differences from supabase-phase13-hardening.sql (the annotated reference):
--   • CONCURRENTLY removed from index creation, so this can run as one block.
--     At ~40 profiles / 2 posts these build instantly. Use the annotated file's
--     CONCURRENTLY version instead if you ever run this on a large table.
--   • The restrictive policy is GONE. Its WITH CHECK sub-queried profiles, which
--     is itself under RLS -> infinite recursion. The column grant below is the
--     real fix and needs no policy.
--   • The column revoke is done properly: `authenticated` has a TABLE-level
--     UPDATE grant, and single columns cannot be carved out of one. So we drop
--     the table grant and re-grant every column except verified and role.
-- ═════════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — Close the privilege-escalation hole   ★ the important one ★
--
-- `profiles_update` is USING (id = auth.uid()) with no WITH CHECK, so Postgres
-- reuses the USING clause as the check — and it is still true after you edit
-- your own row. Any signed-in user can therefore run:
--     UPDATE profiles SET verified = true, role = 'coach' WHERE id = auth.uid();
-- Coach verification is what decides which adults may browse and message
-- minors, so this is a child-safety issue, not just a permissions bug.
--
-- The column list is built dynamically, so no column is missed or invented.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY column_name)
    INTO cols
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'profiles'
     AND column_name NOT IN ('verified', 'role');

  EXECUTE 'REVOKE UPDATE ON public.profiles FROM authenticated';
  EXECUTE format('GRANT UPDATE (%s) ON public.profiles TO authenticated', cols);

  -- anon has no legitimate reason to update a profile; every write path
  -- requires a session, and RLS would reject it anyway (auth.uid() is null).
  EXECUTE 'REVOKE UPDATE ON public.profiles FROM anon';

  RAISE NOTICE 'step 1 ok — verified/role no longer updatable by authenticated';
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 — Indexes for the paths the app actually queries.
-- Irrelevant at today's size, decisive at 10,000 rows. Each is skipped if the
-- table or column does not exist, so a schema surprise cannot break the run.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  spec record;
  made int := 0;
  skipped text := '';
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('idx_posts_created_at',     'posts',         '(created_at DESC)',            ARRAY['created_at']),
      ('idx_posts_author_id',      'posts',         '(author_id)',                  ARRAY['author_id']),
      ('idx_posts_author_created', 'posts',         '(author_id, created_at DESC)', ARRAY['author_id','created_at']),
      ('idx_hypes_post_id',        'hypes',         '(post_id)',                    ARRAY['post_id']),
      ('idx_hypes_user_id',        'hypes',         '(user_id)',                    ARRAY['user_id']),
      ('idx_follows_follower',     'follows',       '(follower_id)',                ARRAY['follower_id']),
      ('idx_follows_followee',     'follows',       '(followee_id)',                ARRAY['followee_id']),
      ('idx_messages_player',      'messages',      '(player_id)',                  ARRAY['player_id']),
      ('idx_messages_coach',       'messages',      '(coach_id)',                   ARRAY['coach_id']),
      ('idx_blocks_blocker',       'blocks',        '(blocker_id)',                 ARRAY['blocker_id']),
      ('idx_profiles_role',        'profiles',      '(role)',                       ARRAY['role'])
    ) AS t(idx, tbl, cols, needed)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema='public' AND table_name=spec.tbl) THEN
      skipped := skipped || spec.idx || ' (no table) '; CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM unnest(spec.needed) c
       WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_schema='public' AND table_name=spec.tbl
                            AND column_name=c)
    ) THEN
      skipped := skipped || spec.idx || ' (no column) '; CONTINUE;
    END IF;

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I %s', spec.idx, spec.tbl, spec.cols);
    made := made + 1;
  END LOOP;

  RAISE NOTICE 'step 2 ok — % indexes ensured. skipped: %', made,
               COALESCE(NULLIF(skipped,''), 'none');
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3 — Stop double-hyping and double-following.
-- Each unique index is created ONLY if the table has no duplicates already, so
-- this can never fail the run. If it skips, the report card says so.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE dupes int;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='hypes' AND column_name='user_id') THEN
    EXECUTE 'SELECT count(*) FROM (SELECT 1 FROM public.hypes GROUP BY user_id, post_id HAVING count(*)>1) d'
       INTO dupes;
    IF dupes = 0 THEN
      CREATE UNIQUE INDEX IF NOT EXISTS uq_hypes_user_post ON public.hypes (user_id, post_id);
      RAISE NOTICE 'step 3a ok — unique hype per user/post enforced';
    ELSE
      RAISE NOTICE 'step 3a SKIPPED — % duplicate hype pairs exist; de-duplicate first', dupes;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='follows' AND column_name='follower_id') THEN
    EXECUTE 'SELECT count(*) FROM (SELECT 1 FROM public.follows GROUP BY follower_id, followee_id HAVING count(*)>1) d'
       INTO dupes;
    IF dupes = 0 THEN
      CREATE UNIQUE INDEX IF NOT EXISTS uq_follows_pair ON public.follows (follower_id, followee_id);
      RAISE NOTICE 'step 3b ok — unique follow per pair enforced';
    ELSE
      RAISE NOTICE 'step 3b SKIPPED — % duplicate follow pairs exist; de-duplicate first', dupes;
    END IF;
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4 — Fix the "165lb lbs" display bug.
-- scout.tsx:293 renders `${weight} lbs`, so a stored "165lb" shows as
-- "165lb lbs". Strips a trailing lb/lbs. Column stays TEXT — retyping it would
-- break the shipped iOS app, which reads and writes it as a string.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.profiles
   SET weight = regexp_replace(weight, '\s*(lbs|lb)\s*$', '', 'i')
 WHERE weight IS NOT NULL
   AND weight ~* '(lb|lbs)\s*$';


-- ═════════════════════════════════════════════════════════════════════════════
-- REPORT CARD — this is the only output you need to read.
-- Every row should say PASS. Anything else, send it to Claude.
-- ═════════════════════════════════════════════════════════════════════════════
SELECT 'verified locked'  AS check,
       CASE WHEN has_column_privilege('authenticated','public.profiles','verified','UPDATE')
            THEN 'FAIL — still self-updatable' ELSE 'PASS' END AS result
UNION ALL
SELECT 'role locked',
       CASE WHEN has_column_privilege('authenticated','public.profiles','role','UPDATE')
            THEN 'FAIL — still self-updatable' ELSE 'PASS' END
UNION ALL
SELECT 'bio still editable',
       CASE WHEN has_column_privilege('authenticated','public.profiles','bio','UPDATE')
            THEN 'PASS' ELSE 'FAIL — normal edits broken, tell Claude' END
UNION ALL
SELECT 'indexes created',
       count(*)::text || ' of 11'
  FROM pg_indexes
 WHERE schemaname='public'
   AND indexname IN ('idx_posts_created_at','idx_posts_author_id','idx_posts_author_created',
                     'idx_hypes_post_id','idx_hypes_user_id','idx_follows_follower',
                     'idx_follows_followee','idx_messages_player','idx_messages_coach',
                     'idx_blocks_blocker','idx_profiles_role')
UNION ALL
SELECT 'unique constraints',
       count(*)::text || ' of 2'
  FROM pg_indexes
 WHERE schemaname='public' AND indexname IN ('uq_hypes_user_post','uq_follows_pair')
UNION ALL
SELECT 'weight rows still bad',
       CASE WHEN count(*)=0 THEN 'PASS' ELSE count(*)::text || ' remaining' END
  FROM public.profiles
 WHERE weight IS NOT NULL AND weight ~* '(lb|lbs)\s*$'
UNION ALL
SELECT 'phase 12 gate open',
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc
                          WHERE proname='_es_viewer_has_feed_access'
                            AND pg_get_functiondef(oid) ILIKE '%_es_has_active_sub%')
            THEN 'FAIL — still paywalled, phase 12 did not apply' ELSE 'PASS' END
UNION ALL
SELECT 'storage anon write',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                          WHERE schemaname='storage' AND tablename='objects'
                            AND 'anon' = ANY(roles) AND cmd IN ('INSERT','UPDATE','DELETE'))
            THEN 'FAIL — anon can write to storage' ELSE 'PASS' END;
