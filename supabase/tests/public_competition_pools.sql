-- Apply the candidate migration first. This suite makes only rollback fixtures.
-- Trusted claims emulate verified Clerk requests; cryptographic session checks
-- remain a separate browser/API check. No real accounts, picks or fixtures move.
BEGIN;
SELECT public.configure_clerk_identity_provider(
  'https://public-pool-test.clerk.accounts.dev',ARRAY['http://localhost:3000']);

SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://public-pool-test.clerk.accounts.dev','sub','user_public_pool_owner',
  'sid','sess_public_pool_owner','azp','http://localhost:3000')::text,true);
SET LOCAL ROLE authenticated;
SELECT set_config('pool_test.owner',public.bootstrap_my_account()->>'id',true);
RESET ROLE;
SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://public-pool-test.clerk.accounts.dev','sub','user_public_pool_player',
  'sid','sess_public_pool_player','azp','http://localhost:3000')::text,true);
SET LOCAL ROLE authenticated;
SELECT set_config('pool_test.player',public.bootstrap_my_account()->>'id',true);
RESET ROLE;
SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://public-pool-test.clerk.accounts.dev','sub','user_public_pool_outsider',
  'sid','sess_public_pool_outsider','azp','http://localhost:3000')::text,true);
SET LOCAL ROLE authenticated;
SELECT set_config('pool_test.outsider',public.bootstrap_my_account()->>'id',true);
RESET ROLE;

SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE public.profiles SET role='admin' WHERE id=current_setting('pool_test.owner')::uuid;
INSERT INTO public.sports(id,slug,name) VALUES('public-pool-score-test','public-pool-score-test','Rollback score');
INSERT INTO public.tournaments(id,sport_id,slug,name,status) VALUES
  ('public-pool-test-a','public-pool-score-test','public-pool-test-a','Rollback A','active'),
  ('public-pool-test-b','public-pool-score-test','public-pool-test-b','Rollback B','active');
INSERT INTO public.participants(id,sport_id,name,short_name) VALUES
  ('public-pool-team-a','public-pool-score-test','Rollback A','A'),
  ('public-pool-team-b','public-pool-score-test','Rollback B','B');
INSERT INTO public.matches(id,tournament_id,home_participant_id,away_participant_id,
  start_time_utc,lock_time_utc,status,stage) VALUES
  ('public-pool-match-a','public-pool-test-a','public-pool-team-a','public-pool-team-b',
    now()+interval '1 day',now()+interval '1 day','scheduled','League Phase'),
  ('public-pool-match-b','public-pool-test-b','public-pool-team-a','public-pool-team-b',
    now()+interval '1 day',now()+interval '1 day','scheduled','League Phase');

-- A private prediction must stay private and must never be copied on public join.
INSERT INTO public.lobbies(id,name,owner_id,tournament_id,join_code,visibility) VALUES
  ('public-pool-private-test','Rollback private',current_setting('pool_test.owner')::uuid,
    'public-pool-test-a','PUBLIC-POOL-PRIVATE-ROLLBACK','private');
INSERT INTO public.lobby_tournaments(lobby_id,tournament_id,status)
  VALUES('public-pool-private-test','public-pool-test-a','active');
INSERT INTO public.lobby_members(lobby_id,user_id) VALUES
  ('public-pool-private-test',current_setting('pool_test.owner')::uuid),
  ('public-pool-private-test',current_setting('pool_test.player')::uuid);
INSERT INTO public.predictions(user_id,lobby_id,match_id,predicted_home_score,predicted_away_score)
VALUES(current_setting('pool_test.player')::uuid,'public-pool-private-test','public-pool-match-a',2,1);

SELECT set_config('pool_test.a',public.provision_public_competition('public-pool-test-a',
  'public-pool-test-a','Rollback public A',current_setting('pool_test.owner')::uuid)->>'lobby_id',true);
SELECT set_config('pool_test.b',public.provision_public_competition('public-pool-test-b',
  'public-pool-test-b','Rollback public B',current_setting('pool_test.owner')::uuid)->>'lobby_id',true);
