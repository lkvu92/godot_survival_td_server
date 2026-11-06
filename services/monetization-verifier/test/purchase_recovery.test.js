import test from 'node:test';
import assert from 'node:assert/strict';
import {recoveryKey,sealToken,openToken,normalizePurchase,validatePushIdentity,enqueueNotification,recoverJob} from '../src/purchase_recovery.js';
const key=Buffer.alloc(32,9),token='synthetic-purchase-token',pkg='fixture.game';
const purchased={purchaseStateContext:{purchaseState:'PURCHASED'},productLineItem:[{productId:'sku',productOfferDetails:{quantity:1}}],orderId:'GPA.fixture',obfuscatedExternalAccountId:'buyer',obfuscatedExternalProfileId:'order'};
test('AES-GCM survives restart; tampering, swapped identity and missing key fail closed',()=>{
 const job=sealToken(token,key);assert.equal(openToken(JSON.parse(JSON.stringify(job)),key),token);
 assert(!JSON.stringify(job).includes(token));assert.throws(()=>openToken({...job,token_hash:'a'.repeat(64)},key));
 assert.throws(()=>openToken(job,Buffer.alloc(32,2)));assert.throws(()=>recoveryKey(''));assert.equal(recoveryKey(key.toString('base64')).length,32);
});
test('Pub/Sub requires exact verified email; notification package and refund type are checked',async()=>{
 assert.throws(()=>validatePushIdentity({email:'other',email_verified:true},'push@fixture'));
 assert.throws(()=>validatePushIdentity({email:'push@fixture',email_verified:false},'push@fixture'));
 validatePushIdentity({email:'push@fixture',email_verified:true},'push@fixture');
 const calls=[],bridge=async data=>{calls.push(data);return {success:true};};
 await assert.rejects(enqueueNotification({notification:{packageName:'other'},packageName:pkg,key,bridge}));
 await enqueueNotification({notification:{packageName:pkg,oneTimeProductNotification:{notificationType:1,purchaseToken:token,sku:'sku'}},packageName:pkg,key,bridge});
 assert.equal(calls[0].action,'enqueue');assert.equal(openToken(calls[0],key),token);
 await enqueueNotification({notification:{packageName:pkg,voidedPurchaseNotification:{productType:2,refundType:2,purchaseToken:token}},packageName:pkg,key,bridge});
 assert.equal(calls[1].review,true);assert.equal(calls[1].revoked,false);
});
test('Google pending/canceled are distinct; ambiguous and multi-quantity purchases require review',()=>{
 assert.equal(normalizePurchase({purchaseStateContext:{purchaseState:'PENDING'}},pkg).state,'PENDING');
 assert.equal(normalizePurchase({purchaseStateContext:{purchaseState:'CANCELLED'}},pkg).state,'CANCELED');
 assert.throws(()=>normalizePurchase({...purchased,productLineItem:[{productId:'sku',productOfferDetails:{quantity:2}}]},pkg));
 assert.throws(()=>normalizePurchase({...purchased,obfuscatedExternalProfileId:''},pkg));
});
for(const fulfillment of ['consumable','non_consumable'])test(`durable delivery precedes ${fulfillment} finalization; lost final response retries without another grant`,async()=>{
 const events=[],job={...sealToken(token,key),package_name:pkg,lease_id:'lease'},effects=new Set();let consumed=false,acked=false,lose=true;
 const publisher={purchases:{productsv2:{getproductpurchasev2:async()=>({data:purchased})},products:{get:async()=>({data:{purchaseState:0,consumptionState:consumed?1:0,acknowledgementState:acked?1:0}}),consume:async()=>{events.push('consume');consumed=true;},acknowledge:async()=>{events.push('ack');acked=true;}}}};
 const bridge=async data=>{events.push(data.action);if(data.action==='apply'){effects.add(job.token_hash);return {delivered:true,fulfillment_type:fulfillment};}if(data.action==='finalized'&&lose){lose=false;throw Error('lost response');}return {success:true};};
 await recoverJob({job,key,packageName:pkg,publisher,bridge});await recoverJob({job,key,packageName:pkg,publisher,bridge});
 assert.equal(effects.size,1);assert.equal(events.filter(e=>e===(fulfillment==='consumable'?'consume':'ack')).length,1);
 assert(events.indexOf('apply')<events.indexOf(fulfillment==='consumable'?'consume':'ack'));assert.equal(events.at(-1),'finalized');
});
test('pending never finalizes, and provider errors do not invent success or erase jobs',async()=>{
 const job={...sealToken(token,key),package_name:pkg,lease_id:'lease'},events=[];
 const bridge=async d=>{events.push(d);return {success:true,delivered:false};};
 await recoverJob({job,key,packageName:pkg,publisher:{purchases:{productsv2:{getproductpurchasev2:async()=>({data:{purchaseStateContext:{purchaseState:'PENDING'}}})}}},bridge});
 assert.deepEqual(events.map(e=>e.action),['apply']);assert.equal(events[0].verified.state,'PENDING');events.length=0;
 await recoverJob({job,key,packageName:pkg,publisher:{purchases:{productsv2:{getproductpurchasev2:async()=>{throw Error('private URL/token');}}}},bridge});
 assert.equal(events[0].action,'retry');assert.equal(events[0].reason,'PROVIDER_RETRY');assert(!JSON.stringify(events).includes('private'));
});
