\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '10s';
DO $grant$
DECLARE
  uid uuid;
  profile jsonb;
  inventory jsonb;
  entries jsonb;
  item text;
  stamp text := '_local_grant_20261026_gems_exp5_stamina';
BEGIN
  SELECT id INTO STRICT uid FROM users WHERE lower(email)='lkvu92@gmail.com';
  IF NOT EXISTS (SELECT 1 FROM player_characters WHERE account_id=uid AND server_id='s001' AND generation=1 AND status='ready') THEN
    RAISE EXCEPTION 'Expected ready local character missing';
  END IF;
  SELECT value INTO STRICT profile FROM storage WHERE user_id=uid AND collection='player_profiles' AND key='s001:g1:main' FOR UPDATE;
  SELECT value INTO STRICT inventory FROM storage WHERE user_id=uid AND collection='player_inventory' AND key='s001:g1:items' FOR UPDATE;
  IF profile ? stamp OR inventory ? stamp THEN
    IF NOT (profile ? stamp AND inventory ? stamp) THEN RAISE EXCEPTION 'Partial grant marker'; END IF;
    RAISE NOTICE 'Grant already applied; no changes';
    RETURN;
  END IF;
  IF (SELECT count(*) FROM game_items WHERE id IN ('energy_elixir','exp_boost_card_x5') AND stackable AND max_stack>=1000)<>2 THEN
    RAISE EXCEPTION 'Required stackable catalog items missing';
  END IF;
  profile:=jsonb_set(profile,'{resources,gems}',to_jsonb(COALESCE((profile#>>'{resources,gems}')::bigint,0)+1000000));
  entries:=COALESCE(inventory->'items','[]'::jsonb);
  FOREACH item IN ARRAY ARRAY['exp_boost_card_x5','energy_elixir'] LOOP
    IF (SELECT count(*) FROM jsonb_array_elements(entries) e WHERE e->>'item_id'=item)>1 THEN RAISE EXCEPTION 'Duplicate target stack'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(entries) e WHERE e->>'item_id'=item) THEN
      SELECT jsonb_agg(CASE WHEN e->>'item_id'=item THEN jsonb_set(e,'{quantity}',to_jsonb((e->>'quantity')::bigint+1000)) ELSE e END ORDER BY ord)
        INTO entries FROM jsonb_array_elements(entries) WITH ORDINALITY AS t(e,ord);
    ELSE
      entries:=entries||jsonb_build_array(jsonb_build_object('item_id',item,'quantity',1000,'acquired_at',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
    END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(entries) e JOIN game_items g ON g.id=e->>'item_id' WHERE g.id=item AND (e->>'quantity')::bigint>g.max_stack) THEN RAISE EXCEPTION 'Stack cap exceeded'; END IF;
  END LOOP;
  profile:=profile||jsonb_build_object(stamp,true);
  inventory:=jsonb_set(inventory,'{items}',entries)||jsonb_build_object(stamp,true);
  UPDATE storage SET value=profile,version=md5(profile::text),update_time=now() WHERE user_id=uid AND collection='player_profiles' AND key='s001:g1:main';
  UPDATE storage SET value=inventory,version=md5(inventory::text),update_time=now() WHERE user_id=uid AND collection='player_inventory' AND key='s001:g1:items';
END $grant$;
COMMIT;
SELECT key,value#>>'{resources,gems}' AS gems FROM storage WHERE user_id=(SELECT id FROM users WHERE lower(email)='lkvu92@gmail.com') AND collection='player_profiles' AND key='s001:g1:main';
SELECT e->>'item_id' AS item_id,e->>'quantity' AS quantity FROM storage CROSS JOIN LATERAL jsonb_array_elements(value->'items') e WHERE user_id=(SELECT id FROM users WHERE lower(email)='lkvu92@gmail.com') AND collection='player_inventory' AND key='s001:g1:items' AND e->>'item_id' IN ('energy_elixir','exp_boost_card_x5');
