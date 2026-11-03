import {seal,hash} from './security.js';
import {createHmac} from 'node:crypto';
const unavailable=()=>Object.assign(Error('DELETION_POLICY_UNAVAILABLE'),{status:503});
const integer=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
export const dataset=(p,id)=>p.datasets.find(d=>d.id===id);
export function validateArchivePolicy(p) {
 if(!p||p.schema_version!==2||p.enabled!==true||!integer(p.soft_delete_days,1,365)||typeof p.revision!=='string'||!p.revision.trim()||p.timezone!=='Asia/Ho_Chi_Minh'||p.identity_release_event!=='archive_committed'||p.restore_before_deadline_only!==true||p.minimal_user_mode!=='retained_tombstone'||typeof p.archive_transition_enabled!=='boolean'||typeof p.gameplay_purge_enabled!=='boolean'||!Array.isArray(p.datasets))throw unavailable();
 if(p.datasets.length!==4||new Set(p.datasets.map(d=>d.id)).size!==4)throw unavailable();
 for(const [id,processor,trigger] of [['gameplay','account_gameplay_cleanup_v1','archive_committed'],['player_identity','protected_identity_archive_v1','confirmed_deletion']]){
  const d=dataset(p,id);if(!d||d.processor!==processor||d.trigger!==trigger||!integer(d.calendar_months,1,120))throw unavailable();
 }
 for(const id of ['billing_transaction','minimal_user'])if(dataset(p,id)?.mode!=='retain_review_required')throw unavailable();
 const w=p.worker,r=p.reauth;
 if(!w||!integer(w.scan_interval_seconds,1,604800)||!integer(w.batch_size,1,200)||!integer(w.lease_seconds,30,600)||!integer(w.retry_backoff_seconds,1,86400)||!integer(w.max_attempts,1,100)||!r||!integer(r.google_max_age_seconds,30,900)||!integer(r.email_link_ttl_seconds,60,3600)||!/^[A-Za-z0-9_-]{1,64}$/.test(p.retention_key_id||'')||typeof p.notice_template_revision!=='string'||!p.notice_template_revision)throw unavailable();
 return JSON.parse(JSON.stringify(p));
}
export async function archivePolicy(db){return validateArchivePolicy((await db.query("SELECT snapshot#>'{system,account_deletion}' AS policy FROM remote_config_releases ORDER BY config_version DESC LIMIT 1")).rows[0]?.policy);}
// Explicit native-schema adapter: Nakama 3.24.2, one PG transaction, NO accountDeleteId.
const nativeColumns='id username display_name avatar_url lang_tag location timezone metadata wallet email password facebook_id google_id gamecenter_id steam_id custom_id edge_count create_time update_time verify_time disable_time facebook_instant_game_id apple_id'.split(' ');
export async function assertNativeSchema(db){
 const {rows}=await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='users'");
 if(rows.length!==nativeColumns.length||rows.some(r=>!nativeColumns.includes(r.column_name)))throw Error('NATIVE_SCHEMA_REVIEW_REQUIRED');
}
async function hold(db,id,action){return (await db.query("SELECT 1 FROM account_archive_holds WHERE deletion_id=$1 AND released_at IS NULL AND action=ANY($2::text[]) LIMIT 1",[id,['all',action]])).rowCount>0;}
export async function archiveAccount(db,id,key,keyId,notice,keys){
 if(!/^[a-f0-9]{64}$/i.test(key||''))return false;
 const current=await archivePolicy(db);if(!current.archive_transition_enabled)return false;
 const job=(await db.query("SELECT * FROM account_identity_deletions WHERE id=$1 AND flow_version=3 AND status IN('soft_deleted','archive_failed') AND restore_until<=clock_timestamp() AND next_attempt_at<=NOW() FOR UPDATE SKIP LOCKED",[id])).rows[0];
 if(!job||job.hold||await hold(db,id,'archive'))return false;
 const p=validateArchivePolicy(job.policy_snapshot);
 const archiveKey=keys?keys[p.retention_key_id]:key;
 if(keyId!==current.retention_key_id||!/^[a-f0-9]{64}$/i.test(archiveKey||''))throw Error('RETENTION_KEY_MIGRATION_REQUIRED');
 await db.query("SELECT set_config('statement_timeout',$1,true)",[String(p.worker.lease_seconds*1000)]);
 await assertNativeSchema(db);
 await db.query(`SELECT server_id FROM game_servers WHERE server_id IN(SELECT server_id FROM player_characters WHERE account_id=$1 OR account_id IN(SELECT user_id FROM account_link_state WHERE merged_into=$1 AND status='archived')) ORDER BY server_id FOR UPDATE`,[job.user_id]);
 const subjects=(await db.query("SELECT id FROM users WHERE id=$1 OR id IN(SELECT user_id FROM account_link_state WHERE merged_into=$1 AND status='archived') ORDER BY id FOR UPDATE",[job.user_id])).rows.map(r=>r.id);
 if(!subjects.includes(job.user_id))throw Error('ARCHIVE_OWNER_MISSING');
 const leases=await db.query('SELECT user_id,active_requests FROM account_link_state WHERE user_id=ANY($1::uuid[]) ORDER BY user_id FOR UPDATE',[subjects]);
 if(!leases.rows.some(r=>r.user_id===job.user_id)||leases.rows.some(r=>Number(r.active_requests)>0))return false;
 const busy=await db.query(`SELECT 1 FROM server_lifecycle_jobs j JOIN player_characters c ON c.server_id=j.server_id WHERE c.account_id=ANY($1::uuid[]) AND j.status<>'succeeded' LIMIT 1`,[subjects]);if(busy.rowCount)return false;
 const data=(await db.query(`SELECT u.id,u.email,u.google_id,u.username,s.value AS activation_profile FROM users u LEFT JOIN storage s ON s.user_id=u.id AND s.collection='compliance_activation' AND s.key='profile' WHERE u.id=ANY($1::uuid[]) ORDER BY u.id`,[subjects])).rows;
 const payload=seal({schema_version:3,subjects:data,soft_deleted_at:job.soft_deleted_at,policy:p},archiveKey);
 await db.query(`INSERT INTO account_retention_archives(deletion_id,payload,retain_until,key_id,content_digest) VALUES($1,$2,(($3::timestamptz AT TIME ZONE $4)+$5*INTERVAL '1 month') AT TIME ZONE $4,$6,$7)`,[id,payload,job.soft_deleted_at,p.timezone,dataset(p,'player_identity').calendar_months,p.retention_key_id,hash(payload)]);
 await db.query(`UPDATE users SET email=NULL,password=NULL,google_id=NULL,facebook_id=NULL,gamecenter_id=NULL,steam_id=NULL,custom_id=NULL,facebook_instant_game_id=NULL,apple_id=NULL,
 username='archived_'||replace(id::text,'-',''),display_name=NULL,avatar_url=NULL,location=NULL,timezone=NULL,metadata='{}',disable_time=NOW(),update_time=NOW() WHERE id=ANY($1::uuid[])`,[subjects]);
 await db.query('DELETE FROM user_device WHERE user_id=ANY($1::uuid[])',[subjects]);
 await db.query('DELETE FROM account_identity_verifications WHERE user_id=ANY($1::uuid[])',[subjects]);
 await db.query("DELETE FROM storage WHERE user_id=ANY($1::uuid[]) AND collection='compliance_activation'",[subjects]);
 await db.query('UPDATE storage SET read=0,write=0 WHERE user_id=ANY($1::uuid[])',[subjects]);
 await db.query('DELETE FROM account_identity_challenges WHERE user_id=ANY($1::uuid[])',[subjects]);
 await db.query('UPDATE player_login_sessions SET generation=$2 WHERE user_id=ANY($1::uuid[])',[subjects,'archived-'+id]);
 const committed=(await db.query(`UPDATE account_identity_deletions SET status='archived',archived_at=t.stamp,identity_released_at=t.stamp,subject_manifest=$2::jsonb,
 gameplay_purge_at=((t.stamp AT TIME ZONE $3)+$4*INTERVAL '1 month') AT TIME ZONE $3,updated_at=NOW(),attempts=0,next_attempt_at=NOW(),last_error_code=NULL
 FROM (SELECT clock_timestamp() AS stamp) t WHERE id=$1 RETURNING gameplay_purge_at`,[id,JSON.stringify(subjects),p.timezone,dataset(p,'gameplay').calendar_months])).rows[0];
 const owner=data.find(s=>s.id===job.user_id);
 if(notice&&owner.email&&job.confirmation_hash){
  const receipt=createHmac('sha256',notice.secret).update('C232-deletion:'+job.confirmation_hash).digest('base64url');
  await db.query(`INSERT INTO account_deletion_notices(deletion_id,payload) VALUES($1,$2) ON CONFLICT(deletion_id) DO UPDATE SET payload=EXCLUDED.payload,status='queued',next_attempt_at=NOW(),lease_until=NULL`,[id,seal({event:'archived',email:owner.email,receipt,gameplay_purge_at:committed.gameplay_purge_at},notice.key)]);
 }
 await db.query("INSERT INTO account_archive_audit(deletion_id,action,result) VALUES($1,'archive_committed',$2::jsonb)",[id,JSON.stringify({subjects:subjects.length,key_id:p.retention_key_id,policy_revision:p.revision,identity_released:true})]);
 return true;
}
export async function purgeGameplay(db,id){
 const current=await archivePolicy(db);if(!current.gameplay_purge_enabled)return false;
 const job=(await db.query("SELECT * FROM account_identity_deletions WHERE id=$1 AND flow_version=3 AND status='archived' AND gameplay_purge_at<=clock_timestamp() FOR UPDATE SKIP LOCKED",[id])).rows[0];
 if(!job||job.hold||await hold(db,id,'gameplay_purge'))return false;
 if(!(await db.query("SELECT 1 FROM account_retention_archives WHERE deletion_id=$1 AND payload<>'' AND NOT hold",[id])).rowCount)return false;
 validateArchivePolicy(job.policy_snapshot);
 await db.query('SELECT account_gameplay_cleanup_v1($1::uuid)',[id]);return true;
}
