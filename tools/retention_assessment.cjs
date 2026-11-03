'use strict';
const cp=require('child_process');

function validatePolicy(p){
 if(!p||p.schema_version!==1||!Number.isSafeInteger(p.revision)||p.revision<1||typeof p.enabled!=='boolean'||!Number.isSafeInteger(p.minimum_calendar_months)||p.minimum_calendar_months<1||p.minimum_calendar_months>120||p.trigger!=='explicit_service_stop'||typeof p.legal_reviewed!=='boolean')throw Error('CONFIG_INVALID');
 if(!p.enabled)throw Error('CONFIG_DISABLED');
 return p;
}

function assessmentSql(){
 return `SELECT json_build_object(
 'config_version',(SELECT config_version FROM remote_config_releases ORDER BY config_version DESC LIMIT 1),
 'policy',(SELECT snapshot#>'{system,retention_assessment}' FROM remote_config_releases ORDER BY config_version DESC LIMIT 1),
 'counts',json_build_object(
   'verified_profiles',(SELECT COUNT(*) FROM storage WHERE collection='compliance_activation' AND key='profile' AND value->>'is_phone_verified'='true'),
   'deletion_jobs_total',(SELECT COUNT(*) FROM account_identity_deletions),
   'deletion_completed',(SELECT COUNT(*) FROM account_identity_deletions WHERE status='completed'),
   'deletion_completed_without_profile',(SELECT COUNT(*) FROM account_identity_deletions d WHERE d.status='completed' AND NOT EXISTS(SELECT 1 FROM storage s WHERE s.user_id=d.user_id AND s.collection='compliance_activation' AND s.key='profile'))),
 'job_status_counts',(SELECT COALESCE(json_object_agg(bucket,n),'{}'::json) FROM (SELECT CASE WHEN status IN ('queued','soft_deleted','archive_failed','archived','gameplay_purged','gameplay_review','purge_pending','cancelled','processing','retrying','manual_review','completed') THEN status ELSE 'other' END bucket,COUNT(*) n FROM account_identity_deletions GROUP BY 1) t));`;
}
function makeReport(data){
 if(!data||!Number.isSafeInteger(data.config_version)||data.config_version<1)throw Error('CONFIG_INVALID');
 const p=validatePolicy(data.policy),keys=['verified_profiles','deletion_jobs_total','deletion_completed','deletion_completed_without_profile'];
 if(!data.counts||keys.some(k=>!Number.isSafeInteger(data.counts[k])||data.counts[k]<0)||!data.job_status_counts||typeof data.job_status_counts!=='object'||Array.isArray(data.job_status_counts))throw Error('DATA_INVALID');
 if(Object.entries(data.job_status_counts).some(([k,v])=>!['queued','soft_deleted','archive_failed','archived','gameplay_purged','gameplay_review','purge_pending','cancelled','processing','retrying','manual_review','completed','other'].includes(k)||!Number.isSafeInteger(v)||v<0)||Object.values(data.job_status_counts).reduce((a,b)=>a+b,0)!==data.counts.deletion_jobs_total)throw Error('DATA_INVALID');
 if(data.counts.deletion_completed_without_profile>data.counts.deletion_completed||data.counts.deletion_completed>data.counts.deletion_jobs_total)throw Error('DATA_INVALID');
 return {schema_version:1,generated_at:new Date().toISOString(),scope:'aggregate local assessment; no service-stop records or purge authorization',config_version:data.config_version,policy_revision:p.revision,minimum_calendar_months:p.minimum_calendar_months,trigger:p.trigger,legal_reviewed:p.legal_reviewed,status:'REVIEW_REQUIRED',counts:data.counts,job_status_counts:data.job_status_counts,unknowns:['service_stop_event','hold','backup_expiry','whether_completed_job_had_player_information','applicable_current_law'],limitations:['Not a finding of legal noncompliance','Existing deletion flow is not governed by this assessment','No purge, archive or legal hold is performed']};
}
function psql(sql){
 const text=cp.execFileSync('docker',['exec','-i','survival_td_local-postgres-1','psql','-U','postgres','-d','nakama','-XAtq','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',maxBuffer:1024*1024});
 return JSON.parse(text.trim());
}
if(require.main===module){
 try{
  if(process.argv.length!==3||process.argv[2]!=='--local')throw Error('USAGE');
  const data=psql("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL statement_timeout='15s'; "+assessmentSql()+' COMMIT;');
  console.log(JSON.stringify(makeReport(data),null,2));
 }catch(e){const s=String(e.message);console.error('Retention assessment failed: '+(['CONFIG_INVALID','CONFIG_DISABLED','DATA_INVALID','USAGE'].includes(s)?s:'CHECK_LOCAL_DATABASE_AND_CONFIG'));process.exitCode=1;}
}
module.exports={validatePolicy,assessmentSql,makeReport};