SELECT set_config('pool_test.code',(SELECT join_code FROM public.lobbies WHERE id=current_setting('pool_test.a')),true);
DO $$ BEGIN
  IF (public.provision_public_competition('public-pool-test-a','public-pool-test-a','Rollback public A',
    current_setting('pool_test.owner')::uuid)->>'lobby_id') IS DISTINCT FROM current_setting('pool_test.a') THEN
    RAISE EXCEPTION 'Provisioning is not idempotent'; END IF;
  BEGIN
    PERFORM public.provision_public_competition('public-pool-wrong-owner','public-pool-test-a',
      'Wrong owner',current_setting('pool_test.player')::uuid);
    RAISE EXCEPTION 'Player accepted as system owner';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.provision_public_competition('public-pool-test-a','public-pool-test-b',
      'Wrong tournament',current_setting('pool_test.owner')::uuid);
    RAISE EXCEPTION 'Existing slug repointed';
  EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
SELECT public.set_public_competition_publication('public-pool-test-a',true);
SELECT public.set_public_competition_publication('public-pool-test-b',true);
UPDATE public.app_feature_flags SET enabled=false WHERE key='public_competitions_enabled';

-- A published pool is still invisible until the independent launch gate opens.
SELECT set_config('request.jwt.claims','{"role":"anon"}',true);
SET LOCAL ROLE anon;
DO $$ BEGIN
  IF public.get_public_competitions()<>'[]'::jsonb THEN RAISE EXCEPTION 'Closed launch catalogue leaked'; END IF;
  BEGIN PERFORM public.get_public_competition('public-pool-test-a'); RAISE EXCEPTION 'Closed detail leaked';
    EXCEPTION WHEN no_data_found THEN NULL; END;
  BEGIN PERFORM public.join_public_competition('public-pool-test-a'); RAISE EXCEPTION 'Anonymous join accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.provision_public_competition('evil','public-pool-test-a','Evil');
    RAISE EXCEPTION 'Anonymous provision accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM 1 FROM tipovacka_private.public_competition_pools;
    RAISE EXCEPTION 'Anonymous registry read accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://public-pool-test.clerk.accounts.dev','sub','user_public_pool_player',
  'sid','sess_public_pool_player','azp','http://localhost:3000')::text,true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM public.join_public_competition('public-pool-test-a'); RAISE EXCEPTION 'Closed launch joined';
    EXCEPTION WHEN no_data_found THEN NULL; END;
  BEGIN PERFORM public.join_lobby_secure(current_setting('pool_test.code')); RAISE EXCEPTION 'Legacy code bypassed launch gate';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF EXISTS(SELECT 1 FROM public.lobbies WHERE id=current_setting('pool_test.a')) THEN
    RAISE EXCEPTION 'Nonmember could read unpublished lobby/code'; END IF;
  BEGIN PERFORM public.set_public_competition_publication('public-pool-test-a',true);
    RAISE EXCEPTION 'Player published pool'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE public.app_feature_flags SET enabled=true WHERE key='public_competitions_enabled';

