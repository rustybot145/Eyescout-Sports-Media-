// ── EyeScout Supabase Data Layer ────────────────────────────────────────────
// Include after @supabase/supabase-js@2 CDN script.
// Provides _SB (client), conversion helpers, _sbSync(), and write helpers.

const _SB = supabase.createClient(
  'https://auvnwuliwghmjbhhovbo.supabase.co',
  'sb_publishable_7qKzHagsIYotquLIiARBqg_cbTSv9C5'
);

// ── Row → legacy localStorage object conversions ─────────────────────────────

function _rowToPlayer(r) {
  return {
    id:           r.id,
    email:        r.email        || '',
    athleteFirst: r.athlete_first || '',
    athleteLast:  r.athlete_last  || '',
    sport:        r.sport         || '',
    jersey:       r.jersey        || '',
    school:       r.school        || '',
    gradYear:     r.grad_year     || '',
    phone:        r.phone         || '',
    parentFirst:  r.parent_first  || '',
    parentLast:   r.parent_last   || '',
    parentEmail:  r.parent_email  || '',
    parentPhone:  r.parent_phone  || '',
    zip:          r.zip           || '',
    purchased:    !!r.purchased,
    selectionSubmitted:    !!r.selection_submitted,
    selectedPhotos:        r.selected_photos        || [],
    photosReady:           !!r.photos_ready,
    deliveredPhotos:       r.delivered_photos       || [],
    photoPackageSize:      r.photo_package_size      || null,
    totalPhotoCount:       r.total_photo_count       || null,
    watermarkedDropboxUrl: r.watermarked_dropbox_url || null,
    selectionDropboxUrl:   r.selection_dropbox_url   || null,
    dropboxUrl:    r.dropbox_url    || null,
    profilePhoto:  r.profile_photo  || null,
    bio:           r.bio            || '',
    position:      r.position       || '',
    clubTeam:      r.club_team      || '',
    height:        r.height         || '',
    weight:        r.weight         || '',
    achievements:  r.achievements   || [],
    stats:         r.stats          || [],
    sportStats:    r.stats          || [],
    ownPhotos:     r.own_photos     || [],
    ownClips:      r.own_clips      || [],
    prefs:         r.prefs          || {},
    submittedAt:   r.submitted_at   || null,
    createdAt:     r.created_at     || new Date().toISOString(),
    role:          r.role           || 'player',
  };
}

function _playerToRow(p) {
  return {
    id:            p.id,
    email:         p.email,
    athlete_first: p.athleteFirst  || null,
    athlete_last:  p.athleteLast   || null,
    sport:         p.sport         || null,
    jersey:        p.jersey        || null,
    school:        p.school        || null,
    grad_year:     p.gradYear      || null,
    phone:         p.phone         || null,
    parent_first:  p.parentFirst   || null,
    parent_last:   p.parentLast    || null,
    parent_email:  p.parentEmail   || null,
    parent_phone:  p.parentPhone   || null,
    zip:           p.zip           || null,
    purchased:     !!p.purchased,
    selection_submitted:    !!p.selectionSubmitted,
    selected_photos:        p.selectedPhotos        || [],
    photos_ready:           !!p.photosReady,
    delivered_photos:       p.deliveredPhotos       || [],
    photo_package_size:     p.photoPackageSize      || null,
    total_photo_count:      p.totalPhotoCount       || null,
    watermarked_dropbox_url: p.watermarkedDropboxUrl || null,
    selection_dropbox_url:  p.selectionDropboxUrl   || null,
    dropbox_url:   p.dropboxUrl    || null,
    profile_photo: p.profilePhoto  || null,
    bio:           p.bio           || null,
    position:      p.position      || null,
    club_team:     p.clubTeam      || null,
    height:        p.height        || null,
    weight:        p.weight        || null,
    achievements:  p.achievements  || [],
    stats:         p.sportStats    || p.stats || [],
    own_photos:    p.ownPhotos     || [],
    own_clips:     p.ownClips      || [],
    prefs:         p.prefs         || {},
    submitted_at:  p.submittedAt   || null,
    role:          p.role          || 'player',
  };
}

function _rowToCoach(r) {
  return {
    id:         r.id,
    email:      r.email          || '',
    firstName:  r.athlete_first  || '',
    lastName:   r.athlete_last   || '',
    title:      r.title          || '',
    sport:      r.sport          || '',
    school:     r.school         || '',
    university: r.school         || '',
    division:   r.division       || '',
    years:      r.years          || '',
    link:       r.link           || '',
    phone:      r.phone          || '',
    bio:        r.bio            || '',
    profilePhoto: r.profile_photo || null,
    bannerPhoto:  r.banner_photo  || null,
    verified:   !!r.verified,
    createdAt:  r.created_at     || new Date().toISOString(),
    role:       'coach',
  };
}

function _rowToPost(r) {
  return {
    id:           r.id,
    authorId:     r.author_id,
    authorName:   r.author_name   || '',
    authorJersey: r.author_jersey || '',
    sport:        r.sport         || '',
    type:         r.media_type    || 'photo',
    mediaData:    r.media_data    || '',
    caption:      r.caption       || '',
    tournament:   r.tournament    || null,
    likes:        r.likes_data    || [],
    createdAt:    r.created_at,
  };
}

function _postToRow(p) {
  return {
    id:           p.id,
    author_id:    p.authorId,
    author_name:  p.authorName   || null,
    author_jersey: p.authorJersey || null,
    sport:        p.sport         || null,
    media_type:   p.type          || 'photo',
    media_data:   p.mediaData     || null,
    caption:      p.caption       || null,
    tournament:   p.tournament    || null,
    likes:        typeof p.likes === 'number' ? p.likes : (p.likes?.length || 0),
    likes_data:   Array.isArray(p.likes) ? p.likes : [],
    created_at:   p.createdAt     || new Date().toISOString(),
  };
}

function _rowToTournament(r) {
  return {
    id:         r.id,
    name:       r.name,
    date:       r.date        || null,
    location:   r.location    || null,
    sport:      r.sport       || '',
    status:     r.status      || 'upcoming',
    dropboxUrl: r.dropbox_url || null,
    photos:     r.photos      || [],
    createdAt:  r.created_at,
  };
}

function _tournamentToRow(t) {
  return {
    id:          t.id,
    name:        t.name,
    date:        t.date        || null,
    location:    t.location    || null,
    sport:       t.sport       || null,
    status:      t.status      || 'upcoming',
    dropbox_url: t.dropboxUrl  || null,
    photos:      t.photos      || [],
    created_at:  t.createdAt   || new Date().toISOString(),
  };
}

function _rowToFollow(r) {
  return { followerId: r.follower_id, followeeId: r.followee_id, createdAt: r.created_at };
}

function _rowToNotif(r) {
  return {
    id:          r.id,
    type:        r.type,
    actorId:     r.actor_id,
    actorName:   r.actor_name || '',
    actorJersey: '',
    actorSport:  '',
    targetId:    r.target_id,
    timestamp:   r.created_at,
    read:        !!r.read,
  };
}

function _rowToThread(r) {
  return {
    id:          r.id,
    playerId:    r.player_id,
    coachId:     r.coach_id   || null,
    coachName:   r.coach_name   || '',
    coachTitle:  r.coach_title  || '',
    coachSchool: r.coach_school || '',
    messages:    r.thread       || [],
  };
}

