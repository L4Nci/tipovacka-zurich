-- =========================================================================
-- FIFA 2026 MATCH IMPORT PIPELINE
-- File: supabase/seed/import_matches.sql
-- Description: Idempotent and safe SQL import mechanism for FIFA 2026 matches.
-- =========================================================================

-- -------------------------------------------------------------------------
-- STEP 1: VALIDATION BLOCK (Asserting referential integrity)
-- -------------------------------------------------------------------------
DO $$
DECLARE
  v_missing_tournaments TEXT;
  v_missing_participants TEXT;
BEGIN
  -- 1a. Validate Tournaments Existence
  SELECT string_agg(t.id, ', ') INTO v_missing_tournaments
  FROM (
    VALUES ('fifa-world-cup-2026')
  ) AS t(id)
  LEFT JOIN public.tournaments pt ON pt.id = t.id
  WHERE pt.id IS NULL;

  IF v_missing_tournaments IS NOT NULL THEN
    RAISE EXCEPTION 'Validation failed: The following tournament_ids do not exist in public.tournaments: %', v_missing_tournaments;
  END IF;

  RAISE NOTICE 'Validation success: All referenced tournaments verified OK.';
END $$;

-- -------------------------------------------------------------------------
-- STEP 2: IDEMPOTENT INSERT / ON CONFLICT UPDATE PIPELINE
-- -------------------------------------------------------------------------
INSERT INTO public.matches (
  id,
  tournament_id,
  home_participant_id,
  away_participant_id,
  start_time_utc,
  lock_time_utc,
  stage,
  provider_name,
  provider_match_id,
  status
)
SELECT 
  (provider_name || '-' || provider_match_id) AS id,
  tournament_id,
  home_participant_id,
  away_participant_id,
  start_time_utc,
  (start_time_utc - INTERVAL '5 minutes') AS lock_time_utc,
  stage,
  provider_name,
  provider_match_id,
  'scheduled' AS status