SELECT set_config('request.jwt.claims','{"role":"anon"}',true);
SET LOCAL ROLE anon;
DO $$ DECLARE details jsonb; BEGIN
  details:=public.get_public_competition('public-pool-test-a');
  IF details->>'format'<>'score' OR details->>'status'<>'open'
    OR details->>'participant_count'<>'0' OR details->>'next_lock_at' IS NULL
    OR details->'is_member' IS DISTINCT FROM 'false'::jsonb
    OR details ?| ARRAY['lobby_id','owner_id','join_code','members','profiles'] THEN
    RAISE EXCEPTION 'Public metadata contract leaked or changed'; END IF;
  BEGIN PERFORM public.get_public_competition('unknown-public-pool'); RAISE EXCEPTION 'Unknown pool resolved';
    EXCEPTION WHEN no_data_found THEN NULL; END;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://public-pool-test.clerk.accounts.dev','sub','user_public_pool_player',
  'sid','sess_public_pool_player','azp','http://localhost:3000')::text,true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE result jsonb; BEGIN
  PERFORM public.get_public_competition('public-pool-test-a');
  IF public.is_lobby_member(current_setting('pool_test.a')) THEN RAISE EXCEPTION 'Detail silently joined player'; END IF;
  result:=public.join_public_competition('public-pool-test-a');
  IF result->>'membership_state'<>'joined' OR result->>'lobby_id' IS DISTINCT FROM current_setting('pool_test.a')
    OR NOT public.is_lobby_member(current_setting('pool_test.a')) THEN RAISE EXCEPTION 'Explicit public join failed'; END IF;
  IF public.join_public_competition('public-pool-test-a')->>'membership_state'<>'already_member' THEN
    RAISE EXCEPTION 'Repeat join is not idempotent'; END IF;
  IF public.get_public_competition('public-pool-test-a')->>'participant_count'<>'1' THEN
    RAISE EXCEPTION 'Explicit participant was not counted'; END IF;
  IF public.get_public_competition('public-pool-test-a')->'is_member' IS DISTINCT FROM 'true'::jsonb
    OR public.get_public_competition('public-pool-test-b')->'is_member' IS DISTINCT FROM 'false'::jsonb THEN
    RAISE EXCEPTION 'Catalogue membership is not scoped to current player and pool'; END IF;
  IF public.is_lobby_member(current_setting('pool_test.b')) THEN RAISE EXCEPTION 'Join silently enrolled second competition'; END IF;
  IF EXISTS(SELECT 1 FROM public.predictions WHERE lobby_id=current_setting('pool_test.a')) THEN
    RAISE EXCEPTION 'Private predictions copied to public competition'; END IF;
  BEGIN
    INSERT INTO public.predictions(user_id,lobby_id,match_id,predicted_home_score,predicted_away_score)
    VALUES(public.current_player_id(),current_setting('pool_test.b'),'public-pool-match-b',1,0);
    RAISE EXCEPTION 'Cross-pool prediction accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
INSERT INTO public.predictions(user_id,lobby_id,match_id,predicted_home_score,predicted_away_score)
VALUES(public.current_player_id(),current_setting('pool_test.a'),'public-pool-match-a',3,0);
DO $$ BEGIN
  IF (SELECT predicted_home_score FROM public.predictions WHERE lobby_id='public-pool-private-test'
    AND match_id='public-pool-match-a')<>2 THEN RAISE EXCEPTION 'Private prediction changed'; END IF;
  BEGIN UPDATE public.predictions SET points_earned=99 WHERE lobby_id=current_setting('pool_test.a');
    RAISE EXCEPTION 'Player assigned public points'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT public.leave_lobby_secure(current_setting('pool_test.a'));
DO $$ BEGIN
  IF public.join_public_competition('public-pool-test-a')->>'membership_state'<>'rejoined' THEN
    RAISE EXCEPTION 'Voluntary leaver could not explicitly rejoin'; END IF;
END $$;
RESET ROLE;

-- A distinct Clerk account receives no private/group data and cannot forge the
-- current player's UUID through native Supabase claims, metadata or parameters.
SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','supabase','sub',current_setting('pool_test.player'))::text,true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF public.current_player_id() IS NOT NULL THEN RAISE EXCEPTION 'Native UUID login revived'; END IF;
  BEGIN PERFORM public.join_public_competition('public-pool-test-b'); RAISE EXCEPTION 'Native JWT joined';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.join_lobby_secure(current_setting('pool_test.code')); RAISE EXCEPTION 'Native JWT used legacy join';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://public-pool-test.clerk.accounts.dev','sub','user_public_pool_outsider',
  'sid','sess_public_pool_outsider','azp','http://localhost:3000')::text,true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF public.get_public_competition('public-pool-test-a')->'is_member' IS DISTINCT FROM 'false'::jsonb THEN
    RAISE EXCEPTION 'Another Clerk player inherited membership hint'; END IF;
  IF EXISTS(SELECT 1 FROM public.predictions WHERE lobby_id IN(current_setting('pool_test.a'),'public-pool-private-test')) THEN
    RAISE EXCEPTION 'Nonmember read public/private predictions'; END IF;
  BEGIN
    INSERT INTO public.predictions(user_id,lobby_id,match_id,predicted_home_score,predicted_away_score)
    VALUES(current_setting('pool_test.player')::uuid,current_setting('pool_test.a'),'public-pool-match-a',9,9);
    RAISE EXCEPTION 'Outsider forged another player prediction';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

