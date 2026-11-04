-- C263 audit foundation. Run through controlled migration.
-- Runtime must also require the existing CONFIG_ADMIN_USER_ID authorization.
BEGIN;
CREATE TABLE IF NOT EXISTS player_data_access_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id UUID NOT NULL,
  subject_id UUID,
  action TEXT NOT NULL CHECK (action IN ('search','read','export_create','export_download','export_cancel','audit_read','capability_grant','capability_revoke')),
  dataset TEXT CHECK (dataset IS NULL OR dataset IN ('account','identity','playtime','inventory','asset_history','payments')),
  outcome TEXT NOT NULL CHECK (outcome IN ('allowed','denied','failed')),
  request_id UUID,
  reason_code TEXT CHECK (reason_code IS NULL OR reason_code ~ '^[A-Z0-9_]{1,64}$')
);
CREATE INDEX IF NOT EXISTS player_data_access_audit_actor_time_idx ON player_data_access_audit(actor_id, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS player_data_access_audit_subject_time_idx ON player_data_access_audit(subject_id, occurred_at DESC, id DESC);
-- Separate non-owner runtime/operator DB roles and revoke UPDATE/DELETE/TRUNCATE on audit
-- during deployment. An owner/superuser can bypass privileges; independent audit storage,
-- retention and grants require environment-specific review before production.
COMMIT;
