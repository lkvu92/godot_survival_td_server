-- Local-only: publish a new snapshot preserving all unrelated policy fields.
BEGIN;
LOCK TABLE remote_config_releases IN EXCLUSIVE MODE;
UPDATE remote_config_settings SET value=(value::jsonb || jsonb_build_object('revision',(value::jsonb->>'revision')::int+1,'guardian_phone_max_accounts',3)),updated_by='c247-phone-local',updated_at=NOW() WHERE module='system' AND key='compliance_policy';
INSERT INTO remote_config_releases(config_version,snapshot,min_app_version,latest_app_version,store_url,published_by)
SELECT config_version+1,jsonb_set(snapshot,'{system,compliance_policy}',(SELECT value::jsonb FROM remote_config_settings WHERE module='system' AND key='compliance_policy')),min_app_version,latest_app_version,store_url,'c247-phone-local' FROM remote_config_releases WHERE (SELECT count(*) FROM remote_config_settings WHERE module='system' AND key='compliance_policy')=1 ORDER BY config_version DESC LIMIT 1;
COMMIT;