FROM (
  VALUES 
    ('fifa-world-cup-2026', 'Group A', 'football-mex', 'football-rsa', '2026-06-11T19:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g001'),
    ('fifa-world-cup-2026', 'Group A', 'football-kor', 'football-cze', '2026-06-12T02:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g002'),
    ('fifa-world-cup-2026', 'Group B', 'football-can', 'football-bih', '2026-06-11T18:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g003'),
    ('fifa-world-cup-2026', 'Group B', 'football-usa', 'football-par', '2026-06-11T21:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g004'),
    ('fifa-world-cup-2026', 'Group C', 'football-qat', 'football-sui', '2026-06-12T00:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g005'),
    ('fifa-world-cup-2026', 'Group C', 'football-bra', 'football-mar', '2026-06-13T22:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g006'),
    ('fifa-world-cup-2026', 'Group D', 'football-hai', 'football-sco', '2026-06-12T15:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g007'),
    ('fifa-world-cup-2026', 'Group D', 'football-aus', 'football-tur', '2026-06-12T18:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g008'),
    ('fifa-world-cup-2026', 'Group E', 'football-ger', 'football-cuw', '2026-06-12T21:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g009'),
    ('fifa-world-cup-2026', 'Group E', 'football-ned', 'football-jpn', '2026-06-13T00:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g010'),
    ('fifa-world-cup-2026', 'Group F', 'football-civ', 'football-ecu', '2026-06-14T23:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g011'),
    ('fifa-world-cup-2026', 'Group F', 'football-swe', 'football-tun', '2026-06-13T15:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g012'),
    ('fifa-world-cup-2026', 'Group G', 'football-esp', 'football-cpv', '2026-06-13T18:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g013'),
    ('fifa-world-cup-2026', 'Group G', 'football-bel', 'football-egy', '2026-06-13T21:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g014'),
    ('fifa-world-cup-2026', 'Group H', 'football-ksa', 'football-uru', '2026-06-14T00:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g015'),
    ('fifa-world-cup-2026', 'Group H', 'football-irn', 'football-nzl', '2026-06-14T12:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g016'),
    ('fifa-world-cup-2026', 'Group I', 'football-fra', 'football-sen', '2026-06-14T15:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g017'),
    ('fifa-world-cup-2026', 'Group I', 'football-irq', 'football-nor', '2026-06-14T18:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g018'),
    ('fifa-world-cup-2026', 'Group J', 'football-arg', 'football-alg', '2026-06-14T21:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g019'),
    ('fifa-world-cup-2026', 'Group J', 'football-ecu', 'football-cuw', '2026-06-21T00:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g020'),
    ('fifa-world-cup-2026', 'Group K', 'football-por', 'football-cod', '2026-06-15T12:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g021'),
    ('fifa-world-cup-2026', 'Group K', 'football-eng', 'football-cro', '2026-06-15T15:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g022'),
    ('fifa-world-cup-2026', 'Group L', 'football-gha', 'football-pan', '2026-06-15T18:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g023'),
    ('fifa-world-cup-2026', 'Group L', 'football-uzb', 'football-col', '2026-06-15T21:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g024'),
    ('fifa-world-cup-2026', 'Group A', 'football-mex', 'football-kor', '2026-06-16T00:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g025'),
    ('fifa-world-cup-2026', 'Group A', 'football-cze', 'football-rsa', '2026-06-16T12:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g026'),
    ('fifa-world-cup-2026', 'Group B', 'football-can', 'football-usa', '2026-06-16T15:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g027'),
    ('fifa-world-cup-2026', 'Group B', 'football-par', 'football-bih', '2026-06-16T18:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g028'),
    ('fifa-world-cup-2026', 'Group C', 'football-qat', 'football-bra', '2026-06-16T21:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g029'),
    ('fifa-world-cup-2026', 'Group C', 'football-mar', 'football-sui', '2026-06-17T00:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g030'),
    ('fifa-world-cup-2026', 'Group D', 'football-hai', 'football-aus', '2026-06-17T12:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g031'),
    ('fifa-world-cup-2026', 'Group D', 'football-tur', 'football-sco', '2026-06-17T15:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g032'),
    ('fifa-world-cup-2026', 'Group E', 'football-ger', 'football-ned', '2026-06-17T18:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g033'),
    ('fifa-world-cup-2026', 'Group E', 'football-jpn', 'football-cuw', '2026-06-17T21:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g034'),
    ('fifa-world-cup-2026', 'Group F', 'football-civ', 'football-swe', '2026-06-18T00:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g035'),
    ('fifa-world-cup-2026', 'Group F', 'football-tun', 'football-ecu', '2026-06-18T12:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g036'),
    ('fifa-world-cup-2026', 'Group G', 'football-esp', 'football-bel', '2026-06-18T15:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g037'),
    ('fifa-world-cup-2026', 'Group G', 'football-egy', 'football-cpv', '2026-06-18T18:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g038'),
    ('fifa-world-cup-2026', 'Group H', 'football-ksa', 'football-irn', '2026-06-18T21:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g039'),
    ('fifa-world-cup-2026', 'Group H', 'football-nzl', 'football-uru', '2026-06-19T00:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g040'),
    ('fifa-world-cup-2026', 'Group I', 'football-fra', 'football-irq', '2026-06-19T12:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g041'),
    ('fifa-world-cup-2026', 'Group I', 'football-nor', 'football-sen', '2026-06-19T15:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g042'),
    ('fifa-world-cup-2026', 'Group J', 'football-arg', 'football-aut', '2026-06-19T18:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g043'),
    ('fifa-world-cup-2026', 'Group J', 'football-jor', 'football-alg', '2026-06-19T21:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g044'),
    ('fifa-world-cup-2026', 'Group K', 'football-por', 'football-eng', '2026-06-20T00:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g045'),
    ('fifa-world-cup-2026', 'Group K', 'football-cro', 'football-cod', '2026-06-20T12:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g046'),
    ('fifa-world-cup-2026', 'Group L', 'football-gha', 'football-uzb', '2026-06-20T15:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g047'),
    ('fifa-world-cup-2026', 'Group L', 'football-col', 'football-pan', '2026-06-20T18:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g048'),
    ('fifa-world-cup-2026', 'Group A', 'football-cze', 'football-mex', '2026-06-20T21:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g049'),
    ('fifa-world-cup-2026', 'Group A', 'football-rsa', 'football-kor', '2026-06-21T00:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g050'),
    ('fifa-world-cup-2026', 'Group B', 'football-par', 'football-can', '2026-06-21T12:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g051'),
    ('fifa-world-cup-2026', 'Group B', 'football-bih', 'football-usa', '2026-06-21T15:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g052'),
    ('fifa-world-cup-2026', 'Group C', 'football-mar', 'football-qat', '2026-06-21T18:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g053'),
    ('fifa-world-cup-2026', 'Group C', 'football-sui', 'football-bra', '2026-06-21T21:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g054'),
    ('fifa-world-cup-2026', 'Group D', 'football-tur', 'football-hai', '2026-06-22T00:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g055'),
    ('fifa-world-cup-2026', 'Group D', 'football-sco', 'football-aus', '2026-06-22T12:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g056'),
    ('fifa-world-cup-2026', 'Group E', 'football-jpn', 'football-ger', '2026-06-22T15:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g057'),
    ('fifa-world-cup-2026', 'Group E', 'football-cuw', 'football-ned', '2026-06-22T18:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g058'),
    ('fifa-world-cup-2026', 'Group F', 'football-tun', 'football-civ', '2026-06-22T21:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g059'),
    ('fifa-world-cup-2026', 'Group F', 'football-ecu', 'football-swe', '2026-06-23T00:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g060'),
    ('fifa-world-cup-2026', 'Group G', 'football-egy', 'football-esp', '2026-06-23T12:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g061'),
    ('fifa-world-cup-2026', 'Group G', 'football-cpv', 'football-bel', '2026-06-23T15:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g062'),
    ('fifa-world-cup-2026', 'Group H', 'football-nzl', 'football-ksa', '2026-06-23T18:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g063'),
    ('fifa-world-cup-2026', 'Group H', 'football-uru', 'football-irn', '2026-06-23T21:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g064'),
    ('fifa-world-cup-2026', 'Group I', 'football-nor', 'football-fra', '2026-06-24T00:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g065'),
    ('fifa-world-cup-2026', 'Group I', 'football-sen', 'football-irq', '2026-06-24T12:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g066'),
    ('fifa-world-cup-2026', 'Group J', 'football-jor', 'football-arg', '2026-06-24T15:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g067'),
    ('fifa-world-cup-2026', 'Group J', 'football-alg', 'football-aut', '2026-06-24T18:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g068'),
    ('fifa-world-cup-2026', 'Group K', 'football-cro', 'football-por', '2026-06-24T21:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g069'),
    ('fifa-world-cup-2026', 'Group K', 'football-cod', 'football-eng', '2026-06-25T00:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g070'),
    ('fifa-world-cup-2026', 'Group L', 'football-col', 'football-gha', '2026-06-25T12:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g071'),
    ('fifa-world-cup-2026', 'Group L', 'football-pan', 'football-uzb', '2026-06-25T15:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-g072'),
    ('fifa-world-cup-2026', 'Round of 32', 'football-tba', 'football-tba', '2026-06-28T19:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-r32-01'),
    ('fifa-world-cup-2026', 'Round of 32', 'football-tba', 'football-tba', '2026-06-29T19:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-r32-02'),
    ('fifa-world-cup-2026', 'Round of 32', 'football-tba', 'football-tba', '2026-06-30T19:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-r32-03'),
    ('fifa-world-cup-2026', 'Round of 32', 'football-tba', 'football-tba', '2026-07-01T19:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-r32-04'),
    ('fifa-world-cup-2026', 'Round of 32', 'football-tba', 'football-tba', '2026-07-02T19:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-r32-05'),
    ('fifa-world-cup-2026', 'Round of 32', 'football-tba', 'football-tba', '2026-07-03T19:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-r32-06'),
    ('fifa-world-cup-2026', 'Round of 32', 'football-tba', 'football-tba', '2026-07-04T19:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-r32-07'),
    ('fifa-world-cup-2026', 'Round of 32', 'football-tba', 'football-tba', '2026-07-05T19:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-r32-08'),
    ('fifa-world-cup-2026', 'Round of 32', 'football-tba', 'football-tba', '2026-07-06T19:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-r32-09'),
    ('fifa-world-cup-2026', 'Round of 32', 'football-tba', 'football-tba', '2026-07-07T19:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-r32-10'),
    ('fifa-world-cup-2026', 'Round of 32', 'football-tba', 'football-tba', '2026-07-08T19:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-r32-11'),
    ('fifa-world-cup-2026', 'Round of 32', 'football-tba', 'football-tba', '2026-07-09T19:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-r32-12'),
    ('fifa-world-cup-2026', 'Round of 32', 'football-tba', 'football-tba', '2026-07-10T19:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-r32-13'),
    ('fifa-world-cup-2026', 'Round of 32', 'football-tba', 'football-tba', '2026-07-11T19:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-r32-14'),
    ('fifa-world-cup-2026', 'Round of 32', 'football-tba', 'football-tba', '2026-07-12T19:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-r32-15'),
    ('fifa-world-cup-2026', 'Round of 32', 'football-tba', 'football-tba', '2026-07-13T19:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-r32-16'),
    ('fifa-world-cup-2026', 'Round of 16', 'football-tba', 'football-tba', '2026-07-14T19:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-r16-01'),
    ('fifa-world-cup-2026', 'Round of 16', 'football-tba', 'football-tba', '2026-07-15T19:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-r16-02'),
    ('fifa-world-cup-2026', 'Round of 16', 'football-tba', 'football-tba', '2026-07-16T19:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-r16-03'),
    ('fifa-world-cup-2026', 'Round of 16', 'football-tba', 'football-tba', '2026-07-17T19:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-r16-04'),
    ('fifa-world-cup-2026', 'Round of 16', 'football-tba', 'football-tba', '2026-07-18T19:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-r16-05'),
    ('fifa-world-cup-2026', 'Round of 16', 'football-tba', 'football-tba', '2026-07-19T19:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-r16-06'),
    ('fifa-world-cup-2026', 'Round of 16', 'football-tba', 'football-tba', '2026-07-20T19:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-r16-07'),
    ('fifa-world-cup-2026', 'Round of 16', 'football-tba', 'football-tba', '2026-07-21T19:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-r16-08'),
    ('fifa-world-cup-2026', 'Quarterfinal', 'football-tba', 'football-tba', '2026-07-22T19:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-qf-01'),
    ('fifa-world-cup-2026', 'Quarterfinal', 'football-tba', 'football-tba', '2026-07-23T19:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-qf-02'),
    ('fifa-world-cup-2026', 'Quarterfinal', 'football-tba', 'football-tba', '2026-07-24T19:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-qf-03'),
    ('fifa-world-cup-2026', 'Quarterfinal', 'football-tba', 'football-tba', '2026-07-25T19:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-qf-04'),
    ('fifa-world-cup-2026', 'Semifinal', 'football-tba', 'football-tba', '2026-07-26T19:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-sf-01'),
    ('fifa-world-cup-2026', 'Semifinal', 'football-tba', 'football-tba', '2026-07-27T19:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-sf-02'),
    ('fifa-world-cup-2026', 'Third Place', 'football-tba', 'football-tba', '2026-07-28T19:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-third-place'),
    ('fifa-world-cup-2026', 'Final', 'football-tba', 'football-tba', '2026-07-29T19:00:00Z'::TIMESTAMPTZ, 'manual-fifa-2026', 'fwc2026-final')
) AS raw_import(tournament_id, stage, home_participant_id, away_participant_id, start_time_utc, provider_name, provider_match_id)
ON CONFLICT (provider_name, provider_match_id) 
WHERE provider_name IS NOT NULL AND provider_match_id IS NOT NULL 
DO UPDATE SET
  tournament_id = EXCLUDED.tournament_id,
  home_participant_id = EXCLUDED.home_participant_id,
  away_participant_id = EXCLUDED.away_participant_id,
  start_time_utc = EXCLUDED.start_time_utc,
  lock_time_utc = EXCLUDED.lock_time_utc,
  stage = EXCLUDED.stage,
  updated_at = NOW();

-- -------------------------------------------------------------------------
-- STEP 3: LOG AUDIT STATEMENT
-- -------------------------------------------------------------------------
SELECT count(*) AS imported_matches_count_fifa_2026 
FROM public.matches 
WHERE provider_name = 'manual-fifa-2026';
