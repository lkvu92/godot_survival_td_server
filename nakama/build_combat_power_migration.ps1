param([string]$ProgressionPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'data/progression.json'))
$ErrorActionPreference = 'Stop'
$packaged = Get-Content -LiteralPath $ProgressionPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($packaged.combat_power.version -ne 2 -or $packaged.combat_power.horizon_seconds -le 0 -or
    $packaged.element_combat.supported_elements.Count -ne 5 -or $packaged.persistent_leveling.max_hero_level -lt 1 -or $packaged.element_upgrade.max_level -lt 1) {
    throw 'Packaged combat-power dependencies are incomplete.'
}
# ASCII-only SQL transport preserves all Vietnamese JSON text under Windows PowerShell.
$encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($packaged | ConvertTo-Json -Depth 100 -Compress)))
@"
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.cp_fill_missing(existing jsonb, defaults jsonb) RETURNS jsonb LANGUAGE plpgsql AS `$`$
DECLARE entry record; result jsonb := existing;
BEGIN
  IF existing IS NULL OR jsonb_typeof(existing)='null' THEN RETURN defaults; END IF;
  IF jsonb_typeof(existing)<>'object' OR jsonb_typeof(defaults)<>'object' THEN RETURN existing; END IF;
  FOR entry IN SELECT key,value FROM jsonb_each(defaults) LOOP
    result := jsonb_set(result,ARRAY[entry.key],pg_temp.cp_fill_missing(result->entry.key,entry.value),true);
  END LOOP;
  RETURN result;
END `$`$;
DO `$`$
DECLARE packaged jsonb := convert_from(decode('$encoded','base64'),'UTF8')::jsonb;
        cfg jsonb; dependencies jsonb;
BEGIN
  INSERT INTO game_config(key,value) VALUES('progression',packaged) ON CONFLICT(key) DO NOTHING;
  SELECT value INTO cfg FROM game_config WHERE key='progression' FOR UPDATE;
  IF jsonb_typeof(cfg)='string' THEN cfg := (cfg #>> '{}')::jsonb; END IF;
  IF cfg IS NULL OR jsonb_typeof(cfg)='null' THEN cfg := '{}'::jsonb; END IF;
  IF jsonb_typeof(cfg) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Progression must be a JSON object; retained existing data'; END IF;
  dependencies := jsonb_build_object('element_combat',packaged->'element_combat','persistent_leveling',packaged->'persistent_leveling','element_upgrade',packaged->'element_upgrade');
  cfg := pg_temp.cp_fill_missing(cfg,dependencies);
  IF jsonb_typeof(cfg->'element_combat') IS DISTINCT FROM 'object'
     OR jsonb_typeof(cfg->'persistent_leveling') IS DISTINCT FROM 'object'
     OR jsonb_typeof(cfg->'element_upgrade') IS DISTINCT FROM 'object'
     OR jsonb_typeof(cfg#>'{element_combat,supported_elements}') IS DISTINCT FROM 'array'
     THEN RAISE EXCEPTION 'Malformed progression dependencies; retained existing data'; END IF;
  cfg := jsonb_set(cfg,'{combat_power}',packaged->'combat_power',true);
  UPDATE game_config SET value=cfg,updated_at=NOW() WHERE key='progression';
END `$`$;
COMMIT;
SELECT jsonb_build_object('power_version',value#>'{combat_power,version}','hero_cap',value#>'{persistent_leveling,max_hero_level}','root_cap',value#>'{element_upgrade,max_level}') AS combat_power_migration FROM game_config WHERE key='progression';
"@
