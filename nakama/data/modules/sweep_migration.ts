// C144 versioned, additive startup migration. Never publish pending draft settings.
const SWEEP_TICKET_DEFINITION:any={id:'campaign_sweep_ticket',display_name:'Vé càn quét chiến dịch',description:'Càn quét một ải chiến dịch đã đạt S.',category:'consumable',rarity:'rare',icon_id:'consumable_0',stackable:true,max_stack:99999,order:49,expires_after_hours:0,tags:['sweep','ticket','consumable'],attributes:{sweep_type:'campaign',atlas_index:0}};
function sweepMigrationSql():string {return `
CREATE OR REPLACE FUNCTION c144_migrate_stage_sweep(p_rules JSONB,p_ticket JSONB)
RETURNS INT LANGUAGE plpgsql AS $c144$
DECLARE published remote_config_releases%ROWTYPE; new_snapshot JSONB; minimum TEXT; latest TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(144,20261020);
  LOCK TABLE remote_config_releases IN EXCLUSIVE MODE;
  SELECT * INTO published FROM remote_config_releases ORDER BY config_version DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'C144 requires an existing published config release'; END IF;
  IF jsonb_typeof(p_rules) IS DISTINCT FROM 'object' OR p_rules->>'version' IS DISTINCT FROM '1'
    OR p_ticket->>'id' IS DISTINCT FROM 'campaign_sweep_ticket' THEN RAISE EXCEPTION 'Invalid C144 migration inputs'; END IF;
  INSERT INTO game_items(id,display_name,description,category,rarity,icon_id,stackable,max_stack,sort_order,expires_after_hours,tags,attributes)
  VALUES(p_ticket->>'id',p_ticket->>'display_name',p_ticket->>'description',p_ticket->>'category',p_ticket->>'rarity',p_ticket->>'icon_id',
    (p_ticket->>'stackable')::BOOLEAN,(p_ticket->>'max_stack')::INT,(p_ticket->>'order')::INT,(p_ticket->>'expires_after_hours')::INT,p_ticket->'tags',p_ticket->'attributes')
  ON CONFLICT(id) DO NOTHING;
  -- Existing published rules, including deliberately disabled/custom rules, win.
  IF (published.snapshot->'system') ? 'stage_sweep' THEN RETURN published.config_version; END IF;
  IF jsonb_typeof(published.snapshot) IS DISTINCT FROM 'object'
    OR jsonb_typeof(COALESCE(published.snapshot->'system','{}'::JSONB)) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid published config snapshot'; END IF;
  minimum:='1.1.0'; latest:='1.1.0';
  IF published.min_app_version ~ '^[0-9]+[.][0-9]+[.][0-9]+$' THEN
    IF string_to_array(published.min_app_version,'.')::INT[]>=ARRAY[1,1,0] THEN minimum:=published.min_app_version; END IF;
  END IF;
  IF published.latest_app_version ~ '^[0-9]+[.][0-9]+[.][0-9]+$' THEN
    IF string_to_array(published.latest_app_version,'.')::INT[]>=ARRAY[1,1,0] THEN latest:=published.latest_app_version; END IF;
  END IF;
  IF string_to_array(latest,'.')::INT[]<string_to_array(minimum,'.')::INT[] THEN latest:=minimum; END IF;
  new_snapshot:=published.snapshot||jsonb_build_object('system',COALESCE(published.snapshot->'system','{}'::JSONB)
    ||jsonb_build_object('stage_sweep',p_rules,'min_app_version',minimum,'latest_app_version',latest));
  INSERT INTO remote_config_releases(config_version,snapshot,min_app_version,latest_app_version,store_url,published_by)
  VALUES(published.config_version+1,new_snapshot,minimum,latest,published.store_url,'migration:C144:v1');
  RETURN published.config_version+1;
END $c144$;`;
}
function sweepMigratePublishedConfig(nk:nkruntime.Nakama,logger:nkruntime.Logger):void {
    const rules=sweepValidateConfig(SWEEP_DEFAULTS);
    nk.sqlExec(sweepMigrationSql(),[]);
    const rows=nk.sqlQuery('SELECT c144_migrate_stage_sweep($1::JSONB,$2::JSONB) AS config_version',[JSON.stringify(rules),JSON.stringify(SWEEP_TICKET_DEFINITION)]);
    logger.info('C144 startup migration verified config release %s',String(rows.length?rows[0].config_version:''));
}
