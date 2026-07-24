#!/usr/bin/env bash
set -euo pipefail

PGHOST="${PGHOST:-/private/tmp}"
PGPORT="${PGPORT:-55433}"
PGUSER="${PGUSER:-postgres}"
PGDATABASE="${PGDATABASE:-tipovacka_phase012_013}"

OWNER_ID="00000000-0000-4000-8000-000000000601"
ADMIN_ID="00000000-0000-4000-8000-000000000602"
MEMBER_ID="00000000-0000-4000-8000-000000000603"
PLATFORM_ADMIN_ID="00000000-0000-4000-8000-000000000604"
OPEN_MEMBER_ID="00000000-0000-4000-8000-000000000605"
LOBBY_ID="phase-012-concurrency-lobby"
JOIN_CODE="PHASE012CONCURRENT"
TOURNAMENT_ID="phase-012-concurrency-tournament"
SPORT_ID="phase-012-concurrency-sport"

psql_base=(psql -X -v ON_ERROR_STOP=1 -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE")
tmp_dir="$(mktemp -d)"

cleanup() {
  "${psql_base[@]}" -q <<SQL >/dev/null
DELETE FROM public.lobbies WHERE id = '$LOBBY_ID';
DELETE FROM auth.users
WHERE id IN (
  '$OWNER_ID',
  '$ADMIN_ID',
  '$MEMBER_ID',
  '$PLATFORM_ADMIN_ID',
  '$OPEN_MEMBER_ID'
);
DELETE FROM public.tournaments WHERE id = '$TOURNAMENT_ID';
DELETE FROM public.sports WHERE id = '$SPORT_ID';
SQL
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

run_as() {
  local user_id="$1"
  local sql="$2"
  "${psql_base[@]}" -q -c "
    BEGIN;
    SET LOCAL ROLE authenticated;
    SELECT set_config(
      'request.jwt.claims',
      '{\"sub\":\"$user_id\",\"role\":\"authenticated\"}',
      true
    );
    SELECT set_config('request.jwt.claim.sub', '$user_id', true);
    $sql
    COMMIT;
  "
}

"${psql_base[@]}" -q <<SQL
INSERT INTO public.sports (id, slug, name)
VALUES ('$SPORT_ID', '$SPORT_ID', 'Phase 012 Concurrency Sport');

INSERT INTO public.tournaments (id, sport_id, slug, name, status)
VALUES (
  '$TOURNAMENT_ID',
  '$SPORT_ID',
  '$TOURNAMENT_ID',
  'Phase 012 Concurrency Tournament',
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
SELECT
  '00000000-0000-0000-0000-000000000000',
  identity.id,
  'authenticated',
  'authenticated',
  identity.email,
  'not-a-real-password-hash',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('username', identity.username),
  now(),
  now()
FROM (
  VALUES
    ('$OWNER_ID'::uuid, 'phase-012-concurrency-owner@example.invalid', 'Concurrency Owner'),
    ('$ADMIN_ID'::uuid, 'phase-012-concurrency-admin@example.invalid', 'Concurrency Admin'),
    ('$MEMBER_ID'::uuid, 'phase-012-concurrency-member@example.invalid', 'Concurrency Member'),
    ('$PLATFORM_ADMIN_ID'::uuid, 'phase-012-concurrency-platform@example.invalid', 'Concurrency Platform Admin'),
    ('$OPEN_MEMBER_ID'::uuid, 'phase-012-concurrency-open@example.invalid', 'Concurrency Open Member')
) AS identity(id, email, username);

UPDATE public.profiles
SET role = 'admin'
WHERE id = '$PLATFORM_ADMIN_ID';

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
  'Phase 012 Concurrency Lobby',
  '$OWNER_ID',
  '$TOURNAMENT_ID',
  '$JOIN_CODE',
  'approval_required',
  'private'
);

INSERT INTO public.lobby_tournaments (lobby_id, tournament_id, status)
VALUES ('$LOBBY_ID', '$TOURNAMENT_ID', 'active');

INSERT INTO public.lobby_members (
  lobby_id,
  user_id,
  role,
  membership_status
)
VALUES
  ('$LOBBY_ID', '$OWNER_ID', 'member', 'active'),
  ('$LOBBY_ID', '$ADMIN_ID', 'admin', 'active');
SQL

run_as "$MEMBER_ID" "SELECT membership_state FROM public.join_lobby_secure('$JOIN_CODE');" \
  >"$tmp_dir/join-1.log" 2>&1 &
join_pid_1=$!
run_as "$MEMBER_ID" "SELECT membership_state FROM public.join_lobby_secure('$JOIN_CODE');" \
  >"$tmp_dir/join-2.log" 2>&1 &
join_pid_2=$!
wait "$join_pid_1"
wait "$join_pid_2"

join_count="$("${psql_base[@]}" -Atqc "
  SELECT count(*)
  FROM public.lobby_join_requests
  WHERE lobby_id = '$LOBBY_ID'
    AND user_id = '$MEMBER_ID'
    AND status = 'pending';
")"
membership_count="$("${psql_base[@]}" -Atqc "
  SELECT count(*)
  FROM public.lobby_members
  WHERE lobby_id = '$LOBBY_ID'
    AND user_id = '$MEMBER_ID';
")"
test "$join_count" = "1"
test "$membership_count" = "0"
echo "PASS concurrent join: one pending request, no membership"

request_id="$("${psql_base[@]}" -Atqc "
  SELECT id
  FROM public.lobby_join_requests
  WHERE lobby_id = '$LOBBY_ID'
    AND user_id = '$MEMBER_ID'
    AND status = 'pending';
")"

run_as "$OWNER_ID" "SELECT public.resolve_lobby_join_request('$request_id', 'approved');" \
  >"$tmp_dir/approve-owner.log" 2>&1 &
approve_pid_1=$!
run_as "$ADMIN_ID" "SELECT public.resolve_lobby_join_request('$request_id', 'approved');" \
  >"$tmp_dir/approve-admin.log" 2>&1 &
approve_pid_2=$!
wait "$approve_pid_1"
wait "$approve_pid_2"

approved_count="$("${psql_base[@]}" -Atqc "
  SELECT count(*)
  FROM public.lobby_join_requests
  WHERE id = '$request_id'
    AND status = 'approved';
")"
active_count="$("${psql_base[@]}" -Atqc "
  SELECT count(*)
  FROM public.lobby_members
  WHERE lobby_id = '$LOBBY_ID'
    AND user_id = '$MEMBER_ID'
    AND membership_status = 'active';
")"
test "$approved_count" = "1"
test "$active_count" = "1"
echo "PASS concurrent approval: one approved request, one active membership"

run_as "$OWNER_ID" "SELECT public.remove_lobby_member_secure('$LOBBY_ID', '$MEMBER_ID');" \
  >"$tmp_dir/remove-owner.log" 2>&1 &
remove_pid_1=$!
run_as "$ADMIN_ID" "SELECT public.remove_lobby_member_secure('$LOBBY_ID', '$MEMBER_ID');" \
  >"$tmp_dir/remove-admin.log" 2>&1 &
remove_pid_2=$!
wait "$remove_pid_1"
wait "$remove_pid_2"

removed_count="$("${psql_base[@]}" -Atqc "
  SELECT count(*)
  FROM public.lobby_members
  WHERE lobby_id = '$LOBBY_ID'
    AND user_id = '$MEMBER_ID'
    AND membership_status = 'removed'
    AND ended_at IS NOT NULL;
")"
test "$removed_count" = "1"
echo "PASS concurrent remove: one removed membership"

run_as "$OWNER_ID" "SELECT public.restore_lobby_member_secure('$LOBBY_ID', '$MEMBER_ID');" \
  >"$tmp_dir/restore-owner.log" 2>&1 &
restore_pid_1=$!
run_as "$PLATFORM_ADMIN_ID" "SELECT public.restore_lobby_member_secure('$LOBBY_ID', '$MEMBER_ID');" \
  >"$tmp_dir/restore-platform.log" 2>&1 &
restore_pid_2=$!
wait "$restore_pid_1"
wait "$restore_pid_2"

restored_count="$("${psql_base[@]}" -Atqc "
  SELECT count(*)
  FROM public.lobby_members
  WHERE lobby_id = '$LOBBY_ID'
    AND user_id = '$MEMBER_ID'
    AND membership_status = 'active'
    AND ended_at IS NULL
    AND ended_by IS NULL;
")"
test "$restored_count" = "1"
echo "PASS concurrent restore: one active membership"

"${psql_base[@]}" -q -c "
  UPDATE public.lobbies
  SET join_policy = 'open'
  WHERE id = '$LOBBY_ID';
"

run_as "$OPEN_MEMBER_ID" "SELECT membership_state FROM public.join_lobby_secure('$JOIN_CODE');" \
  >"$tmp_dir/open-join-1.log" 2>&1 &
open_join_pid_1=$!
run_as "$OPEN_MEMBER_ID" "SELECT membership_state FROM public.join_lobby_secure('$JOIN_CODE');" \
  >"$tmp_dir/open-join-2.log" 2>&1 &
open_join_pid_2=$!
wait "$open_join_pid_1"
wait "$open_join_pid_2"

open_membership_count="$("${psql_base[@]}" -Atqc "
  SELECT count(*)
  FROM public.lobby_members
  WHERE lobby_id = '$LOBBY_ID'
    AND user_id = '$OPEN_MEMBER_ID'
    AND membership_status = 'active';
")"
test "$open_membership_count" = "1"
echo "PASS concurrent open join: one active membership, both calls succeed"

echo "Phase 012/013 concurrency scenarios passed."
