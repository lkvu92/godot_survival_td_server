const fs=require('fs'),vm=require('vm'),assert=require('assert'),cp=require('child_process'),path=require('path');
const context={Date,JSON,Math,Number,String,Array,isFinite};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../nakama/data/modules/build/monetization_rpc.js'),'utf8'),context);
const results=[];function test(name,fn){fn();results.push({name,result:'PASS'});}
const sample={schema_version:1,source:'google_orders_api',google_order_id:'GPA.fixture',currency:'VND',paid_amount:'19000.000000000',tax_amount:'1000.000000000',refunded_amount:'0.000000000',provider_state:'PROCESSED',provider_event_at:'2026-11-01T00:00:00Z',events:[],receipt:'NEVER_STORE'};
test('backend strips unknown snapshot fields',()=>assert(!JSON.stringify(context.financialSnapshot(sample)).includes('NEVER_STORE')));
test('client sessions cannot call internal recorder even with secret',()=>assert.equal(JSON.parse(context.googlePlayFinancialSync({userId:'attacker',env:{MONETIZATION_VERIFIER_SECRET:'secret'}},{},{},JSON.stringify({verifier_secret:'secret'}))).reason,'FORBIDDEN'));
test('wrong verifier secret rejected',()=>assert.equal(JSON.parse(context.googlePlayFinancialSync({env:{MONETIZATION_VERIFIER_SECRET:'secret'}},{},{},JSON.stringify({verifier_secret:'wrong'}))).reason,'FORBIDDEN'));
test('float amounts and invalid policy rejected',()=>{assert.throws(()=>context.financialSnapshot({...sample,paid_amount:19000}));assert.throws(()=>context.financialPolicy({schema_version:1,revision:1,enabled:true,batch_size:1000}));});
if(process.argv.includes('--postgres')){
 const source=fs.readFileSync(path.join(__dirname,'../nakama/data/modules/monetization_tables.ts'),'utf8');
 const schema=source.match(/nk.sqlExec\(`(CREATE TABLE IF NOT EXISTS payment_financial_records[\s\S]*?)`,\[\]\);/)[1].replace(/CREATE TABLE IF NOT EXISTS /g,'CREATE TEMP TABLE ');
 const lit=v=>v===null?'NULL':"'"+String(v).replaceAll("'","''")+"'";
 function insert(f){const cleaned=context.financialSnapshot(f),args=['internal',f.google_order_id,f.currency,f.paid_amount,f.tax_amount,f.refunded_amount,f.provider_event_at,f.provider_state,JSON.stringify(cleaned)];return context.financialRecordSql().replace(/\$(\d+)/g,(_,n)=>lit(args[Number(n)-1]))+' INTO r;';}
 const newer={...sample,provider_event_at:'2026-11-02T00:00:00Z',refunded_amount:'5000.000000000',events:[{type:'partial_refund',time:'2026-11-02T00:00:00Z',state:'PROCESSED_SUCCESSFULLY',amount:'5000.000000000',currency:'VND'}]};
 const sql=`BEGIN;CREATE TEMP TABLE monetization_purchase_orders(id TEXT PRIMARY KEY,transaction_id TEXT,platform TEXT,status TEXT,vip_environment TEXT,created_at TIMESTAMPTZ DEFAULT NOW());INSERT INTO monetization_purchase_orders(id,transaction_id,platform,status,vip_environment) VALUES('internal','GPA.fixture','android','fulfilled','production');${schema}
 DO $test$ DECLARE r RECORD; amount NUMERIC; entries INT; BEGIN
 ${insert(sample)} IF NOT r.accepted OR r.inserted<>1 THEN RAISE EXCEPTION 'first';END IF;
 ${insert(newer)} IF NOT r.accepted OR r.inserted<>1 THEN RAISE EXCEPTION 'refund';END IF;
 ${insert(newer)} IF r.inserted<>0 THEN RAISE EXCEPTION 'duplicate';END IF;
 ${insert(sample)} IF r.inserted<>0 THEN RAISE EXCEPTION 'old duplicate';END IF;
 ${insert({...sample,paid_amount:'20000.000000000'})} IF r.accepted THEN RAISE EXCEPTION 'original overwrite';END IF;
 ${insert({...sample,google_order_id:'GPA.wrong'})} IF r.accepted THEN RAISE EXCEPTION 'wrong binding';END IF;
 SELECT original_amount INTO amount FROM payment_financial_records;IF amount<>19000 THEN RAISE EXCEPTION 'original lost';END IF;
 SELECT COUNT(*) INTO entries FROM payment_financial_snapshots;IF entries<>2 THEN RAISE EXCEPTION 'history lost';END IF;
 SELECT refunded_amount INTO amount FROM payment_financial_snapshots ORDER BY provider_event_at DESC,synced_at DESC LIMIT 1;IF amount<>5000 THEN RAISE EXCEPTION 'refund regressed';END IF;
 END $test$;ROLLBACK;`;
 cp.execFileSync('docker',['exec','-i','survival_td_local-postgres-1','psql','-U','postgres','-d','nakama','-XAtq','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8'});
 results.push({name:'PostgreSQL immutable original, append snapshots, duplicate replay, old event and binding checks',result:'PASS'});
}
console.log(JSON.stringify({suite:'C246 financial persistence',generated_at:new Date().toISOString(),environment:'runtime unit fixtures and optional PostgreSQL temporary tables rolled back',results},null,2));
