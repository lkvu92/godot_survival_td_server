// Generate only: preserve current operator values; publish a config release afterward.
const fs=require('fs'),path=require('path');
const defaults=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/rewarded_ads.json'),'utf8'));
const quote=v=>"'"+String(v).replace(/'/g,"''")+"'";
const sql=`-- C134: System rewarded placement migration. No player/reward ledgers are rewritten.
BEGIN;
LOCK TABLE remote_config_settings IN SHARE ROW EXCLUSIVE MODE;
DO $patch$
DECLARE cfg JSONB; base JSONB := ${quote(JSON.stringify(defaults))}::JSONB; entry RECORD;
BEGIN
  SELECT value::JSONB INTO cfg FROM remote_config_settings WHERE module='system' AND key='rewarded_ads';
  IF cfg IS NULL THEN SELECT payload INTO cfg FROM game_content_configs WHERE id='rewarded_ads' AND active=TRUE; END IF;
  cfg:=base||COALESCE(cfg,'{}'::JSONB);
  cfg:=jsonb_set(cfg,'{placements}',(base->'placements')||COALESCE(cfg->'placements','{}'::JSONB));
  FOR entry IN SELECT key,value FROM jsonb_each(base->'placements') LOOP
    cfg:=jsonb_set(cfg,ARRAY['placements',entry.key],entry.value||COALESCE(cfg->'placements'->entry.key,'{}'::JSONB));
  END LOOP;
  cfg:=jsonb_set(cfg,'{schema_version}','2'::JSONB);
  INSERT INTO remote_config_settings(module,key,value_type,value,description,is_active)
  VALUES('system','rewarded_ads','json',cfg::TEXT,'C134: rewarded ad amounts, daily/run limits and victory multiplier',TRUE)
  ON CONFLICT(module,key) DO UPDATE SET value_type='json',value=EXCLUDED.value,description=EXCLUDED.description,is_active=TRUE,updated_at=NOW();
END;
$patch$;
COMMIT;
-- Publish a new immutable remote_config_release after reviewing system.rewarded_ads.
`;
if(require.main===module)process.stdout.write(sql);
module.exports={sql,defaults};
