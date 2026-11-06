-- Long-term picks cannot carry earned points into another lobby/tournament.
-- Keep the existing deadline (first kickoff; no fixtures means still open).
CREATE FUNCTION tipovacka_private.protect_longterm_prediction_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF (current_user = 'authenticated' OR auth.jwt()->>'role' = 'authenticated')
     AND (NEW.id IS DISTINCT FROM OLD.id
       OR NEW.lobby_id IS DISTINCT FROM OLD.lobby_id
       OR NEW.tournament_id IS DISTINCT FROM OLD.tournament_id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.prediction_type IS DISTINCT FROM OLD.prediction_type) THEN
    RAISE EXCEPTION 'Prediction identity and context are immutable.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION tipovacka_private.protect_longterm_prediction_context() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER protect_longterm_prediction_context
BEFORE UPDATE ON public.longterm_predictions
FOR EACH ROW EXECUTE FUNCTION tipovacka_private.protect_longterm_prediction_context();

-- USING evaluates OLD, closing the lock escape before WITH CHECK sees NEW.
ALTER POLICY "Longterm predictions update policy" ON public.longterm_predictions
USING (
  user_id = (SELECT public.current_player_id())
  AND public.is_lobby_member(lobby_id)
  AND EXISTS (
    SELECT 1 FROM public.lobby_tournaments AS lt
    WHERE lt.lobby_id = longterm_predictions.lobby_id
      AND lt.tournament_id = longterm_predictions.tournament_id
  )
  AND (
    NOT EXISTS (
      SELECT 1 FROM public.matches AS m
      WHERE m.tournament_id = longterm_predictions.tournament_id
    )
    OR now() < (
      SELECT min(m.start_time_utc) FROM public.matches AS m
      WHERE m.tournament_id = longterm_predictions.tournament_id
    )
  )
);
