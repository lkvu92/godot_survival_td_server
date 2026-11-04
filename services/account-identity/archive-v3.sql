-- C232 v3: additive migration; existing v1/v2 jobs are never silently reinterpreted.
ALTER TABLE account_identity_deletions
 ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
 ADD COLUMN IF NOT EXISTS identity_released_at TIMESTAMPTZ,
 ADD COLUMN IF NOT EXISTS gameplay_purge_at TIMESTAMPTZ,
 ADD COLUMN IF NOT EXISTS gameplay_purged_at TIMESTAMPTZ,
 ADD COLUMN IF NOT EXISTS subject_manifest JSONB,
 ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 ADD COLUMN IF NOT EXISTS last_error_code TEXT;
ALTER TABLE account_retention_archives ADD COLUMN IF NOT EXISTS key_id TEXT,
 ADD COLUMN IF NOT EXISTS content_digest TEXT,
 ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS account_archive_audit(
 id BIGSERIAL PRIMARY KEY,deletion_id UUID NOT NULL REFERENCES account_identity_deletions(id),
 action TEXT NOT NULL,result JSONB NOT NULL DEFAULT '{}',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS account_archive_holds(
 id UUID PRIMARY KEY,deletion_id UUID NOT NULL REFERENCES account_identity_deletions(id),
 action TEXT NOT NULL CHECK(action IN('all','archive','gameplay_purge','identity_expiry')),
 actor TEXT NOT NULL,reason TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 released_at TIMESTAMPTZ,released_by TEXT
);
CREATE TABLE IF NOT EXISTS account_archive_worker_state(name TEXT PRIMARY KEY,next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
INSERT INTO account_archive_worker_state(name) VALUES('gameplay') ON CONFLICT DO NOTHING;

-- One account (including aliases) = one transactional checkpoint. No native user delete,
-- no billing/transaction/replay table mutation. No PII lookups by reused email/phone.
CREATE OR REPLACE FUNCTION account_gameplay_cleanup_v1(job_id UUID) RETURNS VOID LANGUAGE plpgsql AS $purge$
DECLARE job account_identity_deletions%ROWTYPE; subjects UUID[]; tbl TEXT; field TEXT; n BIGINT; deleted_storage BIGINT;
BEGIN
 RAISE EXCEPTION 'Automatic gameplay cleanup is disabled; hard deletion requires a separate workflow';
 SELECT * INTO job FROM account_identity_deletions WHERE id=job_id FOR UPDATE;
 IF NOT FOUND OR job.flow_version<>3 OR job.status<>'archived' OR job.gameplay_purge_at IS NULL
  OR job.gameplay_purge_at>clock_timestamp() OR job.identity_released_at IS NULL OR job.hold THEN RAISE EXCEPTION 'Gameplay purge not authorized'; END IF;
 IF EXISTS(SELECT 1 FROM account_archive_holds WHERE deletion_id=job_id AND released_at IS NULL AND action IN('all','gameplay_purge'))
  OR NOT EXISTS(SELECT 1 FROM account_retention_archives WHERE deletion_id=job_id AND (payload<>'' OR expired_at IS NOT NULL) AND NOT hold) THEN RAISE EXCEPTION 'Archive/hold guard'; END IF;
 IF NOT EXISTS(SELECT 1 FROM remote_config_releases WHERE config_version=(SELECT max(config_version) FROM remote_config_releases)
  AND snapshot#>'{system,account_deletion,schema_version}'='2'::jsonb
  AND snapshot#>'{system,account_deletion,enabled}'='true'::jsonb
  AND snapshot#>'{system,account_deletion,gameplay_purge_enabled}'='true'::jsonb) THEN RAISE EXCEPTION 'Purge disabled'; END IF;
 SELECT array_agg(v::uuid) INTO subjects FROM jsonb_array_elements_text(job.subject_manifest) v;
 IF subjects IS NULL OR cardinality(subjects)=0 OR NOT job.user_id=ANY(subjects)
  OR '00000000-0000-0000-0000-000000000000'::uuid=ANY(subjects) THEN RAISE EXCEPTION 'Invalid subject manifest'; END IF;
 IF EXISTS(SELECT 1 FROM users WHERE id=ANY(subjects) AND (email IS NOT NULL OR google_id IS NOT NULL OR password IS NOT NULL OR disable_time<=to_timestamp(0))) THEN RAISE EXCEPTION 'Identity still active'; END IF;
 IF EXISTS(SELECT 1 FROM account_link_state WHERE user_id=ANY(subjects) AND active_requests>0) THEN RAISE EXCEPTION 'Active leases'; END IF;
 PERFORM server_id FROM game_servers WHERE server_id IN(SELECT server_id FROM player_characters WHERE account_id=ANY(subjects)) ORDER BY server_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM server_lifecycle_jobs j JOIN player_characters c ON c.server_id=j.server_id WHERE c.account_id=ANY(subjects) AND j.status<>'succeeded') THEN RAISE EXCEPTION 'Lifecycle busy'; END IF;
 -- Account-owned storage is game state; system-owned purchase replay/audit rows stay.
 -- Retention archive has already removed account-owned activation/OTP identity data.
 -- C251 receipts are not gameplay. Keep until their separate approved retention policy exists.
 DELETE FROM storage WHERE user_id=ANY(subjects) AND collection<>'privacy_consent'; GET DIAGNOSTICS deleted_storage=ROW_COUNT;
 DELETE FROM player_characters WHERE account_id=ANY(subjects);
 DELETE FROM player_server_preferences WHERE account_id=ANY(subjects);
 FOREACH tbl IN ARRAY ARRAY['server_weekly_scores','server_weekly_awards','weekly_leaderboard_scores','weekly_leaderboard_awards',
  'sweep_worker_claims','player_vip_credits','player_monetization_entitlements','monetization_daily_reward_claims','monetization_daily_fragment_rewards',
  'compliance_playtime','player_health_activity','notification'] LOOP
  EXECUTE format('DELETE FROM %I WHERE user_id::text=ANY($1)',tbl) USING subjects::text[];
 END LOOP;
 DELETE FROM leaderboard_record WHERE owner_id=ANY(subjects);
 UPDATE users SET wallet='{}',update_time=NOW() WHERE id=ANY(subjects);
 -- Old merge/lifecycle snapshots must not resurrect gameplay. Keep financial tables.
 DELETE FROM account_link_server_tasks WHERE loser_id=ANY(subjects) OR winner_id=ANY(subjects);
 DELETE FROM account_link_archives WHERE loser_id=ANY(subjects) OR winner_id=ANY(subjects);
 DELETE FROM account_link_intents WHERE initiator=ANY(subjects) OR other_id=ANY(subjects) OR winner_id=ANY(subjects);
 FOREACH field IN ARRAY ARRAY['storage','characters','weekly_scores','weekly_awards'] LOOP
  UPDATE server_operation_plans p SET manifest=jsonb_set(p.manifest,ARRAY[field],
   COALESCE((SELECT jsonb_agg(v) FROM jsonb_array_elements(COALESCE(p.manifest->field,'[]'::jsonb)) v
    WHERE NOT COALESCE(v->>'user_id',v->>'account_id','')=ANY(subjects::text[])),'[]'::jsonb)),manifest_hash='redacted:C232v3'
   WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(p.manifest->field,'[]'::jsonb)) v WHERE COALESCE(v->>'user_id',v->>'account_id','')=ANY(subjects::text[]));
 END LOOP;
 SELECT count(*) INTO n FROM storage WHERE user_id=ANY(subjects) AND collection<>'privacy_consent';
 IF n<>0 OR EXISTS(SELECT 1 FROM player_characters WHERE account_id=ANY(subjects)) THEN RAISE EXCEPTION 'Gameplay reconciliation failed'; END IF;
 UPDATE account_identity_deletions SET status='gameplay_purged',gameplay_purged_at=clock_timestamp(),updated_at=NOW(),last_error_code=NULL WHERE id=job_id;
 INSERT INTO account_archive_audit(deletion_id,action,result) VALUES(job_id,'gameplay_purged',jsonb_build_object('subjects',cardinality(subjects),'deleted_storage',deleted_storage,'remaining_storage',n));
END $purge$;
