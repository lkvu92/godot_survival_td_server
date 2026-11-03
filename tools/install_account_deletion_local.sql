-- LOCAL ONLY. Existing v2 jobs require explicit migration, never silent reinterpretation.
BEGIN;
LOCK TABLE remote_config_releases IN EXCLUSIVE MODE;
DO $guard$ BEGIN IF EXISTS(SELECT 1 FROM account_identity_deletions WHERE status<>'cancelled' AND flow_version<3) THEN RAISE EXCEPTION 'Legacy jobs require inventory/migration review'; END IF; END $guard$;
INSERT INTO remote_config_settings(module,key,value_type,value,description,updated_by)
VALUES('system','account_deletion','json','{"schema_version":2,"revision":"local-archive-v3-1","enabled":true,"timezone":"Asia/Ho_Chi_Minh","soft_delete_days":14,"restore_before_deadline_only":true,"identity_release_event":"archive_committed","minimal_user_mode":"retained_tombstone","archive_transition_enabled":true,"gameplay_purge_enabled":true,"retention_key_id":"local-retention-v1","notice_template_revision":"archive-1","worker":{"scan_interval_seconds":86400,"batch_size":50,"lease_seconds":120,"retry_backoff_seconds":60,"max_attempts":12},"reauth":{"google_max_age_seconds":300,"email_link_ttl_seconds":900},"datasets":[{"id":"gameplay","processor":"account_gameplay_cleanup_v1","trigger":"archive_committed","calendar_months":3},{"id":"player_identity","processor":"protected_identity_archive_v1","trigger":"confirmed_deletion","calendar_months":6},{"id":"billing_transaction","mode":"retain_review_required"},{"id":"minimal_user","mode":"retain_review_required"}]}','C232 v3 local:14-day restore, archive releases identity,3-calendar-month gameplay cleanup','c232-v3-local')
ON CONFLICT(module,key) DO UPDATE SET value=EXCLUDED.value,value_type='json',updated_by=EXCLUDED.updated_by,updated_at=NOW();
INSERT INTO remote_config_releases(config_version,snapshot,min_app_version,latest_app_version,store_url,published_by)
SELECT config_version+1,jsonb_set(snapshot,'{system,account_deletion}',(SELECT value::jsonb FROM remote_config_settings WHERE module='system' AND key='account_deletion')),min_app_version,latest_app_version,store_url,'c232-v3-local'
FROM remote_config_releases ORDER BY config_version DESC LIMIT 1;
SELECT config_version,snapshot#>'{system,account_deletion}' AS policy FROM remote_config_releases ORDER BY config_version DESC LIMIT 1;
COMMIT;
