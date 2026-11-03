-- Reviewed local-only policy install. Immutable previous releases are preserved.
BEGIN;
LOCK TABLE remote_config_releases IN EXCLUSIVE MODE;
INSERT INTO remote_config_settings(module,key,value_type,value,description,updated_by)
VALUES('system','payment_reconciliation','json','{"schema_version":1,"revision":1,"lookback_days":30,"pending_grace_seconds":86400,"delivery_grace_seconds":600}','B1 read-only reconciliation policy','c244-local')
ON CONFLICT(module,key) DO UPDATE SET value=EXCLUDED.value,value_type='json',updated_at=NOW(),updated_by='c244-local';
INSERT INTO remote_config_releases(config_version,snapshot,min_app_version,latest_app_version,store_url,published_by)
SELECT config_version+1,jsonb_set(snapshot,'{system,payment_reconciliation}',(SELECT value::jsonb FROM remote_config_settings WHERE module='system' AND key='payment_reconciliation')),min_app_version,latest_app_version,store_url,'c244-local'
FROM remote_config_releases ORDER BY config_version DESC LIMIT 1;
COMMIT;
