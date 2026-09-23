-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 14 — Instagram auto-posting: somewhere safe to keep the tokens
--
-- Created 2026-09-22. Run it in: supabase.com/dashboard
--                              -> project auvnwuliwghmjbhhovbo
--                              -> SQL Editor -> New query -> paste -> Run
--
-- Safe to run more than once. It ADDS one table and touches nothing existing:
-- no column is dropped, renamed or retyped, and no policy on any other table
-- changes. Nothing the live app does today can break because of this.
--
-- WHY A NEW TABLE INSTEAD OF profiles.prefs
--   An Instagram access token can post as that athlete for 60 days. `prefs`
--   lives on `profiles`, and profiles rows are readable by other signed-in
--   users (that is how coaches browse athletes). Putting a token there would
--   hand every coach the ability to post to every athlete's Instagram.
--   So it gets its own table, locked down harder than anything else in the DB.
--
-- HOW IT IS LOCKED
--   RLS is ON and there are DELIBERATELY NO POLICIES. In Postgres that means
--   no ordinary signed-in user can read, insert, update or delete a single row,
--   not even their own. Only the service role — which lives exclusively in the
--   Vercel functions, never in the app — can touch it. The app never sees a
--   token; it only ever asks the server "am I connected?" and "please post".
-- ─────────────────────────────────────────────────────────────────────────────


-- 1. The table ────────────────────────────────────────────────────────────────
create table if not exists public.instagram_accounts (
  -- One Instagram connection per EyeScout account. Reconnecting overwrites.
  user_id       uuid primary key references auth.users (id) on delete cascade,

  ig_user_id    text        not null,   -- Instagram's own id for the account
  username      text,                   -- shown in the app: "Connected as @name"
  access_token  text        not null,   -- long-lived, ~60 days
  expires_at    timestamptz,            -- when the token dies; refresh before this
  connected_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table  public.instagram_accounts is
  'Instagram publishing tokens. Service-role only — RLS is on with no policies by design. See supabase-phase14-instagram.sql.';
comment on column public.instagram_accounts.access_token is
  'Long-lived Instagram token. Never expose to a client. Never add a SELECT policy to this table.';


-- 2. Lock it ──────────────────────────────────────────────────────────────────
alter table public.instagram_accounts enable row level security;
alter table public.instagram_accounts force row level security;

-- Belt and braces: even the blanket grants Supabase hands `anon`/`authenticated`
-- on new public tables are taken back, so the only way in is the service role.
revoke all on public.instagram_accounts from anon, authenticated;

-- NO CREATE POLICY STATEMENTS HERE. That is the point. If a future migration
-- adds one, it opens the hole this table exists to avoid.


-- 3. Keep updated_at honest ───────────────────────────────────────────────────
create or replace function public.touch_instagram_accounts()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_touch_instagram_accounts on public.instagram_accounts;
create trigger trg_touch_instagram_accounts
  before update on public.instagram_accounts
  for each row execute function public.touch_instagram_accounts();


-- 4. Check it worked ──────────────────────────────────────────────────────────
-- Expect: rls_enabled = true, policy_count = 0. Both matter.
select
  c.relname                                  as table_name,
  c.relrowsecurity                           as rls_enabled,
  (select count(*) from pg_policies p
    where p.schemaname = 'public'
      and p.tablename  = 'instagram_accounts') as policy_count
from   pg_class c
join   pg_namespace n on n.oid = c.relnamespace
where  n.nspname = 'public' and c.relname = 'instagram_accounts';


-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (only if you want this gone)
--   drop table if exists public.instagram_accounts;
--   drop function if exists public.touch_instagram_accounts();
-- Dropping the table disconnects everyone's Instagram. It deletes no posts and
-- no profiles.
-- ─────────────────────────────────────────────────────────────────────────────
