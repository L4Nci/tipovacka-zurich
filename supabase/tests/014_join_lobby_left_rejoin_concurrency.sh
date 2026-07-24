#!/usr/bin/env bash
set -euo pipefail

PGHOST="${PGHOST:-/private/tmp}"
PGPORT="${PGPORT:-55433}"
PGUSER="${PGUSER:-postgres}"
PGDATABASE="${PGDATABASE:-tipovacka_phase014}"

OWNER_ID="00000000-0000-4000-8000-000000000711"
MEMBER_ID="00000000-0000-4000-8000-000000000712"
LOBBY_ID="phase-014-concurrency-lobby"
JOIN_CODE="PHASE014CONCURRENT"
TOURNAMENT_ID="phase-014-concurrency-tournament"
SPORT_ID="phase-014-concurrency-sport"

psql_base=(psql -X -v ON_ERROR_STOP=1 -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE")
tmp_dir="$(mktemp -d)"

cleanup() {
  "${psql_base[@]}" -q <<SQL >/dev/null
DELETE FROM public.lobbies WHERE id = '$LOBBY_ID';
DELETE FROM auth.users WHERE id IN ('$OWNER_ID', '$MEMBER_ID');
DELETE FROM public.tournaments WHERE id = '$TOURNAMENT_ID';
DELETE FROM public.sports WHERE id = '$SPORT_ID';
SQL
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

run_join() {
  "${psql_base[@]}" -Atq -c "
    BEGIN;
    SET LOCAL ROLE authenticated;
    SELECT set_config(
      'request.jwt.claims',
      '{\"sub\":\"$MEMBER_ID\",\"role\":\"authenticated\"}',
      true
    );
    SELECT set_config('request.jwt.claim.sub', '$MEMBER_ID', true);
    SELECT membership_state
    FROM public.join_lobby_secure('$JOIN_CODE');
    COMMIT;
  "
}

"${psql_base[@]}" -q <<SQL
INSERT INTO public.sports (id, slug, name)
VALUES ('$SPORT_ID', '$SPORT_ID', 'Phase 014 Concurrency Sport');

INSERT INTO public.tournaments (id, sport_id, slug, name, status)
VALUES (
  '$TOURNAMENT_ID',
  '$SPORT_ID',
  '$TOURNAMENT_ID',
  'Phase 014 Concurrency Tournament',
  'active'
);

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
VALUES
  (
    '00000000-0000-0000-0000-000000000000',
    '$OWNER_ID',
    'authenticated',
    'authenticated',
    'phase-014-concurrency-owner@example.invalid',
    'not-a-real-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"Phase 014 Concurrency Owner"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '$MEMBER_ID',
    'authenticated',
    'authenticated',
    'phase-014-concurrency-member@example.invalid',
    'not-a-real-password-hash',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"Phase 014 Concurrency Member"}'::jsonb,
    now(),
    now()
  );

INSERT INTO public.lobbies (
  id,
  name,
  owner_id,
  tournament_id,
  join_code,
  join_policy,
  visibility
)
VALUES (
  '$LOBBY_ID',
  'Phase 014 Concurrency Lobby',
  '$OWNER_ID',
  '$TOURNAMENT_ID',
  '$JOIN_CODE',
  'open',
  'private'
);

INSERT INTO public.lobby_members (
  lobby_id,
  user_id,
  role,
  membership_status,
  ended_at,
  ended_by
)
VALUES
  ('$LOBBY_ID', '$OWNER_ID', 'member', 'active', NULL, NULL),
  ('$LOBBY_ID', '$MEMBER_ID', 'member', 'left', now(), '$MEMBER_ID');
SQL

run_join >"$tmp_dir/join-1.txt" &
pid_one=$!
run_join >"$tmp_dir/join-2.txt" &
pid_two=$!
wait "$pid_one"
wait "$pid_two"

sort "$tmp_dir/join-1.txt" "$tmp_dir/join-2.txt" >"$tmp_dir/states.txt"

if [[ "$(grep -c '^rejoined$' "$tmp_dir/states.txt")" -ne 1 ]]; then
  echo "Expected exactly one rejoined result." >&2
  exit 1
fi

if [[ "$(grep -c '^already_member$' "$tmp_dir/states.txt")" -ne 1 ]]; then
  echo "Expected exactly one already_member result." >&2
  exit 1
fi

membership_count="$("${psql_base[@]}" -Atqc "
  SELECT count(*)
  FROM public.lobby_members
  WHERE lobby_id = '$LOBBY_ID'
    AND user_id = '$MEMBER_ID';
")"

active_count="$("${psql_base[@]}" -Atqc "
  SELECT count(*)
  FROM public.lobby_members
  WHERE lobby_id = '$LOBBY_ID'
    AND user_id = '$MEMBER_ID'
    AND membership_status = 'active'
    AND role = 'member'
    AND ended_at IS NULL
    AND ended_by IS NULL;
")"

if [[ "$membership_count" != "1" || "$active_count" != "1" ]]; then
  echo "Concurrent rejoin violated membership invariants." >&2
  exit 1
fi

echo "Phase 014 concurrent left-rejoin scenario passed."
