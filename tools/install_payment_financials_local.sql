-- Disabled until Google Orders permission and test order have been validated.
BEGIN;
LOCK TABLE remote_config_releases IN EXCLUSIVE MODE;
INSERT INTO remote_config_settings(module,key,value_type,value,description,updated_by)
VALUES('system','payment_financials','json','{"schema_version":1,"revision":1,"enabled":false,"batch_size":20,"retry_seconds":300,"resync_seconds":86400,"lookback_days":365}','C246 Google financial sync (permission approval required)','c246-local')
ON CONFLICT(module,key) DO UPDATE SET value=EXCLUDED.value,value_type='json',updated_at=NOW(),updated_by='c246-local';
INSERT INTO remote_config_releases(config_version,snapshot,min_app_version,latest_app_version,store_url,published_by)
SELECT config_version+1,jsonb_set(snapshot,'{system,payment_financials}',(SELECT value::jsonb FROM remote_config_settings WHERE module='system' AND key='payment_financials')),min_app_version,latest_app_version,store_url,'c246-local'
FROM remote_config_releases ORDER BY config_version DESC LIMIT 1;
COMMIT;
