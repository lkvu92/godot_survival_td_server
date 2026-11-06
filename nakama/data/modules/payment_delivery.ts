// C271: durable receipt jobs; every entry point reuses verified fulfillment.
function pdError(code:number,reason:string):string {
    const messages:any={FORBIDDEN:'Không có quyền thực hiện.',ORDER_NOT_FOUND:'Không tìm thấy đơn.',REASON_REQUIRED:'Vui lòng nhập lý do từ 5 đến 500 ký tự.',
      NO_RECOVERABLE_RECEIPT:'Chưa có receipt có thể phục hồi. Người chơi cần đồng bộ giao dịch từ Google Play.',
      DELIVERY_IN_PROGRESS:'Đơn đang được worker xử lý.',INCONSISTENT_DELIVERY:'Dấu giao và ledger chưa khớp; cần đối soát.',NOT_RETRYABLE:'Đơn chưa đủ điều kiện chạy lại.'};
    return JSON.stringify({success:false,code,reason,message:messages[reason]||'Trạng thái xử lý đã thay đổi hoặc cần đối soát. Vui lòng tải lại đơn.'});
}
function pdProof(nk:nkruntime.Nakama,order:any,hash:string):any {
    const scope={accountId:String(order.user_id),serverId:String(order.target_server_id),generation:Number(order.target_generation)};
    const scoped=characterRuntime(nk,scope),userId=scope.accountId;
    const marker=scoped.storageRead([{collection:'player_purchase_grants',key:hash,userId}])[0];
    const ledger=nk.sqlQuery('SELECT id,user_id,product_id,status,granted_seconds,target_server_id,target_generation,COALESCE(NULLIF(purchase_order_id,\'\'),request_id) AS original_order_id FROM monetization_purchases WHERE purchase_token_hash=$1',[hash])[0];
    const vip=ledger&&Number(order.vip_exp)>0?nk.sqlQuery('SELECT user_id,environment,exp FROM player_vip_credits WHERE purchase_id=$1',[ledger.id])[0]:null;
    const mailed=(parseJsonb(order.reward_snapshot)||[]).some((r:any)=>['currency','item','hero'].includes(r.reward_type)&&!(DAILY_PACK_IDS.includes(order.product_id)&&r.metadata&&Number(r.metadata.daily_pack_days)===30));
    const mail=mailed?scoped.storageRead([{collection:'player_mail_deliveries',key:mailId(nk,'purchase:'+hash),userId}])[0]:null;
    const needsNoAds=(parseJsonb(order.reward_snapshot)||[]).filter((r:any)=>r.reward_type==='entitlement'&&r.reward_id==='no_ads_seconds').reduce((n:number,r:any)=>n+Number(r.quantity),0);
    const inconsistent=!!ledger&&(!marker||ledger.user_id!==userId||ledger.product_id!==order.product_id||Number(ledger.granted_seconds)!==needsNoAds
      ||ledger.original_order_id!==order.id||ledger.target_server_id!==scope.serverId||Number(ledger.target_generation)!==scope.generation)
      ||!!vip&&(vip.user_id!==userId||vip.environment!==order.vip_environment||Number(vip.exp)!==Number(order.vip_exp))||!!marker&&mailed&&!mail;
    return {complete:!!marker&&!!ledger&&ledger.status!=='voided'&&!inconsistent&&(!(Number(order.vip_exp)>0)||!!vip),inconsistent,marker:!!marker,claimed:!!(mail&&mail.value.claimed_at_ms),mail:!!mail};
}
function pdSummary(nk:nkruntime.Nakama,order:any):any {
    const job=nk.sqlQuery(`SELECT token_hash,payment_state,status,attempts,last_error,delivery_completed_at,finalized_at,
      lease_until>NOW() AS leased FROM payment_delivery_jobs WHERE purchase_order_id=$1 OR expected_order_id=$1 ORDER BY updated_at DESC LIMIT 1`,[order.id])[0];
    if(!job)return {payment_state:'UNKNOWN',delivery_state:order.status==='fulfilled'?'DELIVERED_LEGACY':'NOT_STARTED',finalization_state:'UNKNOWN',can_retry:false,reason:'NO_RECOVERABLE_RECEIPT',job_status:'none',attempts:0,last_error:''};
    const proof=pdProof(nk,order,job.token_hash);
    const blocked=['blocked','complete'].includes(job.status)||['CANCELED','VOIDED','PENDING'].includes(job.payment_state)||proof.inconsistent;
    return {payment_state:job.payment_state,delivery_state:proof.inconsistent?'REVIEW_REQUIRED':proof.complete?(proof.mail&&!proof.claimed?'DELIVERED_AWAITING_CLAIM':'DELIVERED'):proof.marker?'REPAIR_COMPLETION':'NOT_STARTED',
      finalization_state:job.finalized_at?'FINALIZED':job.delivery_completed_at?'ACK_PENDING':'NOT_STARTED',can_retry:!blocked&&!job.leased,
      reason:proof.inconsistent?'INCONSISTENT_DELIVERY':job.leased?'DELIVERY_IN_PROGRESS':blocked?'NOT_RETRYABLE':'VERIFY_AND_CONTINUE',job_status:job.status,attempts:Number(job.attempts),last_error:job.last_error};
}
function pdFinish(nk:nkruntime.Nakama,job:any,status:string,reason:string,state?:string):void {
    const rows=nk.sqlQuery(`UPDATE payment_delivery_jobs SET status=$3,last_error=$4,payment_state=COALESCE($5,payment_state),
      lease_until=NULL,lease_id='',next_attempt_at=NOW()+make_interval(secs=>LEAST(3600,30*(1+attempts))),revision=revision+1,updated_at=NOW()
      WHERE token_hash=$1 AND lease_id=$2 AND lease_until>NOW() RETURNING token_hash`,[job.token_hash,job.lease_id,status,reason,state||null]);
    if(!rows.length)throw Error('STALE_DELIVERY_LEASE');
}
function pdApply(ctx:nkruntime.Context,logger:nkruntime.Logger,nk:nkruntime.Nakama,job:any,v:any):any {
    if(!v||!['PENDING','PURCHASED','CANCELED','VOIDED'].includes(v.state)||v.package_name!==job.package_name)throw Error('INVALID_PROVIDER_STATE');
    if(v.state==='PENDING'){pdFinish(nk,job,'retry','WAITING_PAYMENT','PENDING');return {delivered:false};}
    if(v.state==='CANCELED'||v.state==='VOIDED'){
        nk.sqlQuery('SELECT void_store_purchase($1)',[job.token_hash]);pdFinish(nk,job,'blocked','PAYMENT_REVOKED',v.state);return {delivered:false};
    }
    if(typeof v.order_id!=='string'||typeof v.user_id!=='string'||typeof v.product_id!=='string'||typeof v.transaction_id!=='string'||!v.transaction_id||v.quantity!==1)throw Error('UNSUPPORTED_PROVIDER_BINDING');
    const rows=nk.sqlQuery('SELECT * FROM monetization_purchase_orders WHERE id=$1',[v.order_id]);
    const order=rows[0];
    if(!order||order.user_id!==v.user_id||order.platform!=='android'||String(order.store_product_id||order.product_id)!==v.product_id
      ||job.product_id&&job.product_id!==v.product_id||job.expected_order_id&&job.expected_order_id!==order.id||job.expected_user_id&&job.expected_user_id!==order.user_id
      ||job.purchase_order_id&&job.purchase_order_id!==order.id||order.vip_environment!=='production'||!['pending','fulfilled'].includes(order.status))throw Error('ORIGINAL_ORDER_REVIEW_REQUIRED');
    if(nk.sqlQuery('SELECT 1 FROM store_purchase_voids WHERE token_hash=$1',[job.token_hash]).length){pdFinish(nk,job,'blocked','PAYMENT_REVOKED','VOIDED');return {delivered:false};}
    const workerCtx:any={userId:order.user_id,env:ctx.env};
    if(!isProductionTestPurchaseAllowed(workerCtx,nk,{environment:v.test_purchase?'sandbox':'production'} as any))throw Error('TEST_PURCHASE_NOT_ALLOWED');
    const scope={accountId:order.user_id,serverId:order.target_server_id,generation:Number(order.target_generation)};
    const bound=nk.sqlQuery(`UPDATE payment_delivery_jobs SET purchase_order_id=$3,payment_state='PURCHASED',updated_at=NOW()
      WHERE token_hash=$1 AND lease_id=$2 AND lease_until>NOW() RETURNING token_hash`,[job.token_hash,job.lease_id,order.id]);
    if(!bound.length)throw Error('STALE_DELIVERY_LEASE');
    const proof=pdProof(nk,order,job.token_hash);if(proof.inconsistent)throw Error('INCONSISTENT_DELIVERY');
    // A previously delivered order can finish Google's acknowledgement during maintenance.
    // Admission is required only when repairing or creating delivery effects.
    if(!proof.complete||order.status!=='fulfilled') {
    if(identityRestoreBlocked(nk)||identityGameplayGate(workerCtx,nk))throw Error('ACCOUNT_ADMISSION_REVIEW_REQUIRED');
    const server=validatedServer(nk,{server_id:scope.serverId,generation:scope.generation});
    if(server.error)throw Error('ORIGINAL_SERVER_UNAVAILABLE');
    if(!nk.sqlQuery("SELECT 1 FROM player_characters WHERE account_id=$1::UUID AND server_id=$2 AND generation=$3 AND status='ready'",[scope.accountId,scope.serverId,scope.generation]).length)throw Error('ORIGINAL_CHARACTER_REVIEW_REQUIRED');
    const result=JSON.parse(withActiveAccount(nk,order.user_id,()=>withServerRequest(nk,scope,()=>fulfillVerifiedStoreOrder(workerCtx,logger,characterRuntime(nk,scope),order,
      {platform:'android',productId:order.product_id,storeProductId:v.product_id,transactionId:v.transaction_id,tokenHash:job.token_hash,seenBefore:false,receiptOwner:order.user_id,mode:'production'}))));
    if(result.status!=='success')throw Error('DELIVERY_RETRY_REQUIRED');
    }
    if(!pdProof(nk,order,job.token_hash).complete)throw Error('INCONSISTENT_DELIVERY');
    if(nk.sqlQuery('SELECT 1 FROM store_purchase_voids WHERE token_hash=$1',[job.token_hash]).length){pdFinish(nk,job,'blocked','PAYMENT_REVOKED','VOIDED');return {delivered:false};}
    const saved=nk.sqlQuery(`UPDATE payment_delivery_jobs SET status='delivered',delivery_completed_at=COALESCE(delivery_completed_at,NOW()),last_error='',revision=revision+1,updated_at=NOW()
      WHERE token_hash=$1 AND lease_id=$2 AND lease_until>NOW() RETURNING token_hash`,[job.token_hash,job.lease_id]);
    if(!saved.length)throw Error('STALE_DELIVERY_LEASE');
    return {delivered:true,fulfillment_type:order.fulfillment_type};
}
const googlePlayDelivery:nkruntime.RpcFunction=(ctx,logger,nk,payload)=>{
    if(ctx.userId||!ctx.env||!ctx.env.MONETIZATION_VERIFIER_SECRET)return pdError(403,'FORBIDDEN');
    let req:any;try{req=JSON.parse(payload||'{}');}catch(_e){return pdError(400,'INVALID_REQUEST');}
    if((payload||'').length>20000||req.verifier_secret!==ctx.env.MONETIZATION_VERIFIER_SECRET)return pdError(403,'FORBIDDEN');
    const hash=String(req.token_hash||'');
    try {
        if(req.action==='lease'){
            const limit=Math.min(20,Math.max(1,Number(req.limit)||5)),lease=nk.uuidv4();
            const jobs=nk.sqlQuery(`WITH due AS (SELECT token_hash FROM payment_delivery_jobs WHERE status IN ('queued','retry','processing','delivered')
              AND next_attempt_at<=NOW() AND (lease_until IS NULL OR lease_until<NOW()) ORDER BY next_attempt_at LIMIT $1 FOR UPDATE SKIP LOCKED)
              UPDATE payment_delivery_jobs j SET status='processing',lease_id=$2,lease_until=NOW()+INTERVAL '120 seconds',attempts=attempts+1,revision=revision+1,updated_at=NOW()
              FROM due WHERE j.token_hash=due.token_hash RETURNING j.token_hash,j.encrypted_token,j.package_name,j.product_id,j.expected_order_id,j.expected_user_id,j.lease_id`,[Math.floor(limit),lease]);
            return JSON.stringify({success:true,jobs});
        }
        if(!/^[a-f0-9]{64}$/.test(hash))return pdError(400,'INVALID_TOKEN_HASH');
        if(req.action==='enqueue'){
            if(typeof req.encrypted_token!=='string'||!/^v1\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/.test(req.encrypted_token)||req.encrypted_token.length>16000
              ||typeof req.package_name!=='string'||!/^[a-zA-Z0-9_.]{3,200}$/.test(req.package_name))return pdError(400,'INVALID_ENCRYPTED_RECEIPT');
            const args=[hash,req.encrypted_token,req.package_name,String(req.product_id||'').slice(0,200),String(req.expected_order_id||'').slice(0,180),String(req.expected_user_id||'').slice(0,80)];
            nk.sqlExec(`INSERT INTO payment_delivery_jobs(token_hash,encrypted_token,package_name,product_id,expected_order_id,expected_user_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,args);
            const old=nk.sqlQuery('SELECT package_name,product_id,expected_order_id,expected_user_id FROM payment_delivery_jobs WHERE token_hash=$1',[hash])[0];
            if(old.package_name!==args[2]||old.product_id&&args[3]&&old.product_id!==args[3]||old.expected_order_id&&args[4]&&old.expected_order_id!==args[4]||old.expected_user_id&&args[5]&&old.expected_user_id!==args[5])return pdError(409,'RECEIPT_BINDING_CONFLICT');
            if(req.revoked===true){
                nk.sqlQuery('SELECT void_store_purchase($1)',[hash]);
                nk.sqlExec("UPDATE payment_delivery_jobs SET status='blocked',payment_state='VOIDED',last_error='PAYMENT_REVOKED',lease_id='',lease_until=NULL,revision=revision+1,updated_at=NOW() WHERE token_hash=$1",[hash]);
            }else if(req.review===true)nk.sqlExec("UPDATE payment_delivery_jobs SET status='review',last_error='PARTIAL_REFUND_REVIEW',lease_id='',lease_until=NULL,revision=revision+1,updated_at=NOW() WHERE token_hash=$1 AND status<>'blocked'",[hash]);
            return JSON.stringify({success:true,queued:true});
        }
        const job=nk.sqlQuery('SELECT * FROM payment_delivery_jobs WHERE token_hash=$1 AND lease_id=$2 AND lease_until>NOW()',[hash,String(req.lease_id||'')])[0];
        if(!job)return pdError(409,'STALE_DELIVERY_LEASE');
        if(req.action==='apply'){
            try{return JSON.stringify({success:true,...pdApply(ctx,logger,nk,job,req.verified)});}
            catch(error){const reason=String(error).replace(/^Error: /,'');const transient=['DELIVERY_RETRY_REQUIRED','ORIGINAL_SERVER_UNAVAILABLE','SERVER_REQUEST_FENCED'].includes(reason);
              pdFinish(nk,job,transient?'retry':'review',/^[A-Z_]{3,100}$/.test(reason)?reason:'DELIVERY_REVIEW_REQUIRED');return JSON.stringify({success:true,delivered:false,review:!transient});}
        }
        if(req.action==='finalized'){
            if(!job.delivery_completed_at||job.status!=='delivered')return pdError(409,'DELIVERY_NOT_COMPLETE');
            const done=nk.sqlQuery(`UPDATE payment_delivery_jobs SET status='complete',finalized_at=NOW(),lease_id='',lease_until=NULL,last_error='',revision=revision+1,updated_at=NOW()
              WHERE token_hash=$1 AND lease_id=$2 AND lease_until>NOW() AND NOT EXISTS(SELECT 1 FROM store_purchase_voids WHERE token_hash=$1) RETURNING token_hash`,[hash,job.lease_id]);
            return done.length?JSON.stringify({success:true}):pdError(409,'STALE_OR_REVOKED_DELIVERY');
        }
        if(req.action==='retry'){
            const reason=String(req.reason||'PROVIDER_RETRY');pdFinish(nk,job,req.review===true?'review':'retry',/^[A-Z_]{3,100}$/.test(reason)?reason:'PROVIDER_RETRY');return JSON.stringify({success:true});
        }
        return pdError(400,'INVALID_ACTION');
    }catch(_error){logger.warn('Payment recovery operation failed; retry with durable identity');return pdError(409,'DELIVERY_OPERATION_RETRY');}
};
function pdAdmin(ctx:nkruntime.Context,nk:nkruntime.Nakama,payload:string,retry:boolean):string {
    if(!ctx.userId||!isConfigAdmin(ctx))return pdError(403,'FORBIDDEN');
    let req:any;try{req=JSON.parse(payload||'{}');}catch(_e){return pdError(400,'INVALID_REQUEST');}
    const order=nk.sqlQuery('SELECT * FROM monetization_purchase_orders WHERE id=$1',[String(req.order_id||'')])[0];
    if(!order)return pdError(404,'ORDER_NOT_FOUND');
    const summary=pdSummary(nk,order);if(!retry)return JSON.stringify({success:true,data:summary});
    if(typeof req.reason!=='string'||req.reason.trim().length<5||req.reason.length>500)return pdError(400,'REASON_REQUIRED');
    if(!summary.can_retry)return pdError(409,summary.reason);
    const rows=nk.sqlQuery(`WITH queued AS (UPDATE payment_delivery_jobs SET status='queued',next_attempt_at=NOW(),last_error='',revision=revision+1,updated_at=NOW()
      WHERE (purchase_order_id=$1 OR expected_order_id=$1) AND status IN ('queued','retry','review','delivered') AND payment_state NOT IN ('CANCELED','VOIDED','PENDING')
      AND (lease_until IS NULL OR lease_until<NOW()) AND NOT EXISTS(SELECT 1 FROM store_purchase_voids v WHERE v.token_hash=payment_delivery_jobs.token_hash)
      RETURNING token_hash,revision)
      INSERT INTO payment_delivery_audit(actor,action,order_id,token_hash,reason,job_revision) SELECT $2,'admin_retry',$1,token_hash,$3,revision FROM queued RETURNING id`,[order.id,ctx.userId,req.reason.trim()]);
    return rows.length?JSON.stringify({success:true,data:{success:true,message:'Đã xếp hàng kiểm tra và tiếp tục đơn gốc; không tạo thêm phần thưởng.'}}):pdError(409,'DELIVERY_STATE_CHANGED');
}
function rpcAdminOrderRecovery(c:nkruntime.Context,_l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string {return pdAdmin(c,n,p,false);}
function rpcAdminOrderFulfill(c:nkruntime.Context,_l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string {return pdAdmin(c,n,p,true);}