// Merge server threads with the device's local threads so a just-sent message or a
// brand-new conversation that hasn't finished saving to the DB isn't wiped out by a
// sync. For threads in both, keep whichever has more messages (covers unsynced sends);
// local-only threads (not yet in the DB) are preserved.
function _mergeThreads(dbThreads, localMine) {
  const dbIds = new Set(dbThreads.map(t => t.id));
  const merged = dbThreads.map(dbT => {
    const localT = localMine.find(t => t.id === dbT.id);
    if (localT && (localT.messages?.length || 0) > (dbT.messages?.length || 0)) return localT;
    return dbT;
  });
  localMine.forEach(localT => { if (!dbIds.has(localT.id)) merged.push(localT); });
  return merged;
}

// ── Main sync: populate localStorage from Supabase ────────────────────────────
// opts keys: players, coaches, posts, tournaments, hypes, follows,
//            notifications, subscription, messages, coachMessages,
//            coachSaved
//
// PAGINATION: every list query below is bounded — nothing fetches an unlimited
// result set. Pass `true` (or omit) to get the default first page, or pass an
// object `{ limit, offset }` to page, e.g. _sbSync({ posts: { limit: 20, offset: 40 } }).
// Naturally-ordered lists (posts / notifications / reports / tournaments)
// page newest-first, so page 0 is the newest N. The reference tables the app
// joins against client-side (players / coaches / hypes / follows / membership)
// use a high safety cap instead of a small page, because capping them low would
// break profile lookups and hype counts; true per-id fetching is the larger
// refactor if those ever outgrow the cap.
const _SB_PAGE_LIMITS = {
  posts: 100, notifs: 100, reports: 200, tourneys: 200,
  msgs: 500, cmsgs: 500,
  players: 2000, coaches: 2000, hypes: 5000, follows: 5000,
  csaved: 2000, seen: 5000,
};
// Apply .range(offset, offset+limit-1) to a query. `opt` is the per-list option
// value: `true`/undefined → default page; `{ limit, offset }` → explicit page.
function _sbPaginate(query, opt, key) {
  const def    = _SB_PAGE_LIMITS[key] || 1000;
  const limit  = (opt && Number.isInteger(opt.limit)  && opt.limit  > 0) ? opt.limit  : def;
  const offset = (opt && Number.isInteger(opt.offset) && opt.offset > 0) ? opt.offset : 0;
  return query.range(offset, offset + limit - 1);
}

// Explicit column lists — exactly the columns each _rowTo* converter reads, so
// we never pull a whole row (`select('*')`) when only a subset is used. Keep
// each list in sync with its converter above.
// Contact PII (email, phone, parent_*, zip) is intentionally NOT selected here.
// Those columns are revoked at the DB (supabase-phase1c-pii-contact.sql) so they
// can't be bulk-harvested; the CURRENT user's own contact is re-attached after a
// sync via the my_contact() RPC, and another player's (only if they opted in) is
// fetched on demand via _sbPlayerContact(). Keep these lists free of those 7 cols.
const _SEL_PLAYER = 'id, athlete_first, athlete_last, sport, jersey, school, grad_year, purchased, selection_submitted, selected_photos, photos_ready, delivered_photos, photo_package_size, total_photo_count, watermarked_dropbox_url, selection_dropbox_url, dropbox_url, profile_photo, bio, position, club_team, height, weight, achievements, stats, own_photos, own_clips, prefs, submitted_at, created_at, role';
const _SEL_COACH  = 'id, athlete_first, athlete_last, title, sport, school, division, years, link, bio, profile_photo, banner_photo, verified, created_at';
const _SEL_POST   = 'id, author_id, author_name, author_jersey, sport, media_type, media_data, caption, tournament, likes_data, created_at';
const _SEL_TOURNEY = 'id, name, date, location, sport, status, dropbox_url, photos, created_at';
const _SEL_FOLLOW = 'follower_id, followee_id, created_at';
const _SEL_NOTIF  = 'id, type, actor_id, actor_name, target_id, created_at, read';
const _SEL_SUB    = 'status, plan, price, started_at, expires_at, paypal_subscription_id';
const _SEL_THREAD = 'id, player_id, coach_id, coach_name, coach_title, coach_school, thread';
const _SEL_REPORT = 'id, post_id, author_id, author_name, caption, media_data, media_type, reason, reporter_id, reporter_name, reporter_role, status, created_at';

