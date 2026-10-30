// C173: local-only selective catalog update/publication. Never writes player data.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const root=path.join(__dirname,'..'),project='survival_td_local',pg=project+'-postgres-1',nkName=project+'-nakama-1';
let stage='local_identity';
const mode=process.argv[2];assert(['--check','--apply','--verify'].includes(mode),'Use --check, --apply or --verify');
const stable=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const docker=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:32*1024*1024}).trim();
function main(){
 const meta=JSON.parse(docker(['inspect',nkName]))[0],db=JSON.parse(docker(['inspect',pg]))[0];
 for(const m of [meta,db])assert(m.State.Running&&m.Config.Labels['com.docker.compose.project']===project,'Local project identity mismatch');
 const bindings=meta.NetworkSettings.Ports['7350/tcp'];assert(bindings.length===1&&bindings[0].HostIp==='127.0.0.1','Local loopback required');
 const env=Object.fromEntries(db.Config.Env.map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1)];}));
 const box=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(root,'nakama/data/build/index.js'),'utf8'),box);
 const api=vm.runInContext('({seedGameData,seedBindSql,parseRemoteSetting,publishConfigRelease})',box);
 const sql=q=>docker(['exec','-i',pg,'psql','-X','-U',env.POSTGRES_USER,'-d',env.POSTGRES_DB,'-v','ON_ERROR_STOP=1','-q','-t','-A'],q);
 const nk={sqlQuery(q,p=[]){q=api.seedBindSql(q,p).replace(/;\s*$/,'');return JSON.parse(sql("SELECT COALESCE(jsonb_agg(to_jsonb(q)),'[]'::jsonb) FROM ("+q+") q;"));}};
 const catalog=JSON.parse(fs.readFileSync(path.join(root,'data/packs.json'),'utf8'));
 const rows=[...catalog.packs_by_tab.daily.map(p=>({...p,tab_id:'daily'})),...catalog.packs_by_tab.resources.filter(p=>p.product_id==='gold_vault').map(p=>({...p,tab_id:'resources'}))];
 assert.equal(rows.length,3);const ids=rows.map(r=>r.product_id),scope="product_id IN ('daily_deal','flash_sale','gold_vault')";
 const getProducts=()=>nk.sqlQuery('SELECT * FROM game_store_products ORDER BY product_id');
 const getRewards=()=>nk.sqlQuery('SELECT * FROM game_store_product_rewards ORDER BY product_id,line_no');
 const beforeProducts=getProducts(),beforeRewards=getRewards();
 const differences=[];
 for(const row of rows){const product=beforeProducts.find(p=>p.product_id===row.product_id);const actual=beforeRewards.filter(r=>r.product_id===row.product_id).map(r=>({reward_type:r.reward_type,reward_id:r.reward_id,quantity:Number(r.quantity),metadata:r.metadata||{}}));
  if(!product||stable(actual)!==stable(row.rewards)||Number(product.ui?.pricing_version)!==250002||product.description!==row.desc)differences.push(row.product_id);
 }
 const release=nk.sqlQuery('SELECT * FROM remote_config_releases ORDER BY config_version DESC LIMIT 1')[0];assert(release,'Published local config required');
 if(mode==='--verify'||!differences.length){assert.equal(differences.length,0,'Catalog does not match');console.log(JSON.stringify({status:'PASS',mode,config_version:release.config_version,products:ids,published:false,player_writes:false}));return;}
 stage='read_settings';
 const settings=nk.sqlQuery('SELECT module,key,value_type,value FROM remote_config_settings WHERE is_active=TRUE ORDER BY module,key');
 const snapshot={system:{},game_play:{}};for(const row of settings)snapshot[row.module][row.key]=api.parseRemoteSetting(row.value_type,String(row.value));
 stage='compare_published_settings';
 assert.equal(stable(snapshot),stable(release.snapshot),'Unrelated unpublished settings must be resolved separately');
 const statements=[],planner=Object.create(nk),logger={info(){},warn(){},error(){}};
 planner.sqlExec=(q,p=[])=>statements.push(p.length?api.seedBindSql(q,p):q);
 const ctx={userId:'local:C173',env:{CONFIG_ADMIN_USER_ID:'local:C173'}};
 stage='compiled_seed_plan';
 const seeded=JSON.parse(api.seedGameData(ctx,logger,planner,JSON.stringify({table:'bundle',requests:[{table:'store_catalog',rows,replace_all:false}]})));assert(seeded.success&&seeded.atomic,'Compiled catalog plan failed: '+String(seeded.message||seeded.error||seeded.status||'unknown'));
 stage='compiled_publication_plan';
 const published=JSON.parse(api.publishConfigRelease(ctx,logger,planner,JSON.stringify({store_url:release.store_url})));assert(published.status==='ok','Compiled publication rejected');assert.equal(statements.length,2);
 for(const statement of statements)assert(!/\b(?:UPDATE|INSERT INTO|DELETE FROM)\s+(?:storage|player_|users|wallet|monetization_)/i.test(statement),'Player mutation forbidden');
 if(mode==='--check'){console.log(JSON.stringify({status:'PASS',mode,differences,config_version:release.config_version,planned_version:published.config_version,player_writes:false}));return;}
 const backupDir=path.join(root,'nakama/backups');fs.mkdirSync(backupDir,{recursive:true});const backup=path.join(backupDir,'C173-packs-'+Date.now()+'.json');
 fs.writeFileSync(backup,JSON.stringify({config_version:release.config_version,products:beforeProducts.filter(p=>ids.includes(p.product_id)),rewards:beforeRewards.filter(p=>ids.includes(p.product_id))},null,2),{flag:'wx',mode:0o600});
 const expectedSettings=api.seedBindSql('$1::jsonb',[JSON.stringify(settings)]);
 const guard=`DO $guard$ BEGIN IF (SELECT MAX(config_version) FROM remote_config_releases) <> ${release.config_version} THEN RAISE EXCEPTION 'C173_RELEASE_CHANGED'; END IF;
 IF (SELECT jsonb_agg(to_jsonb(s)) FROM (SELECT module,key,value_type,value FROM remote_config_settings WHERE is_active=TRUE ORDER BY module,key) s) IS DISTINCT FROM ${expectedSettings} THEN RAISE EXCEPTION 'C173_SETTINGS_CHANGED'; END IF; END $guard$;`;
 sql('BEGIN; SELECT pg_advisory_xact_lock(143,2); LOCK TABLE game_store_products,game_store_product_rewards,remote_config_settings,remote_config_releases IN SHARE ROW EXCLUSIVE MODE;'+guard+statements.join(';')+';COMMIT;');
 const afterProducts=getProducts(),afterRewards=getRewards();
 assert.equal(stable(afterProducts.filter(p=>!ids.includes(p.product_id))),stable(beforeProducts.filter(p=>!ids.includes(p.product_id))),'Other products changed');
 assert.equal(stable(afterRewards.filter(p=>!ids.includes(p.product_id))),stable(beforeRewards.filter(p=>!ids.includes(p.product_id))),'Other reward rows changed');
 for(const row of rows)assert.equal(stable(afterRewards.filter(r=>r.product_id===row.product_id).map(r=>({reward_type:r.reward_type,reward_id:r.reward_id,quantity:Number(r.quantity),metadata:r.metadata||{}}))),stable(row.rewards),'Reward readback mismatch');
 const latest=nk.sqlQuery('SELECT config_version,snapshot FROM remote_config_releases ORDER BY config_version DESC LIMIT 1')[0];assert.equal(latest.config_version,published.config_version);assert.equal(stable(latest.snapshot),stable(release.snapshot));
 console.log(JSON.stringify({status:'PASS',mode,products:ids,config_version:latest.config_version,published:true,player_writes:false,unrelated_catalog_preserved:true,backup:path.relative(root,backup)}));
}
try{main();}catch(error){console.error('FAIL C173 local catalog: '+stage+': '+String(error.message||error.code||'LOCAL_TRANSPORT_ERROR').split('\n')[0].slice(0,160));process.exitCode=1;}
