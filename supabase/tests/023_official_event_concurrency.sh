#!/usr/bin/env bash
set -euo pipefail

PGHOST="${PGHOST:-/private/tmp}"
PGPORT="${PGPORT:-55435}"
PGUSER="${PGUSER:-postgres}"
PGDATABASE="${PGDATABASE:-tipovacka_official_events}"

ADMIN_ID="00000000-0000-4000-8000-000000000c01"
PLAYER_ID="00000000-0000-4000-8000-000000000c02"
EVENT_ID="00000000-0000-4000-8000-000000000c10"
SPORT_ID="evolution-concurrency-sport"
TOURNAMENT_ID="evolution-concurrency-tournament"
MATCH_ID="evolution-concurrency-match"

psql_base=(
  psql -X -v ON_ERROR_STOP=1
  -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE"
)
tmp_dir="$(mktemp -d)"

cleanup() {
  "${psql_base[@]}" -q <<SQL >/dev/null
DELETE FROM public.official_events WHERE id = '$EVENT_ID';
DELETE FROM auth.users WHERE id IN ('$ADMIN_ID', '$PLAYER_ID');
DELETE FROM public.matches WHERE id = '$MATCH_ID';
DELETE FROM public.tournaments WHERE id = '$TOURNAMENT_ID';
DELETE FROM public.participants
WHERE id IN ('evolution-concurrency-home', 'evolution-concurrency-away');
DELETE FROM public.sports WHERE id = '$SPORT_ID';
SQL
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

run_as_player() {
  "${psql_base[@]}" -q -c "
    BEGIN;
    SET LOCAL ROLE authenticated;
    SELECT set_config(
      'request.jwt.claims',
      '{\"sub\":\"$PLAYER_ID\",\"role\":\"authenticated\"}',
      true
    );
    SELECT set_config('request.jwt.claim.sub', '$PLAYER_ID', true);
    SELECT public.accept_official_event_terms_and_join(
      '$EVENT_ID',
      true,
      true,
      true
    );
    COMMIT;
  "
}

run_reconciliation() {
  "${psql_base[@]}" -q -c "
    BEGIN;
    SET LOCAL ROLE service_role;
    SELECT public.reconcile_official_event_badges('$EVENT_ID', false);
    COMMIT;
  "
}

"${psql_base[@]}" -q <<SQL
INSERT INTO public.sports (id, slug, name)
VALUES ('$SPORT_ID', '$SPORT_ID', 'Evolution Concurrency Sport');

INSERT INTO public.participants (id, sport_id, name, short_name)
VALUES
  ('evolution-concurrency-home', '$SPORT_ID', 'Concurrency Home', 'COH'),
  ('evolution-concurrency-away', '$SPORT_ID', 'Concurrency Away', 'COA');

INSERT INTO public.tournaments (id, sport_id, slug, name, status)
VALUES (
  '$TOURNAMENT_ID',
  '$SPORT_ID',
  '$TOURNAMENT_ID',
  'Evolution Concurrency Tournament',
  'active'
);

INSERT INTO public.matches (
  id, tournament_id, home_participant_id, away_participant_id,
  start_time_utc, lock_time_utc, status
)
VALUES (
  '$MATCH_ID',
  '$TOURNAMENT_ID',
  'evolution-concurrency-home',
  'evolution-concurrency-away',
  now() + interval '1 day',
  now() + interval '1 day' - interval '5 minutes',
  'scheduled'
);

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  (
    '00000000-0000-0000-0000-000000000000',
    '$ADMIN_ID',
    'authenticated',
    'authenticated',
    'evolution-concurrency-admin@example.invalid',
    'not-a-real-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"Evolution Concurrency Admin"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '$PLAYER_ID',
    'authenticated',
    'authenticated',
    'evolution-concurrency-player@example.invalid',
    'not-a-real-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"Evolution Concurrency Player"}'::jsonb,
    now(),
    now()
  );

INSERT INTO public.official_events (
  id, slug, name, tournament_id, status,
  registration_opens_at, registration_closes_at, starts_at, ends_at,
  featured, onboarding_eligible, created_by, visibility, terms_version,
  minimum_age, eligible_regions
)
VALUES (
  '$EVENT_ID',
  'evolution-concurrency-event',
  'Evolution Concurrency Event',
  '$TOURNAMENT_ID',
  'active',
  now() - interval '1 day',
  now() + interval '1 day',
  now() - interval '1 day',
  now() + interval '2 days',
  true,
  true,
  '$ADMIN_ID',
  'public',
  1,
  18,
  ARRAY['CZ']
);
SQL

run_as_player >"$tmp_dir/join-1.log" 2>&1 &
join_pid_1=$!
run_as_player >"$tmp_dir/join-2.log" 2>&1 &
join_pid_2=$!
wait "$join_pid_1"
wait "$join_pid_2"

participation_count="$("${psql_base[@]}" -Atqc "
  SELECT COUNT(*) FROM public.official_event_participations
  WHERE event_id = '$EVENT_ID' AND user_id = '$PLAYER_ID';
")"
acceptance_count="$("${psql_base[@]}" -Atqc "
  SELECT COUNT(*) FROM public.official_event_terms_acceptances
  WHERE event_id = '$EVENT_ID'
    AND user_id = '$PLAYER_ID'
    AND terms_version = 1;
")"
score_count="$("${psql_base[@]}" -Atqc "
  SELECT COUNT(*) FROM public.official_event_scores
  WHERE event_id = '$EVENT_ID' AND user_id = '$PLAYER_ID';
")"
test "$participation_count" = "1"
test "$acceptance_count" = "1"
test "$score_count" = "1"
echo "PASS concurrent join: one participation, acceptance and score row"

"${psql_base[@]}" -q <<SQL
INSERT INTO public.official_event_predictions (
  event_id, user_id, match_id, predicted_home_score, predicted_away_score,
  points_earned
)
VALUES ('$EVENT_ID', '$PLAYER_ID', '$MATCH_ID', 2, 1, 5);

UPDATE public.official_event_scores
SET total_points = 5, exact_hits = 1, first_prediction_at = now()
WHERE event_id = '$EVENT_ID' AND user_id = '$PLAYER_ID';

INSERT INTO public.official_event_badge_rules (
  event_id, key, name_cs, description_cs, icon, rule_type, is_active
)
VALUES
  ('$EVENT_ID', 'winner', 'Vítěz', 'Vítěz eventu.', 'Trophy', 'winner', true),
  (
    '$EVENT_ID',
    'participant',
    'Účastník',
    'Alespoň jeden tip.',
    'TicketCheck',
    'participant',
    true
  );

UPDATE public.matches
SET status = 'finished', home_score = 2, away_score = 1
WHERE id = '$MATCH_ID';

UPDATE public.official_events
SET status = 'completed', ends_at = now() - interval '1 minute'
WHERE id = '$EVENT_ID';
SQL

run_reconciliation >"$tmp_dir/reconcile-1.log" 2>&1 &
reconcile_pid_1=$!
run_reconciliation >"$tmp_dir/reconcile-2.log" 2>&1 &
reconcile_pid_2=$!
wait "$reconcile_pid_1"
wait "$reconcile_pid_2"

active_award_count="$("${psql_base[@]}" -Atqc "
  SELECT COUNT(*) FROM public.official_event_badge_awards
  WHERE event_id = '$EVENT_ID'
    AND user_id = '$PLAYER_ID'
    AND revoked_at IS NULL;
")"
duplicate_award_count="$("${psql_base[@]}" -Atqc "
  SELECT COUNT(*) FROM (
    SELECT user_id, rule_id
    FROM public.official_event_badge_awards
    WHERE event_id = '$EVENT_ID'
    GROUP BY user_id, rule_id
    HAVING COUNT(*) > 1
  ) AS duplicate;
")"
test "$active_award_count" = "2"
test "$duplicate_award_count" = "0"
echo "PASS concurrent reconciliation: one active award per earned rule"
