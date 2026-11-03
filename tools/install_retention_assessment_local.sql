-- Local operator opt-in to read-only reporting, NOT retention enforcement or purge.
BEGIN;
LOCK TABLE remote_config_releases IN EXCLUSIVE MODE;
INSERT INTO remote_config_settings(module,key,value_type,value,description,updated_by)
VALUES('system','retention_assessment','json','{"schema_version":1,"revision":1,"enabled":true,"minimum_calendar_months":6,"trigger":"explicit_service_stop","legal_reviewed":false}','C249 local report only; no deletion or legal approval','c249-local')
ON CONFLICT(module,key) DO NOTHING;
INSERT INTO remote_config_releases(config_version,snapshot,min_app_version,latest_app_version,store_url,published_by)
SELECT config_version+1,jsonb_set(snapshot,'{system,retention_assessment}',(SELECT value::jsonb FROM remote_config_settings WHERE module='system' AND key='retention_assessment')),min_app_version,latest_app_version,store_url,'c249-local'
FROM remote_config_releases WHERE (SELECT count(*) FROM remote_config_settings WHERE module='system' AND key='retention_assessment')=1 ORDER BY config_version DESC LIMIT 1;
COMMIT;
