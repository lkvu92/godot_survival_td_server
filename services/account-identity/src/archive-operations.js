import {seal,unseal,hash} from './security.js';
const denied=()=>Object.assign(Error('ARCHIVE_ROLE_DENIED'),{code:'42501'});
export function retentionKeys(env){
 let keys={};try{keys=env.ACCOUNT_RETENTION_KEYS_JSON?JSON.parse(env.ACCOUNT_RETENTION_KEYS_JSON):{};}catch{throw Error('INVALID_RETENTION_KEYRING');}
 if(!keys||typeof keys!=='object'||Array.isArray(keys))throw Error('INVALID_RETENTION_KEYRING');
 if(env.ACCOUNT_RETENTION_KEY_ID&&env.ACCOUNT_RETENTION_KEY){
  if(keys[env.ACCOUNT_RETENTION_KEY_ID]&&keys[env.ACCOUNT_RETENTION_KEY_ID]!==env.ACCOUNT_RETENTION_KEY)throw Error('RETENTION_KEY_ID_COLLISION');
  keys[env.ACCOUNT_RETENTION_KEY_ID]=env.ACCOUNT_RETENTION_KEY;
 }
 for(const [id,key] of Object.entries(keys))if(!/^[A-Za-z0-9_-]{1,64}$/.test(id)||typeof key!=='string'||!/^[a-f0-9]{64}$/i.test(key)||key===env.ACCOUNT_IDENTITY_SECRET||key===env.ACCOUNT_IDENTITY_OUTBOX_KEY)throw Error('INVALID_RETENTION_KEYRING');
 return keys;
}
export async function assertArchiveRole(db,role){
 const r=await db.query('SELECT pg_has_role(current_user,$1,\'MEMBER\') AS allowed',[role]);if(r.rows[0]?.allowed!==true)throw denied();
}
export async function rotateArchive(db,id,keys,targetKeyId,caseRef){
 await assertArchiveRole(db,'c250_archive_rotation');
 const a=(await db.query('SELECT payload,key_id,content_digest,expired_at FROM public.account_retention_archives WHERE deletion_id=$1',[id])).rows[0];
 if(!a||a.expired_at||!a.payload)throw Error('ARCHIVE_EXPIRED_OR_MISSING');
 if(!keys[a.key_id]||!keys[targetKeyId])throw Error('RETENTION_KEY_MISSING');
 if(a.content_digest!==hash(a.payload))throw Error('ARCHIVE_INTEGRITY_FAILED');
 const value=unseal(a.payload,keys[a.key_id]);if(value.schema_version!==3||!Array.isArray(value.subjects))throw Error('ARCHIVE_SCHEMA_INVALID');
 if(a.key_id===targetKeyId)return false;
 if(keys[a.key_id]===keys[targetKeyId])throw Error('ROTATION_REQUIRES_NEW_KEY');
 const payload=seal(value,keys[targetKeyId]);
 return (await db.query('SELECT public.account_archive_rotate_commit($1,$2,$3,$4,$5,$6) AS changed',[id,a.content_digest,targetKeyId,payload,hash(payload),caseRef])).rows[0].changed;
}
export async function expireArchive(db,id,caseRef){
 await assertArchiveRole(db,'c250_archive_expiry');
 return (await db.query('SELECT public.account_archive_expire($1,$2) AS changed',[id,caseRef])).rows[0].changed;
}
export function expiryPolicy(p){
 if(!p||p.schema_version!==1||p.enabled!==true||typeof p.revision!=='string'||!p.revision.trim()||!Number.isInteger(p.batch_size)||p.batch_size<1||p.batch_size>200||p.identity_expiry?.enabled!==true)return null;
 const e=p.identity_expiry;
 if(typeof e.approval_reference!=='string'||e.approval_reference.trim().length<4||['pending','draft','none'].includes(e.approval_reference.trim().toLowerCase())||typeof e.approved_by!=='string'||e.approved_by.trim().length<2||typeof e.effective_at!=='string'||!Number.isFinite(Date.parse(e.effective_at))||Date.parse(e.effective_at)>Date.now())return null;
 return p;
}
export async function tickArchiveExpiry(db){
 const p=expiryPolicy((await db.query('SELECT policy FROM account_archive_expiry_policy')).rows[0]?.policy);if(!p)return 0;
 const jobs=(await db.query('SELECT deletion_id FROM account_archive_expiry_candidates ORDER BY retain_until LIMIT $1',[p.batch_size])).rows;
 let count=0;for(const j of jobs)if(await expireArchive(db,j.deletion_id,'worker-expiry-'+p.revision))count++;return count;
}
