import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export function recoveryKey(value) {
  const key=Buffer.from(String(value||''),'base64');
  if(key.length!==32)throw Error('RECOVERY_KEY_REQUIRED');
  return key;
}
export const tokenHash=token=>createHash('sha256').update(token).digest('hex');
export function sealToken(token,key) {
  if(typeof token!=='string'||token.length<8||token.length>8000)throw Error('INVALID_PURCHASE_TOKEN');
  const hash=tokenHash(token),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(Buffer.from(hash));
  const body=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);
  return {token_hash:hash,encrypted_token:['v1',iv.toString('base64'),cipher.getAuthTag().toString('base64'),body.toString('base64')].join('.')};
}
export function openToken(job,key) {
  const [version,iv,tag,body,...extra]=String(job.encrypted_token||'').split('.');
  if(version!=='v1'||extra.length||!iv||!tag||!body)throw Error('INVALID_TOKEN_ENVELOPE');
  const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'base64'));
  decipher.setAAD(Buffer.from(job.token_hash));decipher.setAuthTag(Buffer.from(tag,'base64'));
  const token=Buffer.concat([decipher.update(Buffer.from(body,'base64')),decipher.final()]).toString('utf8');
  if(tokenHash(token)!==job.token_hash)throw Error('TOKEN_HASH_MISMATCH');
  return token;
}
export function normalizePurchase(data,packageName) {
  const state=data?.purchaseStateContext?.purchaseState;
  if(state==='PENDING')return {state,package_name:packageName};
  if(state==='CANCELLED')return {state:'CANCELED',package_name:packageName};
  const lines=data?.productLineItem;
  if(state!=='PURCHASED'||!Array.isArray(lines)||lines.length!==1)throw Error('UNSUPPORTED_PURCHASE');
  const line=lines[0],details=line.productOfferDetails||{},quantity=details.quantity===undefined?1:details.quantity;
  if(quantity!==1||details.refundableQuantity===0)throw Error('REFUND_OR_QUANTITY_REVIEW_REQUIRED');
  if(!data.obfuscatedExternalProfileId||!data.obfuscatedExternalAccountId||!line.productId||!data.orderId)throw Error('MISSING_ORIGINAL_BINDING');
  return {state,package_name:packageName,product_id:line.productId,order_id:data.obfuscatedExternalProfileId,user_id:data.obfuscatedExternalAccountId,
    transaction_id:data.orderId,quantity,test_purchase:!!data.testPurchaseContext};
}
export async function enqueueReceipt({token,packageName,productId='',expectedOrderId='',expectedUserId='',key,bridge,revoked=false,review=false}) {
  return bridge({action:'enqueue',...sealToken(token,key),package_name:packageName,product_id:productId,expected_order_id:expectedOrderId,expected_user_id:expectedUserId,revoked,review});
}
export function validatePushIdentity(payload,email) {
  if(!email||payload?.email!==email||payload?.email_verified!==true)throw Error('PUBSUB_IDENTITY_REJECTED');
}
export async function enqueueNotification({notification,packageName,key,bridge}) {
  if(!packageName||notification?.packageName!==packageName)throw Error('RTDN_PACKAGE_REJECTED');
  if(notification.testNotification)return {ignored:true};
  const voided=notification.voidedPurchaseNotification,oneTime=notification.oneTimeProductNotification;
  if(voided){
    if(Number(voided.productType)!==2||![1,2].includes(Number(voided.refundType)))throw Error('UNSUPPORTED_VOID_NOTIFICATION');
    return enqueueReceipt({token:voided.purchaseToken,packageName,key,bridge,revoked:Number(voided.refundType)===1,review:Number(voided.refundType)===2});
  }
  if(oneTime&&[1,2].includes(Number(oneTime.notificationType)))return enqueueReceipt({token:oneTime.purchaseToken,packageName,productId:String(oneTime.sku||''),key,bridge});
  return {ignored:true};
}
export async function recoverJob({job,key,packageName,publisher,bridge}) {
  const identity={token_hash:job.token_hash,lease_id:job.lease_id};
  try {
    if(job.package_name!==packageName)throw Error('RECOVERY_PACKAGE_MISMATCH');
    const token=openToken(job,key);
    const response=await publisher.purchases.productsv2.getproductpurchasev2({packageName,token},{timeout:10000});
    const verified=normalizePurchase(response.data,packageName);
    const applied=await bridge({action:'apply',...identity,verified});
    if(!applied.delivered)return;
    // Verify again before finalization, including already-consumed responses after a lost ACK.
    const latest=await publisher.purchases.products.get({packageName,productId:verified.product_id,token},{timeout:10000});
    const purchase=latest.data||{};
    if(Number(purchase.purchaseState)!==0){await bridge({action:'apply',...identity,verified:{state:'CANCELED',package_name:packageName}});return;}
    if(applied.fulfillment_type==='consumable'){
      if(Number(purchase.consumptionState)!==1)await publisher.purchases.products.consume({packageName,productId:verified.product_id,token},{timeout:10000});
    }else if(Number(purchase.acknowledgementState)!==1)await publisher.purchases.products.acknowledge({packageName,productId:verified.product_id,token},{timeout:10000});
    await bridge({action:'finalized',...identity});
  }catch(error){
    const reason=String(error?.message||'');
    const review=/^(RECOVERY_KEY_REQUIRED|INVALID_TOKEN_ENVELOPE|TOKEN_HASH_MISMATCH|UNSUPPORTED_PURCHASE|REFUND_OR_QUANTITY_REVIEW_REQUIRED|MISSING_ORIGINAL_BINDING|RECOVERY_PACKAGE_MISMATCH)$/.test(reason);
    await bridge({action:'retry',...identity,reason:review?reason:'PROVIDER_RETRY',review}).catch(()=>{});
  }
}
export async function recoverBatch(options) {
  const result=await options.bridge({action:'lease',worker_id:'google-play-verifier',limit:5});
  // Keep each batch within the 120-second lease under bounded provider calls.
  await Promise.all((result.jobs||[]).map(job=>recoverJob({...options,job})));
  return {jobs:(result.jobs||[]).length};
}
