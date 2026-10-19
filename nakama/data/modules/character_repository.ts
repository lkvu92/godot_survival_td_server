// C143: the only key encoder for character-owned Storage objects.
const CHARACTER_COLLECTIONS = ['player_profiles','player_inventory','player_heroes','player_stage_runs',
    'player_identity','player_event_progress','player_daily_checkin','weekly_leaderboard_claims','player_purchase_grants','player_item_requests'];

function characterContext(nk: nkruntime.Nakama): GameServerContext|null {
    return (nk as any).__characterContext || null;
}

// Request-local adapter lets all existing gameplay helpers use the same repository.
// Mixed account/character batches remain one atomic Nakama Storage write.
function characterRuntime(base: nkruntime.Nakama, context: GameServerContext): nkruntime.Nakama {
    const runtime:any=Object.create(base);
    runtime.__characterContext=Object.freeze(Object.assign({},context));
    const shared=['player_settings','player_compliance_profiles','player_entitlements'];
    const scoped=(collection:string)=>CHARACTER_COLLECTIONS.indexOf(collection)>=0;
    const allowed=(collection:string)=>scoped(collection)||shared.indexOf(collection)>=0;
    const observed:any={};
    const identity=(ref:any)=>(ref.userId||context.accountId)+'/'+ref.collection+'/'+ref.key;
    const encode=(ref:any,write:boolean)=>{
        if(!allowed(ref.collection))throw new Error('Unregistered Storage collection: '+ref.collection);
        const userId=ref.userId||context.accountId;
        if(write && userId!==context.accountId)throw new Error('Cross-account character write');
        return Object.assign({},ref,{userId,key:scoped(ref.collection)?characterStorageKey(context,ref.key):ref.key},
            write&&scoped(ref.collection)?{permissionRead:0,permissionWrite:0}:{});
    };
    const decode=(row:any)=>{
        if(!scoped(row.collection))return row;
        const prefix=characterStorageKey(context,'_').slice(0,-1);
        if(row.key.indexOf(prefix)!==0)throw new Error('Unexpected Storage scope');
        return Object.assign({},row,{key:row.key.slice(prefix.length)});
    };
    runtime.storageRead=(refs:any[])=>{
        const rows=base.storageRead(refs.map(ref=>encode(ref,false))).map(decode);
        for(const ref of refs)observed[identity(ref)]='*';
        for(const row of rows)observed[identity(row)]=row.version;
        return rows;
    };
    runtime.storageWrite=(writes:any[])=>base.storageWrite(writes.map(write=>{
        if(scoped(write.collection)&&!write.version) {
            const version=observed[identity(write)];
            if(!version)throw new Error('Character write requires prior read or explicit version');
            write=Object.assign({},write,{version});
        }
        return encode(write,true);
    })).map(decode).map((ack:any)=>{observed[identity(ack)]=ack.version;return ack;});
    runtime.storageDelete=(refs:any[])=>base.storageDelete(refs.map(ref=>encode(ref,true)));
    const boards=['best_wave','most_kills','total_wins','cultivation_realm','campaign_stage','combat_power_v2'];
    const boardId=(id:string)=>{
        if(boards.indexOf(id)<0)throw new Error('Unknown character leaderboard');
        return context.serverId+':g'+context.generation+':'+id;
    };
    runtime.leaderboardRecordWrite=(id:string,...args:any[])=>{
        const scopedId=boardId(id);
        base.leaderboardCreate(scopedId,true,'desc' as any,
            (id==='total_wins'?'incr':id==='combat_power_v2'?'set':'best') as any,
            id==='combat_power_v2'?'0 0 * * 1':'',{});
        return (base.leaderboardRecordWrite as any).apply(base,[scopedId].concat(args));
    };
    for(const method of ['leaderboardRecordsList','leaderboardRecordsHaystack','leaderboardRecordDelete']) {
        if(typeof (base as any)[method]==='function')runtime[method]=(id:string,...args:any[])=>(base as any)[method].apply(base,[boardId(id)].concat(args));
    }
    return runtime;
}

function characterStorageKey(context: GameServerContext, key: string): string {
    if (!context.accountId || !/^[a-z][a-z0-9_]{0,31}$/.test(context.serverId)
        || !Number.isSafeInteger(context.generation) || context.generation<1 || !key || key.length>80)
        throw new Error('Invalid character Storage identity');
    return context.serverId+':g'+context.generation+':'+key;
}

function characterRead(nk: nkruntime.Nakama, context: GameServerContext, refs: {collection:string;key:string}[]): nkruntime.StorageObject[] {
    for(const ref of refs) if(CHARACTER_COLLECTIONS.indexOf(ref.collection)<0) throw new Error('Collection is not character-owned');
    const prefix=characterStorageKey(context,'_').slice(0,-1);
    return nk.storageRead(refs.map(ref=>({collection:ref.collection,key:characterStorageKey(context,ref.key),userId:context.accountId})))
        .map(row=>Object.assign({},row,{key:row.key.slice(prefix.length)}));
}