-- Platform owner sessions cannot reconfigure pools, add another competition or
-- turn the system's private storage into a broadly-readable ordinary lobby.
SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://public-pool-test.clerk.accounts.dev','sub','user_public_pool_owner',
  'sid','sess_public_pool_owner','azp','http://localhost:3000')::text,true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN UPDATE public.lobbies SET visibility='public' WHERE id=current_setting('pool_test.a');
    RAISE EXCEPTION 'Owner exposed system storage'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.lobby_tournaments(lobby_id,tournament_id,status)
    VALUES(current_setting('pool_test.a'),'public-pool-test-b','active');
    RAISE EXCEPTION 'Owner silently enrolled another competition'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.lobby_tournaments(lobby_id,tournament_id,status)
    VALUES(current_setting('pool_test.a'),'public-pool-test-b','archived');
    RAISE EXCEPTION 'Archived attachment bypassed single-competition context'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE public.lobby_tournaments SET status='archived' WHERE lobby_id=current_setting('pool_test.a');
    RAISE EXCEPTION 'Owner detached system competition'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM public.lobby_tournaments WHERE lobby_id=current_setting('pool_test.a');
    RAISE EXCEPTION 'Owner deleted system competition'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT public.remove_lobby_member_secure(current_setting('pool_test.a'),current_setting('pool_test.player')::uuid);
RESET ROLE;
SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://public-pool-test.clerk.accounts.dev','sub','user_public_pool_player',
  'sid','sess_public_pool_player','azp','http://localhost:3000')::text,true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE result jsonb; BEGIN
  result:=public.join_public_competition('public-pool-test-a');
  IF result IS DISTINCT FROM jsonb_build_object('slug','public-pool-test-a','membership_state','removed')
    OR public.is_lobby_member(current_setting('pool_test.a')) THEN RAISE EXCEPTION 'Removed player regained/leaked context'; END IF;
END $$;
RESET ROLE;

-- A closed season is still readable, but neither new nor legacy entry may add
-- participants to a concluded table. Existing active members keep their access.
SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://public-pool-test.clerk.accounts.dev','sub','user_public_pool_player',
  'sid','sess_public_pool_player','azp','http://localhost:3000')::text,true);
SET LOCAL ROLE authenticated;
SELECT public.join_public_competition('public-pool-test-b');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE public.tournaments SET status='finished' WHERE id='public-pool-test-b';
SELECT set_config('pool_test.closed_code',(SELECT join_code FROM public.lobbies WHERE id=current_setting('pool_test.b')),true);
SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://public-pool-test.clerk.accounts.dev','sub','user_public_pool_player',
  'sid','sess_public_pool_player','azp','http://localhost:3000')::text,true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF public.get_public_competition('public-pool-test-b')->'is_member' IS DISTINCT FROM 'true'::jsonb
    OR public.join_public_competition('public-pool-test-b')->>'membership_state' IS DISTINCT FROM 'already_member' THEN
    RAISE EXCEPTION 'Existing closed-season participant could not reopen results'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://public-pool-test.clerk.accounts.dev','sub','user_public_pool_outsider',
  'sid','sess_public_pool_outsider','azp','http://localhost:3000')::text,true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF public.get_public_competition('public-pool-test-b')->>'status'<>'closed' THEN
    RAISE EXCEPTION 'Finished season still open'; END IF;
  IF public.get_public_competition('public-pool-test-b')->'is_member' IS DISTINCT FROM 'false'::jsonb THEN
    RAISE EXCEPTION 'Closed-season outsider marked as member'; END IF;
  BEGIN PERFORM public.join_public_competition('public-pool-test-b'); RAISE EXCEPTION 'Closed season joined';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.join_lobby_secure(current_setting('pool_test.closed_code')); RAISE EXCEPTION 'Legacy code joined closed season';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

-- Annual UFC uses the existing member guard, method column and leaderboard.
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO public.sports(id,slug,name) VALUES('mma','mma','MMA') ON CONFLICT(id) DO NOTHING;
INSERT INTO public.tournaments(id,sport_id,slug,name,status)
  VALUES('ufc-2099','mma','ufc-2099','UFC rollback 2099','active');
