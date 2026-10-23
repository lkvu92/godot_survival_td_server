-- C159. psql -v apply=false (default) previews with full rollback.
\set ON_ERROR_STOP on
\if :{?apply}
\else
\set apply false
\endif
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';
LOCK TABLE game_items, storage IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE IF NOT EXISTS inventory_stack_merge_audit (
    operation_id text NOT NULL,
    user_id uuid NOT NULL,
    storage_key text NOT NULL,
    old_version text NOT NULL,
    old_value jsonb NOT NULL,
    new_value jsonb NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (operation_id, user_id, storage_key)
);
REVOKE ALL ON inventory_stack_merge_audit FROM PUBLIC;

CREATE TEMP TABLE stack_catalog_before ON COMMIT DROP AS
SELECT id,stackable,max_stack FROM game_items;
UPDATE game_items SET stackable=true, max_stack=999999
WHERE category NOT IN ('talisman','equipment')
  AND (stackable IS DISTINCT FROM true OR max_stack IS DISTINCT FROM 999999);
UPDATE game_items SET description=replace(description,'độc bản không thể cộng dồn','có thể cộng dồn')
WHERE id LIKE 'rune_%_high' AND description LIKE '%độc bản không thể cộng dồn%';

CREATE TEMP TABLE stack_inventory_before ON COMMIT DROP AS
SELECT user_id,key,value,version FROM storage
WHERE collection='player_inventory' AND key ~ '^[a-z][a-z0-9_]*:g[1-9][0-9]*:items$';

DO $merge$
DECLARE
    inv record;
    entry jsonb;
    result jsonb;
    seen jsonb;
    item_id text;
    cap bigint;
    total bigint;
    first_acquired text;
    merged jsonb;
    operation_id text := 'C159-' || txid_current()::text;
BEGIN
    FOR inv IN SELECT * FROM stack_inventory_before LOOP
        IF jsonb_typeof(inv.value->'items') IS DISTINCT FROM 'array' THEN
            RAISE EXCEPTION 'Inventory items is not an array';
        END IF;
        result := '[]'::jsonb;
        seen := '{}'::jsonb;
        FOR entry IN SELECT value FROM jsonb_array_elements(inv.value->'items') LOOP
            item_id := entry->>'item_id';
            cap := NULL;
            SELECT max_stack INTO cap FROM game_items
            WHERE id=item_id AND stackable AND category NOT IN ('talisman','equipment');
            -- Expiry, equipped state, rolled stats and all unknown metadata remain distinct.
            IF cap IS NULL OR (entry-'item_id'-'quantity'-'acquired_at') <> '{}'::jsonb THEN
                result := result || jsonb_build_array(entry);
                CONTINUE;
            END IF;
            IF seen ? item_id THEN CONTINUE; END IF;
            seen := seen || jsonb_build_object(item_id,true);
            IF EXISTS (
                SELECT 1 FROM jsonb_array_elements(inv.value->'items') e
                WHERE e->>'item_id'=item_id AND (e-'item_id'-'quantity'-'acquired_at')='{}'::jsonb
                AND (jsonb_typeof(e->'quantity') IS DISTINCT FROM 'number'
                     OR (e->>'quantity') !~ '^[1-9][0-9]*$')
            ) THEN RAISE EXCEPTION 'Invalid quantity for %',item_id; END IF;
            SELECT sum((e->>'quantity')::bigint),min(e->>'acquired_at') INTO total,first_acquired
            FROM jsonb_array_elements(inv.value->'items') e
            WHERE e->>'item_id'=item_id AND (e-'item_id'-'quantity'-'acquired_at')='{}'::jsonb;
            WHILE total>0 LOOP
                merged := jsonb_build_object('item_id',item_id,'quantity',least(total,cap));
                IF first_acquired IS NOT NULL THEN
                    merged := merged || jsonb_build_object('acquired_at',first_acquired);
                END IF;
                result := result || jsonb_build_array(merged);
                total := total-least(total,cap);
            END LOOP;
        END LOOP;
        merged := jsonb_set(inv.value,'{items}',result);
        IF merged IS DISTINCT FROM inv.value THEN
            INSERT INTO inventory_stack_merge_audit(operation_id,user_id,storage_key,old_version,old_value,new_value)
            VALUES(operation_id,inv.user_id,inv.key,inv.version,inv.value,merged);
            UPDATE storage SET value=merged,version=md5(merged::text),update_time=now()
            WHERE collection='player_inventory' AND key=inv.key AND user_id=inv.user_id AND version=inv.version;
            IF NOT FOUND THEN RAISE EXCEPTION 'Inventory version changed'; END IF;
        END IF;
    END LOOP;
END $merge$;

-- Compare quantities per owner, namespace and item ID in both directions.
DO $verify$
BEGIN
    IF EXISTS (
        WITH before_totals AS (
            SELECT user_id,key,e->>'item_id' id,sum((e->>'quantity')::numeric) quantity
            FROM stack_inventory_before CROSS JOIN LATERAL jsonb_array_elements(value->'items') e
            GROUP BY user_id,key,e->>'item_id'
        ), after_totals AS (
            SELECT s.user_id,s.key,e->>'item_id' id,sum((e->>'quantity')::numeric) quantity
            FROM storage s JOIN stack_inventory_before b USING(user_id,key)
            CROSS JOIN LATERAL jsonb_array_elements(s.value->'items') e
            WHERE s.collection='player_inventory' GROUP BY s.user_id,s.key,e->>'item_id'
        )
        (SELECT * FROM before_totals EXCEPT SELECT * FROM after_totals)
        UNION ALL
        (SELECT * FROM after_totals EXCEPT SELECT * FROM before_totals)
    ) THEN RAISE EXCEPTION 'Item quantity conservation failed'; END IF;
END $verify$;

SELECT count(*) FILTER (WHERE s.value IS DISTINCT FROM b.value) AS changed_inventories,
       sum(jsonb_array_length(b.value->'items')) AS slots_before,
       sum(jsonb_array_length(s.value->'items')) AS slots_after
FROM stack_inventory_before b JOIN storage s USING(user_id,key) WHERE s.collection='player_inventory';
SELECT count(*) AS catalog_changed FROM stack_catalog_before b JOIN game_items i USING(id)
WHERE (b.stackable,b.max_stack) IS DISTINCT FROM (i.stackable,i.max_stack);

\if :apply
COMMIT;
\else
ROLLBACK;
\endif
