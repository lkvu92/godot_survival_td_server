// C147: messages and grants share one atomic Storage transaction.
const MAIL_COLLECTION = 'player_mail';
const MAIL_DAY = 86400000;
const MAIL_FILTERS = ['all','unread','read','reward','expiring','system','battle_report'];
function mailSettings(nk:nkruntime.Nakama):any {
    const c=getRemoteConfigValue(nk,'system','mailbox',{warning_hours:24,retention_days:7});
    if(!c || !Number.isSafeInteger(c.warning_hours)||c.warning_hours<1||c.warning_hours>720
        ||!Number.isSafeInteger(c.retention_days)||c.retention_days<1||c.retention_days>365)throw new Error('MAIL_CONFIG_INVALID');
    return c;
}
function mailPrefix(nk:nkruntime.Nakama):string {
    const scope=characterContext(nk);return scope?characterStorageKey(scope,'_').slice(0,-1):'';
}
function mailId(nk:nkruntime.Nakama,source:string):string {return 'm_'+String(nk.sqlQuery("SELECT encode(sha256(convert_to($1,'UTF8')),'hex') AS hash",[source])[0].hash).slice(0,48);}
function mailError(code:string,message:string):any {return {success:false,code,message};}
function mailValidateAttachments(nk:nkruntime.Nakama,input:any):any[] {
    if(!Array.isArray(input)||input.length>32)throw new Error('INVALID_ATTACHMENTS');
    return input.map((r:any)=>{
        if(!r||!Number.isSafeInteger(r.amount)||r.amount<1||r.amount>1000000000)throw new Error('INVALID_REWARD_AMOUNT');
        if(r.type==='resource'&&['gold','gems'].indexOf(r.id)>=0)return {type:r.type,id:r.id,amount:r.amount};
        if(r.type==='exp'&&r.id==='user')return {type:r.type,id:r.id,amount:r.amount};
        if(r.type==='item'&&typeof r.id==='string'&&/^[a-z0-9_]{1,100}$/.test(r.id)) {
            // Resolve definitions before persisting rewards; never accept client art as an item ID.
            if(r.amount>1000||!nk.sqlQuery('SELECT id FROM game_items WHERE id=$1',[r.id]).length)throw new Error('INVALID_ITEM');
            return {type:r.type,id:r.id,amount:r.amount};
        }
        if(r.type==='hero'&&r.amount===1&&typeof r.id==='string'&&/^[a-z0-9_]{1,100}$/.test(r.id)
            &&nk.sqlQuery('SELECT id FROM game_heroes WHERE id=$1',[r.id]).length)return {type:r.type,id:r.id,amount:r.amount};
        throw new Error('INVALID_REWARD');
    });
}
function mailDefinition(nk:nkruntime.Nakama,input:any):any {
    if(!input||typeof input.source_id!=='string'||!input.source_id.length||input.source_id.length>240
        ||typeof input.title!=='string'||!input.title.trim()||input.title.length>160
        ||typeof input.body!=='string'||input.body.length>12000)throw new Error('INVALID_MAIL');
    const category=input.category||'system';if(['system','event','battle_report'].indexOf(category)<0)throw new Error('INVALID_CATEGORY');
    const expiry=input.expires_at_ms===undefined?null:input.expires_at_ms;
    if(expiry!==null&&(!Number.isSafeInteger(expiry)||expiry<0||expiry>Number.MAX_SAFE_INTEGER-366*MAIL_DAY))throw new Error('INVALID_EXPIRY');
    const sender=input.sender_name||'Hệ thống';if(typeof sender!=='string'||sender.length>80)throw new Error('INVALID_SENDER');
    const source=String(input.source_type||'system');if(source.length>40)throw new Error('INVALID_SOURCE');
    return {id:mailId(nk,input.source_id),category,source_type:source,source_id:input.source_id,title:input.title.trim(),sender_name:sender,
        body:input.body,attachments:mailValidateAttachments(nk,input.attachments||[]),created_at_ms:Date.now(),expires_at_ms:expiry,
        purge_at_ms:expiry===null?null:expiry+mailSettings(nk).retention_days*MAIL_DAY,read_at_ms:null,claimed_at_ms:null,deleted_at_ms:null,version:1,
        weekly:input.weekly||null};
}
function mailWrite(row:any,userId:string):any {return {collection:MAIL_COLLECTION,key:row.id,userId,value:row,permissionRead:0,permissionWrite:0};}
function mailPush(nk:nkruntime.Nakama,userId:string,id:string):void {
    const scope=characterContext(nk);
    try{nk.notificationSend(userId,'Hộp thư',{type:'mail_changed',mail_id:id,server_id:scope?scope.serverId:'',generation:scope?scope.generation:0},147,undefined,false);}catch(_e){/* Recovery RPC is authoritative. */}
}
// Ledger is immutable and retained after mail purge. Callers may batch these writes with purchase markers.
function deliverMail(nk:nkruntime.Nakama,userId:string,input:any):any {
    const row=mailDefinition(nk,input),marker={collection:'player_mail_deliveries',key:row.id,userId};
    if(nk.storageRead([marker]).length)return {id:row.id,idempotent:true};
    nk.storageWrite([Object.assign(mailWrite(row,userId),{version:'*'}),Object.assign({},marker,{value:{source_id:row.source_id,created_at_ms:row.created_at_ms},version:'*',permissionRead:0,permissionWrite:0})]);
    if(!(nk as any).__mailBatch)mailPush(nk,userId,row.id);
    return {id:row.id,idempotent:false};
}

