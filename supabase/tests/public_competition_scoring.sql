-- Integration evidence for the existing cron-facing RPCs, not a new scorer.
-- Run in an isolated local current-schema harness or coordinated ROLLBACK
-- validation before provisioning real public CL/UFC pools. Synthetic provider
-- IDs are used; no existing prediction/result is selected for modification.
BEGIN;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='3s';
SELECT public.configure_clerk_identity_provider(
  'https://public-sync-test.clerk.accounts.dev',ARRAY['http://localhost:3000']);
SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://public-sync-test.clerk.accounts.dev','sub','user_public_sync_owner',
  'sid','sess_public_sync_owner','azp','http://localhost:3000')::text,true);
SET LOCAL ROLE authenticated;
SELECT set_config('public_sync.owner',public.bootstrap_my_account()->>'id',true);
RESET ROLE;
SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://public-sync-test.clerk.accounts.dev','sub','user_public_sync_player',
  'sid','sess_public_sync_player','azp','http://localhost:3000')::text,true);
SET LOCAL ROLE authenticated;
SELECT set_config('public_sync.player',public.bootstrap_my_account()->>'id',true);
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE public.profiles SET role='admin' WHERE id=current_setting('public_sync.owner')::uuid;
INSERT INTO public.sports(id,slug,name) VALUES('football','football','Football'),('mma','mma','MMA')
  ON CONFLICT(id) DO NOTHING;
CREATE TEMP TABLE public_sync_batches(kind text PRIMARY KEY,payload jsonb);

INSERT INTO public_sync_batches(kind,payload)
SELECT 'score',jsonb_build_object('competition','CL','season',2026,
  'clubs',(SELECT jsonb_agg(jsonb_build_object('id','football-data-team-'||(9937000+i),
    'name','Public sync rollback club '||i,'short_name','R'||i)) FROM generate_series(1,36)i),
  'matches',(SELECT jsonb_agg(jsonb_build_object('id','football-data-match-'||(9937000+i),
    'provider_match_id',(9937000+i)::text,
    'home_id','football-data-team-'||(9937001+(i-1)%18),
    'away_id','football-data-team-'||(9937019+(((i-1)%18+(i-1)/18)%18)),
    'kickoff',now()+interval '10 days','matchday',1+(i-1)/18,'stage','League Phase',
    'provider_status','TIMED','provider_updated_at',now()-interval '2 minutes',
    'provider_score',jsonb_build_object('duration','REGULAR','fullTime',jsonb_build_object('home',null,'away',null)),
    'home_score',null,'away_score',null,'status','scheduled','scores','[]'::jsonb) ORDER BY i)
    FROM generate_series(1,144)i));
SELECT public.sync_football_data_catalog(payload,false,true) FROM public_sync_batches WHERE kind='score';
UPDATE public.tournaments SET status='active' WHERE id='uefa-champions-league-2026-27';

INSERT INTO tipovacka_private.mma_event_catalog(provider_event_id,tournament_id,season_year,published_start_at)
VALUES(993700001,'ufcal-event-993700001',2026,now()+interval '1 day');
INSERT INTO public_sync_batches(kind,payload)
VALUES('mma',jsonb_build_object('observed_at',clock_timestamp(),'snapshot_hash',repeat('a',64),
  'event',jsonb_build_object('tournament_id','ufcal-event-993700001','provider_event_id',993700001,
    'provider_slug','public-sync-rollback','name','Public sync rollback','org','ufc','sport','mma',
    'starts_at',now()+interval '1 day','main_card_at',null,'status','scheduled'),
  'fighters',jsonb_build_array(jsonb_build_object('id',993700011,'name','Public sync A','country_code','CZ'),
    jsonb_build_object('id',993700012,'name','Public sync B','country_code','NZ')),
  'fights',jsonb_build_array(jsonb_build_object('id','ufcal-fight-993700001','provider_fight_id',993700001,
    'fighter_a_id',993700011,'fighter_b_id',993700012,'ordering',1,'card_section','main',
    'weight_class','Test','scheduled_rounds',3,'status','scheduled','winner_fighter_id',null,
    'method',null,'method_normalized',null,'finish_round',null))));
SELECT public.sync_mma_event(payload,false) FROM public_sync_batches WHERE kind='mma';

INSERT INTO public.lobbies(id,name,owner_id,tournament_id,join_code,visibility)
VALUES('public-sync-private-test','Rollback private scoring',current_setting('public_sync.owner')::uuid,
  'uefa-champions-league-2026-27','PUBLIC-SYNC-PRIVATE-ROLLBACK','private');
INSERT INTO public.lobby_tournaments(lobby_id,tournament_id,status) VALUES
  ('public-sync-private-test','uefa-champions-league-2026-27','active'),
  ('public-sync-private-test','ufc-2026','active');
INSERT INTO public.lobby_members(lobby_id,user_id) VALUES
  ('public-sync-private-test',current_setting('public_sync.owner')::uuid),
  ('public-sync-private-test',current_setting('public_sync.player')::uuid);
SELECT set_config('public_sync.score',public.provision_public_competition('public-sync-test-score',
  'uefa-champions-league-2026-27','Public sync rollback score',current_setting('public_sync.owner')::uuid)->>'lobby_id',true);
SELECT set_config('public_sync.mma',public.provision_public_competition('public-sync-test-mma',
  'ufc-2026','Public sync rollback MMA',current_setting('public_sync.owner')::uuid)->>'lobby_id',true);
