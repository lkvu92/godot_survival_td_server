BEGIN;
LOCK TABLE remote_config_releases IN EXCLUSIVE MODE;
INSERT INTO remote_config_settings(module,key,value_type,value,description,updated_by)
VALUES('system','account_history','json','{"schema_version":1,"revision":1,"page_size":10,"max_page_size":30,"allowed_statuses":["pending","validated","fulfilled","failed","cancelled","expired","voided","granted","verified","consumed"],"display_utc_offset_seconds":25200}','B2 customer history read policy','c245-local')
ON CONFLICT(module,key) DO UPDATE SET value=EXCLUDED.value,value_type='json',updated_at=NOW(),updated_by='c245-local';
INSERT INTO remote_config_releases(config_version,snapshot,min_app_version,latest_app_version,store_url,published_by)
SELECT config_version+1,jsonb_set(snapshot,'{system,account_history}',(SELECT value::jsonb FROM remote_config_settings WHERE module='system' AND key='account_history')),min_app_version,latest_app_version,store_url,'c245-local'
FROM remote_config_releases ORDER BY config_version DESC LIMIT 1;
COMMIT;
