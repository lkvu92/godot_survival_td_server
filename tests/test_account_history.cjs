const fs=require('fs'),vm=require('vm'),assert=require('assert'),cp=require('child_process'),path=require('path');
const ctx={Date,JSON,Math,Number,String,Array,isFinite};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../nakama/data/modules/build/main.js'),'utf8'),ctx);
const policy={schema_version:1,revision:1,page_size:2,max_page_size:3,allowed_statuses:['pending','fulfilled','voided'],display_utc_offset_seconds:25200};
ctx.getActiveRemoteConfig=()=>({version:1,config:{system:{account_history:policy}}});
let params=[],queryCount=0;
const nk={sqlQuery(sql,args){queryCount++;if(sql.includes('WITH history')){params=args;return [1,2,3,4].map(i=>({reference:'order:'+i,product_id:'test',product_name:'Fixture',platform:'android',status:'fulfilled',created_at:'2026-11-02T00:00:00.000000Z',target_server_id:'s001',target_generation:1,purchase_token_hash:'NEVER_EXPORT',receipt:'NEVER_EXPORT'}));}return [{seconds:120}];},storageRead(refs){assert(refs.every(r=>r.userId==='owner'));return [{collection:'player_profiles',value:{resources:{gold:123,gems:45},email:'NEVER_EXPORT'}},{collection:'player_inventory',value:{items:[{id:'one'}]}}];}};
const call=req=>JSON.parse(ctx.accountHistory({userId:'owner'},{},nk,JSON.stringify(req)));
const results=[];function test(name,fn){fn();results.push({name,result:'PASS'});}
test('request user_id cannot choose another account',()=>{call({user_id:'victim'});assert.equal(params[0],'owner');});
test('server caps page size and provides stable next cursor',()=>{const r=call({limit:100});assert.equal(params[4],4);assert.equal(r.transactions.length,3);assert.equal(JSON.parse(r.next_cursor).reference,'order:3');});
test('default page is configured; amount is unknown, not inferred',()=>{const r=call({});assert.equal(r.transactions.length,2);assert.equal(r.transactions[0].paid_amount,null);assert.equal(r.transactions[0].price_recorded,false);});
test('sensitive source fields never enter response',()=>assert(!JSON.stringify(call({})).includes('NEVER_EXPORT')));
test('invalid status/cursor/page rejected before querying SQL',()=>{const before=queryCount;assert.equal(call({status:"';DROP"}).reason,'INVALID_FILTER');assert.equal(call({cursor:'bad'}).reason,'INVALID_CURSOR');assert.equal(call({limit:0}).reason,'INVALID_PAGE');assert.equal(queryCount,before);});
test('summary contains server resources only',()=>{const r=call({});assert.deepEqual(r.summary.resources,{gold:123,gems:45});assert.equal(r.summary.inventory_entry_count,1);});
if(process.argv.includes('--postgres')){
 const setup=`BEGIN;CREATE TEMP TABLE game_store_products(product_id TEXT,display_name TEXT);INSERT INTO game_store_products VALUES('pack','Goi thu');
 CREATE TEMP TABLE monetization_purchase_orders(id TEXT,user_id TEXT,product_id TEXT,platform TEXT,status TEXT,created_at TIMESTAMPTZ,target_server_id TEXT,target_generation INT);
 CREATE TEMP TABLE monetization_purchases(id INT,user_id TEXT,request_id TEXT,purchase_order_id TEXT,product_id TEXT,platform TEXT,status TEXT,created_at TIMESTAMPTZ,target_server_id TEXT,target_generation INT);
 INSERT INTO monetization_purchase_orders VALUES('a','owner','pack','android','fulfilled','2026-11-02T00:00:00.000001Z','s001',1),('b','owner','pack','android','pending','2026-11-02T00:00:00.000001Z','s002',2),('secret','victim','pack','android','fulfilled','2026-11-02T01:00:00Z','s003',1);
 INSERT INTO monetization_purchases VALUES(1,'owner','a','a','pack','android','voided','2026-11-02T00:00:00Z','s001',1),(2,'owner','legacy','','pack','android','granted','2026-11-01T00:00:00Z','',0);
 CREATE TEMP TABLE payment_financial_records(purchase_order_id TEXT,original_amount NUMERIC(30,9),currency TEXT,source TEXT,last_synced_at TIMESTAMPTZ);
 INSERT INTO payment_financial_records VALUES('a',19000,'VND','google_orders_api',NOW());
 CREATE TEMP TABLE payment_financial_snapshots(purchase_order_id TEXT,refunded_amount NUMERIC(30,9),provider_event_at TIMESTAMPTZ,synced_at TIMESTAMPTZ);
 INSERT INTO payment_financial_snapshots VALUES('a',5000,NOW(),NOW());`;
 function query(args){const literal=v=>typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";const q=ctx.accountHistoryQuery().replace(/\$(\d+)/g,(_,i)=>literal(args[Number(i)-1]));const text=cp.execFileSync('docker',['exec','-i','survival_td_local-postgres-1','psql','-U','postgres','-d','nakama','-XAtq','-v','ON_ERROR_STOP=1'],{input:setup+'SELECT COALESCE(json_agg(t),\'[]\'::json) FROM ('+q+') t; ROLLBACK;',encoding:'utf8'});return JSON.parse(text.trim());}
 const first=query(['owner','','','',2]);
 test('PostgreSQL account isolation, tie order and refund status',()=>{assert.deepEqual(first.map(r=>r.reference),['order:b','order:a']);assert.equal(first[1].status,'voided');assert(!JSON.stringify(first).includes('secret'));});
 test('PostgreSQL returns verified financial amounts as exact strings',()=>{assert.equal(first[1].paid_amount,'19000.000000000');assert.equal(first[1].currency,'VND');assert.equal(first[1].refunded_amount,'5000.000000000');assert.equal(first[0].paid_amount,null);});
 const next=query(['owner','',first[1].created_at,first[1].reference,2]);
 test('PostgreSQL keyset has no overlap and includes legacy missing-order purchase',()=>assert.deepEqual(next.map(r=>r.reference),['legacy:2']));
 test('PostgreSQL status filter is applied',()=>assert.deepEqual(query(['owner','pending','','',10]).map(r=>r.reference),['order:b']));
 results.push({name:'SQL page evidence',result:'CAPTURED',first_page:first,next_page:next});
}
console.log(JSON.stringify({suite:'B2/C245',generated_at:new Date().toISOString(),environment:'unit fixtures and optional temporary PostgreSQL tables rolled back; no real player reads',results},null,2));