async function _sbSync(opts = {}) {
  const session      = JSON.parse(localStorage.getItem('es_session')       || 'null');
  const coachSession = JSON.parse(localStorage.getItem('es_coach_session') || 'null');
  const uid  = session?.id || coachSession?.id || null;

  const fetches = [];
  const labels  = [];
  function q(label, promise) { labels.push(label); fetches.push(promise); }

  if (opts.players)                       q('players',  _sbPaginate(_SB.from('profiles').select(_SEL_PLAYER).eq('role', 'player'), opts.players, 'players'));
  if (opts.coaches)                       q('coaches',  _sbPaginate(_SB.from('profiles').select(_SEL_COACH).eq('role', 'coach'), opts.coaches, 'coaches'));
  if (opts.posts)                         q('posts',    _sbPaginate(_SB.from('posts').select(_SEL_POST).order('created_at', { ascending: false }), opts.posts, 'posts'));
  if (opts.tournaments)                   q('tourneys', _sbPaginate(_SB.from('tournaments').select(_SEL_TOURNEY).order('created_at', { ascending: false }), opts.tournaments, 'tourneys'));
  if (opts.hypes)                         q('hypes',    _sbPaginate(_SB.from('hypes').select('post_id, user_id'), opts.hypes, 'hypes'));
  if (opts.follows)                       q('follows',  _sbPaginate(_SB.from('follows').select(_SEL_FOLLOW), opts.follows, 'follows'));
  if (opts.notifications && uid)          q('notifs',   _sbPaginate(_SB.from('notifications').select(_SEL_NOTIF).eq('target_id', uid).order('created_at', { ascending: false }), opts.notifications, 'notifs'));
  if (opts.subscription  && uid)          q('sub',      _SB.from('subscriptions').select(_SEL_SUB).eq('user_id', uid).maybeSingle());
  if (opts.messages      && session?.id)  q('msgs',     _sbPaginate(_SB.from('messages').select(_SEL_THREAD).eq('player_id', session.id), opts.messages, 'msgs'));
  if (opts.coachMessages && coachSession?.id) q('cmsgs', _sbPaginate(_SB.from('messages').select(_SEL_THREAD).eq('coach_id', coachSession.id), opts.coachMessages, 'cmsgs'));
  if (opts.reports)                       q('reports',  _sbPaginate(_SB.from('reports').select(_SEL_REPORT).order('created_at', { ascending: false }), opts.reports, 'reports'));
  if (opts.coachSaved && coachSession?.id) q('csaved',  _sbPaginate(_SB.from('coach_saved').select('player_id').eq('coach_id', coachSession.id), opts.coachSaved, 'csaved'));
  if (opts.seenStories && uid)            q('seen',     _sbPaginate(_SB.from('seen_stories').select('post_id').eq('user_id', uid), opts.seenStories, 'seen'));
  // Always refresh "my own" row so admin-side edits (like coach verification)
  // show up on the next sync without a re-login. MUST select the coach column
  // set for a coach session — _SEL_PLAYER has no `verified`/`title`/`division`/
  // etc. columns, so using it here was silently overwriting a just-approved
  // coach's session back to verified:false on every single sync (role comes
  // from _SEL_PLAYER already; _SEL_COACH doesn't include it, so it's appended).
  if (uid) {
    const isCoachMe = !session && !!coachSession;
    q('me', _SB.from('profiles').select(isCoachMe ? _SEL_COACH + ', role' : _SEL_PLAYER).eq('id', uid).single());
  }

  // NOTE: Supabase query builders are thenable but have NO .catch method,
  // so we convert each to a real promise before catching.
  const results = await Promise.all(fetches.map(f => Promise.resolve(f).then(r => r, () => ({ data: null }))));

  results.forEach(({ data }, i) => {
    if (!data) return;
    switch (labels[i]) {
      case 'players':
        localStorage.setItem('es_players', JSON.stringify(data.map(_rowToPlayer)));
        break;
      case 'coaches':
        localStorage.setItem('es_coaches', JSON.stringify(data.map(_rowToCoach)));
        break;
      case 'posts':
        localStorage.setItem('es_posts', JSON.stringify(data.map(_rowToPost)));
        break;
      case 'tourneys': {
        const remote = data.map(_rowToTournament);
        const local  = JSON.parse(localStorage.getItem('es_tournaments') || '[]');
        const remoteIds = new Set(remote.map(t => t.id));
        // Keep locally-created tournaments that haven't synced to Supabase yet
        const pending = local.filter(t => !remoteIds.has(t.id));
        localStorage.setItem('es_tournaments', JSON.stringify([...pending, ...remote]));
        break;
      }
      case 'hypes': {
        const counts = {}, mine = [];
        data.forEach(h => {
          counts[h.post_id] = (counts[h.post_id] || 0) + 1;
          if (h.user_id === uid) mine.push(h.post_id);
        });
        localStorage.setItem('es_hypes', JSON.stringify(counts));
        if (uid) localStorage.setItem('es_player_hyped_' + uid, JSON.stringify(mine));
        break;
      }
      case 'follows': {
        // Merge remote follows with any local-only follows that haven't synced yet
        // (prevents a race where a just-clicked follow gets wiped by a stale Supabase response)
        const remote = data.map(_rowToFollow);
        const local  = JSON.parse(localStorage.getItem('es_follows') || '[]');
        const remoteKeys = new Set(remote.map(f => f.followerId + '|' + f.followeeId));
        // Keep local follows that haven't landed in Supabase yet
        const pending = local.filter(f => !remoteKeys.has(f.followerId + '|' + f.followeeId));
        localStorage.setItem('es_follows', JSON.stringify([...remote, ...pending]));
        break;
      }
      case 'notifs':
        localStorage.setItem('es_notifications', JSON.stringify(data.map(_rowToNotif)));
        break;
      case 'sub':
        if (uid) {
          const subObj = _rowToSub(data);
          localStorage.setItem('es_sub_' + uid, JSON.stringify(subObj));
          // Coaches read their subscription under a different key — mirror it so an
          // active plan restores on a new device / browser.
          if (coachSession?.id === uid) localStorage.setItem('es_coach_sub_' + uid, JSON.stringify(subObj));
          // Check if past billing date and should renew (fire-and-forget)
          if (typeof _checkSubscriptionRenewal === 'function') _checkSubscriptionRenewal(subObj, uid);
        }
        break;
      case 'msgs': {
        const dbThreads = data.map(_rowToThread);
        const all       = JSON.parse(localStorage.getItem('es_messages') || '[]');
        const other     = all.filter(t => t.playerId !== session.id);
        const localMine = all.filter(t => t.playerId === session.id);
        localStorage.setItem('es_messages', JSON.stringify([...other, ..._mergeThreads(dbThreads, localMine)]));
        break;
      }
      case 'cmsgs': {
        const dbThreads = data.map(_rowToThread);
        const coachId   = coachSession?.id;
        const all       = JSON.parse(localStorage.getItem('es_messages') || '[]');
        const other     = all.filter(t => t.coachId !== coachId);
        const localMine = all.filter(t => t.coachId === coachId);
        const merged    = _mergeThreads(dbThreads, localMine);
        localStorage.setItem('es_coach_messages', JSON.stringify(merged));
        localStorage.setItem('es_messages', JSON.stringify([...other, ...merged]));
        break;
      }
      case 'reports':
        localStorage.setItem('es_reports', JSON.stringify(data.map(_rowToReport)));
        break;
      case 'csaved':
        localStorage.setItem('es_coach_saved', JSON.stringify(data.map(r => r.player_id)));
        break;
      case 'seen': {
        // Restore which stories this user has already viewed so the "new" ring
        // state is consistent across devices. Merge (never drop local-only seens).
        const seen = JSON.parse(localStorage.getItem('es_seen_stories') || '{}');
        data.forEach(r => { seen[r.post_id] = true; });
        localStorage.setItem('es_seen_stories', JSON.stringify(seen));
        break;
      }
      case 'me': {
        const p = _rowToPlayer(data);
        if (session) {
          localStorage.setItem('es_session', JSON.stringify({ ...session, ...p }));
        } else if (coachSession && data.role === 'coach') {
          const c = _rowToCoach(data);
          localStorage.setItem('es_coach_session', JSON.stringify({ ...coachSession, ...c }));
        }
        break;
      }
    }
  });

  // Re-attach the CURRENT user's own contact PII (email/phone/parent/zip), which
  // is deliberately stripped from the bulk selects above. Uses the owner-only
  // my_contact() RPC so Settings / the user's own profile still show it. Other
  // users' contact is never bulk-loaded — it's fetched on demand + opt-in-gated
  // by _sbPlayerContact(). Fails soft (blank) if the RPC isn't deployed yet.
  if (uid) {
    try {
      const { data: cRows } = await _SB.rpc('my_contact');
      const c = Array.isArray(cRows) ? cRows[0] : cRows;
      if (c) {
        const patch = {
          email:       c.email        || '',
          phone:       c.phone        || '',
          parentFirst: c.parent_first || '',
          parentLast:  c.parent_last  || '',
          parentEmail: c.parent_email || '',
          parentPhone: c.parent_phone || '',
          zip:         c.zip          || '',
        };
        const s = JSON.parse(localStorage.getItem('es_session') || 'null');
        if (s && s.id === uid) localStorage.setItem('es_session', JSON.stringify({ ...s, ...patch }));
        const cs = JSON.parse(localStorage.getItem('es_coach_session') || 'null');
        if (cs && cs.id === uid) localStorage.setItem('es_coach_session', JSON.stringify({ ...cs, ...patch }));
        const players = JSON.parse(localStorage.getItem('es_players') || '[]');
        let touched = false;
        players.forEach(pl => { if (pl.id === uid) { Object.assign(pl, patch); touched = true; } });
        if (touched) localStorage.setItem('es_players', JSON.stringify(players));
      }
    } catch (e) { /* contact stays blank until the my_contact RPC is deployed */ }
  }

  // Fresh player/coach data may include an updated photo — repaint the sidebar.
  if (typeof paintSidebarAvatar === 'function') paintSidebarAvatar();
  // A synced notification may be a post-takedown notice → show the one-time pop-up.
  if (typeof showPostRemovedPopup === 'function') showPostRemovedPopup();
}

