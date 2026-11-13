-- Existing entitlements foundation is deployed. Rebind only the subscriber FK
-- to the same internal player UUID used by Clerk and game data. No subscription,
-- plan, entitlement, role, payment status, reader or permission is changed.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '20s';

DO $$
DECLARE old_fk pg_catalog.pg_constraint%ROWTYPE;
  subscriber_column smallint; auth_id_column smallint;
BEGIN
  SELECT attnum INTO subscriber_column FROM pg_catalog.pg_attribute
    WHERE attrelid='public.subscriptions'::regclass AND attname='user_id' AND NOT attisdropped;
  SELECT attnum INTO auth_id_column FROM pg_catalog.pg_attribute
    WHERE attrelid='auth.users'::regclass AND attname='id' AND NOT attisdropped;
  SELECT * INTO old_fk FROM pg_catalog.pg_constraint
    WHERE conrelid='public.subscriptions'::regclass AND conname='subscriptions_user_id_fkey';
  IF old_fk.oid IS NULL OR old_fk.contype<>'f' OR NOT old_fk.convalidated
    OR old_fk.confrelid<>'auth.users'::regclass
    OR old_fk.conkey IS DISTINCT FROM ARRAY[subscriber_column]::smallint[]
    OR old_fk.confkey IS DISTINCT FROM ARRAY[auth_id_column]::smallint[]
    OR old_fk.confdeltype<>'c' OR old_fk.confupdtype<>'a' OR old_fk.confmatchtype<>'s'
    OR old_fk.condeferrable OR old_fk.condeferred THEN
    RAISE EXCEPTION 'Unexpected subscriber identity constraint. Inspect schema before migration.'
      USING ERRCODE='55000';
  END IF;
  IF EXISTS (SELECT 1 FROM public.subscriptions subscription
    WHERE NOT EXISTS (SELECT 1 FROM public.profiles player WHERE player.id=subscription.user_id)) THEN
    RAISE EXCEPTION 'Subscriber UUID has no corresponding player. No automatic identity remapping is allowed.'
      USING ERRCODE='23503';
  END IF;
END;
$$;

ALTER TABLE public.subscriptions DROP CONSTRAINT subscriptions_user_id_fkey;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE public.subscriptions VALIDATE CONSTRAINT subscriptions_user_id_fkey;
