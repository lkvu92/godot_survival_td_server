-- C130 v1.6.0: apply through the normal operator workflow, then publish a
-- new immutable config release. Does not modify inventory or player runs.
BEGIN;
UPDATE game_items
SET attributes = jsonb_set(attributes, '{effect,cooldown}', '5'::jsonb),
    updated_at = NOW()
WHERE attributes #>> '{effect,context}' = 'combat'
  AND attributes #>> '{effect,kind}' = 'heal'
  AND attributes #> '{effect,cooldown}' IS DISTINCT FROM '5'::jsonb;
COMMIT;