function characterWrite(nk: nkruntime.Nakama, context: GameServerContext, changes: nkruntime.StorageWriteRequest[]): nkruntime.StorageWriteAck[] {
    for(const change of changes) {
        if(CHARACTER_COLLECTIONS.indexOf(change.collection)<0 || (change.userId && change.userId!==context.accountId))
            throw new Error('Invalid character write scope');
        if(!change.version) throw new Error('Character writes require a version precondition');
    }
    const prefix=characterStorageKey(context,'_').slice(0,-1);
    const writes=changes.map(change=>Object.assign({},change,{userId:context.accountId,
        key:characterStorageKey(context,change.key),permissionRead:0,permissionWrite:0}));
    return nk.storageWrite(writes).map(ack=>Object.assign({},ack,{key:ack.key.slice(prefix.length)}));
}

const createServerCharacter: nkruntime.RpcFunction=(ctx,_logger,nk,payload)=>{
    if(!ctx.userId)return serverFailure('AUTH_REQUIRED',401,'Authentication required');
    if(!ctx.env || ctx.env.MULTI_SERVER_ENABLED!=='true')return serverFailure('FEATURE_DISABLED',409,'Multi-server is disabled');
    let req:any;try{req=serverRequest(payload);}catch(_e){return serverFailure('INVALID_REQUEST',400,'Invalid JSON');}
    const server=validatedServer(nk,req);if(server.error)return server.error;
    if(!server.allow_new_characters)return serverFailure('CHARACTER_CREATION_CLOSED',409,'Máy chủ tạm ngừng tạo nhân vật mới.');
    // Claim creation atomically against server revision/state, rather than trusting the earlier read.
    const reserved=nk.sqlQuery(`INSERT INTO player_characters(account_id,server_id,generation,status)
      SELECT $1::UUID,s.server_id,s.generation,'initializing' FROM game_servers s
      WHERE s.server_id=$2 AND s.generation=$3 AND s.status='open' AND s.opens_at<=NOW() AND s.allow_new_characters
      ON CONFLICT(account_id,server_id) DO UPDATE SET generation=EXCLUDED.generation,status='initializing',created_at=NOW(),last_entered_at=NULL
        WHERE player_characters.status='retired' AND player_characters.generation<EXCLUDED.generation
      RETURNING generation`,[ctx.userId,req.server_id,req.generation]);
    const existing=nk.sqlQuery('SELECT status,generation FROM player_characters WHERE account_id=$1::UUID AND server_id=$2',[ctx.userId,req.server_id]);
    if(!existing.length || Number(existing[0].generation)!==req.generation)return serverFailure('CHARACTER_NOT_READY',409,'Vui lòng làm mới danh sách máy chủ.');
    if(existing[0].status==='ready')return JSON.stringify({success:true,server_id:req.server_id,generation:req.generation,created:false});
    const context:GameServerContext={accountId:ctx.userId,serverId:req.server_id,generation:req.generation};
    const refs=[{collection:'player_profiles',key:'main'},{collection:'player_inventory',key:'items'},
      {collection:'player_heroes',key:'states'},{collection:'player_identity',key:'name'}];
    const stored=characterRead(nk,context,refs);
    const name='Tu Giả '+nk.uuidv4().replace(/-/g,'').slice(0,6).toUpperCase();
    const profile=defaultPlayerProfile(name);
    profile.server_id=context.serverId;profile.generation=context.generation;
    const values:any={player_profiles:profile,player_inventory:{items:[],_iap_reward_ids:[]},
      player_heroes:{heroes:canonicalHeroStates(nk,{})},player_identity:{display_name:name,name_changes_used:0}};
    const writes=refs.filter(ref=>!stored.some(row=>row.collection===ref.collection&&row.key===ref.key))
      .map(ref=>({collection:ref.collection,key:ref.key,userId:ctx.userId,value:values[ref.collection],version:'*',permissionRead:0,permissionWrite:0}));
    if(writes.length)characterWrite(nk,context,writes);
    nk.sqlExec(`UPDATE player_characters c SET status='ready' FROM game_servers s
      WHERE c.account_id=$1::UUID AND c.server_id=$2 AND c.generation=$3 AND c.status='initializing'
        AND s.server_id=c.server_id AND s.generation=c.generation AND s.status='open'`,[ctx.userId,req.server_id,req.generation]);
    return JSON.stringify({success:true,server_id:req.server_id,generation:req.generation,created:reserved.length>0});
};
