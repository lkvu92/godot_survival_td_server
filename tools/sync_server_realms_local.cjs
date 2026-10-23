// C143: rename generic existing local servers; never creates/opens servers.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const pg = 'survival_td_local-postgres-1', nk = 'survival_td_local-nakama-1';
const docker = args => execFileSync('docker', args, {encoding:'utf8'}).trim();
const q = value => "'" + String(value).replace(/'/g, "''") + "'";
const sql = input => execFileSync('docker', ['exec','-i',pg,'psql','-X','-U','postgres','-d','nakama','-v','ON_ERROR_STOP=1','-t','-A'], {input,encoding:'utf8'}).trim();
for (const name of [pg,nk]) assert.equal(JSON.parse(docker(['inspect',name]))[0].Config.Labels['com.docker.compose.project'], 'survival_td_local');
const env = JSON.parse(docker(['inspect',nk]))[0].Config.Env;
const actor = (env.find(v => v.startsWith('CONFIG_ADMIN_USER_ID=')) || '').split('=')[1];
assert.match(actor || '', /^[a-f0-9-]{36}$/i, 'Configured local admin identity required for audit');
const catalog = JSON.parse(fs.readFileSync(path.join(__dirname,'../data/server_realms.json'),'utf8'));
assert.equal(catalog.schema_version, 1);
const names = new Map(catalog.servers.map(row => [row.server_id,row.display_name]));
assert.equal(names.size, catalog.servers.length);
for (const row of catalog.servers) {
  assert.match(row.server_id, /^s\d{3}$/);
  assert(row.display_name.trim() && row.display_name.length <= 100);
}
const rows = JSON.parse(sql("SELECT COALESCE(json_agg(r),'[]'::json) FROM (SELECT server_id,display_name,status,generation,revision FROM game_servers ORDER BY server_id) r;"));
const changes = rows.filter(row => names.has(row.server_id) && (!row.display_name.trim() || /^(s0*\d+|server\s*\d+|máy chủ\s*\d+)$/i.test(row.display_name.trim())) && ['open','scheduled','maintenance','disabled'].includes(row.status));
console.log(JSON.stringify({apply:process.argv.includes('--apply'),changes:changes.map(row=>({server_id:row.server_id,from:row.display_name,to:names.get(row.server_id)}))},null,2));
if (!process.argv.includes('--apply') || !changes.length) process.exit(0);
const backup = path.resolve(__dirname,'../../tmp/server_realms_before_'+Date.now()+'.json');
fs.mkdirSync(path.dirname(backup), {recursive:true});
fs.writeFileSync(backup, JSON.stringify(rows,null,2));
let transaction = 'BEGIN;\n';
for (const row of changes) transaction += `
DO $$ DECLARE changed_revision BIGINT; BEGIN
 UPDATE game_servers SET display_name=${q(names.get(row.server_id))},revision=revision+1,updated_at=NOW()
 WHERE server_id=${q(row.server_id)} AND revision=${Number(row.revision)} AND display_name=${q(row.display_name)}
 RETURNING revision INTO changed_revision;
 IF changed_revision IS NULL THEN RAISE EXCEPTION 'Server metadata changed concurrently'; END IF;
 INSERT INTO server_operation_audit(server_id,actor_id,action,reason,before_revision,after_revision)
 VALUES(${q(row.server_id)},${q(actor)}::uuid,'update','Local C143 realm naming catalog; metadata only',${Number(row.revision)},changed_revision);
END $$;
`;
sql(transaction + 'COMMIT;');
const after = JSON.parse(sql("SELECT json_agg(r) FROM (SELECT server_id,display_name,status,generation,revision FROM game_servers ORDER BY server_id) r;"));
for (const old of rows) {
  const current = after.find(row=>row.server_id===old.server_id);
  assert(current && current.generation===old.generation && current.status===old.status);
  if (changes.some(row=>row.server_id===old.server_id)) assert.equal(current.display_name,names.get(old.server_id));
  else assert.deepEqual(current,old);
}
console.log('PASS local realm names updated and audited; server identities, generations, availability and player data preserved.');
