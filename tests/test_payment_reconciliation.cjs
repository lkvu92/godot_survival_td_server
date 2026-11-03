const assert=require('assert'),cp=require('child_process');
const {validatePolicy,reportSql,makeReport}=require('../tools/payment_reconciliation.cjs');
const policy={schema_version:1,revision:1,lookback_days:30,pending_grace_seconds:86400,delivery_grace_seconds:600};
const results=[];
function test(name,fn){fn();results.push({name,result:'PASS'});}
test('missing/unsafe policy fails closed',()=>{assert.throws(()=>validatePolicy(null));assert.throws(()=>validatePolicy({...policy,lookback_days:'1; DELETE FROM users'}));assert.throws(()=>validatePolicy({...policy,delivery_grace_seconds:0}));});
test('configuration changes query without code rebuild',()=>assert(reportSql({...policy,lookback_days:7}).includes("INTERVAL '7 days'")));
test('configuration revision race rejects report',()=>assert.throws(()=>makeReport({config_version:2,anomalies:{}},policy,1)));
test('review findings are not silently reported clean',()=>assert.equal(makeReport({config_version:1,counts:{},anomalies:{pending_overdue:1}},policy,1).status,'REVIEW_REQUIRED'));
test('SQL is read-only SELECT with no repair operations',()=>assert(!/\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE)\b/i.test(reportSql(policy))));
if(process.argv.includes('--postgres')){
 const setup=`BEGIN;CREATE TEMP TABLE remote_config_releases(config_version INT);INSERT INTO remote_config_releases VALUES(1);
 CREATE TEMP TABLE monetization_purchase_orders(id TEXT,status TEXT,created_at TIMESTAMPTZ DEFAULT NOW(),validated_at TIMESTAMPTZ,updated_at TIMESTAMPTZ DEFAULT NOW(),platform TEXT DEFAULT 'android',vip_environment TEXT DEFAULT 'production',transaction_id TEXT DEFAULT 'GPA-fixture');
 CREATE TEMP TABLE monetization_purchases(request_id TEXT,purchase_order_id TEXT,purchase_token_hash TEXT,status TEXT,created_at TIMESTAMPTZ DEFAULT NOW());
 CREATE TEMP TABLE store_purchase_voids(token_hash TEXT);
 INSERT INTO monetization_purchase_orders(id,status,created_at,validated_at) VALUES('pending-old','pending',NOW()-INTERVAL '2 days',NULL),('valid-old','validated',NOW(),NOW()-INTERVAL '1 hour'),('fulfilled-missing','fulfilled',NOW(),NULL),('ok','fulfilled',NOW(),NULL);
 INSERT INTO monetization_purchases(request_id,purchase_order_id,purchase_token_hash,status) VALUES('ok','ok','duplicate','granted'),('orphan','missing','duplicate','granted');INSERT INTO store_purchase_voids VALUES('duplicate');
 CREATE TEMP TABLE payment_financial_records(purchase_order_id TEXT,currency TEXT,original_amount NUMERIC(30,9));INSERT INTO payment_financial_records VALUES('ok','VND',19000);
 CREATE TEMP TABLE payment_financial_snapshots(purchase_order_id TEXT,refunded_amount NUMERIC(30,9),provider_event_at TIMESTAMPTZ,synced_at TIMESTAMPTZ);INSERT INTO payment_financial_snapshots VALUES('ok',5000,NOW(),NOW());`;
 const out=cp.execFileSync('docker',['exec','-i','survival_td_local-postgres-1','psql','-U','postgres','-d','nakama','-XAtq','-v','ON_ERROR_STOP=1'],{input:setup+reportSql(policy)+'ROLLBACK;',encoding:'utf8'});
 const data=JSON.parse(out.trim());
 test('PostgreSQL detects all seeded anomaly classes',()=>assert.deepEqual(data.anomalies,{pending_overdue:1,validated_delivery_overdue:1,fulfilled_without_purchase:1,purchase_without_order:1,duplicate_purchase_token_groups:1,void_not_applied:2,financial_metadata_missing:1}));
 test('totals remain decimal strings grouped by currency',()=>assert.deepEqual(data.financial_totals_by_currency,[{currency:'VND',original_amount:'19000.000000000',refunded_amount:'5000.000000000'}]));
 results.push({name:'PostgreSQL fixture data',result:'CAPTURED',data:makeReport(data,policy,1)});
}
console.log(JSON.stringify({suite:'B1/C244',generated_at:new Date().toISOString(),environment:'isolated fixtures and optional PostgreSQL temporary tables rolled back; no actual purchases',results},null,2));
