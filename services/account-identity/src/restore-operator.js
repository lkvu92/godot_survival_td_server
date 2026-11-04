// Restricted operator CLI: database credentials and host access are the authorization boundary.
import pg from 'pg';
import {restoreAccount} from './deletion.js';
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const i=a.indexOf('=');return i<0?[a.replace(/^--/,''),'']:[a.slice(0,i).replace(/^--/,''),a.slice(i+1)];}));
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
if(!['list','approve','reject'].includes(args.action)||args.action!=='list'&&(!uuid.test(args.request||'')||args.confirm!==args.request||! /^[A-Za-z0-9_.@-]{4,100}$/.test(args.operator||'')||! /^[A-Za-z0-9_-]{4,80}$/.test(args.case||'')))throw Error('Usage: --action=list OR --action=approve|reject --request=UUID --confirm=UUID --operator=ID --case=CASE');
const db=new pg.Client();await db.connect();
try {
 if(args.action==='list'){
  const result=await db.query(`SELECT r.id,r.user_id,r.status,r.created_at,d.restore_until FROM account_restoration_requests r JOIN account_identity_deletions d ON d.id=r.deletion_id WHERE r.status='pending' ORDER BY r.created_at`);
  console.log(JSON.stringify(result.rows));
 }else{
  await db.query('BEGIN');
  const gate=await db.query("SELECT state FROM account_archive_restore_gate WHERE singleton=TRUE FOR SHARE");
  if(gate.rows[0]?.state!=='ready')throw Error('ARCHIVE_RESTORE_BLOCKED');
  const found=await db.query('SELECT deletion_id FROM account_restoration_requests WHERE id=$1',[args.request]);
  if(!found.rowCount)throw Error('REQUEST_NOT_FOUND');
  const job=await db.query('SELECT id FROM account_identity_deletions WHERE id=$1 FOR UPDATE',[found.rows[0].deletion_id]);
  if(!job.rowCount)throw Error('REQUEST_NOT_FOUND');
  const pending=await db.query("SELECT * FROM account_restoration_requests WHERE id=$1 AND status='pending' FOR UPDATE",[args.request]);
  if(!pending.rowCount)throw Error('REQUEST_ALREADY_REVIEWED');
  const request=pending.rows[0];
  if(args.action==='approve'){
   const current=await db.query("SELECT s.generation FROM player_login_sessions s JOIN account_link_state a ON a.user_id=s.user_id AND a.status='deleting' WHERE s.user_id=$1 FOR UPDATE OF s",[request.user_id]);
   if(!current.rowCount)throw Error('IDENTITY_CHANGED');
   await restoreAccount(db,request.user_id,current.rows[0].generation);
  }
  await db.query('UPDATE account_restoration_requests SET status=$2,reviewed_at=NOW(),reviewed_by=$3,case_reference=$4 WHERE id=$1',[args.request,args.action==='approve'?'approved':'rejected',args.operator,args.case]);
  await db.query('COMMIT');console.log(JSON.stringify({request:args.request,status:args.action==='approve'?'approved':'rejected'}));
 }
}catch(error){await db.query('ROLLBACK').catch(()=>{});console.error('Restoration review failed:',error.code||error.message);process.exitCode=1;}finally{await db.end();}
