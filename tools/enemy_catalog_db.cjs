const fs=require('fs'),path=require('path'),vm=require('vm'),cp=require('child_process');
const root=path.resolve(__dirname,'..');
function literal(value){if(value===null||value===undefined)return'NULL';if(typeof value==='boolean')return value?'TRUE':'FALSE';if(typeof value==='number'){if(!Number.isFinite(value))throw Error('Invalid number');return String(value);}return "'"+String(value).replaceAll("'","''")+"'";}
function database(container='survival_td_local-postgres-1',name='nakama'){
 if(!/^[a-zA-Z0-9_-]+$/.test(container)||!/^[a-zA-Z0-9_]+$/.test(name))throw Error('Invalid local Docker database target');
 const run=sql=>cp.execFileSync('docker',['exec','-i',container,'psql','-U','postgres','-d',name,'-XAtq','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',maxBuffer:80*1024*1024});
 const bind=(sql,args)=>sql.replace(/\$(\d+)/g,(token,i)=>Number(i)<=args.length?literal(args[Number(i)-1]):token);
 return{run,sqlExec(sql,args=[]){run(bind(sql,args));},sqlQuery(sql,args=[]){const q=bind(sql,args);return JSON.parse(run("SELECT COALESCE(json_agg(row_to_json(t)),'[]'::JSON) FROM ("+q+") t;").trim());}};
}
function runtime(){const context=vm.createContext({JSON,Math,Number,String,Array,Set,Date,isFinite});for(const name of ['server_admin','config_tables','seed','config_rpc','enemy_catalog_rpc'])vm.runInContext(fs.readFileSync(path.join(root,'nakama/data/modules/build',name+'.js'),'utf8'),context);return context;}
module.exports={database,runtime,literal};
if(require.main===module){
 try{
 const args=Object.fromEntries(process.argv.slice(2).map(a=>{const i=a.indexOf('=');return i<0?[a.replace(/^--/,''),true]:[a.slice(2,i),a.slice(i+1)];}));
 const nk=database(args.container,args.database),ctx=runtime();
 ctx.createEnemyCatalogTables(nk);
 const before=ctx.ecRead(nk),expected=String(args['expected-revision']??before.revision);
 if(args.apply||args.publish||args.rollback){if(args['expected-revision']===undefined)throw Error('--expected-revision is required for mutations');}
 const out=path.resolve(args.out||path.join(root,'temp','enemy-catalog'));
 fs.mkdirSync(out,{recursive:true});
 const stamp=new Date().toISOString().replace(/[:.]/g,'-');
 if(args.rollback){const result=nk.sqlQuery('SELECT enemy_catalog_publish(NULL,$1::BIGINT,$2,$3,$4::BIGINT) AS result',[expected,'operator:local-cli',String(args.note||'Local rollback'),String(args.rollback)])[0].result;console.log(JSON.stringify(result));process.exit(0);}
 if(args.normalize){const plan=ctx.ecNormalize(before),projected=ctx.ecProject(plan.draft);if(projected.errors.length)throw Error(projected.errors.join('\n'));const report={dry_run:!args.apply,changes:plan.changes.map(r=>({entity:r.entity,id:r.id,operation:r.operation})),draft_revision:before.revision,counts:projected.counts};if(args.apply&&plan.changes.length){fs.writeFileSync(path.join(out,'before-normalize-'+stamp+'.json'),JSON.stringify(before,null,2));report.result=nk.sqlQuery('SELECT enemy_catalog_batch($1::JSONB,$2::BIGINT,$3) AS result',[JSON.stringify(plan.changes),expected,'operator:local-cli'])[0].result;}fs.writeFileSync(path.join(out,'normalization-'+stamp+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({dry_run:report.dry_run,changes:report.changes.length,counts:report.counts,result:report.result}));process.exit(0);}
 if(args.publish){fs.writeFileSync(path.join(out,'runtime-before-publish-'+stamp+'.json'),JSON.stringify({progression:nk.sqlQuery("SELECT * FROM game_config WHERE key='progression'"),enemies:nk.sqlQuery('SELECT * FROM game_enemies'),waves:nk.sqlQuery('SELECT * FROM game_stage_waves'),config_release:nk.sqlQuery('SELECT * FROM remote_config_releases ORDER BY config_version DESC LIMIT 1')},null,2));const projected=ctx.ecProject(before);if(projected.errors.length)throw Error(projected.errors.join('\n'));fs.writeFileSync(path.join(out,'before-publish-'+stamp+'.json'),JSON.stringify(before,null,2));const result=nk.sqlQuery('SELECT enemy_catalog_publish($1::JSONB,$2::BIGINT,$3,$4) AS result',[JSON.stringify(projected.snapshot),expected,'operator:local-cli',String(args.note||'Local enemy catalog publication')])[0].result;console.log(JSON.stringify(result));process.exit(0);}
 if(!args['asset-sources'])throw Error('--asset-sources=<client-exported JSON> is required');
 const sources=JSON.parse(fs.readFileSync(path.resolve(args['asset-sources']),'utf8'));
 const imported=ctx.ecMigration(nk,sources),projected=ctx.ecProject(imported);
 const report={dry_run:!args.apply,counts:projected.counts,errors:projected.errors,legacy_stage_ids:imported.metadata.legacy_stage_ids,draft_revision:before.revision};
 fs.writeFileSync(path.join(out,'migration-'+stamp+'.json'),JSON.stringify(report,null,2));
 if(projected.errors.length)throw Error(projected.errors.slice(0,30).join('\n'));
 if(args.apply){fs.writeFileSync(path.join(out,'before-import-'+stamp+'.json'),JSON.stringify({draft:before,imported},null,2));const bundle={metadata:imported.metadata};for(const [kind,table] of Object.entries({catalog:'enemy_catalog',visual_set:'enemy_visual_sets',visual_asset:'enemy_visual_assets',skill:'enemy_skill_catalog',stage_entry:'enemy_stage_entries'}))bundle[table]=imported[kind];report.result=nk.sqlQuery('SELECT enemy_catalog_import($1::JSONB,$2::BIGINT,$3) AS result',[JSON.stringify(bundle),expected,'operator:local-cli'])[0].result;}
 console.log(JSON.stringify(report,null,2));
 }catch(e){console.error(e.message);process.exitCode=1;}
}
