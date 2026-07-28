#!/usr/bin/env bash
set -euo pipefail

PGHOST="${PGHOST:-/private/tmp}"
PGPORT="${PGPORT:-55435}"
PGUSER="${PGUSER:-postgres}"
PGDATABASE="${PGDATABASE:-tipovacka_official_events}"

OWNER_ID="00000000-0000-4000-8000-000000000931"
PLAYER_ID="00000000-0000-4000-8000-000000000932"
EVENT_ID="00000000-0000-4000-8000-000000000933"
TOURNAMENT_ID="official-concurrency-tournament"
SPORT_ID="official-concurrency-sport"
MATCH_ID="official-concurrency-match"

psql_base=(psql -X -v ON_ERROR_STOP=1 -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE")
tmp_dir="$(mktemp -d)"

cleanup() {
  "${psql_base[@]}" -q <<SQL >/dev/null
DELETE FROM public.official_events WHERE id = '$EVENT_ID';
DELETE FROM public.matches WHERE id = '$MATCH_ID';
DELETE FROM auth.users WHERE id IN ('$OWNER_ID', '$PLAYER_ID');
DELETE FROM public.participants WHERE sport_id = '$SPORT_ID';
DELETE FROM public.tournaments WHERE id = '$TOURNAMENT_ID';
DELETE FROM public.sports WHERE id = '$SPORT_ID';
SQL
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

"${psql_base[@]}" -q <<SQL
INSERT INTO public.sports (id, slug, name)
VALUES ('$SPORT_ID', '$SPORT_ID', 'Official Concurrency Sport');
INSERT INTO public.participants (id, sport_id, name)
VALUES
  ('official-concurrency-home', '$SPORT_ID', 'Concurrency Home'),
  ('official-concurrency-away', '$SPORT_ID', 'Concurrency Away');
INSERT INTO public.tournaments (id, sport_id, slug, name, status)
VALUES ('$TOURNAMENT_ID', '$SPORT_ID', '$TOURNAMENT_ID', 'Official Concurrency', 'active');
INSERT INTO public.matches (
  id, tournament_id, home_participant_id, away_participant_id,
  start_time_utc, lock_time_utc, status
)
VALUES (
  '$MATCH_ID', '$TOURNAMENT_ID',
  'official-concurrency-home', 'official-concurrency-away',
  now() + interval '2 days', now() + interval '2 days' - interval '5 minutes',
  'scheduled'
);
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  (
    '00000000-0000-0000-0000-000000000000', '$OWNER_ID',
    'authenticated', 'authenticated', 'official-concurrency-owner@example.invalid',
    'not-a-real-password-hash', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"Official Concurrency Owner"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000', '$PLAYER_ID',
    'authenticated', 'authenticated', 'official-concurrency-player@example.invalid',
    'not-a-real-password-hash', now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"Official Concurrency Player"}'::jsonb, now(), now()
  );
INSERT INTO public.official_events (
  id, slug, name, tournament_id, status, registration_opens_at,
  registration_closes_at, ends_at, featured, onboarding_eligible, created_by
)
VALUES (
  '$EVENT_ID', 'official-concurrency-event', 'Official Concurrency Event',
  '$TOURNAMENT_ID', 'active', now() - interval '1 day',
  now() + interval '1 day', now() + interval '5 days', true, true, '$OWNER_ID'
);
SQL

run_join() {
  "${psql_base[@]}" -Atq -c "
    BEGIN;
    SET LOCAL ROLE authenticated;
    SELECT set_config(
      'request.jwt.claims',
      '{\"sub\":\"$PLAYER_ID\",\"role\":\"authenticated\"}',
      true
    );
    SELECT set_config('request.jwt.claim.sub', '$PLAYER_ID', true);
    SELECT public.join_official_event('$EVENT_ID')->>'state';
    COMMIT;
  "
}

run_join >"$tmp_dir/join-1.txt" &
pid_one=$!
run_join >"$tmp_dir/join-2.txt" &
pid_two=$!
wait "$pid_one"
wait "$pid_two"

sort "$tmp_dir/join-1.txt" "$tmp_dir/join-2.txt" >"$tmp_dir/join-states.txt"
if [[ "$(grep -c '^joined$' "$tmp_dir/join-states.txt")" -ne 1 ]] ||
   [[ "$(grep -c '^already_participating$' "$tmp_dir/join-states.txt")" -ne 1 ]]; then
  echo "Concurrent join was not idempotent." >&2
  exit 1
fi

# Hold the match share lock while the prediction row is still uncommitted.
"${psql_base[@]}" -q -c "
  BEGIN;
  SET LOCAL ROLE authenticated;
  SELECT set_config(
    'request.jwt.claims',
    '{\"sub\":\"$PLAYER_ID\",\"role\":\"authenticated\"}',
    true
  );
  SELECT set_config('request.jwt.claim.sub', '$PLAYER_ID', true);
  SELECT public.save_official_event_prediction('$EVENT_ID', '$MATCH_ID', 2, 1);
  SELECT pg_sleep(1);
  COMMIT;
" >"$tmp_dir/save.txt" &
save_pid=$!
sleep 0.2

set +e
"${psql_base[@]}" -q -c "
  BEGIN;
  SET LOCAL ROLE service_role;
  SELECT set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true);
  SELECT set_config('request.jwt.claim.role', 'service_role', true);
  SELECT public.apply_match_result_atomic(
    '$MATCH_ID', 2, 1, '[]'::jsonb, '[]'::jsonb, 'concurrency-test', 'test-runner'
  );
  COMMIT;
" >"$tmp_dir/stale-result.txt" 2>&1
stale_exit=$?
set -e
wait "$save_pid"

if [[ "$stale_exit" -eq 0 ]]; then
  echo "Stale result snapshot unexpectedly succeeded." >&2
  exit 1
fi

if [[ "$("${psql_base[@]}" -Atqc "SELECT status FROM public.matches WHERE id = '$MATCH_ID'")" != "scheduled" ]]; then
  echo "Failed result application changed the match." >&2
  exit 1
fi

"${psql_base[@]}" -q -c "
  BEGIN;
  SET LOCAL ROLE service_role;
  SELECT set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true);
  SELECT set_config('request.jwt.claim.role', 'service_role', true);
  SELECT public.apply_match_result_atomic(
    '$MATCH_ID',
    2,
    1,
    '[]'::jsonb,
    '[{
      \"user_id\":\"$PLAYER_ID\",
      \"event_id\":\"$EVENT_ID\",
      \"predicted_home_score\":2,
      \"predicted_away_score\":1,
      \"points_earned\":5
    }]'::jsonb,
    'concurrency-retry',
    'test-runner'
  );
  COMMIT;
"

if [[ "$("${psql_base[@]}" -Atqc "
  SELECT points_earned
  FROM public.official_event_predictions
  WHERE event_id = '$EVENT_ID' AND user_id = '$PLAYER_ID' AND match_id = '$MATCH_ID'
")" != "5" ]]; then
  echo "Retry did not score the event prediction." >&2
  exit 1
fi

echo "Official event concurrency scenarios passed."
