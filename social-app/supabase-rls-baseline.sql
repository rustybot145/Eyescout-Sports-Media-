-- EyeScout RLS baseline — generated from the live database 2026-08-15
--
-- WHY THIS FILE EXISTS: the RLS config was built in the Supabase dashboard and
-- existed nowhere in version control. That made it unreviewable, undiffable and
-- unrecoverable. This is the snapshot. Regenerate it after any policy change and
-- commit the diff, so a widened policy shows up in review instead of silently.
--
-- Regenerate:
--   npx supabase db query "select schemaname,tablename,policyname,cmd,roles::text,qual,with_check from pg_policies where schemaname in ($$public$$,$$storage$$) order by 1,2,3" --linked
--
-- 48 policies at time of capture.


-- ── public.blocks ────────────────────────────────────────
--   blocks_delete_own  [DELETE to {public}]
--     USING       (auth.uid() = blocker_id)
--   blocks_insert_own  [INSERT to {public}]
--     WITH CHECK  (auth.uid() = blocker_id)
--   blocks_select_own  [SELECT to {public}]
--     USING       (auth.uid() = blocker_id)

-- ── public.coach_saved ────────────────────────────────────────
--   coach_saved_delete  [DELETE to {authenticated}]
--     USING       (coach_id = auth.uid())
--   coach_saved_insert  [INSERT to {authenticated}]
--     WITH CHECK  (coach_id = auth.uid())
--   coach_saved_select  [SELECT to {authenticated}]
--     USING       (coach_id = auth.uid())
--   coach_saved_update  [UPDATE to {authenticated}]
--     USING       (coach_id = auth.uid())
--     WITH CHECK  (coach_id = auth.uid())

-- ── public.follows ────────────────────────────────────────
--   follows_delete  [DELETE to {authenticated}]
--     USING       (follower_id = auth.uid())
--   follows_insert  [INSERT to {authenticated}]
--     WITH CHECK  ((follower_id = auth.uid()) AND _es_viewer_has_feed_access())
--   follows_select  [SELECT to {authenticated}]
--     USING       true
--   follows_update  [UPDATE to {authenticated}]
--     USING       (follower_id = auth.uid())
--     WITH CHECK  (follower_id = auth.uid())

-- ── public.hypes ────────────────────────────────────────
--   hypes_delete  [DELETE to {authenticated}]
--     USING       (user_id = auth.uid())
--   hypes_insert  [INSERT to {authenticated}]
--     WITH CHECK  (user_id = auth.uid())
--   hypes_select  [SELECT to {authenticated}]
--     USING       true
--   hypes_update  [UPDATE to {authenticated}]
--     USING       (user_id = auth.uid())
--     WITH CHECK  (user_id = auth.uid())

-- ── public.messages ────────────────────────────────────────
--   messages_delete  [DELETE to {authenticated}]
--     USING       ((player_id = auth.uid()) OR (coach_id = auth.uid()))
--   messages_insert  [INSERT to {authenticated}]
--     WITH CHECK  ((player_id = auth.uid()) OR ((coach_id = auth.uid()) AND _es_viewer_has_feed_access()))
--   messages_select  [SELECT to {authenticated}]
--     USING       ((player_id = auth.uid()) OR ((coach_id = auth.uid()) AND _es_viewer_has_feed_access()))
--   messages_update  [UPDATE to {authenticated}]
--     USING       ((player_id = auth.uid()) OR ((coach_id = auth.uid()) AND _es_viewer_has_feed_access()))
--     WITH CHECK  ((player_id = auth.uid()) OR ((coach_id = auth.uid()) AND _es_viewer_has_feed_access()))

-- ── public.notifications ────────────────────────────────────────
--   notifications_insert  [INSERT to {authenticated}]
--     WITH CHECK  ((auth.uid() = actor_id) OR ((actor_id IS NULL) AND (type = 'hype_milestone'::text)) OR ((actor_id IS NULL) AND (type = 'admin_message'::text) AND is_admin()))
--   notifications_select  [SELECT to {authenticated}]
--     USING       (target_id = auth.uid())
--   notifications_update  [UPDATE to {authenticated}]
--     USING       (target_id = auth.uid())
--     WITH CHECK  (target_id = auth.uid())

