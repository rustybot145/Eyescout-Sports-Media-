-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 11 — per-type email notification prefs, and get a minor's phone number
--            out of the public API.
--
-- Two unrelated jobs, one file, because they ship together.
--
--   SECTION 1  Notification prefs. Almost certainly a NO-OP — it only asserts
--              that profiles.prefs exists. Read it, run the checks, move on.
--   SECTION 2  THE SECURITY FIX. player_contact() currently returns `phone` and
--              `parent_phone`. This drops both from its return type.
--
-- SECTION 2 IS THE REASON THIS FILE EXISTS. The client half is already shipped
-- (the Phone row is gone from profile.html's Info tab, and _sbPlayerContact() no
-- longer maps the field) but that is cosmetic: until this runs, the number is
-- still in the JSON the browser receives and anyone can read it out of the
-- network tab. These are minors' phone numbers. Run section 2.
--
-- Findings below are labelled [VERIFIED LIVE] (probed the running database) or
-- [FROM CODE] (inferred by reading the clients). Nothing in this file is
-- [VERIFIED LIVE] — it was written without database credentials. In particular
-- the body of player_contact() in section 2 is RECONSTRUCTED from the behaviour
-- the clients document, not copied from the live definition. Run section 0 and
-- diff the two before you run section 2. If the live body gates on something
-- this one doesn't (a verified-coach check, a block list), keep the live
-- predicate and change ONLY the returned columns.
--
-- RUN IT: Supabase dashboard → SQL Editor → paste → Run. Idempotent; each
-- section is safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 0 — LOOK FIRST (read-only; run these on their own, change nothing)
-- ═════════════════════════════════════════════════════════════════════════════
-- The current definition of the function section 2 replaces. PRINT THIS AND
-- READ IT BEFORE RUNNING SECTION 2 — the original SQL is not in any repo, so
-- this is the only copy of it that exists.
--
--   SELECT pg_get_functiondef(p.oid)
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname IN ('player_contact', 'my_contact');
--
-- Who may execute it today. Section 2 grants EXECUTE to `authenticated` only;
-- if this shows `anon` as well, decide deliberately whether to restore that
-- (you should not — this returns contact details for minors):
--
--   SELECT p.proname, p.prosecdef AS security_definer,
--          array_to_string(p.proacl, E'\n') AS grants
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname IN ('player_contact', 'my_contact');
--
-- How many accounts have already opted a notification type off. Before this
-- ships the answer must be 0 — nobody has ever been shown these switches:
--
--   SELECT count(*) FILTER (WHERE prefs ? 'notif_message')       AS msg,
--          count(*) FILTER (WHERE prefs ? 'notif_coach_follow')  AS follow,
--          count(*) FILTER (WHERE prefs ? 'notif_admin_message') AS admin,
--          count(*)                                              AS profiles
--   FROM public.profiles;


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 1 — notification prefs live in profiles.prefs (no new column)
-- ═════════════════════════════════════════════════════════════════════════════
-- The three toggles the Settings screens now show map 1:1 onto the only three
-- notification types notify-email actually sends:
--
--     notif_message        → type 'message'        (coach ↔ player DM)
--     notif_coach_follow   → type 'coach_follow'   (players only)
--     notif_admin_message  → type 'admin_message'  (the EyeScout team writing)
--
-- ABSENT MEANS ON. This is the whole design and it is not negotiable: every
-- existing row has none of these keys, so the edge function tests
-- `prefs->>key = 'false'` and nothing else. A "default off" reading of a missing
-- key would silently unsubscribe every account you have on the next deploy.
-- profiles.email_notifications stays the master switch and is checked first.
--
-- Nothing needed a schema change, so all this does is make sure the column the
-- design leans on is really there. [FROM CODE] — profiles.prefs is read and
-- written by the web (sb-data.js `prefs`), the admin panel and the mobile app,
-- so it exists; this is a belt-and-braces no-op for a fresh environment.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS prefs jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Deploy the edge function too. Section 1 changes nothing on its own: the
-- toggles write to prefs from day one, but the mail keeps going out until
-- supabase/functions/notify-email/index.ts is redeployed with the PREF_KEY
-- check. Client-only is a settings screen that lies.


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 2 — player_contact() must stop returning phone numbers  ← the fix
-- ═════════════════════════════════════════════════════════════════════════════
-- WHY A DROP AND NOT A REPLACE
-- CREATE OR REPLACE cannot change a function's return type, and removing two
-- OUT columns changes it. The drop is unavoidable. It is also the reason this
-- section is the risky one: between the DROP and the CREATE the RPC does not
-- exist, and if the CREATE fails the profile Info tab silently shows no contact
-- details at all (the client catches the error and returns blanks). Hence the
-- transaction — either both statements land or neither does.
--
-- WHAT IS DELIBERATELY UNCHANGED
--   * my_contact() — returns YOUR OWN row to you. A user seeing their own phone
--     number is not a leak; it is what the Settings phone field is populated
--     from. Leave it alone.
--   * The profiles.phone / parent_phone COLUMNS — still collected at signup,
--     still needed, still visible to the admin panel, which is an internal
--     business record. Nothing here deletes any data.
--   * The opt-in gate itself. `priv-contact` still governs whether a coach sees
--     the email; this narrows WHAT is returned, not WHO may call it.
BEGIN;

