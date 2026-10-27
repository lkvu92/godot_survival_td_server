// Run only after support has independently verified ownership. Never exposed over HTTP.
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {newToken,hash} from './security.js';
const args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split('=')));
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
if(!uuid.test(args.user||'')||args.confirm!==args.user||! /^[A-Za-z0-9_-]{4,80}$/.test(args.case||'')) {
 console.error('Usage: node src/operator.js --user=<UUID> --confirm=<same UUID> --case=<verified support case reference>');process.exit(1);
}
if(args.user==='00000000-0000-0000-0000-000000000000')throw Error('System account cannot be deleted');
const db=new pg.Client();await db.connect();
try{
 await db.query('BEGIN');
 const owner=await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[args.user]);if(!owner.rowCount)throw Error('Account not found');
 await db.query(`SELECT g.server_id FROM game_servers g WHERE EXISTS(SELECT 1 FROM player_characters c WHERE c.server_id=g.server_id
   AND (c.account_id=$1 OR c.account_id IN(SELECT user_id FROM account_link_state WHERE merged_into=$1 AND status='archived'))) ORDER BY g.server_id FOR UPDATE`,[args.user]);
 const lifecycle=await db.query(`SELECT 1 FROM server_lifecycle_jobs j JOIN player_characters c ON c.server_id=j.server_id
   WHERE (c.account_id=$1 OR c.account_id IN(SELECT user_id FROM account_link_state WHERE merged_into=$1 AND status='archived')) AND j.status<>'succeeded' LIMIT 1`,[args.user]);if(lifecycle.rowCount)throw Error('Server lifecycle active; resolve before deletion');
 const lock=await db.query(`INSERT INTO account_link_state(user_id,status,active_requests) VALUES($1,'deleting',0)
   ON CONFLICT(user_id) DO UPDATE SET status='deleting' WHERE account_link_state.status='active' RETURNING user_id`,[args.user]);if(!lock.rowCount)throw Error('Account already archived/deleting');
 const receipt=newToken(),id=randomUUID();
 await db.query('INSERT INTO account_identity_deletions(id,user_id,receipt_hash) VALUES($1,$2,$3)',[id,args.user,hash(receipt)]);
 await db.query('COMMIT');
 console.log(JSON.stringify({job_id:id,case_reference:args.case,receipt,status:'queued'}));
}catch(error){await db.query('ROLLBACK');console.error('Support deletion not queued:',error.code||error.message);process.exitCode=1;}
finally{await db.end();}
