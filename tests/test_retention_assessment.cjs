'use strict';
const assert=require('assert'),cp=require('child_process');
const {validatePolicy,assessmentSql,makeReport}=require('../tools/retention_assessment.cjs');
const policy={schema_version:1,revision:1,enabled:true,minimum_calendar_months:6,trigger:'explicit_service_stop',legal_reviewed:false};
const input={config_version:5,policy,counts:{verified_profiles:2,deletion_jobs_total:3,deletion_completed:2,deletion_completed_without_profile:1},job_status_counts:{completed:2,queued:1}};
assert.equal(makeReport(input).status,'REVIEW_REQUIRED');assert(makeReport({...input,policy:{...policy,legal_reviewed:true}}).unknowns.includes('service_stop_event'));
for(const bad of [null,{...policy,enabled:false},{...policy,minimum_calendar_months:0},{...policy,minimum_calendar_months:6.5},{...policy,trigger:'last_login'},{...policy,legal_reviewed:'true'}])assert.throws(()=>validatePolicy(bad));
assert.throws(()=>makeReport({...input,counts:{...input.counts,deletion_completed_without_profile:3}}));
assert.throws(()=>makeReport({...input,job_status_counts:{'unexpected-PII':3}}));
assert.throws(()=>makeReport({...input,job_status_counts:{completed:1}}));
assert(!/\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP)\b/i.test(assessmentSql()));
if(process.argv.includes('--postgres')){
 const sql=`BEGIN; CREATE TEMP TABLE remote_config_releases(config_version INT,snapshot JSONB); CREATE TEMP TABLE account_identity_deletions(user_id UUID,status TEXT); CREATE TEMP TABLE storage(user_id UUID,collection TEXT,key TEXT,value JSONB);
 INSERT INTO remote_config_releases VALUES (5,'{"system":{"retention_assessment":{"schema_version":1,"revision":1,"enabled":true,"minimum_calendar_months":6,"trigger":"explicit_service_stop","legal_reviewed":false}}}');
 INSERT INTO account_identity_deletions VALUES ('00000000-0000-0000-0000-000000000001','completed'),('00000000-0000-0000-0000-000000000002','completed'),('00000000-0000-0000-0000-000000000003','queued');
 INSERT INTO storage VALUES ('00000000-0000-0000-0000-000000000001','compliance_activation','profile','{"is_phone_verified":true}'),('00000000-0000-0000-0000-000000000004','compliance_activation','profile','{"is_phone_verified":true}');
 ${assessmentSql()} ROLLBACK;`;
 const out=cp.execFileSync('docker',['exec','-i','survival_td_local-postgres-1','psql','-U','postgres','-d','nakama','-XAtq','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8'});
 const data=JSON.parse(out.trim()),report=makeReport(data);assert.deepEqual(report.counts,input.counts);assert.deepEqual(report.job_status_counts,input.job_status_counts);
}
console.log('PASS retention assessment: validated config, fail closed, aggregate-only report, unknown triggers/holds/backups, no purge'+(process.argv.includes('--postgres')?', PostgreSQL fixture rollback':''));
