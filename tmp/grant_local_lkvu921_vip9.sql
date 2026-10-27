\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='10s';
DO $grant$
DECLARE
  uid text;
  target_exp bigint;
  current_exp bigint;
  purchase bigint;
  marker text := 'local_admin:20261027:lkvu921:vip9:s001:g1';
BEGIN
  SELECT id::text INTO STRICT uid FROM users WHERE lower(username)='lkvu921';
  IF NOT EXISTS (SELECT 1 FROM player_characters WHERE account_id=uid::uuid AND server_id='s001' AND generation=1 AND status='ready') THEN
    RAISE EXCEPTION 'Expected ready local character missing';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(uid),9);
  SELECT (entry->>'min_exp')::bigint INTO STRICT target_exp FROM game_content_configs,
    LATERAL jsonb_array_elements(payload->'levels') entry WHERE id='vip' AND active=true AND (entry->>'level')::int=9;
  SELECT COALESCE(sum(c.exp),0) INTO current_exp FROM player_vip_credits c
    JOIN monetization_purchases p ON p.id=c.purchase_id
    WHERE c.user_id=uid AND c.environment='sandbox' AND p.target_server_id='s001' AND p.target_generation=1 AND p.status IN ('verified','consumed');
  IF current_exp>=target_exp THEN RAISE NOTICE 'VIP9 threshold already met; no grant'; RETURN; END IF;
  IF EXISTS(SELECT 1 FROM monetization_purchases WHERE purchase_token_hash=marker) THEN
    RAISE EXCEPTION 'Prior grant marker exists but threshold not met; inspect before retry';
  END IF;
  -- Explicit local-admin test grant, not a store receipt or paid transaction.
  -- Existing VIP reconciliation requires a ledger parent; no pack rewards,
  -- entitlements, purchase orders, or verified store timestamps are created.
  INSERT INTO monetization_purchases(request_id,user_id,platform,product_id,purchase_token_hash,status,target_server_id,target_generation)
    VALUES(marker,uid,'local_admin','local_admin_vip_test_grant',marker,'consumed','s001',1) RETURNING id INTO purchase;
  INSERT INTO player_vip_credits(purchase_id,user_id,environment,exp)
    VALUES(purchase,uid,'sandbox',target_exp-current_exp);
END $grant$;
COMMIT;
WITH vip AS (
  SELECT COALESCE(sum(c.exp),0)::bigint exp FROM player_vip_credits c JOIN monetization_purchases p ON p.id=c.purchase_id
  WHERE c.user_id=(SELECT id::text FROM users WHERE lower(username)='lkvu921') AND c.environment='sandbox'
    AND p.target_server_id='s001' AND p.target_generation=1 AND p.status IN ('verified','consumed')
)
SELECT 's001:g1' AS character, vip.exp,
  (SELECT max((entry->>'level')::int) FROM game_content_configs,LATERAL jsonb_array_elements(payload->'levels') entry
   WHERE id='vip' AND active=true AND (entry->>'min_exp')::bigint<=vip.exp) AS vip_level FROM vip;
