-- Run only inside the enclosing BEGIN/ROLLBACK before the candidate migration.
-- A unique locked fixture proves that migration does not upgrade historical rules.
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO tipovacka_private.mma_event_catalog(provider_event_id,tournament_id,season_year,published_start_at)
VALUES(98704999,'ufcal-event-98704999',2026,now()+interval '2 days');
SELECT public.sync_mma_event(jsonb_build_object(
  'observed_at',clock_timestamp(),'snapshot_hash',repeat('a',64),
  'event',jsonb_build_object('tournament_id','ufcal-event-98704999','provider_event_id',98704999,'provider_slug','ufc-method-locked-qa',
    'name','UFC locked method QA','org','ufc','sport','mma','starts_at',now()+interval '2 days','main_card_at',null,'status','scheduled'),
  'fighters',jsonb_build_array(jsonb_build_object('id',98704101,'name','Method QA A','country_code','CZ'),
    jsonb_build_object('id',98704102,'name','Method QA B','country_code','NZ')),
  'fights',jsonb_build_array(jsonb_build_object('id','ufcal-fight-98704999','provider_fight_id',98704999,
    'fighter_a_id',98704101,'fighter_b_id',98704102,'ordering',1,'card_section','main','weight_class','Test',
    'scheduled_rounds',3,'status','scheduled','winner_fighter_id',null,'method',null,'finish_round',null))),false);
UPDATE public.mma_events SET rules_version='mma-winner-v1',lock_time_utc=now()-interval '1 minute'
WHERE tournament_id='ufcal-event-98704999';
