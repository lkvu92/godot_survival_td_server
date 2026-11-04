import {createHmac,createCipheriv,createDecipheriv,randomBytes,timingSafeEqual} from 'node:crypto';
import {hash} from './security.js';
import {assertArchiveRole} from './archive-operations.js';
import {assertNativeSchema} from './archive.js';
const key=k=>{if(typeof k!=='string'||!/^[a-f0-9]{64}$/i.test(k))throw Error('RECOVERY_KEY_INVALID');return Buffer.from(k,'hex');};
export function encryptBackup(bytes,secret){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(secret),iv);cipher.setAAD(Buffer.from('C250-backup-v1'));
 const data=Buffer.concat([cipher.update(bytes),cipher.final()]);return Buffer.concat([Buffer.from('C250v1'),iv,cipher.getAuthTag(),data]);
}
export function decryptBackup(bytes,secret){
 if(bytes.subarray(0,6).toString()!=='C250v1'||bytes.length<35)throw Error('BACKUP_FORMAT_INVALID');
 const cipher=createDecipheriv('aes-256-gcm',key(secret),bytes.subarray(6,18));cipher.setAAD(Buffer.from('C250-backup-v1'));cipher.setAuthTag(bytes.subarray(18,34));
 return Buffer.concat([cipher.update(bytes.subarray(34)),cipher.final()]);
}
const financeTables=['monetization_purchase_orders','monetization_purchases','store_receipt_reservations','payment_financial_records','payment_financial_snapshots','payment_financial_attempts','purchase','subscription','wallet_ledger','server_financial_inbox'];
async function financeFingerprint(db){
 const result={};for(const t of financeTables){const r=(await db.query(`SELECT count(*)::int AS count,COALESCE(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb)::text AS canonical FROM public.${t} r`)).rows[0];result[t]={count:r.count,digest:hash(r.canonical)};}return result;
}
// A restore may only open when every private consent receipt and current choice
// matches the latest independently authenticated checkpoint. Never replay an
// older grant over a withdrawal. The keyed digest does not expose receipt data.
async function privacyFingerprint(db,secret){
 const row=(await db.query("SELECT count(*)::int AS count,COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.user_id,s.key),'[]'::jsonb)::text AS canonical FROM public.storage s WHERE s.collection='privacy_consent'")).rows[0];
 return {count:row.count,digest:createHmac('sha256',key(secret)).update('C250-privacy:'+row.canonical).digest('hex')};
}
async function claims(db,secret){
 const rows=(await db.query(`SELECT u.id,u.username,u.email,encode(u.password,'hex') AS credential_hash,u.google_id,u.facebook_id,u.apple_id,u.gamecenter_id,u.steam_id,u.custom_id,u.facebook_instant_game_id,
 COALESCE((SELECT jsonb_agg(d.id ORDER BY d.id) FROM public.user_device d WHERE d.user_id=u.id),'[]'::jsonb) AS devices
 FROM public.users u WHERE u.id<>'00000000-0000-0000-0000-000000000000' AND u.disable_time<=to_timestamp(0) ORDER BY u.id`)).rows;
 return rows.map(r=>({id:r.id,digest:createHmac('sha256',key(secret)).update('C250-claim:'+JSON.stringify(r)).digest('hex')}));
}
export async function exportLedger(db,secret,inTransaction=false){
 key(secret);await assertArchiveRole(db,'c250_archive_restore');
 await db.query("SET TIME ZONE 'UTC'");
 if(!inTransaction)await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 try{
  const jobs=(await db.query('SELECT to_jsonb(d) AS value FROM public.account_identity_deletions d ORDER BY id')).rows.map(r=>r.value);
  const archives=(await db.query('SELECT to_jsonb(a) AS value FROM public.account_retention_archives a ORDER BY deletion_id')).rows.map(r=>r.value);
  const holds=(await db.query('SELECT to_jsonb(h) AS value FROM public.account_archive_holds h ORDER BY id')).rows.map(r=>r.value);
  const audit=(await db.query('SELECT to_jsonb(a) AS value FROM public.account_archive_audit a ORDER BY id')).rows.map(r=>r.value);
  const body=JSON.stringify({schema_version:1,created_at:new Date().toISOString(),nonce:randomBytes(16).toString('hex'),jobs,archives,holds,audit,claims:await claims(db,secret),finance:await financeFingerprint(db),privacy:await privacyFingerprint(db,secret)});
  if(!inTransaction)await db.query('COMMIT');return {schema_version:1,body,mac:createHmac('sha256',key(secret)).update('C250-ledger:'+body).digest('hex'),checkpoint:hash(body)};
 }catch(e){if(!inTransaction)await db.query('ROLLBACK');throw e;}
}
export function verifyLedger(envelope,secret,expectedCheckpoint){
 key(secret);
 if(!envelope||envelope.schema_version!==1||typeof envelope.body!=='string'||!/^[a-f0-9]{64}$/.test(envelope.mac||'')||!/^[a-f0-9]{64}$/.test(expectedCheckpoint||'')||hash(envelope.body)!==expectedCheckpoint)throw Error('RECOVERY_CHECKPOINT_INVALID');
 const expected=createHmac('sha256',key(secret)).update('C250-ledger:'+envelope.body).digest();if(!timingSafeEqual(expected,Buffer.from(envelope.mac,'hex')))throw Error('RECOVERY_LEDGER_AUTH_FAILED');
 const data=JSON.parse(envelope.body);
 if(data.schema_version!==1||!Array.isArray(data.jobs)||!Array.isArray(data.archives)||!Array.isArray(data.holds)||!Array.isArray(data.audit)||!Array.isArray(data.claims)||!data.finance||!data.privacy||!Number.isSafeInteger(data.privacy.count)||data.privacy.count<0||!/^[a-f0-9]{64}$/.test(data.privacy.digest||'')||!Number.isFinite(Date.parse(data.created_at))||Date.parse(data.created_at)>Date.now()+30000)throw Error('RECOVERY_LEDGER_SCHEMA_INVALID');
 return data;
}
export async function reconcileLedger(db,envelope,secret,expectedCheckpoint){
 await assertArchiveRole(db,'c250_archive_restore');
 const name=(await db.query('SELECT current_database() AS name')).rows[0].name;
 if(!/^c250_restore_[a-z0-9_]+$/.test(name))throw Error('RESTORE_TARGET_NOT_DISPOSABLE');
 // Persist closure BEFORE checking an untrusted/corrupted envelope or replaying changes.
 await db.query("UPDATE public.account_archive_restore_gate SET state='blocked',report='{}',updated_at=NOW() WHERE singleton=TRUE");
 const data=verifyLedger(envelope,secret,expectedCheckpoint);
 await assertNativeSchema(db);
 const report={replayed:0,missing_subjects:0,missing_current_owners:0,changed_current_claims:0,financial_mismatches:0,privacy_mismatches:0,unsupported_jobs:0,unknown_restore_jobs:0,state:'blocked'};
 await db.query("SET TIME ZONE 'UTC'");await db.query('BEGIN');
 try{
  const known=new Set(data.jobs.map(j=>j.id));
  report.unknown_restore_jobs=(await db.query('SELECT id FROM public.account_identity_deletions')).rows.filter(j=>!known.has(j.id)).length;
  for(const j of data.jobs){
   if(j.flow_version!==3){report.unsupported_jobs++;continue;}
   // An old purged checkpoint cannot be replayed by deleting gameplay under v3.4.
   // Keep the restore gate blocked for an operator to reconcile it separately.
   if(j.status==='gameplay_purged'){report.unsupported_jobs++;continue;}
   const existing=(await db.query('SELECT user_id FROM public.account_identity_deletions WHERE id=$1',[j.id])).rows[0];
   if(!existing||existing.user_id!==j.user_id){report.unsupported_jobs++;continue;}
   if(!j.identity_released_at){
    if(j.status==='cancelled')await db.query("UPDATE public.account_identity_deletions SET status='cancelled',updated_at=NOW() WHERE id=$1",[j.id]);
    else if(j.status==='soft_deleted'){
     await db.query("UPDATE public.account_identity_deletions SET status='soft_deleted',restore_until=$2,policy_snapshot=$3::jsonb WHERE id=$1",[j.id,j.restore_until,JSON.stringify(j.policy_snapshot)]);
     await db.query("UPDATE public.account_link_state SET status='deleting' WHERE user_id=$1",[j.user_id]);
     await db.query('UPDATE public.player_login_sessions SET generation=$2 WHERE user_id=$1',[j.user_id,'recovery-'+expectedCheckpoint]);
     await db.query('DELETE FROM public.account_identity_challenges WHERE user_id=$1',[j.user_id]);
    }else report.unsupported_jobs++;
    continue;
   }
   const ids=j.subject_manifest;
   if(!Array.isArray(ids)||!ids.includes(j.user_id)||ids.some(id=>!/^[a-f0-9-]{36}$/.test(id)||id==='00000000-0000-0000-0000-000000000000'))throw Error('RECOVERY_SUBJECT_MANIFEST_INVALID');
   const count=(await db.query('SELECT count(*)::int AS count FROM public.users WHERE id=ANY($1::uuid[])',[ids])).rows[0].count;
   if(count!==ids.length){report.missing_subjects+=ids.length-count;continue;}
   await db.query(`UPDATE public.users SET email=NULL,password=NULL,google_id=NULL,facebook_id=NULL,gamecenter_id=NULL,steam_id=NULL,custom_id=NULL,facebook_instant_game_id=NULL,apple_id=NULL,
    username='archived_'||replace(id::text,'-',''),display_name=NULL,avatar_url=NULL,location=NULL,timezone=NULL,metadata='{}',disable_time=NOW(),update_time=NOW() WHERE id=ANY($1::uuid[])`,[ids]);
   await db.query('DELETE FROM public.user_device WHERE user_id=ANY($1::uuid[])',[ids]);
   await db.query("DELETE FROM public.storage WHERE user_id=ANY($1::uuid[]) AND collection='compliance_activation'",[ids]);
   await db.query('UPDATE public.storage SET read=0,write=0 WHERE user_id=ANY($1::uuid[])',[ids]);
   await db.query('DELETE FROM public.account_identity_verifications WHERE user_id=ANY($1::uuid[])',[ids]);
   await db.query('DELETE FROM public.account_identity_challenges WHERE user_id=ANY($1::uuid[])',[ids]);
   await db.query('UPDATE public.player_login_sessions SET generation=$2 WHERE user_id=ANY($1::uuid[])',[ids,'recovery-'+expectedCheckpoint]);
   const a=data.archives.find(a=>a.deletion_id===j.id);if(!a)throw Error('RECOVERY_ARCHIVE_FACT_MISSING');
   await db.query(`INSERT INTO public.account_retention_archives(deletion_id,payload,retain_until,hold,key_id,content_digest,expired_at) VALUES($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT(deletion_id) DO UPDATE SET payload=EXCLUDED.payload,retain_until=EXCLUDED.retain_until,hold=EXCLUDED.hold,key_id=EXCLUDED.key_id,content_digest=EXCLUDED.content_digest,expired_at=EXCLUDED.expired_at`,[j.id,a.expired_at?'':a.payload,a.retain_until,a.hold,a.expired_at?null:a.key_id,a.expired_at?null:a.content_digest,a.expired_at]);
   await db.query(`UPDATE public.account_identity_deletions SET status='archived',flow_version=3,archived_at=$2,identity_released_at=$3,gameplay_purge_at=$4,subject_manifest=$5::jsonb,policy_snapshot=$6::jsonb,hold=$7 WHERE id=$1`,[j.id,j.archived_at,j.identity_released_at,j.gameplay_purge_at,JSON.stringify(ids),JSON.stringify(j.policy_snapshot),j.hold]);
   if(j.status!=='archived')report.unsupported_jobs++;
   report.replayed++;
  }
  for(const h of data.holds)await db.query(`INSERT INTO public.account_archive_holds(id,deletion_id,action,actor,reason,created_at,released_at,released_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
   ON CONFLICT(id) DO UPDATE SET released_at=EXCLUDED.released_at,released_by=EXCLUDED.released_by`,[h.id,h.deletion_id,h.action,h.actor,h.reason,h.created_at,h.released_at,h.released_by]);
  for(const j of data.jobs)if(j.status==='cancelled'&&!data.jobs.some(other=>other.user_id===j.user_id&&other.status!=='cancelled')){
   await db.query("UPDATE public.account_link_state SET status='active' WHERE user_id=$1 AND status='deleting'",[j.user_id]);
   await db.query('UPDATE public.player_login_sessions SET generation=$2 WHERE user_id=$1',[j.user_id,'recovery-'+expectedCheckpoint]);
   await db.query('DELETE FROM public.account_identity_challenges WHERE user_id=$1',[j.user_id]);
  }
  for(const event of data.audit)await db.query('INSERT INTO public.account_archive_recovered_audit(checkpoint_digest,source_audit_id,event) VALUES($1,$2,$3::jsonb) ON CONFLICT DO NOTHING',[expectedCheckpoint,event.id,JSON.stringify(event)]);
  const current=new Map((await claims(db,secret)).map(c=>[c.id,c.digest]));
  for(const c of data.claims){if(!current.has(c.id))report.missing_current_owners++;else if(current.get(c.id)!==c.digest)report.changed_current_claims++;}
  // An unexpected active owner in the old backup is not silently authorized either.
  for(const id of current.keys())if(!data.claims.some(c=>c.id===id))report.changed_current_claims++;
  const finance=await financeFingerprint(db);for(const t of financeTables)if(JSON.stringify(finance[t])!==JSON.stringify(data.finance[t]))report.financial_mismatches++;
  if(JSON.stringify(await privacyFingerprint(db,secret))!==JSON.stringify(data.privacy))report.privacy_mismatches++;
  if(!Object.entries(report).some(([k,v])=>!['replayed','state'].includes(k)&&v!==0))report.state='ready';
  await db.query('UPDATE public.account_archive_restore_gate SET state=$1,checkpoint_digest=$2,report=$3::jsonb,updated_at=NOW() WHERE singleton=TRUE',[report.state,expectedCheckpoint,JSON.stringify(report)]);
  await db.query('COMMIT');return report;
 }catch(e){await db.query('ROLLBACK');throw e;}
}
