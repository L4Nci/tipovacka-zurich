-- Mirror savePrediction's existing result guard in the database as well.
-- A stale future lock time must not allow a tip once a result is known.
-- Membership, ownership, timing and point calculation remain the existing rules.
ALTER POLICY "Predictions write own policy" ON public.predictions
WITH CHECK (
  user_id = (SELECT public.current_player_id())
  AND public.is_lobby_member(lobby_id)
  AND EXISTS (
    SELECT 1
    FROM public.matches AS match
    JOIN public.lobby_tournaments AS lobby_tournament
      ON lobby_tournament.tournament_id = match.tournament_id
    WHERE match.id = predictions.match_id
      AND lobby_tournament.lobby_id = predictions.lobby_id
      AND now() < match.lock_time_utc
      AND match.status IS DISTINCT FROM 'finished'
      AND match.home_score IS NULL
      AND match.away_score IS NULL
  )
);

ALTER POLICY "Predictions update own policy" ON public.predictions
USING (
  user_id = (SELECT public.current_player_id())
  AND public.is_lobby_member(lobby_id)
  AND EXISTS (
    SELECT 1
    FROM public.matches AS match
    JOIN public.lobby_tournaments AS lobby_tournament
      ON lobby_tournament.tournament_id = match.tournament_id
    WHERE match.id = predictions.match_id
      AND lobby_tournament.lobby_id = predictions.lobby_id
      AND now() < match.lock_time_utc
      AND match.status IS DISTINCT FROM 'finished'
      AND match.home_score IS NULL
      AND match.away_score IS NULL
  )
)
WITH CHECK (
  user_id = (SELECT public.current_player_id())
  AND public.is_lobby_member(lobby_id)
  AND EXISTS (
    SELECT 1
    FROM public.matches AS match
    JOIN public.lobby_tournaments AS lobby_tournament
      ON lobby_tournament.tournament_id = match.tournament_id
    WHERE match.id = predictions.match_id
      AND lobby_tournament.lobby_id = predictions.lobby_id
      AND now() < match.lock_time_utc
      AND match.status IS DISTINCT FROM 'finished'
      AND match.home_score IS NULL
      AND match.away_score IS NULL
  )
);
