-- Local-only operator script. Clones the active snapshot; changes this key only.
BEGIN;
LOCK TABLE remote_config_releases IN EXCLUSIVE MODE;
INSERT INTO remote_config_settings(module,key,value_type,value,description,updated_by)
VALUES('system','compliance_policy','json','{"schema_version":1,"revision":2,"game_id":"thong_thien_lo","guardian_below_age":16,"guardian_phone_max_accounts":3,"provider":"mock","otp_ttl_seconds":300,"otp_max_attempts":5,"otp_resend_seconds":60,"otp_rate_window_seconds":3600,"otp_rate_account_max":5,"otp_rate_phone_max":5,"otp_rate_ip_max":30,"lease_seconds":45,"age_bands":[{"below_age":18,"per_game_seconds":3600,"total_seconds":10800}],"notice":"Theo quy \u0111\u1ecbnh c\u1ee7a ph\u00e1p lu\u1eadt Vi\u1ec7t Nam, \u0111\u1ea1o h\u1eefu c\u1ea7n x\u00e1c th\u1ef1c s\u1ed1 \u0111i\u1ec7n tho\u1ea1i di \u0111\u1ed9ng \u0111\u1ec3 k\u00edch ho\u1ea1t quy\u1ec1n tham gia tr\u00f2 ch\u01a1i."}','C243 mock soft gate; not real phone verification','c243-local')
ON CONFLICT(module,key) DO UPDATE SET value=EXCLUDED.value,value_type='json',updated_by='c243-local',updated_at=NOW();
INSERT INTO remote_config_releases(config_version,snapshot,min_app_version,latest_app_version,store_url,published_by)
SELECT config_version+1,jsonb_set(snapshot,'{system,compliance_policy}',(SELECT value::jsonb FROM remote_config_settings WHERE module='system' AND key='compliance_policy')),min_app_version,latest_app_version,store_url,'c243-local'
FROM remote_config_releases ORDER BY config_version DESC LIMIT 1;
COMMIT;
