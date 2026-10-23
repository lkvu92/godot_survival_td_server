// C167: explicitly local-only content/config sync and one named test grant.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert'),{execFileSync}=require('child_process');
const dbContainer='survival_td_local-postgres-1';
const metadata=JSON.parse(execFileSync('docker',['inspect',dbContainer],{encoding:'utf8'}))[0];
assert.equal(metadata.Config.Labels['com.docker.compose.project'],'survival_td_local');
const sql=s=>execFileSync('docker',['exec','-i',dbContainer,'psql','-U','postgres','-d','nakama','-v','ON_ERROR_STOP=1','-t','-A'],{input:s,encoding:'utf8'}).trim();
const quote=s=>"'"+String(s).replace(/'/g,"''")+"'";
const root=path.join(__dirname,'..'),items=JSON.parse(fs.readFileSync(path.join(root,'data/items.json'),'utf8'));
const tower=JSON.parse(fs.readFileSync(path.join(root,'data/trial_tower.json'),'utf8'));
const c=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(root,'nakama/data/modules/build/sweep_rpc.js'),'utf8'),c);
const rules=JSON.parse(JSON.stringify(vm.runInContext('TOWER_SWEEP_DEFAULTS',c)));
const selected=items.filter(i=>i.id==='tower_sweep_ticket'||i.id.startsWith('law_fragment_')||i.id.includes('_boost_card_'));
const rows=selected.map(i=>[i.id,i.display_name,i.description,i.category,i.rarity,i.icon_id,i.stackable,i.max_stack,i.order,i.expires_after_hours,JSON.stringify(i.tags),JSON.stringify(i.attributes)].map(quote).join(',')).map(v=>'('+v+')').join(',\n');
const email='lkvu92@gmail.com',owner=sql(`SELECT id FROM users WHERE email=${quote(email)};`);
assert(/^[a-f0-9-]{36}$/.test(owner),'Expected exactly one local test account');
const key='s001:g1:items';
assert.equal(sql(`SELECT count(*) FROM storage WHERE collection='player_inventory' AND key=${quote(key)} AND user_id=${quote(owner)}::uuid;`),'1','Expected the existing s001/g1 inventory');
sql(`BEGIN;
SELECT pg_advisory_xact_lock(167,20261022);
INSERT INTO game_items(id,display_name,description,category,rarity,icon_id,stackable,max_stack,sort_order,expires_after_hours,tags,attributes) VALUES ${rows}
ON CONFLICT(id) DO UPDATE SET display_name=EXCLUDED.display_name,description=EXCLUDED.description,category=EXCLUDED.category,rarity=EXCLUDED.rarity,icon_id=EXCLUDED.icon_id,stackable=EXCLUDED.stackable,max_stack=EXCLUDED.max_stack,sort_order=EXCLUDED.sort_order,expires_after_hours=EXCLUDED.expires_after_hours,tags=EXCLUDED.tags,attributes=EXCLUDED.attributes,updated_at=NOW();
INSERT INTO game_content_configs(id,payload,active) VALUES('trial_tower',${quote(JSON.stringify(tower))}::jsonb,TRUE) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=NOW();
INSERT INTO remote_config_settings(module,key,value_type,value,description,is_active,updated_by) VALUES('system','tower_sweep','json',${quote(JSON.stringify(rules))},'C167 tower sweep',TRUE,'local:C167') ON CONFLICT(module,key) DO UPDATE SET value=EXCLUDED.value,value_type='json',updated_at=NOW(),updated_by='local:C167';
LOCK TABLE remote_config_releases IN EXCLUSIVE MODE;
INSERT INTO remote_config_releases(config_version,snapshot,min_app_version,latest_app_version,store_url,published_by)
SELECT config_version+1,jsonb_set(snapshot,'{system,tower_sweep}',${quote(JSON.stringify(rules))}::jsonb,TRUE),min_app_version,latest_app_version,store_url,'local:C167'
FROM remote_config_releases WHERE config_version=(SELECT max(config_version) FROM remote_config_releases)
AND snapshot->'system'->'tower_sweep' IS DISTINCT FROM ${quote(JSON.stringify(rules))}::jsonb;
SELECT 1 FROM storage WHERE user_id=${quote(owner)}::uuid AND collection='player_inventory' AND key=${quote(key)} FOR UPDATE;
UPDATE storage SET value=jsonb_set(jsonb_set(value,'{items}',
COALESCE((SELECT jsonb_agg(item) FROM jsonb_array_elements(value->'items') item WHERE item->>'item_id'<>'tower_sweep_ticket'),'[]'::jsonb)
||jsonb_build_array(jsonb_build_object('item_id','tower_sweep_ticket','quantity',1000+COALESCE((SELECT sum((item->>'quantity')::int) FROM jsonb_array_elements(value->'items') item WHERE item->>'item_id'='tower_sweep_ticket'),0)))),
'{_c167_test_grant_1000}','true'::jsonb),version=md5(random()::text||clock_timestamp()::text),update_time=NOW()
WHERE user_id=${quote(owner)}::uuid AND collection='player_inventory' AND key=${quote(key)} AND COALESCE((value->>'_c167_test_grant_1000')::boolean,FALSE)=FALSE;
COMMIT;`);
const count=sql(`SELECT sum((item->>'quantity')::int) FROM storage,jsonb_array_elements(value->'items') item WHERE user_id=${quote(owner)}::uuid AND collection='player_inventory' AND key=${quote(key)} AND item->>'item_id'='tower_sweep_ticket';`);
console.log(`PASS local C167 content/config sync; ${email} s001/g1 tower_sweep_ticket=${count}; durable one-time +1000 marker. Runtime was not restarted.`);
