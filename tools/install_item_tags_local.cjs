// Read/write local item tags only; retain all gameplay columns and inventory.
const fs=require('fs'),path=require('path'),assert=require('assert'),{execFileSync}=require('child_process');
const container='survival_td_local-postgres-1';
const run=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const meta=JSON.parse(run(['inspect',container]))[0];assert.equal(meta.Config.Labels['com.docker.compose.project'],'survival_td_local');
const sql=q=>run(['exec','-i',container,'psql','-X','-U','postgres','-d','nakama','-v','ON_ERROR_STOP=1','-Atq'],q);
const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
const items=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../data/items.json'),'utf8'));
const before=JSON.parse(sql("SELECT json_agg(row_to_json(i)) FROM (SELECT id,tags FROM game_items ORDER BY id) i"));
const release=Number(sql('SELECT max(config_version) FROM remote_config_releases'));
const known=new Set(before.map(i=>i.id));assert(items.every(i=>known.has(i.id)),'catalog migration requires existing definitions');
const rows=items.map(i=>[i.id,i.tags]);
if(rows.every(([id,tags])=>JSON.stringify(before.find(i=>i.id===id).tags)===JSON.stringify(tags))){console.log(JSON.stringify({status:'ALREADY_INSTALLED',config_version:release}));process.exit(0);}
const directory=path.resolve(__dirname,'../../tmp/item-tags-'+Date.now());fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'before-tags.json'),JSON.stringify(before,null,2));
sql(`BEGIN; LOCK TABLE remote_config_releases IN EXCLUSIVE MODE;
DO $$ BEGIN IF (SELECT max(config_version) FROM remote_config_releases)<>${release} THEN RAISE EXCEPTION 'Concurrent release'; END IF; END $$;
${rows.map(([id,tags])=>`UPDATE game_items SET tags=${quote(JSON.stringify(tags))}::jsonb,updated_at=NOW() WHERE id=${quote(id)};`).join('\n')}
INSERT INTO remote_config_releases(config_version,snapshot,min_app_version,latest_app_version,store_url,published_by)
SELECT ${release+1},snapshot,min_app_version,latest_app_version,store_url,'item-tags-local' FROM remote_config_releases WHERE config_version=${release}; COMMIT;`);
const after=JSON.parse(sql('SELECT json_agg(row_to_json(i)) FROM (SELECT id,tags FROM game_items ORDER BY id) i'));
assert(rows.every(([id,tags])=>JSON.stringify(after.find(i=>i.id===id).tags)===JSON.stringify(tags)));
console.log(JSON.stringify({status:'PASS',items:rows.length,config_version:release+1,backup:directory}));