SELECT public.set_public_competition_publication('public-sync-test-score',true);
SELECT public.set_public_competition_publication('public-sync-test-mma',true);
UPDATE public.app_feature_flags SET enabled=true WHERE key='public_competitions_enabled';

SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://public-sync-test.clerk.accounts.dev','sub','user_public_sync_player',
  'sid','sess_public_sync_player','azp','http://localhost:3000')::text,true);
SET LOCAL ROLE authenticated;
SELECT public.join_public_competition('public-sync-test-score');
SELECT public.join_public_competition('public-sync-test-mma');
INSERT INTO public.predictions(user_id,lobby_id,match_id,predicted_home_score,predicted_away_score) VALUES
  (public.current_player_id(),current_setting('public_sync.score'),'football-data-match-9937001',3,1),
  (public.current_player_id(),'public-sync-private-test','football-data-match-9937001',2,0);
INSERT INTO public.mma_predictions(lobby_id,fight_id,user_id,predicted_winner_id,lineup_version,predicted_method) VALUES
  (current_setting('public_sync.mma'),'ufcal-fight-993700001',public.current_player_id(),993700011,1,'ko_tko'),
  ('public-sync-private-test','ufcal-fight-993700001',public.current_player_id(),993700012,1,'ko_tko');
RESET ROLE;

SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE public_sync_batches SET payload=jsonb_set(payload,'{matches,0}',(payload->'matches'->0)||
  jsonb_build_object('status','finished','provider_status','FINISHED','kickoff',now()-interval '2 hours',
    'home_score',3,'away_score',1,'provider_updated_at',now()-interval '1 minute',
    'provider_score','{"duration":"REGULAR","fullTime":{"home":3,"away":1}}'::jsonb,
    'scores',jsonb_build_array(jsonb_build_object('user_id',current_setting('public_sync.player'),
      'lobby_id',current_setting('public_sync.score'),'predicted_home_score',3,'predicted_away_score',1,'points_earned',5),
      jsonb_build_object('user_id',current_setting('public_sync.player'),'lobby_id','public-sync-private-test',
        'predicted_home_score',2,'predicted_away_score',0,'points_earned',3)))) WHERE kind='score';
SELECT public.sync_football_data_catalog(payload,false,false) FROM public_sync_batches WHERE kind='score';
SELECT public.sync_football_data_catalog(payload,false,false) FROM public_sync_batches WHERE kind='score';
UPDATE public_sync_batches SET payload=payload||jsonb_build_object('observed_at',clock_timestamp(),
  'snapshot_hash',repeat('b',64),'event',(payload->'event')||jsonb_build_object('starts_at',now()-interval '2 hours','status','completed'),
  'fights',jsonb_build_array((payload->'fights'->0)||jsonb_build_object('status','finished',
    'winner_fighter_id',993700011,'method','KO/TKO','method_normalized','ko_tko','finish_round',1))) WHERE kind='mma';
SELECT public.sync_mma_event(payload,false) FROM public_sync_batches WHERE kind='mma';
SELECT public.sync_mma_event(payload,false) FROM public_sync_batches WHERE kind='mma';
DO $$ BEGIN
  IF (SELECT points_earned FROM public.predictions WHERE lobby_id=current_setting('public_sync.score')
    AND match_id='football-data-match-9937001') IS DISTINCT FROM 5
    OR (SELECT points_earned FROM public.predictions WHERE lobby_id='public-sync-private-test'
      AND match_id='football-data-match-9937001') IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'Existing football sync did not score public/private predictions separately'; END IF;
  IF (SELECT points_earned FROM public.mma_predictions WHERE lobby_id=current_setting('public_sync.mma')
    AND fight_id='ufcal-fight-993700001') IS DISTINCT FROM 5
    OR (SELECT points_earned FROM public.mma_predictions WHERE lobby_id='public-sync-private-test'
      AND fight_id='ufcal-fight-993700001') IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Existing MMA sync did not score public/private method predictions separately'; END IF;
END $$;

SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'iss','https://public-sync-test.clerk.accounts.dev','sub','user_public_sync_player',
  'sid','sess_public_sync_player','azp','http://localhost:3000')::text,true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF (SELECT points FROM public.get_mma_lobby_leaderboard(current_setting('public_sync.mma'),'ufc-2026')
    WHERE user_id=public.current_player_id()) IS DISTINCT FROM 5 THEN RAISE EXCEPTION 'Public MMA table mixed private points'; END IF;
  BEGIN UPDATE public.predictions SET predicted_home_score=4 WHERE lobby_id=current_setting('public_sync.score')
    AND match_id='football-data-match-9937001';
    IF EXISTS(SELECT 1 FROM public.predictions WHERE lobby_id=current_setting('public_sync.score')
      AND match_id='football-data-match-9937001' AND predicted_home_score<>3) THEN
      RAISE EXCEPTION 'Finished public football reopened'; END IF;
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE public.mma_predictions SET predicted_method='submission' WHERE lobby_id=current_setting('public_sync.mma')
    AND fight_id='ufcal-fight-993700001';
    IF EXISTS(SELECT 1 FROM public.mma_predictions WHERE lobby_id=current_setting('public_sync.mma')
      AND fight_id='ufcal-fight-993700001' AND predicted_method<>'ko_tko') THEN
      RAISE EXCEPTION 'Finished public MMA reopened'; END IF;
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