// Fetch one player's contact (email/phone/parent/zip) on demand. The DB only
// returns it if that player opted in (prefs.priv-contact = 'true') or it's you;
// otherwise every field comes back empty. Returns a legacy-shaped object so the
// caller can merge it straight onto a player object. Used by the profile info tab.
async function _sbPlayerContact(playerId) {
  const blank = { email: '', phone: '', parentFirst: '', parentLast: '', parentEmail: '', parentPhone: '', zip: '' };
  if (!playerId) return blank;
  try {
    const { data } = await _SB.rpc('player_contact', { p_id: playerId });
    const c = Array.isArray(data) ? data[0] : data;
    if (!c) return blank;
    return {
      email:       c.email        || '',
      phone:       c.phone        || '',
      parentFirst: c.parent_first || '',
      parentLast:  c.parent_last  || '',
      parentEmail: c.parent_email || '',
      parentPhone: c.parent_phone || '',
      zip:         c.zip          || '',
    };
  } catch (e) { return blank; }
}

// ── Supabase Storage image upload ─────────────────────────────────────────────
// Uploads a File/Blob to a public bucket (avatars | banners | posts) and returns
// the public CDN URL. Unique per-upload path avoids stale CDN cache. Throws on error.
async function _sbUploadImage(bucket, keyPrefix, fileOrBlob) {
  const ext = (fileOrBlob.type && fileOrBlob.type.split('/')[1]) || 'jpg';
  const path = `${keyPrefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await _SB.storage.from(bucket).upload(path, fileOrBlob, {
    contentType: fileOrBlob.type || 'image/jpeg',
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw new Error(error.message || 'storage upload failed');
  const { data } = _SB.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

// ── Fire-and-forget Supabase write helpers ────────────────────────────────────

function _sbSavePlayer(p) {
  // Use UPDATE (not upsert). The row always exists once the player has signed up
  // (signup does a direct .insert()), and an UPSERT / ON CONFLICT on `profiles`
  // requires TABLE-level SELECT — which supabase-phase1c revoked when it switched
  // to column-level SELECT grants to hide contact PII (email/phone/parent/zip).
  // That mismatch rejected every profile save with 403 "permission denied for
  // table profiles" (the change saved locally, then reverted on refresh). A plain
  // UPDATE works fine with the column-level grant.
  // Returns { error } so callers can tell whether the write actually persisted.
  const row = _playerToRow(p);
  return _SB.from('profiles').update(row).eq('id', row.id).then(
    ({ error }) => { if (error) console.error('[sb save player]', error.message || error); return { error }; },
    (error)     => { console.error('[sb save player]', error?.message || error); return { error }; }
  );
}

// Batch version — one upsert request for many players instead of one per player
// (e.g. bulk photo delivery updating several profiles at once).
function _sbSavePlayers(players) {
  if (!Array.isArray(players) || !players.length) return;
  // Per-row UPDATE (not a batch upsert) — see _sbSavePlayer for why upsert 403s.
  players.forEach(p => {
    const row = _playerToRow(p);
    _SB.from('profiles').update(row).eq('id', row.id).then(undefined, () => {});
  });
}

// Returns a promise so callers can await the delete before redirecting away —
// otherwise the page navigation cancels the in-flight request. Related rows
// (posts, hypes, follows, notifications, subscriptions) cascade via FK.
async function _sbDeletePlayer(id) {
  try {
    const { error } = await _SB.from('profiles').delete().eq('id', id);
    if (error) console.error('[sb delete player]', error);
    return { error };
  } catch (error) {
    console.error('[sb delete player]', error);
    return { error };
  }
}

function _sbSaveTournament(t) {
  _SB.from('tournaments').upsert(_tournamentToRow(t)).then(undefined, () => {});
}

function _sbDeleteTournament(id) {
  _SB.from('tournaments').delete().eq('id', id).then(undefined, () => {});
}

function _sbSavePost(p) {
  _SB.from('posts').upsert(_postToRow(p)).then(undefined, () => {});
}

function _sbDeletePost(id) {
  _SB.from('posts').delete().eq('id', id).then(undefined, () => {});
}

function _sbToggleHype(postId, userId, nowHyped) {
  if (nowHyped) _SB.from('hypes').upsert({ post_id: postId, user_id: userId }).then(undefined, () => {});
  else _SB.from('hypes').delete().match({ post_id: postId, user_id: userId }).then(undefined, () => {});
}

function _sbToggleFollow(followerId, followeeId, nowFollowing) {
  if (nowFollowing) _SB.from('follows').upsert({ follower_id: followerId, followee_id: followeeId }).then(undefined, () => {});
  else _SB.from('follows').delete().match({ follower_id: followerId, followee_id: followeeId }).then(undefined, () => {});
}

function _sbAddNotification(n) {
  _SB.from('notifications').insert({
    id:         n.id        || (Date.now().toString()),
    target_id:  n.targetId,
    actor_id:   n.actorId   || null,
    actor_name: n.actorName || null,
    type:       n.type,
    post_id:    n.postId    || null,
    read:       false,
    created_at: n.timestamp || new Date().toISOString(),
  }).then(undefined, () => {});
}

// Create a "started following you" notification for the followee. Deterministic id
// dedupes re-follows. Also writes locally if the followee is on this device.
function _notifyNewFollow(followerId, followerName, followeeId) {
  if (!followerId || !followeeId || followerId === followeeId) return;
  const notif = {
    id:        'fl_' + followerId + '_' + followeeId,
    targetId:  followeeId,
    actorId:   followerId,
    actorName: followerName || 'Someone',
    type:      'follow',
    timestamp: new Date().toISOString(),
  };
  if (typeof _sbAddNotification === 'function') _sbAddNotification(notif);
  const session = JSON.parse(localStorage.getItem('es_session') || 'null');
  if (session && session.id === followeeId) {
    const local = JSON.parse(localStorage.getItem('es_notifications') || '[]');
    if (!local.some(x => x.id === notif.id)) {
      local.unshift({ ...notif, read: false });
      localStorage.setItem('es_notifications', JSON.stringify(local));
    }
  }
}

// When a post crosses a hype milestone (100 / 500 / 1000), notify the author.
// The milestone number rides in actor_name (no schema change needed).
function _notifyHypeMilestone(postId, newCount) {
  const MILESTONES = [100, 500, 1000];
  if (!MILESTONES.includes(newCount)) return;
  const posts = JSON.parse(localStorage.getItem('es_posts') || '[]');
  const post = posts.find(p => p.id === postId);
  if (!post || !post.authorId) return;
  const notif = {
    id:        'hm_' + postId + '_' + newCount,
    targetId:  post.authorId,
    actorName: String(newCount),
    type:      'hype_milestone',
    postId:    postId,
    timestamp: new Date().toISOString(),
  };
  if (typeof _sbAddNotification === 'function') _sbAddNotification(notif);
  const session = JSON.parse(localStorage.getItem('es_session') || 'null');
  if (session && session.id === post.authorId) {
    const local = JSON.parse(localStorage.getItem('es_notifications') || '[]');
    if (!local.some(x => x.id === notif.id)) {
      local.unshift({ ...notif, read: false });
      localStorage.setItem('es_notifications', JSON.stringify(local));
    }
  }
}

function _sbMarkNotifsRead(userId) {
  _SB.from('notifications').update({ read: true }).eq('target_id', userId).then(undefined, () => {});
}
function _sbMarkNotifRead(id) {
  _SB.from('notifications').update({ read: true }).eq('id', id).then(undefined, () => {});
}

// ── "Your post was removed" pop-up ────────────────────────────────────────────
// When an admin takes down a reported post, a `post_removed` notification is
// created for the author. The next time that player loads the app, show them a
// one-time pop-up. Deduped via es_takedown_seen so it appears once per device.
function showPostRemovedPopup() {
  const session = JSON.parse(localStorage.getItem('es_session') || 'null');
  if (!session || !session.id) return;                       // players only
  if (document.getElementById('es-takedown-overlay')) return; // already showing
  const seen = JSON.parse(localStorage.getItem('es_takedown_seen') || '[]');
  const notifs = JSON.parse(localStorage.getItem('es_notifications') || '[]');
  const pending = notifs.filter(n => n.type === 'post_removed' && n.targetId === session.id && !seen.includes(n.id));
  if (!pending.length) return;

  const n = pending.length;
  const overlay = document.createElement('div');
  overlay.id = 'es-takedown-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:10001;background:rgba(0,0,0,0.7);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px;';
  overlay.innerHTML = `
    <div style="background:#1a1a1a;border:1px solid rgba(255,255,255,0.1);border-radius:18px;max-width:420px;width:100%;padding:32px 28px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.6);">
      <div style="width:60px;height:60px;border-radius:16px;background:rgba(255,77,109,0.1);border:1px solid rgba(255,77,109,0.25);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ff4d6d" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      </div>
      <p style="font-family:Impact,'Arial Narrow',Arial,sans-serif;font-size:22px;letter-spacing:0.03em;text-transform:uppercase;color:#fff;margin-bottom:10px;">${n > 1 ? `${n} Posts Removed` : 'Post Removed'}</p>
      <p style="font-size:13.5px;color:rgba(255,255,255,0.55);line-height:1.6;margin-bottom:24px;">${n > 1 ? 'Some of your posts were' : 'One of your posts was'} reported and removed by our team for violating EyeScout's community guidelines. Please keep your content respectful and appropriate so everyone can enjoy the platform.</p>
      <button id="es-takedown-ok" style="width:100%;padding:13px;border-radius:10px;background:linear-gradient(90deg,#7B2FBE 0%,#1E90FF 38%,#00C9A7 70%,#39D353 100%);border:none;color:#fff;font-size:14px;font-weight:700;cursor:pointer;transition:opacity 0.15s;">Got it</button>
    </div>`;
  document.body.appendChild(overlay);

  const dismiss = () => {
    const seenNow = JSON.parse(localStorage.getItem('es_takedown_seen') || '[]');
    pending.forEach(p => { if (!seenNow.includes(p.id)) seenNow.push(p.id); if (typeof _sbMarkNotifRead === 'function') _sbMarkNotifRead(p.id); });
    localStorage.setItem('es_takedown_seen', JSON.stringify(seenNow));
    // also mark read in the local cache so it doesn't nag in Activity
    const cache = JSON.parse(localStorage.getItem('es_notifications') || '[]');
    cache.forEach(c => { if (pending.some(p => p.id === c.id)) c.read = true; });
    localStorage.setItem('es_notifications', JSON.stringify(cache));
    overlay.remove();
  };
  overlay.querySelector('#es-takedown-ok').addEventListener('click', dismiss);
}

function _sbSaveSubscription(userId, status, paypalSubscriptionId, expiresAt) {
  const row = { user_id: userId, status };
  // Keep the original start date on a cancel; only stamp it fresh on activate.
  if (status === 'active') row.started_at = new Date().toISOString();
  // Only write the PayPal id when we actually have one, so a status-only
  // update (e.g. cancel) never wipes a previously stored id.
  if (paypalSubscriptionId) row.paypal_subscription_id = paypalSubscriptionId;
  // On cancel we keep access until the end of the paid period (expires_at).
  if (expiresAt) row.expires_at = expiresAt;
  _SB.from('subscriptions').upsert(row).then(undefined, () => {});
}

// Does this subscription currently grant Pro access?
// An active plan always does. A cancelled plan still does until the end of the
// period the user already paid for (accessUntil / nextBillingDate).
function _subHasAccess(sub) {
  if (!sub) return false;
  if (sub.status === 'active') return true;
  if (sub.status === 'cancelled') {
    const until = sub.accessUntil || sub.nextBillingDate;
    return !!(until && Date.now() < new Date(until).getTime());
  }
  return false;
}

// Set of player ids that currently have Pro access — used to gate coach
// discovery (search + follow) to Pro players only. Backed by the
// active_pro_player_ids() RPC (supabase-phase4-pro-discovery.sql), which is the
// only path allowed to reveal other users' Pro status (RLS otherwise limits
// subscription reads to your own row). Returns null on error OR when the RPC
// isn't deployed yet, and callers MUST treat null as "unknown → don't filter"
// (fail open) so the coach experience never breaks before the migration is run.
async function _sbActiveProIds() {
  try {
    const { data, error } = await _SB.rpc('active_pro_player_ids');
    if (error || !Array.isArray(data)) return null;
    // SETOF uuid comes back as an array of strings (or 1-key objects, defensively).
    const ids = data.map(row => typeof row === 'string' ? row : (row && (row.active_pro_player_ids ?? Object.values(row)[0])));
    return new Set(ids.filter(Boolean));
  } catch (e) {
    return null;
  }
}

// The 2-post feed teaser for non-Pro players. With the server-side paywall
// (supabase-phase5-server-paywall.sql) the full posts table is Pro-gated at the
// row level, so a non-Pro player's normal posts sync returns nothing to preview.
// This RPC hands back AT MOST 2 recent public-player posts (cap enforced in the
// DB function, so it can't be gamed). Returns an array on success, or null when
// the function isn't deployed yet — callers MUST treat null as "fall back to the
// old behavior" so deploying the client before the SQL never breaks the feed.
async function _sbFeedPreview() {
  try {
    const { data, error } = await _SB.rpc('feed_preview');
    if (error || !Array.isArray(data)) return null;
    return data.map(_rowToPost);
  } catch (e) {
    return null;
  }
}

// This week's frozen "Most Hyped" winners (global + one per sport). Backed by
// get_weekly_hype_winners() (supabase-phase7-weekly-hype-winner.sql), which
// locks in the top hyped-this-week post every Monday and holds it until the
// next reset — replacing the old live recompute-on-every-render behavior.
// Returns [{category, post_id, week_start, hype_count, updated_at}, ...] on
// success, or null when the RPC isn't deployed yet (callers fall back to no
// rings rendering, same as having no data, rather than erroring).
async function _sbWeeklyHypeWinners() {
  try {
    const { data, error } = await _SB.rpc('get_weekly_hype_winners');
    if (error || !Array.isArray(data)) return null;
    return data.map(r => ({
      category:  r.category,
      postId:    r.post_id,
      weekStart: r.week_start,
      hypeCount: r.hype_count || 0,
    }));
  } catch (e) {
    return null;
  }
}

// Ask the local server to cancel the real PayPal subscription. The secret lives
// only on the server, so this POSTs the PayPal subscription id there.
// Returns { ok, notConfigured?, error? }. `notConfigured` means the PayPal keys
// aren't set yet — the caller should fall back to an in-app cancel for now.
async function _cancelPayPalSubscription(subscriptionId) {
  if (!subscriptionId) return { ok: false, notConfigured: true };
  try {
    const resp = await fetch('/api/paypal-cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscriptionId, reason: 'Canceled from EyeScout account settings' }),
    });
    return await resp.json();
  } catch (e) {
    // Server unreachable (e.g. opened as a static file) → let the caller decide.
    return { ok: false, notConfigured: true, error: e.message };
  }
}

// Send a player's purchased selection to the editors: the server copies their
// selected shots into a new Dropbox "to-edit" folder and pushes a Monday CRM
// card with the folder link. Fires only when the player has BOTH purchased and
// submitted a selection; the saved selectionDropboxUrl doubles as the
// "already sent" flag so re-calls are harmless.
// Returns { ok, folderUrl, ... } on success, null when not eligible.
async function _esSendToEditors(playerId) {
  const all = JSON.parse(localStorage.getItem('es_players') || '[]');
  const idx = all.findIndex(p => p.id === playerId);
  const session = JSON.parse(localStorage.getItem('es_session') || 'null');
  const p = idx > -1 ? all[idx] : (session && session.id === playerId ? session : null);
  if (!p || !p.purchased || !p.selectionSubmitted || !(p.selectedPhotos || []).length) return null;
  if (p.selectionDropboxUrl) return { ok: true, folderUrl: p.selectionDropboxUrl, alreadySent: true };

  const resp = await fetch('/api/purchase-confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      player: {
        first:  p.athleteFirst || '',
        last:   p.athleteLast  || '',
        sport:  p.sport        || '',
        jersey: p.jersey       || '',
        email:  p.email        || '',
      },
      photoUrls: p.selectedPhotos,
    }),
  });
  const data = await resp.json();
  if (!data.ok) throw new Error(data.error || 'Could not send photos to the editors');

  // Persist the folder link everywhere so we never double-push
  p.selectionDropboxUrl = data.folderUrl;
  if (idx > -1) {
    all[idx] = p;
    localStorage.setItem('es_players', JSON.stringify(all));
  }
  if (session && session.id === playerId) {
    session.selectionDropboxUrl = data.folderUrl;
    localStorage.setItem('es_session', JSON.stringify(session));
  }
  if (typeof _sbSavePlayer === 'function') _sbSavePlayer(p);
  return data;
}

// Check if an active subscription is past its billing date and should be renewed.
// If so, ask the server to check PayPal and extend the renewal date. Fire-and-forget.
async function _checkSubscriptionRenewal(sub, userId) {
  if (!sub || sub.status !== 'active' || !sub.paypalSubscriptionId) return;
  const nextBilling = new Date(sub.nextBillingDate || sub.accessUntil || Date.now());
  if (Date.now() < nextBilling.getTime()) return; // Not yet time to renew
  // Past billing date — check PayPal to see if it auto-renewed
  try {
    await fetch('/api/subscription-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paypalSubscriptionId: sub.paypalSubscriptionId, userId }),
    });
  } catch (e) {
    // Silently fail — the check is nice-to-have, not critical. Access logic still works.
  }
}

// Map a Supabase subscriptions row into the shape the settings pages render.
// The DB stores only status/plan/started_at/expires_at, so we fill in the
// price ($15/mo) and a next-billing date (started_at + 1 month) the UI expects.
function _rowToSub(r) {
  if (!r) return null;
  const start = r.started_at ? new Date(r.started_at) : new Date();
  const next  = r.expires_at ? new Date(r.expires_at)
                             : new Date(start.getFullYear(), start.getMonth() + 1, start.getDate());
  return {
    status:              r.status || 'active',
    plan:                r.plan   || 'pro',
    price:               r.price  || 15,
    startDate:           start.toISOString(),
    nextBillingDate:     next.toISOString(),
    // When cancelled, expires_at is the date access ends (period already paid).
    accessUntil:         next.toISOString(),
    paypalSubscriptionId: r.paypal_subscription_id || null,
  };
}

function _threadToRow(thread) {
  return {
    id:           thread.id,
    player_id:    thread.playerId,
    coach_id:     thread.coachId   || null,
    coach_name:   thread.coachName   || null,
    coach_title:  thread.coachTitle  || null,
    coach_school: thread.coachSchool || null,
    thread:       thread.messages   || [],
    updated_at:   new Date().toISOString(),
  };
}

function _sbSaveThread(thread) {
  _SB.from('messages').upsert(_threadToRow(thread)).then(undefined, () => {});
}

// Batch version — one upsert request for many threads instead of one per thread
// (e.g. "mark all read" touching several conversations at once).
function _sbSaveThreads(threads) {
  if (!Array.isArray(threads) || !threads.length) return;
  _SB.from('messages').upsert(threads.map(_threadToRow)).then(undefined, () => {});
}

async function _sbDeleteThreadsByCoach(coachId) {
  try {
    const { error } = await _SB.from('messages').delete().eq('coach_id', coachId);
    if (error) console.error('[sb delete coach threads]', error);
    return { error };
  } catch (error) {
    console.error('[sb delete coach threads]', error);
    return { error };
  }
}

function _sbDeleteThread(threadId) {
  _SB.from('messages').delete().eq('id', threadId).then(undefined, () => {});
}

function _sbUpdateCoachVerified(id, verified) {
  _SB.from('profiles').update({ verified }).eq('id', id).then(undefined, () => {});
}

async function _sbDeleteCoach(id) {
  try {
    const { error } = await _SB.from('profiles').delete().eq('id', id);
    if (error) console.error('[sb delete coach]', error);
    return { error };
  } catch (error) {
    console.error('[sb delete coach]', error);
    return { error };
  }
}

function _sbToggleCoachSaved(coachId, playerId, nowSaved) {
  if (nowSaved) _SB.from('coach_saved').upsert({ coach_id: coachId, player_id: playerId }).then(undefined, () => {});
  else _SB.from('coach_saved').delete().match({ coach_id: coachId, player_id: playerId }).then(undefined, () => {});
}

function _sbMarkStorySeenBatch(userId, postIds) {
  if (!postIds.length) return;
  const rows = postIds.map(post_id => ({ user_id: userId, post_id }));
  _SB.from('seen_stories').upsert(rows).then(undefined, () => {});
}

function _sbSaveCoach(c) {
  // UPDATE (not upsert) — coach rows are created at signup; upsert on `profiles`
  // 403s under the phase1c column-level SELECT grant (see _sbSavePlayer).
  _SB.from('profiles').update({
    email:         c.email         || null,
    athlete_first: c.firstName     || null,
    athlete_last:  c.lastName      || null,
    title:         c.title         || null,
    sport:         c.sport         || null,
    school:        c.school || c.university || null,
    division:      c.division      || null,
    years:         c.years         || null,
    link:          c.link          || null,
    phone:         c.phone         || null,
    verified:      !!c.verified,
    profile_photo: c.profilePhoto  || null,
    banner_photo:  c.bannerPhoto   || null,
    bio:           c.bio           || null,
    role:          'coach',
  }).eq('id', c.id).then(undefined, () => {});
}

// ── Reported posts ────────────────────────────────────────────────────────────
function _rowToReport(r) {
  return {
    id:            r.id,
    postId:        r.post_id        || '',
    authorId:      r.author_id      || '',
    authorName:    r.author_name    || '',
    caption:       r.caption        || '',
    mediaData:     r.media_data     || '',
    type:          r.media_type     || 'photo',
    reason:        r.reason         || '',
    reporterId:    r.reporter_id    || '',
    reporterName:  r.reporter_name  || '',
    reporterRole:  r.reporter_role  || 'player',
    status:        r.status         || 'pending',
    createdAt:     r.created_at,
  };
}
function _reportToRow(r) {
  return {
    id:            r.id,
    post_id:       r.postId        || null,
    author_id:     r.authorId      || null,
    author_name:   r.authorName    || null,
    caption:       r.caption       || null,
    media_data:    r.mediaData     || null,
    media_type:    r.type          || 'photo',
    reason:        r.reason        || null,
    reporter_id:   r.reporterId    || null,
    reporter_name: r.reporterName  || null,
    reporter_role: r.reporterRole  || 'player',
    status:        r.status        || 'pending',
    created_at:    r.createdAt     || new Date().toISOString(),
  };
}
function _sbSaveReport(r)   { _SB.from('reports').upsert(_reportToRow(r)).then(undefined, () => {}); }
function _sbDeleteReport(id){ _SB.from('reports').delete().eq('id', id).then(undefined, () => {}); }

// ── Shared "Report post" flow (Instagram-style sheet) ─────────────────────────
// Used by both the player feed and the coach feed. Records a report into
// es_reports (+ Supabase) for the admin to review.
const _REPORT_REASONS = [
  "It's spam",
  'Nudity or sexual content',
  'Harassment or bullying',
  'Violence or dangerous content',
  'Hate speech or symbols',
  'False information',
  'Scam or fraud',
  'Something else',
];

function openReportModal(postId) {
  const posts = JSON.parse(localStorage.getItem('es_posts') || '[]');
  const post  = posts.find(p => p.id === postId) || { id: postId };
  const session      = JSON.parse(localStorage.getItem('es_session')       || 'null');
  const coachSession = JSON.parse(localStorage.getItem('es_coach_session') || 'null');
  const reporter = session
    ? { id: session.id, name: `${session.athleteFirst || ''} ${session.athleteLast || ''}`.trim() || 'Player', role: 'player' }
    : coachSession
      ? { id: coachSession.id, name: `${coachSession.firstName || ''} ${coachSession.lastName || ''}`.trim() || 'Coach', role: 'coach' }
      : { id: '', name: 'Guest', role: 'guest' };

  const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const overlay = document.createElement('div');
  overlay.className = 'es-report-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:20px;';
  overlay.innerHTML = `
    <div class="es-report-sheet" style="background:#1a1a1a;border:1px solid rgba(255,255,255,0.1);border-radius:18px;max-width:420px;width:100%;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.6);">
      <div id="es-report-step1">
        <div style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.07);display:flex;align-items:center;justify-content:space-between;">
          <span style="font-size:15px;font-weight:700;color:#fff;">Post options</span>
          <button data-report-close style="background:none;border:none;color:rgba(255,255,255,0.4);cursor:pointer;font-size:22px;line-height:1;">×</button>
        </div>
        <button data-report-start style="width:100%;text-align:left;padding:16px 20px;background:none;border:none;cursor:pointer;color:#ff4d6d;font-size:15px;font-weight:700;transition:background 0.15s;">Report post</button>
        <button data-report-close style="width:100%;text-align:left;padding:16px 20px;background:none;border:none;border-top:1px solid rgba(255,255,255,0.06);cursor:pointer;color:rgba(255,255,255,0.65);font-size:15px;">Cancel</button>
      </div>
      <div id="es-report-step2" style="display:none;">
        <div style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.07);display:flex;align-items:center;gap:12px;">
          <button data-report-back style="background:none;border:none;color:rgba(255,255,255,0.5);cursor:pointer;font-size:18px;line-height:1;">‹</button>
          <span style="font-size:15px;font-weight:700;color:#fff;">Report</span>
          <button data-report-close style="margin-left:auto;background:none;border:none;color:rgba(255,255,255,0.4);cursor:pointer;font-size:22px;line-height:1;">×</button>
        </div>
        <p style="padding:14px 20px 6px;font-size:12px;color:rgba(255,255,255,0.4);">Why are you reporting this post?</p>
        <div style="max-height:44vh;overflow-y:auto;">
          ${_REPORT_REASONS.map(reason => `<button data-report-reason="${esc(reason)}" style="width:100%;text-align:left;padding:14px 20px;background:none;border:none;border-top:1px solid rgba(255,255,255,0.05);cursor:pointer;color:rgba(255,255,255,0.85);font-size:14px;transition:background 0.15s;">${esc(reason)}</button>`).join('')}
        </div>
      </div>
      <div id="es-report-done" style="display:none;padding:36px 24px;text-align:center;">
        <div style="width:56px;height:56px;border-radius:50%;background:rgba(57,211,83,0.12);border:1px solid rgba(57,211,83,0.3);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#39D353" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <p style="font-size:16px;font-weight:700;color:#fff;margin-bottom:6px;">Thanks for letting us know</p>
        <p style="font-size:13px;color:rgba(255,255,255,0.45);line-height:1.5;">Our team will review this post. We use reports like yours to keep the community safe.</p>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  overlay.querySelectorAll('[data-report-close]').forEach(b => b.addEventListener('click', close));
  overlay.querySelector('[data-report-start]').addEventListener('click', () => {
    overlay.querySelector('#es-report-step1').style.display = 'none';
    overlay.querySelector('#es-report-step2').style.display = 'block';
  });
  overlay.querySelector('[data-report-back]').addEventListener('click', () => {
    overlay.querySelector('#es-report-step2').style.display = 'none';
    overlay.querySelector('#es-report-step1').style.display = 'block';
  });
  overlay.querySelectorAll('[data-report-reason]').forEach(btn => {
    btn.addEventListener('mouseover', () => btn.style.background = 'rgba(255,255,255,0.05)');
    btn.addEventListener('mouseout',  () => btn.style.background = 'none');
    btn.addEventListener('click', () => {
      const report = {
        id:           Date.now().toString() + Math.random().toString(36).slice(2, 6),
        postId:       post.id,
        authorId:     post.authorId   || '',
        authorName:   post.authorName || '',
        caption:      post.caption    || '',
        mediaData:    post.mediaData  || '',
        type:         post.type       || 'photo',
        reason:       btn.getAttribute('data-report-reason'),
        reporterId:   reporter.id,
        reporterName: reporter.name,
        reporterRole: reporter.role,
        status:       'pending',
        createdAt:    new Date().toISOString(),
      };
      const all = JSON.parse(localStorage.getItem('es_reports') || '[]');
      all.unshift(report);
      localStorage.setItem('es_reports', JSON.stringify(all));
      if (typeof _sbSaveReport === 'function') _sbSaveReport(report);
      overlay.querySelector('#es-report-step2').style.display = 'none';
      overlay.querySelector('#es-report-done').style.display = 'block';
      setTimeout(close, 1600);
    });
  });
}

