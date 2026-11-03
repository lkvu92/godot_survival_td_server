-- Local-only migration, preserves all existing policy fields; publishes next release.
BEGIN;
LOCK TABLE remote_config_releases IN EXCLUSIVE MODE;
UPDATE remote_config_settings SET value=(value::jsonb || jsonb_build_object('revision',(value::jsonb->>'revision')::int+1,'otp_rate_window_seconds',3600,'otp_rate_account_max',5,'otp_rate_phone_max',5,'otp_rate_ip_max',30,'guardian_phone_max_accounts',3)),updated_by='c248-rate-local',updated_at=NOW() WHERE module='system' AND key='compliance_policy';
INSERT INTO remote_config_releases(config_version,snapshot,min_app_version,latest_app_version,store_url,published_by)
SELECT config_version+1,jsonb_set(snapshot,'{system,compliance_policy}',(SELECT value::jsonb FROM remote_config_settings WHERE module='system' AND key='compliance_policy')),min_app_version,latest_app_version,store_url,'c248-rate-local' FROM remote_config_releases WHERE (SELECT count(*) FROM remote_config_settings WHERE module='system' AND key='compliance_policy')=1 ORDER BY config_version DESC LIMIT 1;
COMMIT;
