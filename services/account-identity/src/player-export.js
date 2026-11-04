import {hash,unseal} from './security.js';
const fields=['full_name','birth_date','phone_number','guardian_name','phone_owner','is_phone_verified','verified_at','email'];
export async function archivedPlayerIdentity(db,userId,keys){
 if(typeof userId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(userId))throw Error('INVALID_USER_ID');
 const {rows}=await db.query(`SELECT a.deletion_id,a.payload,a.key_id,a.content_digest,a.expired_at FROM account_retention_archives a JOIN account_identity_deletions d ON d.id=a.deletion_id WHERE d.user_id=$1::uuid OR d.subject_manifest @> jsonb_build_array($1::text) ORDER BY a.created_at`,[userId]);
 const records=[],warnings=[];
 for(const row of rows){
  if(row.expired_at||!row.payload){warnings.push('Archived identity has expired');continue;}
  if(!keys[row.key_id])throw Error('RETENTION_KEY_MISSING');
  if(hash(row.payload)!==row.content_digest)throw Error('ARCHIVE_INTEGRITY_FAILED');
  const data=unseal(row.payload,keys[row.key_id]);
  if(data.schema_version!==3||!Array.isArray(data.subjects))throw Error('ARCHIVE_SCHEMA_INVALID');
  const subject=data.subjects.find(s=>String(s.id).toLowerCase()===userId.toLowerCase());
  if(!subject)throw Error('ARCHIVE_SUBJECT_MISSING');
  const profile={};for(const field of fields)profile[field]=subject.activation_profile?.[field]??(field==='email'?subject.email:null);
  records.push({source:'archive',deletion_id:row.deletion_id,profile});
 }
 return {records,warnings};
}