INSERT INTO public.mma_seasons(tournament_id,season_year) VALUES('ufc-2099',2099);
INSERT INTO public.tournaments(id,sport_id,slug,name,status)
  VALUES('ufcal-event-890000001','mma','public-pool-test-card','Rollback card','hidden');
INSERT INTO public.mma_events(tournament_id,provider_event_id,provider_slug,starts_at,lock_time_utc,
  status,rules_version,source_observed_at,snapshot_hash,season_tournament_id)
VALUES('ufcal-event-890000001',890000001,'public-pool-rollback','2099-01-01T00:00:00Z','2099-01-01T00:00:00Z',
  'scheduled','mma-winner-method-v2',now(),repeat('a',64),'ufc-2099');
INSERT INTO public.mma_fighters(id,name) VALUES(890000011,'Rollback fighter A'),(890000012,'Rollback fighter B');
INSERT INTO public.mma_fights(id,tournament_id,provider_fight_id,fighter_a_id,fighter_b_id,ordering,card_section,status)
VALUES('ufcal-fight-890000001','ufcal-event-890000001',890000001,890000011,890000012,1,'main','scheduled');
SELECT set_config('pool_test.mma',public.provision_public_competition('public-pool-test-ufc',
  'ufc-2099','Rollback public UFC',current_setting('pool_test.owner')::uuid)->>'lobby_id',true);
SELECT public.set_public_competition_publication('public-pool-test-ufc',true);
SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://public-pool-test.clerk.accounts.dev','sub','user_public_pool_outsider',
  'sid','sess_public_pool_outsider','azp','http://localhost:3000')::text,true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF public.get_public_competition('public-pool-test-ufc')->>'format'<>'mma' THEN
    RAISE EXCEPTION 'Annual UFC format lost'; END IF;
  BEGIN INSERT INTO public.mma_predictions(lobby_id,fight_id,user_id,predicted_winner_id,lineup_version)
    VALUES(current_setting('pool_test.mma'),'ufcal-fight-890000001',public.current_player_id(),890000011,1);
    RAISE EXCEPTION 'Unjoined MMA player saved'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM public.join_public_competition('public-pool-test-ufc');
END $$;
INSERT INTO public.mma_predictions(lobby_id,fight_id,user_id,predicted_winner_id,lineup_version,predicted_method)
VALUES(current_setting('pool_test.mma'),'ufcal-fight-890000001',public.current_player_id(),890000011,1,'ko_tko');
DO $$ BEGIN
  IF (SELECT count(*) FROM public.get_mma_lobby_leaderboard(current_setting('pool_test.mma'),'ufc-2099')
    WHERE user_id=current_setting('pool_test.outsider')::uuid)<>1 THEN RAISE EXCEPTION 'Existing MMA leaderboard missed joined player'; END IF;
END $$;
RESET ROLE;

-- Existing first-bell locks are unchanged for the public format.
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE public.mma_events SET lock_time_utc=now()-interval '1 minute' WHERE tournament_id='ufcal-event-890000001';
SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://public-pool-test.clerk.accounts.dev','sub','user_public_pool_outsider',
  'sid','sess_public_pool_outsider','azp','http://localhost:3000')::text,true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN UPDATE public.mma_predictions SET predicted_method='submission' WHERE lobby_id=current_setting('pool_test.mma');
    RAISE EXCEPTION 'Public entry reopened elapsed MMA lock'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

-- Closing publication hides new entry, while preserving normal member history.
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT public.set_public_competition_publication('public-pool-test-ufc',false);
SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://public-pool-test.clerk.accounts.dev','sub','user_public_pool_outsider',
  'sid','sess_public_pool_outsider','azp','http://localhost:3000')::text,true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM public.get_public_competition('public-pool-test-ufc'); RAISE EXCEPTION 'Unpublished detail leaked';
    EXCEPTION WHEN no_data_found THEN NULL; END;
  IF NOT public.is_lobby_member(current_setting('pool_test.mma')) OR NOT EXISTS (
    SELECT 1 FROM public.mma_predictions WHERE lobby_id=current_setting('pool_test.mma')) THEN
    RAISE EXCEPTION 'Publication switch destroyed existing access/history'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
