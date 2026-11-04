-- Apply with the C232 v3.4 service rollout. This affects automatic archive cleanup,
-- not the separate server lifecycle or native hard-delete operations.
BEGIN;
CREATE OR REPLACE FUNCTION account_gameplay_cleanup_v1(job_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $disabled$
BEGIN
  RAISE EXCEPTION 'Automatic gameplay cleanup is disabled; hard deletion requires a separate workflow';
END $disabled$;
COMMIT;
