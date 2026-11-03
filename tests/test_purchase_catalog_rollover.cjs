const fs=require('fs'),vm=require('vm'),assert=require('assert');
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(require('path').join(__dirname,'../nakama/data/modules/build/monetization_rpc.js'),'utf8'),context);
context.isRemoteFlagEnabled=()=>true;
context.parseJsonb=v=>typeof v==='string'?JSON.parse(v):v;
context.monetizationMode=()=> 'production';
context.vipConfig=()=>({product_exp:{gold_vault:1000}});
const create=vm.runInContext('createPurchaseOrder',context);
let prior=[],writes=[],conflict=false,rewards=true;
const old={id:'old-paid-or-unpaid',status:'pending',catalog_retired:false,platform:'android',store_product_id:'gold_vault',
 reward_snapshot:[{reward_type:'currency',reward_id:'gold',quantity:1000000,metadata:{pricing_version:1}}]};
const nk={__characterContext:{serverId:'s001',generation:1},uuidv4:()=> 'new-order',
 sqlQuery(sql,args){
  if(sql.includes('game_store_products'))return[{ui:{pricing_version:2},fulfillment_type:'consumable'}];
  if(sql.includes('game_store_platform_products'))return[];
  if(sql.includes('FROM monetization_purchase_orders')){assert.deepEqual(Array.from(args),['buyer','gold_vault','s001',1]);return prior;}
  if(sql.includes('game_store_product_rewards'))return rewards?[{reward_type:'currency',reward_id:'gold',quantity:2500000,metadata:{pricing_version:2}}]:[];
  throw Error(sql);
 },sqlExec(sql,args){
  if(sql.startsWith('INSERT')&&conflict)throw Error('duplicate key purchase_orders_one_pending_scope_uq');
  writes.push({sql,args:Array.from(args)});
 }};
const call=()=>JSON.parse(create({userId:'buyer',env:{}},{},nk,'{"product_id":"gold_vault","platform":"android","server_id":"forged"}'));
prior=[old];const original=JSON.stringify(old);
assert.equal(call().status,'success');assert.equal(writes.length,2);
assert.match(writes[0].sql,/catalog_retired=TRUE/);
assert.match(writes[0].sql,/status='pending' AND catalog_retired=FALSE/);
assert.deepEqual(writes[0].args,[old.id,'buyer','gold_vault','s001',1]);
assert.equal(JSON.stringify(old),original,'original rewards and status stay immutable');
assert.equal(writes[1].args[0],'new-order');
const current={...old,id:'new-order',reward_snapshot:[{metadata:{pricing_version:2}}]};
prior=[current,{...old,catalog_retired:true}];writes=[];
assert.equal(call().data.purchase_order_id,'new-order');assert.equal(writes.length,0,'retry reuses current order');
prior=[{...current,catalog_retired:true}];writes=[];
assert.equal(call().status,'success');assert.equal(writes.length,1,'retired matching snapshots cannot reopen checkout');
prior=[old];writes=[];rewards=false;
assert.equal(call().code,409);assert.equal(writes.length,0,'invalid catalog must not retire an order');
rewards=true;conflict=true;
assert.equal(call().code,409,'concurrent insert is a recoverable conflict, not an uncaught/auth error');
console.log('PASS purchase catalog rollover: scoped retirement, immutable receipts, current-order reuse, catalog validation and concurrent conflict');