function vipEnsureMilestoneMails(nk:nkruntime.Nakama,userId:string,vip:any):number[] {
    if(!vip || !vip.configured || Number(vip.level)<1)return [];
    const config=vipBenefitsConfig(nk),sent:number[]=[];
    for(const milestone of config.milestone_rewards) {
        if(milestone.level>vip.level)break;
        const source='vip_milestone:'+milestone.level,id=mailId(nk,source);
        const marker={collection:'player_mail_deliveries',key:id,userId};
        if(nk.storageRead([marker]).length){sent.push(milestone.level);continue;}
        const totals:any={};
        for(const reward of milestone.rewards) {
            if(reward.type==='item')totals[reward.id]=Number(totals[reward.id]||0)+reward.amount;
            else if(reward.type==='random_item_bundle') {
                const item=reward.pool[Math.floor(Math.random()*reward.pool.length)];
                totals[item]=Number(totals[item]||0)+reward.amount;
            }
            else for(let i=0;i<reward.amount;i++) {
                const item=reward.pool[Math.floor(Math.random()*reward.pool.length)];
                totals[item]=Number(totals[item]||0)+1;
            }
        }
        const attachments=Object.keys(totals).map(item=>({type:'item',id:item,amount:totals[item]}));
        try {
            deliverMail(nk,userId,{source_id:source,source_type:'vip_milestone',title:'Quà đạt VIP '+milestone.level,
                body:'Chúc mừng đạt VIP '+milestone.level+'. Quà mốc chỉ gửi một lần. Vật phẩm ngẫu nhiên đã được chốt khi gửi thư.',attachments});
        } catch(error) {
            // A concurrent reconciliation may have committed this exact source.
            if(!nk.storageRead([marker]).length)throw error;
        }
        sent.push(milestone.level);
    }
    return sent;
}
function mailVisibleSql():string {return "COALESCE((value->>'deleted_at_ms')::BIGINT,0)=0 AND (value->>'purge_at_ms' IS NULL OR (value->>'purge_at_ms')::BIGINT>$3)";}
function mailSummary(nk:nkruntime.Nakama,userId:string,now:number):any {
    const rows=nk.sqlQuery(`SELECT COUNT(*) FILTER(WHERE value->>'read_at_ms' IS NULL AND value->>'claimed_at_ms' IS NULL)::INT AS unread_count,
      COUNT(*) FILTER(WHERE jsonb_array_length(value->'attachments')>0 AND value->>'claimed_at_ms' IS NULL
        AND (value->>'expires_at_ms' IS NULL OR (value->>'expires_at_ms')::BIGINT>$3))::INT AS claimable_count
      FROM storage WHERE collection='player_mail' AND user_id=$1::UUID AND left(key,length($2))=$2 AND ($2<>'' OR left(key,2)='m_') AND ${mailVisibleSql()}`,[userId,mailPrefix(nk),now]);
    return rows[0]||{unread_count:0,claimable_count:0};
}
function mailPresent(nk:nkruntime.Nakama,row:any,now:number):any {
    const expired=row.expires_at_ms!==null&&now>=row.expires_at_ms;
    return Object.assign({},row,{expired,expiring:row.expires_at_ms!==null&&!expired&&row.expires_at_ms-now<=mailSettings(nk).warning_hours*3600000,read_at_ms:row.read_at_ms||row.claimed_at_ms||null,
        can_claim:row.attachments.length>0&&!row.claimed_at_ms&&!expired&&!row.deleted_at_ms,
        can_delete:row.attachments.length===0||!!row.claimed_at_ms});
}
function mailResponse(nk:nkruntime.Nakama,userId:string,data:any):string {
    const now=Date.now();return JSON.stringify(Object.assign({success:true,server_time_ms:now,summary:mailSummary(nk,userId,now)},data));
}
function mailRead(nk:nkruntime.Nakama,userId:string,id:any):any {
    if(typeof id!=='string'||!/^m_[a-f0-9]{48}$/.test(id))throw new Error('INVALID_MAIL_ID');
    const row=nk.storageRead([{collection:MAIL_COLLECTION,key:id,userId}])[0];
    if(!row||row.value.deleted_at_ms||(row.value.purge_at_ms!==null&&Date.now()>=row.value.purge_at_ms))return null;
    return row;
}
function mailClaimOne(nk:nkruntime.Nakama,userId:string,id:string):any {
    const stored=mailRead(nk,userId,id);if(!stored)return mailError('MAIL_NOT_FOUND','Thư không còn tồn tại.');
    const mail=stored.value,now=Date.now();
    const reads=nk.storageRead([{collection:'player_profiles',key:'main',userId},{collection:'player_inventory',key:'items',userId},{collection:'player_heroes',key:'states',userId}]
        .concat(mail.weekly?[{collection:'weekly_leaderboard_claims',key:weeklyClaimKey(mail.weekly.period_id,mail.weekly.board_id),userId}]:[]));
    const p=reads.find((r:any)=>r.collection==='player_profiles'),i=reads.find((r:any)=>r.collection==='player_inventory'),h=reads.find((r:any)=>r.collection==='player_heroes');
    if(!p||!i||!h||!Array.isArray(i.value.items))return mailError('CHARACTER_INCOMPLETE','Dữ liệu nhân vật chưa sẵn sàng.');
    if(mail.claimed_at_ms)return {success:true,already_claimed:true,mail:mailPresent(nk,mail,now),profile:p.value,inventory:i.value.items,heroes:h.value.heroes||[]};
    if(!mailPresent(nk,mail,now).can_claim)return mailError(mail.attachments.length?'MAIL_EXPIRED':'NO_REWARD',mail.attachments.length?'Thư đã hết hạn nhận thưởng.':'Thư không có phần thưởng.');
    // CAS on the shared weekly marker also serializes with older weekly clients.
    const oldWeekly=reads.find((r:any)=>r.collection==='weekly_leaderboard_claims');
    const writes:any[]=[];
    if(!oldWeekly) {
        p.value.resources=p.value.resources||{};
        h.value.heroes=Array.isArray(h.value.heroes)?h.value.heroes:[];
        let heroesChanged=false;
        for(const reward of mail.attachments) {
            if(reward.type==='resource') {
                const total=Number(p.value.resources[reward.id]||0)+reward.amount;
                if(!Number.isSafeInteger(total))return mailError('RESOURCE_LIMIT','Tài nguyên vượt giới hạn.');
                p.value.resources[reward.id]=total;
            }else if(reward.type==='item'){addStoreInventoryItem(nk,i.value.items,reward.id,reward.amount);if(i.value.items.length>2000)return mailError('INVENTORY_FULL','Túi đồ đầy. Hãy dọn túi rồi nhận lại.');}
            else if(reward.type==='exp'){progressionApplyUser(nk,p.value,reward.amount);progressionReconcileLevelUnlocks(nk,p.value);}
            else if(reward.type==='hero'){
                const hero=h.value.heroes.find((entry:any)=>entry&&String(entry.hero_id||'')===reward.id);
                if(hero)hero.owned=true;
                else h.value.heroes.push({hero_id:reward.id,level:1,exp:0,next_level_exp:1000,owned:true,current_attribute:{}});
                heroesChanged=true;
            }
            else throw new Error('INVALID_STORED_REWARD');
        }
        writes.push({collection:'player_profiles',key:'main',userId,value:p.value,version:p.version,permissionRead:1,permissionWrite:0},
            {collection:'player_inventory',key:'items',userId,value:i.value,version:i.version,permissionRead:1,permissionWrite:0});
        if(heroesChanged)writes.push({collection:'player_heroes',key:'states',userId,value:h.value,version:h.version,permissionRead:1,permissionWrite:0});
        if(mail.weekly)writes.push({collection:'weekly_leaderboard_claims',key:weeklyClaimKey(mail.weekly.period_id,mail.weekly.board_id),userId,
            value:{period_id:mail.weekly.period_id,board_id:mail.weekly.board_id,rewards:mail.attachments},version:'*',permissionRead:0,permissionWrite:0});
    }
    // Recheck the wall clock immediately before the atomic write, including bulk requests.
    if(mail.expires_at_ms!==null&&Date.now()>=mail.expires_at_ms)return mailError('MAIL_EXPIRED','Thư đã hết hạn nhận thưởng.');
    const claimNow=Date.now();mail.claimed_at_ms=claimNow;if(!mail.read_at_ms)mail.read_at_ms=claimNow;mail.version++;
    writes.push(Object.assign(mailWrite(mail,userId),{version:stored.version}));
    try{mailCombatRuntime(nk,userId).storageWrite(writes);}catch(_e){return mailError('DATA_CHANGED','Dữ liệu vừa thay đổi. Vui lòng thử lại.');}
    mailPush(nk,userId,id);
    return {success:true,already_claimed:!!oldWeekly,mail:mailPresent(nk,mail,Date.now()),profile:p.value,inventory:i.value.items,heroes:h.value.heroes||[]};
}
function mailMutateOne(nk:nkruntime.Nakama,userId:string,id:string,action:string):any {
    if(action==='claim')return mailClaimOne(nk,userId,id);
    const stored=mailRead(nk,userId,id);if(!stored)return mailError('MAIL_NOT_FOUND','Thư không còn tồn tại.');
    const row=stored.value,now=Date.now();
    if(action==='delete'&&!mailPresent(nk,row,now).can_delete)return mailError('UNCLAIMED_REWARD','Hãy nhận phần thưởng trước khi xóa thư.');
    if(action==='open'&&!row.read_at_ms)row.read_at_ms=now;
    if(action==='delete')row.deleted_at_ms=now;
    row.version++;
    try{nk.storageWrite([Object.assign(mailWrite(row,userId),{version:stored.version})]);}catch(_e){return mailError('DATA_CHANGED','Dữ liệu vừa thay đổi. Vui lòng thử lại.');}
    mailPush(nk,userId,id);return {success:true,mail:mailPresent(nk,row,now)};
}
function mailList(nk:nkruntime.Nakama,userId:string,req:any):any {
    const now=Date.now(),filter=req.filter||'all';if(MAIL_FILTERS.indexOf(filter)<0)throw new Error('INVALID_FILTER');
    const limit=Number.isSafeInteger(req.limit)?Math.min(50,Math.max(1,req.limit)):20;
    let cursor:any=[Number.MAX_SAFE_INTEGER,'~'];
    if(req.cursor){cursor=JSON.parse(req.cursor);if(!Array.isArray(cursor)||cursor.length!==2||!Number.isSafeInteger(cursor[0])||typeof cursor[1]!=='string'||cursor[1].length>150)throw new Error('INVALID_CURSOR');}
    const clauses:any={all:'TRUE',unread:"value->>'read_at_ms' IS NULL AND value->>'claimed_at_ms' IS NULL",read:"(value->>'read_at_ms' IS NOT NULL OR value->>'claimed_at_ms' IS NOT NULL)",reward:"jsonb_array_length(value->'attachments')>0",
        expiring:"value->>'expires_at_ms' IS NOT NULL AND (value->>'expires_at_ms')::BIGINT>$3 AND (value->>'expires_at_ms')::BIGINT<=$7",
        system:"value->>'category'='system'",battle_report:"value->>'category'='battle_report'"};
    const rows=nk.sqlQuery(`SELECT key,value FROM storage WHERE collection='player_mail' AND user_id=$1::UUID AND left(key,length($2))=$2 AND ($2<>'' OR left(key,2)='m_')
        AND ${mailVisibleSql()} AND ${clauses[filter]} AND ((value->>'created_at_ms')::BIGINT,key)<($4::BIGINT,$5)
        ORDER BY (value->>'created_at_ms')::BIGINT DESC,key DESC LIMIT $6`,[userId,mailPrefix(nk),now,cursor[0],cursor[1],limit+1].concat(filter==='expiring'?[now+mailSettings(nk).warning_hours*3600000]:[]));
    const more=rows.length>limit;if(more)rows.pop();const last=rows[rows.length-1];
    return {mails:rows.map((r:any)=>mailPresent(nk,parseJsonObject(r.value),now)),next_cursor:more?JSON.stringify([Number(parseJsonObject(last.value).created_at_ms),last.key]):'',has_more:more};
}
function mailBulk(nk:nkruntime.Nakama,userId:string,req:any,action:string):any {
    const cursor=req.cursor||'';if(typeof cursor!=='string'||cursor.length>150)throw new Error('INVALID_CURSOR');
    const rows=nk.sqlQuery(`SELECT key,value FROM storage WHERE collection='player_mail' AND user_id=$1::UUID AND left(key,length($2))=$2 AND ($2<>'' OR left(key,2)='m_') AND key>$4
        AND ${mailVisibleSql()} ORDER BY key LIMIT 26`,[userId,mailPrefix(nk),Date.now(),cursor]);
    const more=rows.length>25;if(more)rows.pop();const results=[];let latest:any={};
    for(const stored of rows) {
        const row=parseJsonObject(stored.value),present=mailPresent(nk,row,Date.now()),eligible=action==='claim'?present.can_claim:!!present.read_at_ms&&present.can_delete;
        if(!eligible){results.push({id:row.id,success:false,code:'INELIGIBLE'});continue;}
        const result=mailMutateOne(nk,userId,row.id,action);results.push({id:row.id,success:result.success,code:result.code||''});
        if(result.profile)latest={profile:result.profile,inventory:result.inventory,heroes:result.heroes||[]};
    }
    return Object.assign(latest,{results,has_more:more,next_cursor:more?rows[rows.length-1].key:''});
}
// Recover every unclaimed weekly award, bounded per call. Scheduler also invokes this path.
function mailRecoverWeekly(nk:nkruntime.Nakama,userId:string):void {
    const scope=characterContext(nk),table=scope?'server_weekly_awards':'weekly_leaderboard_awards';
    const args:any[]=[userId,mailPrefix(nk)];if(scope)args.push(scope.serverId,scope.generation);
    const awards=nk.sqlQuery(`SELECT a.period_id,a.board_id,a.rank,a.rewards,EXTRACT(EPOCH FROM a.expires_at)*1000 AS expires_at_ms FROM ${table} a
      WHERE a.user_id=$1::UUID AND a.expires_at>clock_timestamp() ${scope?'AND a.server_id=$3 AND a.generation=$4':''}
      AND NOT EXISTS(SELECT 1 FROM storage s WHERE s.collection='player_mail_deliveries' AND s.user_id=a.user_id
        AND s.key=$2||'m_'||substring(encode(sha256(convert_to('weekly:'||a.period_id||':'||a.board_id,'UTF8')),'hex'),1,48))
      ORDER BY a.period_id,a.board_id LIMIT 25`,args);
    for(const a of awards) {
        const source='weekly:'+a.period_id+':'+a.board_id;
        const marker=nk.storageRead([{collection:'weekly_leaderboard_claims',key:weeklyClaimKey(a.period_id,a.board_id),userId}])[0];
        const input={source_id:source,source_type:'weekly',category:'system',title:'Phần thưởng xếp hạng tuần',body:'Bảng '+a.board_id+' — Hạng '+a.rank+'.',
            attachments:parseJsonb(a.rewards),expires_at_ms:Math.floor(Number(a.expires_at_ms)),weekly:{period_id:String(a.period_id),board_id:a.board_id}};
        if(marker) {
            const id=mailId(nk,source);
            try{nk.storageWrite([{collection:'player_mail_deliveries',key:id,userId,value:{source_id:source,already_claimed:true},version:'*',permissionRead:0,permissionWrite:0}]);}catch(_e){}
        }else {try{deliverMail(nk,userId,input);}catch(error){if(String(error).indexOf('version')<0)throw error;}}
    }
}
function mailPlayerHandler(action:string):nkruntime.RpcFunction {
    return (ctx,_logger,nk,payload)=>{
        if(!ctx.userId)return JSON.stringify(mailError('AUTH_REQUIRED','Cần đăng nhập.'));
        try {
            const req=serverRequest(payload);let result:any={};
            if(action==='summary'||action==='list')mailRecoverWeekly(nk,ctx.userId);
            if(action==='list')result=mailList(nk,ctx.userId,req);
            else if(action==='claim_all'||action==='delete_read')result=mailBulk(nk,ctx.userId,req,action==='claim_all'?'claim':'delete');
            else if(action!=='summary')result=mailMutateOne(nk,ctx.userId,req.id,action);
            return mailResponse(nk,ctx.userId,result);
        }catch(error){_logger.error('Mailbox: '+String(error));return JSON.stringify(mailError('MAIL_UNAVAILABLE','Không thể xử lý hộp thư. Vui lòng tải lại và thử lại.'));}
    };
}
function createMailboxTables(nk:nkruntime.Nakama):void {
    nk.sqlExec(`CREATE INDEX IF NOT EXISTS player_mail_owner_idx ON storage(user_id,key) WHERE collection='player_mail';
      CREATE INDEX IF NOT EXISTS player_mail_order_idx ON storage(user_id,((value->>'created_at_ms')::BIGINT) DESC,key DESC) WHERE collection='player_mail';
      CREATE INDEX IF NOT EXISTS player_mail_purge_idx ON storage(((value->>'purge_at_ms')::BIGINT)) WHERE collection='player_mail';
      CREATE TABLE IF NOT EXISTS mail_campaigns(id TEXT PRIMARY KEY,server_id TEXT NOT NULL,generation INT NOT NULL,definition JSONB NOT NULL,
      cutoff TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),cursor TEXT NOT NULL DEFAULT '',done BOOLEAN NOT NULL DEFAULT FALSE);`,[]);
}
function mailAdminRuntime(nk:nkruntime.Nakama,userId:string,req:any):nkruntime.Nakama {
    if(!req.server_id)return nk;
    if(typeof req.server_id!=='string'||!/^[a-z][a-z0-9_]{0,31}$/.test(req.server_id)||!Number.isSafeInteger(req.generation)||req.generation<1)throw new Error('INVALID_CONTEXT');
    const rows=nk.sqlQuery(`SELECT 1 FROM player_characters c JOIN game_servers s ON s.server_id=c.server_id AND s.generation=c.generation
        WHERE c.account_id=$1::UUID AND c.server_id=$2 AND c.generation=$3 AND c.status='ready' AND s.status='open'`,[userId,req.server_id,req.generation]);
    if(!rows.length)throw new Error('CHARACTER_NOT_READY');
    return characterRuntime(nk,{accountId:userId,serverId:req.server_id,generation:req.generation});
}
const rpcMailAdminSend:nkruntime.RpcFunction=(ctx,_logger,nk,payload)=>{
    const denied=requireServerAdmin(ctx);if(denied)return denied;
    try{const req=serverRequest(payload);if(!/^[a-f0-9-]{36}$/.test(req.target_user_id||''))throw new Error('INVALID_USER');
        if(ctx.env.MULTI_SERVER_ENABLED==='true'&&!req.server_id)throw new Error('CONTEXT_REQUIRED');
        return JSON.stringify({success:true,delivery:deliverMail(mailAdminRuntime(nk,req.target_user_id,req),req.target_user_id,req)});
    }catch(error){return JSON.stringify(mailError('INVALID_MAIL',String(error)));}
};
const rpcMailAdminCampaign:nkruntime.RpcFunction=(ctx,_logger,nk,payload)=>{
    const denied=requireServerAdmin(ctx);if(denied)return denied;
    try{const req=serverRequest(payload);if(typeof req.campaign_id!=='string'||!/^[a-zA-Z0-9_:.-]{1,100}$/.test(req.campaign_id))throw new Error('INVALID_CAMPAIGN');
        if(ctx.env.MULTI_SERVER_ENABLED==='true'&&!req.server_id)throw new Error('CONTEXT_REQUIRED');
        if(req.server_id&&!nk.sqlQuery("SELECT 1 FROM game_servers WHERE server_id=$1 AND generation=$2 AND status='open'",[req.server_id,req.generation]).length)throw new Error('INVALID_CONTEXT');
        req.source_id='campaign:'+req.campaign_id;req.source_type='campaign';mailDefinition(nk,req);
        nk.sqlExec(`INSERT INTO mail_campaigns(id,server_id,generation,definition) VALUES($1,$2,$3,$4::JSONB) ON CONFLICT DO NOTHING`,
            [req.campaign_id,req.server_id||'',req.generation||0,JSON.stringify(req)]);
        return JSON.stringify({success:true,campaign_id:req.campaign_id});
    }catch(error){return JSON.stringify(mailError('INVALID_CAMPAIGN',String(error)));}
};
const rpcMailTick:nkruntime.RpcFunction=(ctx,logger,nk,_payload)=>{
    if(ctx.userId&&requireServerAdmin(ctx))return JSON.stringify(mailError('FORBIDDEN','Forbidden'));
    let purged=0,delivered=0;const failures:any[]=[];const deadline=Date.now()+2000;
    const expired=nk.sqlQuery(`SELECT user_id::TEXT AS user_id,key,version FROM storage WHERE collection='player_mail'
        AND (value->>'deleted_at_ms' IS NOT NULL OR (value->>'purge_at_ms')::BIGINT<= $1) ORDER BY update_time LIMIT 100`,[Date.now()]);
    for(const row of expired){try{nk.storageDelete([{collection:MAIL_COLLECTION,key:row.key,userId:row.user_id,version:row.version}]);purged++;}catch(_e){}}
    const campaigns=nk.sqlQuery("SELECT * FROM mail_campaigns c WHERE NOT done AND (c.server_id='' OR EXISTS(SELECT 1 FROM game_servers s WHERE s.server_id=c.server_id AND s.generation=c.generation AND s.status='open')) ORDER BY cutoff,id LIMIT 5",[]);
    for(const campaign of campaigns) {
        if(Date.now()>=deadline)break;
        try {
            const users=campaign.server_id?nk.sqlQuery(`SELECT c.account_id::TEXT AS user_id FROM player_characters c JOIN users u ON u.id=c.account_id WHERE c.server_id=$1 AND c.generation=$2 AND c.status='ready' AND c.created_at<=$3 AND c.account_id::TEXT>$4 AND COALESCE(u.disable_time,to_timestamp(0))<=to_timestamp(0) AND NOT EXISTS(SELECT 1 FROM account_link_state a WHERE a.user_id=u.id AND a.status IN('archived','deleting')) ORDER BY c.account_id::TEXT LIMIT 26`,[campaign.server_id,campaign.generation,campaign.cutoff,campaign.cursor])
                :nk.sqlQuery(`SELECT u.id::TEXT AS user_id FROM users u WHERE u.create_time<=$1 AND u.id::TEXT>$2 AND u.id<>'00000000-0000-0000-0000-000000000000' AND COALESCE(u.disable_time,to_timestamp(0))<=to_timestamp(0) AND NOT EXISTS(SELECT 1 FROM account_link_state a WHERE a.user_id=u.id AND a.status IN('archived','deleting')) ORDER BY u.id::TEXT LIMIT 26`,[campaign.cutoff,campaign.cursor]);
            const more=users.length>25;if(more)users.pop();
            let last=campaign.cursor,processed=0;
            for(const user of users){if(Date.now()>=deadline)break;withActiveAccount(nk,user.user_id,()=>deliverMail(mailAdminRuntime(nk,user.user_id,campaign),user.user_id,parseJsonObject(campaign.definition)));delivered++;processed++;last=user.user_id;}
            nk.sqlExec('UPDATE mail_campaigns SET cursor=$2,done=$3 WHERE id=$1 AND cursor=$4',[campaign.id,last,!more&&processed===users.length,campaign.cursor]);
        }catch(error){failures.push({id:campaign.id,error:String(error)});}
    }
    // Weekly recovery for players with undelivered, still-valid awards (not all accounts).
    const multi=ctx.env&&ctx.env.MULTI_SERVER_ENABLED==='true',table=multi?'server_weekly_awards':'weekly_leaderboard_awards';
    const targets=nk.sqlQuery(`SELECT DISTINCT a.user_id::TEXT AS user_id ${multi?',a.server_id,a.generation':''} FROM ${table} a
        WHERE expires_at>clock_timestamp() AND EXISTS(SELECT 1 FROM users u WHERE u.id=a.user_id AND COALESCE(u.disable_time,to_timestamp(0))<=to_timestamp(0))
        AND NOT EXISTS(SELECT 1 FROM account_link_state l WHERE l.user_id=a.user_id AND l.status IN('archived','deleting'))
        ${multi?"AND EXISTS(SELECT 1 FROM game_servers g JOIN player_characters p ON p.server_id=g.server_id AND p.generation=g.generation WHERE g.server_id=a.server_id AND g.generation=a.generation AND g.status='open' AND p.account_id=a.user_id AND p.status='ready')":''}
        AND NOT EXISTS(SELECT 1 FROM storage s WHERE s.collection='player_mail_deliveries' AND s.user_id=a.user_id
        AND s.key=${multi?"a.server_id||':g'||a.generation||':'||":""}'m_'||substring(encode(sha256(convert_to('weekly:'||a.period_id||':'||a.board_id,'UTF8')),'hex'),1,48)) LIMIT 25`,[]);
    for(const target of targets){if(Date.now()>=deadline)break;try{withActiveAccount(nk,target.user_id,()=>mailRecoverWeekly(mailAdminRuntime(nk,target.user_id,target),target.user_id));}catch(error){logger.error('Mail weekly recovery: '+String(error));failures.push({user:target.user_id});}}
    return JSON.stringify({success:failures.length===0,purged,delivered,failures});
};

