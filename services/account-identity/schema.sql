CREATE TABLE IF NOT EXISTS account_identity_challenges (
 id UUID PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, purpose TEXT NOT NULL,
 email TEXT NOT NULL, user_id UUID, generation TEXT NOT NULL DEFAULT '',
 expires_at TIMESTAMPTZ NOT NULL, consumed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS identity_challenge_email_idx ON account_identity_challenges(email,purpose,created_at);
CREATE TABLE IF NOT EXISTS account_identity_outbox (
 challenge_id UUID PRIMARY KEY REFERENCES account_identity_challenges(id) ON DELETE CASCADE,
 payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', attempts INT NOT NULL DEFAULT 0,
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), lease_until TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS account_identity_rates(bucket TEXT PRIMARY KEY,count INT NOT NULL,expires_at TIMESTAMPTZ NOT NULL);

-- App-specific data inventory. All server/generation variants share account ownership.
-- Keep only purchase replay hash records under system owner; remove order payloads.
CREATE OR REPLACE FUNCTION account_identity_cleanup(uid UUID) RETURNS VOID LANGUAGE plpgsql AS $cleanup$
DECLARE tbl TEXT; field TEXT;
BEGIN
 IF uid='00000000-0000-0000-0000-000000000000'::UUID THEN RAISE EXCEPTION 'System account'; END IF;
 IF NOT EXISTS(SELECT 1 FROM account_identity_deletions WHERE user_id=uid)
   AND NOT EXISTS(SELECT 1 FROM account_link_state a JOIN account_identity_deletions d ON d.user_id=a.merged_into WHERE a.user_id=uid AND a.status='archived') THEN RAISE EXCEPTION 'Deletion job required'; END IF;
 DELETE FROM account_identity_outbox WHERE challenge_id IN(SELECT id FROM account_identity_challenges WHERE user_id=uid);
 DELETE FROM account_identity_challenges WHERE user_id=uid OR email IN(SELECT email FROM users WHERE id=uid);
 DELETE FROM account_identity_verifications WHERE user_id=uid;
 DELETE FROM account_link_server_tasks WHERE loser_id=uid OR winner_id=uid;
 DELETE FROM account_link_archives WHERE loser_id=uid OR winner_id=uid;
 DELETE FROM account_link_intents WHERE initiator=uid OR other_id=uid OR winner_id=uid;
 DELETE FROM player_characters WHERE account_id=uid;
 DELETE FROM player_server_preferences WHERE account_id=uid;
 FOREACH tbl IN ARRAY ARRAY['server_weekly_scores','server_weekly_awards','weekly_leaderboard_scores',
   'weekly_leaderboard_awards','sweep_worker_claims','player_vip_credits','player_monetization_entitlements',
   'monetization_daily_reward_claims','monetization_daily_fragment_rewards','monetization_ad_rewards',
   'server_financial_inbox'] LOOP
   EXECUTE format('DELETE FROM %I WHERE user_id::TEXT=$1',tbl) USING uid::TEXT;
 END LOOP;
 -- Reservation hash prevents reuse even after removing the identity and target server.
 UPDATE store_receipt_reservations SET user_id='00000000-0000-0000-0000-000000000000',target_server_id='',target_generation=0 WHERE user_id=uid::TEXT;
 UPDATE monetization_purchase_orders SET user_id='00000000-0000-0000-0000-000000000000',reward_snapshot='[]'::JSONB,
   transaction_id='',failure_reason='',status='expired',target_server_id='',target_generation=0 WHERE user_id=uid::TEXT;
 UPDATE monetization_purchases SET user_id='00000000-0000-0000-0000-000000000000',order_id='',
   request_id='deleted:'||id::TEXT,purchase_order_id='',target_server_id='',target_generation=0 WHERE user_id=uid::TEXT;
 -- Nakama retains its validation records for anti-replay after the official delete.
 -- Redact provider payloads while preserving native transaction uniqueness.
 UPDATE purchase SET raw_response='{}'::JSONB WHERE user_id=uid;
 UPDATE subscription SET raw_response='{}'::JSONB,raw_notification='{}'::JSONB WHERE user_id=uid;
 -- Snapshots can contain arbitrary user data, and must not resurrect it on restore.
 DELETE FROM server_operation_plans WHERE actor_id=uid AND NOT EXISTS(SELECT 1 FROM server_lifecycle_jobs WHERE plan_id=server_operation_plans.id);
 UPDATE server_operation_audit SET actor_id='00000000-0000-0000-0000-000000000000' WHERE actor_id=uid;
 FOREACH field IN ARRAY ARRAY['storage','characters','weekly_scores','weekly_awards'] LOOP
   UPDATE server_operation_plans p SET manifest=jsonb_set(p.manifest,ARRAY[field],
     COALESCE((SELECT jsonb_agg(v) FROM jsonb_array_elements(COALESCE(p.manifest->field,'[]'::JSONB)) v
       WHERE COALESCE(v->>'user_id',v->>'account_id','')<>uid::TEXT),'[]'::JSONB)),manifest_hash='redacted:C232'
     WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(p.manifest->field,'[]'::JSONB)) v WHERE COALESCE(v->>'user_id',v->>'account_id','')=uid::TEXT);
 END LOOP;
 UPDATE server_operation_plans SET actor_id='00000000-0000-0000-0000-000000000000' WHERE actor_id=uid;
END $cleanup$;