DROP FUNCTION IF EXISTS public.player_contact(uuid);

CREATE FUNCTION public.player_contact(p_id uuid)
RETURNS TABLE (
  email        text,
  parent_first text,
  parent_last  text,
  parent_email text,
  zip          text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
-- Pinned: a SECURITY DEFINER function without this resolves unqualified names
-- through the caller's search_path, which is how a definer function gets turned
-- into someone else's code running as the owner.
SET search_path = public, pg_temp
AS $$
  SELECT p.email, p.parent_first, p.parent_last, p.parent_email, p.zip
  FROM public.profiles p
  WHERE p.id = p_id
    AND (
      -- It's you.
      p.id = auth.uid()
      -- …or you turned "Show Contact Info" on. Stored by the web Settings page
      -- as a JSON boolean and by older clients as the string "true"; ->> renders
      -- both as 'true', so this matches either without caring which.
      OR (p.prefs ->> 'priv-contact') = 'true'
    );
$$;

-- Signed in only. This returns contact details for minors; the publishable key
-- that `anon` holds ships inside the app and the website, so granting anon here
-- would be granting it to the internet. If section 0 showed anon on the old
-- function, that was a bug and this is the fix for it.
REVOKE ALL ON FUNCTION public.player_contact(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.player_contact(uuid) TO authenticated;

COMMIT;


-- ═════════════════════════════════════════════════════════════════════════════
-- SECTION 3 — verify (read-only; run after, expect exactly these answers)
-- ═════════════════════════════════════════════════════════════════════════════
-- 1. The return type no longer mentions a phone. Expect ZERO rows:
--
--      SELECT col FROM (
--        SELECT unnest(p.proargnames) AS col
--        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--        WHERE n.nspname='public' AND p.proname='player_contact'
--      ) t WHERE col LIKE '%phone%';
--
-- 2. It still returns the email for an opted-in player. Pick an id where
--    prefs->>'priv-contact' = 'true' and expect one row with a real email:
--
--      SELECT * FROM public.player_contact('<opted-in-player-uuid>');
--
-- 3. It still returns NOTHING for a player who has not opted in. Expect zero
--    rows — if this returns a row, the gate was lost in the rewrite and you have
--    made things worse, not better. Roll back to the definition section 0
--    printed:
--
--      SELECT * FROM public.player_contact('<not-opted-in-player-uuid>');
--
-- 4. And the client half, in a browser: open another player's profile → Info
--    tab, with devtools on the Network panel. The player_contact response must
--    contain no phone field. That is the check that actually matters, because
--    it is the exact thing an attacker looks at.