// ── Shared sidebar profile-avatar painter ─────────────────────────────────────
// Keeps the bottom-left sidebar avatar consistent across every portal page.
// Paints the logged-in player/coach's profile photo (falling back to a coach
// person-icon). Player session takes priority over coach session, matching the
// pages' own isCoach logic. Safe to call repeatedly (idempotent).
function paintSidebarAvatar() {
  // Different pages use different avatar containers. Player pages nest an
  // "-inner" element inside a gradient ring; coach pages put the icon directly
  // inside a .coach-avatar / #sb-avatar circle. Match whichever exists.
  const inner = document.querySelector(
    '.sidebar-avatar-inner, #sb-avatar-inner, .sb-avatar-inner, #sb-avatar, .coach-avatar, .coach-avatar-sm'
  );
  if (!inner) return;
  const session      = JSON.parse(localStorage.getItem('es_session')       || 'null');
  const coachSession = JSON.parse(localStorage.getItem('es_coach_session') || 'null');
  let photo = null, isCoach = false;
  if (session) {
    const players = JSON.parse(localStorage.getItem('es_players') || '[]');
    const me = players.find(p => p.id === session.id);
    photo = (me && me.profilePhoto) || session.profilePhoto || null;
  } else if (coachSession) {
    isCoach = true;
    const coaches = JSON.parse(localStorage.getItem('es_coaches') || '[]');
    const me = coaches.find(c => c.id === coachSession.id);
    photo = (me && me.profilePhoto) || coachSession.profilePhoto || null;
  } else {
    return; // no one logged in — leave the placeholder as-is
  }
  if (photo) {
    inner.style.background = 'transparent';
    inner.style.overflow = 'hidden';
    inner.innerHTML = `<img src="${photo}" alt="Profile" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;">`;
  } else if (isCoach) {
    // Coach with no photo → blue person icon on a blue-tinted circle.
    const wrap = inner.closest('.sidebar-avatar, .sb-avatar') || inner;
    wrap.style.background = 'rgba(30,144,255,0.15)';
    if (wrap !== inner) inner.style.background = 'transparent';
    inner.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(30,144,255,0.7)" stroke-width="1.8" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
  }
}

