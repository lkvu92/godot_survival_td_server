// C234: private global quota and character mail commit in one Storage CAS batch.
const GIFT_OWNER = '00000000-0000-0000-0000-000000000000';
const GIFT_MESSAGES:any = {
    INVALID_CODE:'Gift code không hợp lệ.', DISABLED:'Gift code hiện không được phép sử dụng.',
    NOT_STARTED:'Gift code chưa đến thời gian sử dụng.', EXPIRED:'Gift code hết hạn.',
    ALREADY_USED:'Gift code đã sử dụng.', EXHAUSTED:'Gift code đã hết lượt sử dụng.',
    WRONG_SERVER:'Gift code không áp dụng cho server này.', RATE_LIMITED:'Bạn thao tác quá nhanh. Vui lòng thử lại sau.',
    INVALID_REQUEST:'Thông tin gift code không hợp lệ.', UNAVAILABLE:'Không thể xử lý gift code. Vui lòng thử lại.'
};
function giftFailure(code:string):string { return JSON.stringify({success:false,code,message:GIFT_MESSAGES[code]||GIFT_MESSAGES.UNAVAILABLE}); }
function giftCode(input:any):string {
    if(typeof input!=='string'||input.length>80)throw new Error('INVALID_CODE');
    const code=input.trim().toUpperCase();
    if(!/^[A-Z0-9_-]{3,64}$/.test(code))throw new Error('INVALID_CODE');
    return code;
}
function giftRef(collection:string,key:string,userId:string):any {return {collection,key,userId};}
function giftWrite(ref:any,value:any,version:string):any {return Object.assign({},ref,{value,version,permissionRead:0,permissionWrite:0});}
function giftDefinition(nk:nkruntime.Nakama,input:any):any {
    if(!input||typeof input.enabled!=='boolean'||!Number.isSafeInteger(input.starts_at_ms)||input.starts_at_ms<0
        ||!Number.isSafeInteger(input.expires_at_ms)||input.expires_at_ms<=input.starts_at_ms
        ||!Array.isArray(input.allowed_servers)||input.allowed_servers.length>100
        ||!(input.max_uses===null||Number.isSafeInteger(input.max_uses)&&input.max_uses>0)
        ||!Number.isSafeInteger(input.mail_claim_days)||input.mail_claim_days<1||input.mail_claim_days>365
        ||typeof input.mail_title!=='string'||!input.mail_title.trim()||input.mail_title.length>160
        ||typeof input.mail_body!=='string'||input.mail_body.length>12000
        ||!Array.isArray(input.rewards)||!input.rewards.length||input.rewards.length>256)throw new Error('INVALID_DEFINITION');
    const servers=input.allowed_servers;
    for(const id of servers)if(typeof id!=='string'||!/^[a-z][a-z0-9_]{0,31}$/.test(id)
        ||!nk.sqlQuery("SELECT 1 FROM game_servers WHERE server_id=$1 AND status<>'deleted'",[id]).length)throw new Error('INVALID_SERVER');
    const rewards=input.rewards.map((r:any)=>{
        if(r&&r.type==='random_item') {
            if(!Array.isArray(r.pool)||!r.pool.length||r.pool.length>32||!Number.isSafeInteger(r.amount)||r.amount<1||r.amount>1000)throw new Error('INVALID_RANDOM_REWARD');
            for(const id of r.pool)mailValidateAttachments(nk,[{type:'item',id,amount:1}]);
            return {type:'random_item',pool:r.pool.slice(),amount:r.amount};
        }
        return mailValidateAttachments(nk,[r])[0];
    });
    return {code:giftCode(input.code),enabled:input.enabled,starts_at_ms:input.starts_at_ms,expires_at_ms:input.expires_at_ms,
        allowed_servers:servers.slice(),max_uses:input.max_uses,rewards,mail_title:input.mail_title.trim(),mail_body:input.mail_body,
        mail_claim_days:input.mail_claim_days};
}
function giftResolve(nk:nkruntime.Nakama,rewards:any[]):any[] {
    const totals:any={};
    function add(r:any):void {
        const key=r.type+':'+r.id;
        if(!totals[key])totals[key]={type:r.type,id:r.id,amount:0};
        totals[key].amount+=r.amount;
    }
    for(const r of rewards) {
        if(r.type==='random_item')for(let i=0;i<r.amount;i++)add({type:'item',id:r.pool[Math.floor(Math.random()*r.pool.length)],amount:1});
        else add(r);
    }
    // Keep every mail attachment within the existing mailbox's amount limits.
    const result:any[]=[];
    for(const key of Object.keys(totals)) {
        const r=totals[key],limit=r.type==='item'?1000:r.type==='hero'?1:1000000000;
        while(r.amount>0){const amount=Math.min(r.amount,limit);result.push({type:r.type,id:r.id,amount});r.amount-=amount;}
    }
    if(result.length>512)throw new Error('TOO_MANY_REWARDS');
    for(let i=0;i<result.length;i+=32)mailValidateAttachments(nk,result.slice(i,i+32));
    return result;
}
function giftRateLimit(nk:nkruntime.Nakama,userId:string):boolean {
    const ref=giftRef('gift_code_attempts','minute',userId);
    for(let retry=0;retry<3;retry++) {
        const old=nk.storageRead([ref])[0],now=Date.now(),minute=Math.floor(now/60000);
        const count=old&&old.value.minute===minute?old.value.count:0;
        if(count>=10)return false;
        try{nk.storageWrite([giftWrite(ref,{minute,count:count+1},old?old.version:'*')]);return true;}catch(_e){}
    }
    return false;
}
function giftMailChunks(nk:nkruntime.Nakama,rewards:any[]):any[][] {
    const chunks:any[][]=[],stackable:any[]=[];
    for(const reward of rewards) {
        // Separate unusually large non-stackable grants from regular bundles.
        const item=reward.type==='item'?nk.sqlQuery('SELECT stackable FROM game_items WHERE id=$1',[reward.id])[0]:null;
        if(item&&item.stackable===false&&reward.amount>1)chunks.push([reward]);else stackable.push(reward);
    }
    for(let i=0;i<stackable.length;i+=32)chunks.push(stackable.slice(i,i+32));
    return chunks;
}
function giftRedeem(ctx:nkruntime.Context,logger:nkruntime.Logger,base:nkruntime.Nakama,nk:nkruntime.Nakama,payload:string):string {
    if(!ctx.userId)return giftFailure('INVALID_REQUEST');
    let req:any,code:string;
    try {
        if(!payload||payload.length>4096)return giftFailure('INVALID_REQUEST');
        req=serverRequest(payload);code=giftCode(req.code);
        if(typeof req.request_id!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(req.request_id))return giftFailure('INVALID_REQUEST');
    }catch(_e){return giftFailure('INVALID_CODE');}
    if(!giftRateLimit(base,ctx.userId))return giftFailure('RATE_LIMITED');
    const scope=characterContext(nk),serverId=scope?scope.serverId:'',generation=scope?scope.generation:0;
    const configRef=giftRef('gift_codes',code,GIFT_OWNER),markerRef=giftRef('gift_code_redemptions',code,ctx.userId);
    for(let retry=0;retry<4;retry++) {
        try {
            const reads=base.storageRead([configRef,markerRef]);
            const old=reads.find((r:any)=>r.collection==='gift_code_redemptions');
            if(old) {
                if(old.value.request_id===req.request_id&&old.value.server_id===serverId&&old.value.generation===generation)
                    return JSON.stringify({success:true,mail_ids:old.value.mail_ids,replayed:true});
                return giftFailure('ALREADY_USED');
            }
            // Linking accounts must not restore codes consumed by an archived identity.
            if(base.sqlQuery(`SELECT 1 FROM storage s JOIN account_link_archives a ON a.loser_id=s.user_id
                WHERE a.winner_id=$1::UUID AND s.collection='gift_code_redemptions' AND s.key=$2 LIMIT 1`,[ctx.userId,code]).length)
                return giftFailure('ALREADY_USED');
            const stored=reads.find((r:any)=>r.collection==='gift_codes');
            if(!stored)return giftFailure('INVALID_CODE');
            const value=stored.value,now=Date.now();
            if(!value.enabled)return giftFailure('DISABLED');
            if(now<value.starts_at_ms)return giftFailure('NOT_STARTED');
            if(now>=value.expires_at_ms)return giftFailure('EXPIRED');
            if(value.allowed_servers.length&&value.allowed_servers.indexOf(serverId)<0)return giftFailure('WRONG_SERVER');
            if(value.max_uses!==null&&value.used_count>=value.max_uses)return giftFailure('EXHAUSTED');
            const chunks=giftMailChunks(nk,giftResolve(nk,value.rewards)),mailIds:string[]=[],writes:any[]=[];
            for(let index=0;index<chunks.length;index++) {
                const row=mailDefinition(nk,{source_id:'gift:'+code+':'+ctx.userId+':'+index,source_type:'gift_code',category:'event',
                    title:value.mail_title.slice(0,140)+(chunks.length>1?' ('+(index+1)+'/'+chunks.length+')':''),
                    body:value.mail_body,expires_at_ms:now+value.mail_claim_days*MAIL_DAY,attachments:chunks[index]});
                const key=scope?characterStorageKey(scope,row.id):row.id;
                mailIds.push(row.id);
                writes.push(giftWrite(giftRef('player_mail',key,ctx.userId),row,'*'),
                    giftWrite(giftRef('player_mail_deliveries',key,ctx.userId),{source_id:row.source_id,created_at_ms:now},'*'));
            }
            const marker={request_id:req.request_id,server_id:serverId,generation,mail_ids:mailIds,redeemed_at_ms:now};
            writes.push(giftWrite(configRef,Object.assign({},value,{used_count:value.used_count+1}),stored.version),giftWrite(markerRef,marker,'*'));
            // Wall clock is checked again immediately before the atomic commit.
            if(Date.now()>=value.expires_at_ms)return giftFailure('EXPIRED');
            try{base.storageWrite(writes);}catch(_conflict){continue;}
            for(const id of mailIds)mailPush(nk,ctx.userId,id);
            return JSON.stringify({success:true,mail_ids:mailIds,replayed:false});
        }catch(_e){logger.error('Gift code processing failed');return giftFailure('UNAVAILABLE');}
    }
    return giftFailure('UNAVAILABLE');
}
function linkedRpc_gift_code_redeem(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string {
    return accountGuardedRpc('gift_code_redeem',(cc,ll,nn,pp)=>invokeWithVersionGate(cc,ll,nn,pp,
        (ccc,lll,nnn,ppp)=>giftRedeem(ccc,lll,n,nnn,ppp)))(c,l,n,p);
}
function giftCodeManagement(ctx:nkruntime.Context,logger:nkruntime.Logger,nk:nkruntime.Nakama,payload:string,actorId:string):string {
    try {
        if(!payload||payload.length>150000)throw new Error('INVALID_REQUEST');
        const req=serverRequest(payload);
        if(req.action==='list'||req.action==='history') {
            const limit=Number.isSafeInteger(req.limit)?Math.min(100,Math.max(1,req.limit)):50;
            const cursor=typeof req.cursor==='string'?req.cursor:'';
            if(cursor.length>160)throw new Error('INVALID_CURSOR');
            const history=req.action==='history',code=history?giftCode(req.code):'';
            const rows=nk.sqlQuery(history?
                "SELECT user_id::TEXT AS user_id,value FROM storage WHERE collection='gift_code_redemptions' AND key=$1 AND user_id::TEXT>$2 ORDER BY user_id::TEXT LIMIT $3":
                "SELECT key,value FROM storage WHERE collection='gift_codes' AND user_id=$1::UUID AND key>$2 ORDER BY key LIMIT $3",
                [history?code:GIFT_OWNER,cursor,limit+1]);
            const more=rows.length>limit;if(more)rows.pop();
            for(const row of rows)row.value=parseJsonb(row.value);
            return JSON.stringify({success:true,entries:rows,next_cursor:more?(history?rows[rows.length-1].user_id:rows[rows.length-1].key):''});
        }
        if(req.action!=='upsert'||typeof req.reason!=='string'||!req.reason.trim()||req.reason.length>500)throw new Error('REASON_REQUIRED');
        const definition=giftDefinition(nk,req.definition),ref=giftRef('gift_codes',definition.code,GIFT_OWNER),old=nk.storageRead([ref])[0];
        if(!Number.isSafeInteger(req.expected_revision)||req.expected_revision!==(old?old.value.revision:0))return JSON.stringify({success:false,code:'REVISION_CONFLICT'});
        if(old&&old.value.used_count>0&&(JSON.stringify(old.value.rewards)!==JSON.stringify(definition.rewards)||old.value.mail_claim_days!==definition.mail_claim_days))throw new Error('REWARDS_LOCKED');
        if(old&&definition.max_uses!==null&&definition.max_uses<old.value.used_count)throw new Error('QUOTA_BELOW_USED');
        const value=Object.assign({},definition,{used_count:old?old.value.used_count:0,revision:req.expected_revision+1});
        const audit={actor_id:actorId,reason:req.reason.trim(),at_ms:Date.now(),code:value.code,revision:value.revision,before:old?old.value:null,after:value};
        try{nk.storageWrite([giftWrite(ref,value,old?old.version:'*'),giftWrite(giftRef('gift_code_audit',nk.uuidv4(),GIFT_OWNER),audit,'*')]);}
        catch(_e){return JSON.stringify({success:false,code:'REVISION_CONFLICT'});}
        return JSON.stringify({success:true,definition:value});
    }catch(error){logger.warn('Gift code admin rejected: '+String(error));return JSON.stringify({success:false,code:'INVALID_DEFINITION',message:String(error)});}
}
const rpcGiftCodeAdmin:nkruntime.RpcFunction=(ctx,logger,nk,payload)=>{
    const denied=requireServerAdmin(ctx);if(denied)return denied;
    return giftCodeManagement(ctx,logger,nk,payload,ctx.userId);
};
const operatorGiftCodes:nkruntime.RpcFunction=(ctx,logger,nk,payload)=>{
    let request:any;
    try {
        if(!payload||payload.length>150000)return giftFailure('INVALID_REQUEST');
        request=JSON.parse(payload);
    }catch(_e){return giftFailure('INVALID_REQUEST');}
    const expected=String(ctx.env&&ctx.env.CONFIG_PUBLISH_TOKEN||'');
    if(ctx.userId||expected.length<64||!request||typeof request!=='object'||Array.isArray(request)||request.publish_token!==expected)
        return JSON.stringify({success:false,code:'FORBIDDEN',message:'Invalid operator credential'});
    return giftCodeManagement(ctx,logger,nk,payload,'operator:deploy');
};
function linkedRpc_gift_code_admin(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string {
    return accountGuardedRpc('gift_code_admin',rpcGiftCodeAdmin)(c,l,n,p);
}
