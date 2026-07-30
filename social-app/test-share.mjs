// Self-check for the share-link data layer: node test-share.mjs
//
// The tricky part of _sbSharedPost is that it has THREE outcomes, not two —
// a post, null (no such post), and 'not-deployed' (the RPC is missing). Collapsing
// the third into the second is the bug worth guarding: it would tell users a real
// post was deleted when the SQL migration simply hasn't been run.
import { readFileSync } from 'fs';
import { createContext, runInContext } from 'vm';
import assert from 'assert';

function load(rpcImpl) {
  const noop = () => {};
  const ctx = {
    console,
    URL, URLSearchParams, JSON, Date, Math, Array, Object, RegExp, Error, setTimeout,
    supabase: { createClient: () => ({ rpc: rpcImpl, from: () => ({}), auth: {} }) },
    window: { location: { href: 'https://eyescoutsports.com/social-app/feed.html' }, MutationObserver: null },
    document: {
      addEventListener: noop, readyState: 'complete', body: null,
      querySelector: () => null, querySelectorAll: () => [],
      getElementById: () => null,
      createElement: () => ({ style: {}, classList: { add: noop, remove: noop }, appendChild: noop, setAttribute: noop }),
      head: { appendChild: noop },
      documentElement: { appendChild: noop },
    },
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    fetch: noop,
  };
  ctx.globalThis = ctx;
  createContext(ctx);
  runInContext(readFileSync(new URL('./sb-data.js', import.meta.url), 'utf8'), ctx);
  return ctx;
}

const POST_ROW = {
  author_name: 'Jordan Reyes', sport: 'Football',
  media_type: 'photo', media_data: 'https://cdn/x.jpg', created_at: '2026-07-01T00:00:00Z',
};

const t = [];

// 1. Happy path — a row comes back mapped into app shape.
t.push(load(async () => ({ data: [POST_ROW], error: null }))._sbSharedPost('tok123').then(p => {
  assert.strictEqual(p.authorName, 'Jordan Reyes');
  assert.strictEqual(p.type, 'photo');
  assert.strictEqual(p.mediaData, 'https://cdn/x.jpg');
  // Nothing that enables pivoting into the app may leak through the mapper.
  assert.ok(!('authorId' in p), 'author_id must never reach the share page');
  assert.ok(!('caption' in p), 'caption must never reach the share page');
  assert.ok(!('id' in p), 'post id must never reach the share page');
}));

// 2. No such token → null.
t.push(load(async () => ({ data: [], error: null }))._sbSharedPost('nope').then(p => {
  assert.strictEqual(p, null);
}));

// 3. RPC not deployed → 'not-deployed', NOT null. This is the one that matters.
for (const err of [
  { code: '42883', message: 'function public.shared_post(text) does not exist' },
  { code: 'PGRST202', message: 'Could not find the function' },
  { code: 'XXX', message: 'function shared_post does not exist in schema cache' },
]) {
  t.push(load(async () => ({ data: null, error: err }))._sbSharedPost('x').then(p => {
    assert.strictEqual(p, 'not-deployed', `expected not-deployed for ${err.code}`);
  }));
}

// 4. A real error (permission, network) → null, so the page says "not found"
//    rather than blaming a deploy that already happened.
t.push(load(async () => ({ data: null, error: { code: '42501', message: 'permission denied' } }))._sbSharedPost('x')
  .then(p => assert.strictEqual(p, null)));

// 5. Thrown/rejected → null, never an unhandled rejection.
t.push(load(async () => { throw new Error('offline'); })._sbSharedPost('x')
  .then(p => assert.strictEqual(p, null)));

// 6. Missing token short-circuits without calling the RPC at all.
t.push(load(async () => { throw new Error('should not be called'); })._sbSharedPost('')
  .then(p => assert.strictEqual(p, null)));

// 7. Share URL is absolute, points at share.html, and escapes the token.
{
  const ctx = load(async () => ({ data: [], error: null }));
  assert.strictEqual(ctx._sbShareUrl('tok123'),
    'https://eyescoutsports.com/social-app/share.html?s=tok123');
  assert.ok(ctx._sbShareUrl('a b&c').includes('a%20b%26c'), 'token must be URL-encoded');
  assert.strictEqual(ctx._sbShareLabel(), 'eyescoutsports.com');
}

// 8. The share host is PINNED to production, not derived from where the page is
//    running. A link minted on localhost is still a link someone else has to be
//    able to open — this is the regression that would silently ship dead links.
{
  const ctx = load(async () => ({ data: [], error: null }));
  ctx.window.location.href = 'http://localhost:3100/social-app/feed.html';
  const u = ctx._sbShareUrl('tok123');
  assert.ok(!u.includes('localhost'), 'share links must never point at localhost');
  assert.ok(u.startsWith('https://eyescoutsports.com/'), 'share links must be production URLs');
}

// ── create_share_link ────────────────────────────────────────────────────────
// Post ids are Date.now() timestamps in a TEXT column — guessable. The whole
// point of the token indirection is that a share URL must never contain one.

// 9. Happy path returns the token.
t.push(load(async () => ({ data: 'tok_abc', error: null }))._sbCreateShareLink('1785273371123')
  .then(v => assert.strictEqual(v, 'tok_abc')));

// 10. The RPC must be called with the id as a STRING — posts.id is text, and a
//     number would fail the comparison server-side.
{
  let seen = null;
  const ctx = load(async (name, args) => { seen = { name, args }; return { data: 'tok_abc', error: null }; });
  t.push(ctx._sbCreateShareLink(1785273371123).then(() => {
    assert.strictEqual(seen.name, 'create_share_link');
    assert.strictEqual(typeof seen.args.p_post_id, 'string', 'post id must be sent as text');
  }));
}

// 11. Not signed in → 'auth', distinct from every other failure.
t.push(load(async () => ({ data: null, error: { code: '42501', message: 'must be signed in to create a share link' } }))
  ._sbCreateShareLink('1').then(v => assert.strictEqual(v, 'auth')));

// 12. Migration not run → 'not-deployed', distinct from a real failure.
t.push(load(async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }))
  ._sbCreateShareLink('1').then(v => assert.strictEqual(v, 'not-deployed')));

// 13. Anything else → null.
t.push(load(async () => ({ data: null, error: { code: '08006', message: 'connection failure' } }))
  ._sbCreateShareLink('1').then(v => assert.strictEqual(v, null)));

// 14. A share URL must never leak the raw post id.
{
  const ctx = load(async () => ({ data: 'tok_abc', error: null }));
  const u = ctx._sbShareUrl('tok_abc');
  assert.ok(!u.includes('1785273371123'), 'share URL must not contain the post id');
  assert.ok(u.includes('?s='), 'share URL must carry a token, not ?p=');
}

await Promise.all(t);
console.log('share: all checks passed (%d async + url)', t.length);