function applyPurchaseMailRewards(nk:nkruntime.Nakama,userId:string,grantId:string,productId:string,fulfillmentType:string,rewards:StoreRewardLine[]):any {
    const marker={collection:'player_purchase_grants',key:grantId,userId};
    const p=nk.storageRead([{collection:'player_profiles',key:'main',userId}])[0];
    if(nk.storageRead([marker]).length||(p&&Array.isArray(p.value._iap_reward_ids)&&p.value._iap_reward_ids.indexOf(grantId)>=0))return {idempotent:true};
    const isDaily=(r:StoreRewardLine)=>DAILY_PACK_IDS.indexOf(productId)>=0&&r.metadata&&Number(r.metadata.daily_pack_days)===30;
    const mailed=rewards.filter(r=>!isDaily(r)&&['currency','item','hero'].indexOf(r.reward_type)>=0);
    const immediate=rewards.filter(r=>isDaily(r)||['currency','item','hero'].indexOf(r.reward_type)<0);
    const writes:any[]=[],batch:any=Object.create(nk);batch.__purchaseBatch=true;batch.__mailBatch=true;
    batch.storageWrite=(changes:any[])=>{for(const w of changes)writes.push(w);return [];};
    const result=applyPurchaseStorageRewards(batch,userId,grantId,productId,fulfillmentType,immediate);
    if(mailed.length)result.mail=deliverMail(batch,userId,{source_id:'purchase:'+grantId,source_type:'purchase',title:'Phần thưởng gói '+productId,
        body:'Thanh toán đã được xác nhận. Hãy nhận vật phẩm của gói tại đây.',attachments:mailed.map(r=>({type:r.reward_type==='currency'?'resource':r.reward_type,id:r.reward_id,amount:Number(r.quantity)}))});
    writes.push(Object.assign({},marker,{value:{product_id:productId,granted_at_ms:Date.now(),delivery:mailed.length?'mail':'direct'},version:'*',permissionRead:0,permissionWrite:0}));
    nk.storageWrite(writes);
    if(result.mail)mailPush(nk,userId,result.mail.id);
    return result;
}
// Only newly opened arcs generate progression mail; ordinary stages stay quiet.
function mailCombatRuntime(base:nkruntime.Nakama,userId:string):nkruntime.Nakama {
    if(typeof featureRuntime === "function")base=featureRuntime(base,userId);
    const runtime:any=Object.create(base);
    runtime.storageWrite=(changes:any[])=>{
        const writes=changes.slice(),reports:any[]=[];
        const profile=changes.find((w:any)=>w.collection==='player_profiles'&&w.key==='main'&&w.userId===userId);
        if(profile) {
            const previous=base.storageRead([{collection:'player_profiles',key:'main',userId}])[0];
            const oldArcs=previous&&Array.isArray(previous.value.unlocked_arcs)?previous.value.unlocked_arcs:[];
            const nextArcs=Array.isArray(profile.value.unlocked_arcs)?profile.value.unlocked_arcs:[];
            const batch:any=Object.create(base);batch.__mailBatch=true;
            batch.storageWrite=(extra:any[])=>{for(const w of extra)writes.push(w);return [];};
            for(const arcId of nextArcs.filter((id:any,index:number,list:any[])=>typeof id==='string'&&id!=='arc_0'&&oldArcs.indexOf(id)<0&&list.indexOf(id)===index)) {
                const arc=base.sqlQuery('SELECT display_name FROM game_arcs WHERE id=$1',[arcId])[0];
                if(!arc)throw new Error('UNKNOWN_UNLOCKED_ARC');
                const name=String(arc.display_name||arcId);
                reports.push(deliverMail(batch,userId,{source_id:'arc_opened:'+arcId,source_type:'arc_opened',category:'system',
                    title:'Khai mở '+name,body:'Chúc mừng tu giả đã khai mở '+name+'!\n\nMột hành trình mới đang chờ đón bạn. Hãy đến Chiến dịch để khám phá các ải và thử thách của khu vực này.',
                    expires_at_ms:null}));
            }
        }
        const ack=base.storageWrite(writes);for(const report of reports)if(!report.idempotent)mailPush(base,userId,report.id);return ack;
    };
    return runtime;
}
function mailSyncWeeklyClaim(nk:nkruntime.Nakama,userId:string,payload:string):void {
    const req=serverRequest(payload),id=mailId(nk,'weekly:'+req.period_id+':'+req.board_id);
    const stored=mailRead(nk,userId,id);if(!stored||stored.value.claimed_at_ms)return;
    const claimNow=Date.now();stored.value.claimed_at_ms=claimNow;if(!stored.value.read_at_ms)stored.value.read_at_ms=claimNow;stored.value.version++;
    try{nk.storageWrite([Object.assign(mailWrite(stored.value,userId),{version:stored.version})]);mailPush(nk,userId,id);}catch(_e){/* Shared weekly marker still prevents a duplicate grant. */}
}