// Auto-paint on load and re-paint whenever a sync refreshes cached data.
// Also show any pending "post removed" pop-up from cached notifications.
if (typeof document !== 'undefined') {
  const _onReady = () => { paintSidebarAvatar(); showPostRemovedPopup(); };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _onReady);
  } else {
    _onReady();
  }
}

// ── Site-wide accessibility (WCAG 2.1 AA) ───────────────────────────────────
// Loads on every portal page (sb-data.js is global). Provides:
//  • a visible keyboard focus ring for ALL interactive elements (2.4.7),
//  • a `.sr-only` utility for screen-reader-only labels (1.1.1 / 4.1.2),
//  • reduced-motion honoring for users who ask the OS to limit animation (2.3.3).
if (typeof document !== 'undefined') {
  (function () {
    if (document.getElementById('es-a11y-css')) return;
    var css = [
      /* Only show the ring for keyboard/AT users, never on mouse click. */
      'a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,',
      'textarea:focus-visible,[tabindex]:focus-visible,[role="button"]:focus-visible,',
      '[contenteditable="true"]:focus-visible{',
      'outline:3px solid #4ea1ff!important;outline-offset:2px!important;',
      'box-shadow:0 0 0 4px rgba(78,161,255,0.35)!important;border-radius:6px;}',
      /* Screen-reader-only text: present in the a11y tree, invisible on screen. */
      '.sr-only{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;',
      'overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;}',
      /* Skip-link becomes visible when focused. */
      '.skip-link{position:absolute;left:8px;top:-48px;z-index:100000;background:#111;',
      'color:#fff;padding:10px 16px;border-radius:8px;font-weight:700;text-decoration:none;',
      'transition:top .15s ease;}',
      '.skip-link:focus{top:8px;}',
      /* Honor the OS "reduce motion" setting. */
      '@media (prefers-reduced-motion: reduce){*,*::before,*::after{',
      'animation-duration:.001ms!important;animation-iteration-count:1!important;',
      'transition-duration:.001ms!important;scroll-behavior:auto!important;}}'
    ].join('');
    var st = document.createElement('style');
    st.id = 'es-a11y-css';
    st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  })();
}

