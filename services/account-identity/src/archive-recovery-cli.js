// Offline recovery workbench. Never restores in place or routes production traffic.
import pg from 'pg';
import path from 'node:path';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {encryptBackup,decryptBackup,exportLedger,verifyLedger,reconcileLedger} from './archive-recovery.js';
import {assertArchiveRole} from './archive-operations.js';
const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
const {ACCOUNT_RECOVERY_BACKUP_KEY:encryption,ACCOUNT_RECOVERY_SIGNING_KEY:signing,ACCOUNT_RECOVERY_ARTIFACT_DIR:directory}=process.env;
const existingSecrets=[process.env.ACCOUNT_IDENTITY_SECRET,process.env.ACCOUNT_IDENTITY_OUTBOX_KEY,process.env.ACCOUNT_RETENTION_KEY].filter(Boolean);
if(!['backup','ledger','restore'].includes(args.action)||!directory||!path.isAbsolute(directory)||!/^[a-zA-Z0-9_-]{1,80}$/.test(args.name||'')||!/^[a-f0-9]{64}$/i.test(encryption||'')||!/^[a-f0-9]{64}$/i.test(signing||'')||encryption===signing||existingSecrets.includes(encryption)||existingSecrets.includes(signing))throw Error('Recovery action/name, absolute private artifact directory and independent backup/signing keys required');
await mkdir(directory,{recursive:true,mode:0o700});
const file=name=>{if(!/^[a-zA-Z0-9_.-]{1,100}$/.test(name)||name.includes('..'))throw Error('Invalid artifact filename');return path.join(directory,name);};
const run=(binary,argv,input,db)=>execFileSync(binary,argv,{input,env:{...process.env,...(db?{PGDATABASE:db}:{})},maxBuffer:128*1024*1024,stdio:['pipe','pipe','pipe']});
const db=new pg.Client();await db.connect();let restored;
try{
 await assertArchiveRole(db,'c250_archive_restore');
 if(args.action==='restore'){
  if(!/^c250_restore_[a-z0-9_]+$/.test(args.database||'')||args.confirm!==args.database)throw Error('Explicit new c250_restore_* target/confirmation required');
  const bytes=decryptBackup(await readFile(file(args.backup||'')),encryption);
  const envelope=JSON.parse(decryptBackup(await readFile(file(args.ledger||'')),encryption));verifyLedger(envelope,signing,args.checkpoint);
  await db.query('CREATE DATABASE '+args.database); // Existing target is refused, never dropped.
  run(process.env.PG_RESTORE_PATH||'pg_restore',['--exit-on-error','-d',args.database],bytes,args.database);
  restored=new pg.Client({database:args.database});await restored.connect();
  for(const schema of ['schema.sql','archive-v3.sql','archive-operations.sql','archive-permissions.sql'])await restored.query(await readFile(new URL('../'+schema,import.meta.url),'utf8'));
  const report=await reconcileLedger(restored,envelope,signing,args.checkpoint);console.log(JSON.stringify({target:args.database,...report,traffic_opened:false}));if(report.state!=='ready')process.exitCode=2;
 }else{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const snapshot=(await db.query('SELECT pg_export_snapshot() AS id')).rows[0].id;
  const name=(await db.query('SELECT current_database() AS name')).rows[0].name;
  const ledger=await exportLedger(db,signing,true);
  if(args.action==='backup'){
   const bytes=run(process.env.PG_DUMP_PATH||'pg_dump',['--format=custom','--snapshot='+snapshot,'-d',name]);
   await writeFile(file(args.name+'.backup.enc'),encryptBackup(bytes,encryption),{mode:0o600,flag:'wx'});
  }
  await writeFile(file(args.name+'.ledger.enc'),encryptBackup(Buffer.from(JSON.stringify(ledger)),encryption),{mode:0o600,flag:'wx'});
  await db.query('COMMIT');console.log(JSON.stringify({action:args.action,checkpoint:ledger.checkpoint,artifacts_encrypted:true,plaintext_files:0}));
 }
}catch{
 await db.query('ROLLBACK').catch(()=>{});console.error('Recovery action failed; no traffic opened. Keep any restored target closed and investigate.');process.exitCode=1;
}finally{if(restored)await restored.end();await db.end();}
