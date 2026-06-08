-- =========================================================================
-- ROLLBACK TEST MATCHES FOR IMPORT PIPELINE
-- File: supabase/seed/rollback_test_matches.sql
-- Description: Idempotent script to clean up test records with 'manual-test' provider.
-- =========================================================================

DELETE FROM public.matches 
WHERE provider_name = 'manual-test';
