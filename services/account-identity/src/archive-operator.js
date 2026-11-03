// Private host CLI; PostgreSQL session identity/role is authoritative, not env USERNAME.
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {rotateArchive,expireArchive,retentionKeys} from './archive-operations.js';
const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
if(!uuid.test(args.job||'')||args.confirm!==args.job||!['hold','release','retry','rotate','expire'].includes(args.action)||!/^[A-Za-z0-9_-]{4,80}$/.test(args.case||''))throw Error('Use --action=hold|release|retry|rotate|expire --job=UUID --confirm=sameUUID --case=reference');
const db=new pg.Client();await db.connect();
try{
 await db.query('BEGIN');let result;
 if(args.action==='rotate')result={success:true,changed:await rotateArchive(db,args.job,retentionKeys(process.env),args['target-key-id'],args.case)};
 else if(args.action==='expire')result={success:true,changed:await expireArchive(db,args.job,args.case)};
 else{
  if(args.action==='hold'&&!['all','archive','gameplay_purge','identity_expiry'].includes(args.scope))throw Error('Invalid scope');
  if(args.action==='release'&&!uuid.test(args.hold||''))throw Error('Hold ID required');
  result=(await db.query('SELECT public.account_archive_manage($1,$2,$3,$4,$5) AS result',[args.job,args.action,args.scope||null,args.action==='hold'?randomUUID():args.hold||null,args.case])).rows[0].result;
 }
 await db.query('COMMIT');console.log(JSON.stringify(result));
}catch{await db.query('ROLLBACK');console.error('Archive operation denied or failed; no change committed.');process.exitCode=1;}finally{await db.end();}