-- ── public.posts ────────────────────────────────────────
--   posts_delete  [DELETE to {authenticated}]
--     USING       (author_id = auth.uid())
--   posts_insert  [INSERT to {authenticated}]
--     WITH CHECK  ((author_id = auth.uid()) AND _es_viewer_has_feed_access())
--   posts_read_authenticated  [SELECT to {authenticated}]
--     USING       true
--   posts_select  [SELECT to {authenticated}]
--     USING       ((author_id = auth.uid()) OR (_es_is_public_player(author_id) AND _es_viewer_has_feed_access()))
--   posts_update  [UPDATE to {authenticated}]
--     USING       (author_id = auth.uid())
--     WITH CHECK  (author_id = auth.uid())

-- ── public.profiles ────────────────────────────────────────
--   Owner insert  [INSERT to {public}]
--     WITH CHECK  (auth.uid() = id)
--   Owner select  [SELECT to {public}]
--     USING       (auth.uid() = id)
--   Owner update  [UPDATE to {public}]
--     USING       (auth.uid() = id)
--   profiles_delete  [DELETE to {authenticated}]
--     USING       (id = auth.uid())
--   profiles_insert  [INSERT to {authenticated}]
--     WITH CHECK  (id = auth.uid())
--   profiles_select  [SELECT to {authenticated}]
--     USING       ((id = auth.uid()) OR ((role = 'coach'::text) AND _es_viewer_is_coach()) OR ((role = 'player'::text) AND (COALESCE((prefs ->> 'priv-public'::text), 'true'::text) <> 'false'::text) AND _es_viewer_has_f
--   profiles_update  [UPDATE to {authenticated}]
--     USING       (id = auth.uid())
--     WITH CHECK  (id = auth.uid())

-- ── public.push_tokens ────────────────────────────────────────
--   push_tokens_own  [ALL to {public}]
--     USING       (auth.uid() = user_id)
--     WITH CHECK  (auth.uid() = user_id)

-- ── public.reports ────────────────────────────────────────
--   reports_insert  [INSERT to {authenticated}]
--     WITH CHECK  (reporter_id = (auth.uid())::text)

-- ── public.seen_stories ────────────────────────────────────────
--   seen_stories_insert  [INSERT to {authenticated}]
--     WITH CHECK  (user_id = auth.uid())
--   seen_stories_select  [SELECT to {authenticated}]
--     USING       (user_id = auth.uid())
--   seen_stories_update  [UPDATE to {authenticated}]
--     USING       (user_id = auth.uid())
--     WITH CHECK  (user_id = auth.uid())

-- ── public.subscriptions ────────────────────────────────────────
--   subscriptions_select  [SELECT to {authenticated}]
--     USING       (user_id = auth.uid())
--   subscriptions_select_own  [SELECT to {public}]
--     USING       (auth.uid() = user_id)
--   subscriptions_update  [UPDATE to {authenticated}]
--     USING       (user_id = auth.uid())
--     WITH CHECK  (user_id = auth.uid())
--   subscriptions_upsert  [INSERT to {authenticated}]
--     WITH CHECK  (user_id = auth.uid())

-- ── public.tournaments ────────────────────────────────────────
--   tournaments_select  [SELECT to {authenticated}]
--     USING       true

-- ── storage.objects ────────────────────────────────────────
--   es delete images  [DELETE to {authenticated}]
--     USING       ((bucket_id = ANY (ARRAY['avatars'::text, 'banners'::text, 'posts'::text])) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR is_admin()))
--   es read images  [SELECT to {authenticated}]
--     USING       (bucket_id = ANY (ARRAY['avatars'::text, 'banners'::text, 'posts'::text]))
--   es update images  [UPDATE to {authenticated}]
--     USING       ((bucket_id = ANY (ARRAY['avatars'::text, 'banners'::text, 'posts'::text])) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR is_admin()))
--     WITH CHECK  ((bucket_id = ANY (ARRAY['avatars'::text, 'banners'::text, 'posts'::text])) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR is_admin()))
--   es upload images  [INSERT to {authenticated}]
--     WITH CHECK  ((bucket_id = ANY (ARRAY['avatars'::text, 'banners'::text, 'posts'::text])) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR is_admin()))
