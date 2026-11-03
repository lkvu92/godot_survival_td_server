'use strict';
const cp=require('child_process');
function validatePolicy(p){
  if(!p||p.schema_version!==1||!Number.isSafeInteger(p.revision)||p.revision<1)throw Error('CONFIG_REQUIRED');
  for(const [key,min,max] of [['lookback_days',1,365],['pending_grace_seconds',60,604800],['delivery_grace_seconds',60,604800]])if(!Number.isSafeInteger(p[key])||p[key]<min||p[key]>max)throw Error('CONFIG_REQUIRED');
  return p;
}
function reportSql(policy){
 const p=validatePolicy(policy);
 return `WITH orders AS (SELECT * FROM monetization_purchase_orders WHERE created_at>=NOW()-INTERVAL '${p.lookback_days} days'),
 purchases AS (SELECT * FROM monetization_purchases WHERE created_at>=NOW()-INTERVAL '${p.lookback_days} days')
 SELECT json_build_object(
 'config_version',(SELECT config_version FROM remote_config_releases ORDER BY config_version DESC LIMIT 1),
 'counts',json_build_object(
 'orders_in_window',(SELECT COUNT(*) FROM orders),
 'purchases_in_window',(SELECT COUNT(*) FROM purchases)),
 'financial_totals_by_currency',(SELECT COALESCE(json_agg(t),'[]'::json) FROM (
 SELECT f.currency,SUM(f.original_amount)::text AS original_amount,SUM(COALESCE(s.refunded_amount,0))::text AS refunded_amount
 FROM orders o JOIN payment_financial_records f ON f.purchase_order_id=o.id
 LEFT JOIN LATERAL (SELECT refunded_amount FROM payment_financial_snapshots WHERE purchase_order_id=o.id ORDER BY provider_event_at DESC,synced_at DESC LIMIT 1) s ON TRUE
 GROUP BY f.currency ORDER BY f.currency) t),
 'anomalies',json_build_object(
 'pending_overdue',(SELECT COUNT(*) FROM orders WHERE status='pending' AND created_at<NOW()-INTERVAL '${p.pending_grace_seconds} seconds'),
 'validated_delivery_overdue',(SELECT COUNT(*) FROM orders WHERE status='validated' AND COALESCE(validated_at,updated_at)<NOW()-INTERVAL '${p.delivery_grace_seconds} seconds'),
 'fulfilled_without_purchase',(SELECT COUNT(*) FROM orders o WHERE o.status='fulfilled' AND NOT EXISTS(SELECT 1 FROM monetization_purchases p WHERE COALESCE(NULLIF(p.purchase_order_id,''),p.request_id)=o.id)),
 'purchase_without_order',(SELECT COUNT(*) FROM purchases p WHERE NOT EXISTS(SELECT 1 FROM monetization_purchase_orders o WHERE o.id=COALESCE(NULLIF(p.purchase_order_id,''),p.request_id))),
 'duplicate_purchase_token_groups',(SELECT COUNT(*) FROM (SELECT purchase_token_hash FROM purchases WHERE purchase_token_hash<>'' GROUP BY purchase_token_hash HAVING COUNT(*)>1) d),
 'void_not_applied',(SELECT COUNT(*) FROM purchases p JOIN store_purchase_voids v ON v.token_hash=p.purchase_token_hash WHERE p.status<>'voided'),
 'financial_metadata_missing',(SELECT COUNT(*) FROM orders o WHERE o.platform='android' AND o.status='fulfilled' AND COALESCE(o.vip_environment,'')<>'mock' AND o.transaction_id<>'' AND NOT EXISTS(SELECT 1 FROM payment_financial_records f WHERE f.purchase_order_id=o.id))));`;
}
function makeReport(data,policy,configVersion){
 validatePolicy(policy);
 if(!data||data.config_version!==configVersion)throw Error('CONFIG_CHANGED_RETRY');
 return {schema_version:1,generated_at:new Date().toISOString(),scope:'local PostgreSQL ledger; not external provider settlement',config_version:configVersion,policy_revision:policy.revision,status:Object.values(data.anomalies).some(n=>Number(n)>0)?'REVIEW_REQUIRED':'CLEAN',counts:data.counts,anomalies:data.anomalies,financial_totals_by_currency:data.financial_totals_by_currency||[]};
}
function psql(sql){
 const text=cp.execFileSync('docker',['exec','-i','survival_td_local-postgres-1','psql','-U','postgres','-d','nakama','-XAtq','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',maxBuffer:1024*1024});
 return JSON.parse(text.trim());
}
if(require.main===module){
 try{
  if(process.argv.length!==3||process.argv[2]!=='--local')throw Error('USAGE: node tools/payment_reconciliation.cjs --local');
  const active=psql(`BEGIN TRANSACTION READ ONLY; SELECT json_build_object('config_version',config_version,'policy',snapshot#>'{system,payment_reconciliation}') FROM remote_config_releases ORDER BY config_version DESC LIMIT 1; COMMIT;`);
  validatePolicy(active.policy);
  const data=psql('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL statement_timeout=\'15s\'; '+reportSql(active.policy)+' COMMIT;');
  console.log(JSON.stringify(makeReport(data,active.policy,active.config_version),null,2));
 }catch(e){console.error('Payment reconciliation failed: '+(String(e.message).includes('CONFIG_')?e.message:'CHECK_LOCAL_DATABASE_AND_CONFIG'));process.exitCode=1;}
}
module.exports={validatePolicy,reportSql,makeReport};
