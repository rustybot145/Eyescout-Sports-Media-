-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 8 — Post sharing
--
-- Lets anyone (logged out, no Pro) open a shared link and see exactly one
-- thing: that post's media. Nothing else.
--
-- WHY THIS IS TOKEN-BASED AND NOT KEYED ON post.id
-- Post ids in this app are minted client-side as Date.now().toString() — plain
-- millisecond timestamps ("1785273371123"), stored in a TEXT column. They are
-- therefore *guessable*: anyone who knows roughly when a post was made can scan
-- a narrow time window and hit real ids. A public function keyed on post.id
-- would hand out an enumeration oracle over the whole posts table and quietly
-- defeat the phase-5 Pro paywall.
--
-- So sharing uses a separate random token (122 bits, gen_random_uuid) that must
-- be minted by a signed-in user. Knowing a post id gets you nothing.
--
-- WHAT THIS CHANGES
--   * adds posts.share_token (nullable, unique) — no existing column touched
--   * adds two functions; alters no policy, no trigger, no existing function
--   * nothing is backfilled: tokens are minted lazily on first share
--
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Where the token lives ────────────────────────────────────────────────
alter table public.posts
  add column if not exists share_token text;

-- Partial unique index: unshared posts stay NULL and don't collide.
create unique index if not exists posts_share_token_uniq
  on public.posts (share_token)
  where share_token is not null;


-- ── 2. Minting a link (signed-in users only) ────────────────────────────────
-- SECURITY DEFINER so it can write share_token without granting the client a
-- general UPDATE on posts. Requires auth.uid(), so a logged-out visitor cannot
-- mint links for arbitrary post ids — which is what stops the enumeration this
-- whole design exists to prevent.
create or replace function public.create_share_link(p_post_id text)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_token text;
begin
  if auth.uid() is null then
    raise exception 'must be signed in to create a share link'
      using errcode = '42501';
  end if;

  select share_token into v_token
  from public.posts
  where id = p_post_id;

  if not found then
    raise exception 'post not found' using errcode = 'P0002';
  end if;

  if v_token is null then
    v_token := replace(gen_random_uuid()::text, '-', '');
    update public.posts set share_token = v_token where id = p_post_id;
  end if;

  return v_token;
end;
$$;


-- ── 3. Reading a shared post (public) ───────────────────────────────────────
-- The deliberate, single-row hole in the phase-5 paywall. Narrow on purpose:
--   * one token in, at most one row out — no listing
--   * returns ONLY media + minimal attribution
--   * never returns author_id, caption, likes or tournament, so a viewer has
--     nothing to pivot from into a profile, the feed, or another post
create or replace function public.shared_post(p_token text)
returns table (
  author_name  text,
  sport        text,
  media_type   text,
  media_data   text,
  created_at   timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.author_name, p.sport, p.media_type, p.media_data, p.created_at
  from public.posts p
  where p.share_token is not null
    and p.share_token = nullif(p_token, '')
  limit 1;
$$;


-- ── 4. Grants ───────────────────────────────────────────────────────────────
revoke all on function public.create_share_link(text) from public;
revoke all on function public.shared_post(text)       from public;

-- Only signed-in users can mint a link…
grant execute on function public.create_share_link(text) to authenticated;
-- …but anyone holding one can open it. That is the point of a share link.
grant execute on function public.shared_post(text) to anon, authenticated;

comment on function public.shared_post(text) is
  'Public read of ONE post''s media by random share token. Bypasses the phase-5 '
  'posts paywall on purpose; returns only media + attribution, never author_id '
  'or caption. Token-based because post.id is a guessable timestamp.';

comment on function public.create_share_link(text) is
  'Mints (or returns) the random share token for a post. Signed-in users only.';


-- ═══════════════════════════════════════════════════════════════════════════
-- TO UNDO, if you ever want this gone:
--   drop function if exists public.shared_post(text);
--   drop function if exists public.create_share_link(text);
--   drop index  if exists public.posts_share_token_uniq;
--   alter table public.posts drop column if exists share_token;
-- Dropping the functions alone instantly kills every outstanding share link
-- while leaving the column and its data untouched.
-- ═══════════════════════════════════════════════════════════════════════════
