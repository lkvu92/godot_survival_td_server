const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const context=vm.createContext({});
for(const name of ['monetization_rpc','config_rpc'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../nakama/data/modules/build',name+'.js'),'utf8'),context);
const fn=name=>vm.runInContext(name,context);
context.isRemoteFlagEnabled=()=>true;context.parseJsonb=v=>typeof v==='string'?JSON.parse(v):v;
context.monetizationMode=()=> 'production';context.isLinkedReceiptOwner=(_nk,a,b)=>a===b;
context.buildMonetizationResponse=()=>({});
let grants=0,validated=0,writes=0,order={id:'order-a',platform:'android',product_id:'canonical_pack',store_product_id:'play.sku.pack',
  status:'pending',fulfillment_type:'consumable',reward_snapshot:[{reward_type:'currency',reward_id:'gems',quantity:10}],vip_exp:1,vip_environment:'production'};
context.applyPurchaseStorageRewards=()=>{grants++;return {};};
let purchase={productId:'play.sku.pack',userId:'buyer',transactionId:'tx-1',environment:'production'};
const nk={sqlQuery(sql){if(sql.includes('FROM monetization_purchase_orders'))return [order];if(sql.includes('sha256'))return[{token_hash:'verified-hash'}];return [];},
  sqlExec(){writes++;},purchaseValidateGoogle(){validated++;return{validatedPurchases:[purchase]};}};
const ctx={userId:'buyer',env:{}},logger={warn(){},error(){}};
const call=(name,body)=>JSON.parse(fn(name)(ctx,logger,nk,JSON.stringify(body)));
assert.equal(call('createPurchaseOrder',{platform:'ios',product_id:'canonical_pack'}).code,501);
assert.equal(validated+writes+grants,0,'unsupported iOS cannot touch verifier, ledger or rewards');
order.platform='ios';
assert.equal(call('iapClaim',{platform:'android',purchase_order_id:'order-a',receipt:'{}'}).code,409);
assert.equal(call('iapClaim',{platform:'ios',purchase_order_id:'order-a',receipt:'{}'}).code,501);
assert.equal(call('iapGoogleClaim',{purchase_order_id:'order-a',receipt:'{}'}).code,409);
assert.equal(validated+writes+grants,0,'legacy Google endpoint cannot bypass an iOS order');
order.platform='android';
assert.equal(call('iapClaim',{platform:'android',purchase_order_id:'order-a',receipt:'{"purchaseToken":"token"}'}).status,'success');
assert.equal(grants,1);assert.equal(validated,1,'Google SKU is verified before canonical rewards');
purchase={...purchase,refundTime:1};
assert.equal(call('iapClaim',{platform:'android',purchase_order_id:'order-a',receipt:'{"purchaseToken":"token"}'}).code,409);
assert.equal(grants,1,'refunded receipt cannot grant');
purchase={...purchase,refundTime:0};
assert.equal(call('resolvePurchaseOrder',{platform:'android',receipt:'{"purchaseToken":"unmapped"}'}).code,409);
assert.equal(grants,1,'restore without original destination cannot grant or create a new order');
const bootstrapNk={sqlQuery(){return[{config_version:1,snapshot:{system:{store_urls:{ios:'https://apps.apple.com/app/test'}}},min_app_version:'1.0.0',latest_app_version:'1.0.0',store_url:'https://play.google.com/store/apps/test',server_time:1}];}};
let result=JSON.parse(fn('getConfigBootstrap')(ctx,logger,bootstrapNk,'{"platform":"ios","app_version":"1.0.0"}'));
assert.equal(result.status,'ok');assert.equal(result.store_url,'https://apps.apple.com/app/test');
bootstrapNk.sqlQuery=()=>[{config_version:1,snapshot:{system:{}},min_app_version:'2.0.0',latest_app_version:'2.0.0',store_url:'https://play.google.com/store/apps/test',server_time:1}];
result=JSON.parse(fn('getConfigBootstrap')(ctx,logger,bootstrapNk,'{"platform":"ios","app_version":"1.0.0"}'));
assert.equal(result.status,'force_update');assert.equal(result.store_url,'','iOS never receives fallback Play URL');
context.vipConfig=()=>({product_exp:{canonical_pack:1}});
let inserted=null,prior=[];
const createNk={__characterContext:{accountId:'buyer',serverId:'s001',generation:2},uuidv4:()=> 'new-order',
  sqlQuery(sql){
    if(sql.includes('FROM game_store_products'))return[{product_id:'canonical_pack',active:true,fulfillment_type:'consumable'}];
    if(sql.includes('game_store_platform_products'))return[{store_product_id:'new.play.sku',active:true}];
    if(sql.includes('FROM monetization_purchase_orders'))return prior;
    if(sql.includes('game_store_product_rewards'))return[{reward_type:'currency',reward_id:'gems',quantity:10,metadata:{}}];
    throw Error('Unexpected query '+sql);
  },sqlExec(sql,args){inserted=args;}};
const newOrder=JSON.parse(fn('createPurchaseOrder')(ctx,logger,createNk,'{"product_id":"canonical_pack","platform":"android","server_id":"forged","generation":99}'));
assert.equal(newOrder.status,'success');assert.equal(inserted[9],'s001');assert.equal(inserted[10],2,'order target comes from validated runtime, not payload');
prior=[{id:'old-order',status:'pending',platform:'android',store_product_id:'old.play.sku'}];
const replay=JSON.parse(fn('createPurchaseOrder')(ctx,logger,createNk,'{"product_id":"canonical_pack","platform":"android"}'));
assert.equal(replay.data.store_product_id,'old.play.sku','catalog edits cannot change pending order SKU');
console.log('PASS store platform boundary: canonical SKU, order-platform binding, iOS fail-closed, refund rejection, restore destination and platform update URL');

// Multi-server production claims must use a server-to-server order binding.
order={...order,platform:'android',status:'pending',target_server_id:'s001',target_generation:2};
let trusted=true,voided=false,bridgeBody=null;
const scopedNk={__characterContext:{accountId:'buyer',serverId:'s001',generation:2},
  sqlQuery(sql){
    if(sql.includes('FROM monetization_purchase_orders'))return[{...order,purchase_order_id:order.id}];
    if(sql.includes('sha256'))return[{token_hash:'verified-hash'}];
    if(sql.includes('INSERT INTO store_receipt_reservations'))return[{order_id:order.id}];
    if(sql.includes('SELECT 1 FROM store_purchase_voids'))return voided?[{}]:[];
    return [];
  },sqlExec(){},purchaseValidateGoogle(){return{validatedPurchases:[purchase]};},
  httpRequest(_url,_method,_headers,body){bridgeBody=JSON.parse(body);return{code:200,body:JSON.stringify({verified:trusted,purchase_order_id:order.id,token_hash:'verified-hash'})};}
};
const scopedCtx={userId:'buyer',env:{MULTI_SERVER_ENABLED:'true',MONETIZATION_VERIFIER_SECRET:'test-only'}};
const scopedCall=(name,body)=>JSON.parse(fn(name)(scopedCtx,logger,scopedNk,JSON.stringify(body)));
const receipt=JSON.stringify({purchaseToken:'token',packageName:'test.package',obfuscatedExternalProfileId:'client-forged-order'});
trusted=false;const priorGrants=grants;
assert.equal(scopedCall('iapClaim',{platform:'android',purchase_order_id:order.id,receipt}).code,409);
assert.equal(grants,priorGrants,'a client-provided order field cannot bypass the trusted verifier');
trusted=true;
assert.equal(scopedCall('iapClaim',{platform:'android',purchase_order_id:order.id,receipt}).status,'success');
assert.equal(bridgeBody.purchase_order_id,order.id);assert.equal(bridgeBody.verification_only,true);
assert.equal(bridgeBody.package_name,'test.package');
const restored=scopedCall('resolvePurchaseOrder',{platform:'android',receipt});
assert.equal(restored.status,'success');assert.equal(restored.data.purchase_order_id,order.id);
assert.equal(restored.data.target_server_id,'s001','pre-fulfillment restore recovers the trusted original destination');
voided=true;
assert.equal(scopedCall('iapClaim',{platform:'android',purchase_order_id:order.id,receipt}).code,409,'refund tombstone blocks an unfulfilled receipt');
console.log('PASS scoped production billing: trusted Google order binding, forged receipt rejection, pre-fulfillment restore and durable refund tombstone');
