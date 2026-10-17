// Generate SQL only. Applying it and publishing a config release are separate operations.
const fs=require('fs'),path=require('path');
const base=path.join(__dirname,'../data');
const all=JSON.parse(fs.readFileSync(path.join(base,'items.json'),'utf8'));
const items=all.filter(i=>i.attributes && Number.isInteger(i.attributes.atlas_slot) && i.attributes.atlas_slot<23);
const config=JSON.parse(fs.readFileSync(path.join(base,'progression.json'),'utf8'));
const ids=items.map(i=>i.id),offers=config.talisman_system.store.materials.filter(p=>ids.includes(p.item_id));
if(items.length!==23 || ids.includes('loot_magnet_talisman'))throw Error('Invalid consumable catalog');
const quote=v=>"'"+String(v).replace(/'/g,"''")+"'";
const json=v=>quote(JSON.stringify(v))+'::jsonb';
let sql='-- C129 additive catalog/config patch. No player rows are modified.\nBEGIN;\nLOCK TABLE game_config IN SHARE ROW EXCLUSIVE MODE;\n';
for(const i of items){
 const values=[quote(i.id),quote(i.display_name),quote(i.description),quote(i.category),quote(i.rarity),quote(i.icon_id),'TRUE',i.max_stack,i.order,0,json(i.tags),json(i.attributes)];
 sql+='INSERT INTO game_items(id,display_name,description,category,rarity,icon_id,stackable,max_stack,sort_order,expires_after_hours,tags,attributes) VALUES('+values.join(',')+') ON CONFLICT(id) DO UPDATE SET display_name=EXCLUDED.display_name,description=EXCLUDED.description,category=EXCLUDED.category,rarity=EXCLUDED.rarity,icon_id=EXCLUDED.icon_id,stackable=EXCLUDED.stackable,max_stack=EXCLUDED.max_stack,sort_order=EXCLUDED.sort_order,expires_after_hours=EXCLUDED.expires_after_hours,tags=EXCLUDED.tags,attributes=EXCLUDED.attributes,updated_at=NOW();\n';
}
sql+=`DO $patch$ BEGIN IF NOT EXISTS(SELECT 1 FROM game_config WHERE key='progression' AND jsonb_typeof(value)='object' AND jsonb_typeof(value#>'{talisman_system,store,materials}')='array') THEN RAISE EXCEPTION 'Valid progression store config is required'; END IF; END; $patch$;\n`;
sql+=`UPDATE game_config SET updated_at=NOW(),value=jsonb_set(jsonb_set(value,'{talisman_system,store,materials}',(SELECT COALESCE(jsonb_agg(p),'[]'::jsonb) FROM jsonb_array_elements(value#>'{talisman_system,store,materials}') p WHERE NOT (COALESCE(p->>'item_id','')=ANY(ARRAY[${ids.map(quote).join(',')}]::text[]))) || ${json(offers)}),'{consumables}',${json(config.consumables)}) WHERE key='progression';\nCOMMIT;\n-- Next: publish a new immutable config release through the normal config-release workflow.\n`;
if(require.main===module)process.stdout.write(sql);
module.exports={sql,items,offers};
