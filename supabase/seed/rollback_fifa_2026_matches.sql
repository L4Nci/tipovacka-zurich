-- =========================================================================
-- Rollback for FIFA 2026 Matches Data
-- File: supabase/seed/rollback_fifa_2026_matches.sql
-- =========================================================================

DELETE FROM public.matches 
WHERE provider_name = 'manual-fifa-2026';

RAISE NOTICE 'Rollback finished: All manual-fifa-2026 matches were removed.';