// ── Site-wide skeleton loaders ───────────────────────────────────────────────
// Shimmering placeholder blocks shown while a page's first data fetch is in
// flight (before cached localStorage/Supabase data has painted). Loads on
// every portal page (sb-data.js is global).
if (typeof document !== 'undefined') {
  (function () {
    if (document.getElementById('es-skel-css')) return;
    var css = [
      '.skel{position:relative;overflow:hidden;background:rgba(255,255,255,0.06);',
      'border-radius:8px;}',
      '.skel::after{content:"";position:absolute;inset:0;transform:translateX(-100%);',
      'background:linear-gradient(90deg,transparent,rgba(255,255,255,0.09),transparent);',
      'animation:skel-shimmer 1.6s ease-in-out infinite;}',
      '@keyframes skel-shimmer{100%{transform:translateX(100%);}}',
      '.skel-circle{border-radius:50%;}',
      '.skel-card{background:var(--surface,#161616);border:1px solid var(--border,rgba(255,255,255,0.07));',
      'border-radius:14px;}',
      '@media (prefers-reduced-motion: reduce){.skel::after{animation:none;}}'
    ].join('');
    var st = document.createElement('style');
    st.id = 'es-skel-css';
    st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  })();
}

// ── Site-wide media protection ──────────────────────────────────────────────
// Stop casual downloading of photos/videos ANYWHERE on the site — right-click
// "Save image/video as…", drag-to-save, iOS long-press, and the video player's
// built-in download button. This loads on every page (sb-data.js is global).
// Explicit in-app download buttons for a player's OWN purchased photos are NOT
// affected — those are <a download> links, not media right-clicks.
if (typeof document !== 'undefined') {
  (function () {
    function injectCss() {
      if (document.getElementById('es-media-guard-css')) return;
      var st = document.createElement('style');
      st.id = 'es-media-guard-css';
      st.textContent = 'img,video{-webkit-user-drag:none;-khtml-user-drag:none;user-drag:none;-webkit-touch-callout:none;}';
      (document.head || document.documentElement).appendChild(st);
    }
    function hardenVideo(v) {
      if (!v || v.getAttribute('data-es-guarded') === '1') return;
      v.setAttribute('data-es-guarded', '1');
      var cl = v.getAttribute('controlslist') || '';
      ['nodownload', 'noremoteplayback', 'noplaybackrate'].forEach(function (t) {
        if (cl.indexOf(t) === -1) cl += (cl ? ' ' : '') + t;
      });
      v.setAttribute('controlslist', cl);
      try { v.disablePictureInPicture = true; } catch (e) {}
    }
    function hardenAll(root) {
      if (root && root.querySelectorAll) root.querySelectorAll('video').forEach(hardenVideo);
    }
    function start() {
      injectCss();
      hardenAll(document);
      if (window.MutationObserver && document.body) {
        new MutationObserver(function (muts) {
          muts.forEach(function (m) {
            (m.addedNodes || []).forEach(function (n) {
              if (n.nodeType !== 1) return;
              if (n.tagName === 'VIDEO') hardenVideo(n);
              else hardenAll(n);
            });
          });
        }).observe(document.body, { childList: true, subtree: true });
      }
    }
    // Block right-click + drag on any image or video, everywhere.
    document.addEventListener('contextmenu', function (e) {
      var t = e.target;
      if (t && (t.tagName === 'IMG' || t.tagName === 'VIDEO')) e.preventDefault();
    }, true);
    document.addEventListener('dragstart', function (e) {
      var t = e.target;
      if (t && (t.tagName === 'IMG' || t.tagName === 'VIDEO')) e.preventDefault();
    }, true);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  })();
}
