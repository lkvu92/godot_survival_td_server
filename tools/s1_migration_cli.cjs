// Operator boundary for the offline SQL migration. No credentials in reports/arguments.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {migrationSql}=require('./migrate_s1.cjs');
function options(args){
  const flags=new Set(['runtime-stopped','ack-production']);const result={};
  const values=new Set(['mode','environment','host','port','user','database','psql','pg-dump','pg-restore','backup','plan-hash','confirm-target','report']);
  for(let i=0;i<args.length;i++){
    const key=args[i].replace(/^--/,'');
    if(args[i]!== '--'+key||result[key]!==undefined)throw Error('Invalid or repeated option: '+args[i]);
    if(flags.has(key))result[key]=true;
    else if(values.has(key)&&args[i+1]&&!args[i+1].startsWith('--'))result[key]=args[++i];
    else throw Error('Unknown option or missing value: '+args[i]);
  }
  result.mode=result.mode||'plan';result.host=result.host||'127.0.0.1';result.port=result.port||'5432';result.database=result.database||'nakama';result.user=result.user||'postgres';
  if(!['plan','backup','apply','verify'].includes(result.mode))throw Error('Mode must be plan, backup, apply or verify');
  if(!['local','staging','production'].includes(result.environment))throw Error('Explicit --environment local|staging|production required (also for tunnels)');
  if(!/^\d+$/.test(result.port)||Number(result.port)<1||Number(result.port)>65535)throw Error('Invalid port');
  for(const key of ['host','database','user'])if(!result[key]||/[\r\n\s]/.test(result[key])||result[key].startsWith('-')||result[key].includes('://'))throw Error('Use plain host/database/user; credentials belong in PGPASSFILE or PGSERVICE');
  if(result.environment==='local'&&!['127.0.0.1','localhost','::1'].includes(result.host))throw Error('Local environment requires a loopback host');
  if(['backup','apply'].includes(result.mode)){
    if(!result['runtime-stopped'])throw Error('Stop ALL Nakama nodes, schedulers, verifier and external writers; supply --runtime-stopped');
    if(!result['confirm-target'])throw Error('--confirm-target CLUSTER_ID/DATABASE from plan is required');
    if(result.environment==='production'&&!result['ack-production'])throw Error('Production mutation requires --ack-production');
    if(!result.backup)throw Error('--backup absolute archive path required');
    if(!path.isAbsolute(result.backup))throw Error('Backup path must be absolute');
  }
  return result;
}
function run(exe,args,input){
  const r=spawnSync(exe,args,{input,encoding:'utf8',maxBuffer:16*1024*1024,windowsHide:true});
  if(r.error)throw Error('Cannot execute '+path.basename(exe)+': '+r.error.message);
  if(r.status!==0)throw Error(path.basename(exe)+' failed: '+String(r.stderr).slice(0,4000));
  return r.stdout.trim();
}
function fileHash(file){
  return new Promise((resolve,reject)=>{const hash=crypto.createHash('sha256'),stream=fs.createReadStream(file);stream.on('data',chunk=>hash.update(chunk));stream.on('error',reject);stream.on('end',()=>resolve(hash.digest('hex')));});
}
async function main(args){
  const o=options(args),conn=['-h',o.host,'-p',o.port,'-U',o.user,'-d',o.database];
  const sql=query=>run(o.psql||'psql',['-X','-q','-A','-t',...conn,'-v','ON_ERROR_STOP=1','-f','-'],query);
  const plan=JSON.parse(sql(migrationSql('plan'))),target=plan.cluster_id+'/'+plan.database;
  if(o['confirm-target']&&o['confirm-target']!==target)throw Error('Database identity does not match --confirm-target');
  let report={environment:o.environment,target,mode:o.mode,timestamp:new Date().toISOString(),plan};
  if(o.mode==='backup'){
    if(fs.existsSync(o.backup)||fs.existsSync(o.backup+'.manifest.json'))throw Error('Backup already exists; never overwrite a recovery archive');
    run(o['pg-dump']||'pg_dump',[...conn,'--format=custom','--file='+o.backup]);
    run(o['pg-restore']||'pg_restore',['--list',o.backup]);
    const after=JSON.parse(sql(migrationSql('plan')));
    if(after.manifest_hash!==plan.manifest_hash)throw Error('Source changed during backup; archive cannot authorize apply');
    const manifest={environment:o.environment,target,plan_hash:plan.manifest_hash,sha256:await fileHash(o.backup),created_at:new Date().toISOString()};
    fs.writeFileSync(o.backup+'.manifest.json',JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
    report.backup={path:o.backup,...manifest};
  } else if(o.mode==='apply'){
    if(!/^[a-f0-9]{64}$/.test(o['plan-hash']||''))throw Error('--plan-hash from plan/backup required');
    const manifest=JSON.parse(fs.readFileSync(o.backup+'.manifest.json','utf8'));
    if(manifest.environment!==o.environment||manifest.target!==target||manifest.plan_hash!==o['plan-hash']||manifest.sha256!==await fileHash(o.backup))throw Error('Backup manifest/target/hash mismatch');
    run(o['pg-restore']||'pg_restore',['--list',o.backup]);
    report.result=JSON.parse(sql(migrationSql('apply',o['plan-hash'],true)).split('\n').filter(line=>line.startsWith('{')).pop());
    report.verification=JSON.parse(sql(migrationSql('verify')));
    validateVerification(report.verification);
  } else if(o.mode==='verify'){
    const output=sql(migrationSql('verify'));if(!output)throw Error('Migration checkpoint not found');
    report.verification=JSON.parse(output);validateVerification(report.verification);
  }
  if(o.report)fs.writeFileSync(o.report,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify(report,null,2));
}
function validateVerification(v){if(!v||v.missing_or_changed!==0||v.missing_characters!==0||v.source_unchanged!==true)throw Error('S1 reconciliation failed; keep writers stopped and feature disabled');}
module.exports={main,options,validateVerification};
