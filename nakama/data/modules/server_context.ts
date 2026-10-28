// C143: explicit admission context. Registry operations never choose a server implicitly.
interface GameServerContext { accountId: string; serverId: string; generation: number; }

function createServerRegistryTables(nk: nkruntime.Nakama): void {
    nk.sqlExec(`CREATE TABLE IF NOT EXISTS game_servers (
        server_id TEXT PRIMARY KEY CHECK(server_id ~ '^[a-z][a-z0-9_]{0,31}$'),
        display_name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'disabled'
          CHECK(status IN ('provisioning','scheduled','open','maintenance','disabled','resetting','deleting','deleted','failed')),
        generation INT NOT NULL DEFAULT 1 CHECK(generation>0), revision BIGINT NOT NULL DEFAULT 1,
        opens_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), allow_new_characters BOOL NOT NULL DEFAULT FALSE,
        placement_id TEXT NOT NULL DEFAULT 'primary', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS player_characters (
        account_id UUID NOT NULL REFERENCES users(id), server_id TEXT NOT NULL REFERENCES game_servers(server_id),
        generation INT NOT NULL, status TEXT NOT NULL CHECK(status IN ('initializing','ready','retired')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_entered_at TIMESTAMPTZ,
        PRIMARY KEY(account_id,server_id)
    );
    CREATE TABLE IF NOT EXISTS player_server_preferences (
        account_id UUID PRIMARY KEY REFERENCES users(id), last_server_id TEXT REFERENCES game_servers(server_id)
    );
    ALTER TABLE game_servers ADD COLUMN IF NOT EXISTS config_version BIGINT;
    ALTER TABLE game_servers ADD COLUMN IF NOT EXISTS create_request_id TEXT UNIQUE;
    ALTER TABLE game_servers ADD COLUMN IF NOT EXISTS create_payload JSONB;
    CREATE TABLE IF NOT EXISTS server_operation_audit (
        id BIGSERIAL PRIMARY KEY, server_id TEXT NOT NULL REFERENCES game_servers(server_id),
        actor_id UUID NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL,
        before_revision BIGINT, after_revision BIGINT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE game_servers ADD COLUMN IF NOT EXISTS active_requests INT NOT NULL DEFAULT 0 CHECK(active_requests>=0);`, []);
    createServerLifecycleTables(nk);
}

function withServerRequest<T>(nk:nkruntime.Nakama,context:GameServerContext,action:()=>T):T {
    const lease=nk.sqlQuery(`UPDATE game_servers SET active_requests=active_requests+1
        WHERE server_id=$1 AND generation=$2 AND status='open' AND opens_at<=NOW() RETURNING server_id`,[context.serverId,context.generation]);
    if(!lease.length)throw new Error('SERVER_REQUEST_FENCED');
    try{return action();}
    finally{nk.sqlExec('UPDATE game_servers SET active_requests=active_requests-1 WHERE server_id=$1 AND active_requests>0',[context.serverId]);}
}

function serverFailure(reason: string, code: number, message: string): string {
    return JSON.stringify({success:false,status:'error',code,reason,message});
}

function serverRequest(payload: string): any {
    const req=JSON.parse(payload||'{}');
    if (!req || typeof req!=='object' || Array.isArray(req)) throw new Error('Invalid request');
    return req;
}

function validatedServer(nk: nkruntime.Nakama, req: any): any {
    if (typeof req.server_id!=='string' || !/^[a-z][a-z0-9_]{0,31}$/.test(req.server_id))
        return {error:serverFailure('SERVER_REQUIRED',400,'Vui lòng chọn máy chủ.')};
    if (!Number.isSafeInteger(req.generation) || req.generation<1)
        return {error:serverFailure('GENERATION_MISMATCH',409,'Vui lòng chọn lại máy chủ.')};
    const rows=nk.sqlQuery(`SELECT *, opens_at<=NOW() AS has_opened FROM game_servers WHERE server_id=$1`,[req.server_id]);
    if (!rows.length || rows[0].status==='deleted') return {error:serverFailure('SERVER_NOT_FOUND',404,'Máy chủ không tồn tại.')};
    const server=rows[0];
    if (Number(server.generation)!==req.generation) return {error:serverFailure('GENERATION_MISMATCH',409,'Máy chủ đã thay đổi. Vui lòng chọn lại.')};
    if (server.status!=='open' || !server.has_opened) return {error:serverFailure('SERVER_UNAVAILABLE',409,'Máy chủ chưa mở hoặc đang bảo trì.')};
    return server;
}

const listGameServers: nkruntime.RpcFunction=(ctx,_logger,nk)=>{
    if (!ctx.userId) return serverFailure('AUTH_REQUIRED',401,'Authentication required');
    if(!ctx.env || ctx.env.MULTI_SERVER_ENABLED!=='true') return JSON.stringify({success:true,server_mode:'legacy',servers:[],last_server_id:''});
    const servers=nk.sqlQuery(`SELECT s.server_id,s.display_name,s.status,s.generation,s.revision,
      EXTRACT(EPOCH FROM s.opens_at)*1000 AS opens_at_ms,EXTRACT(EPOCH FROM s.created_at)*1000 AS created_at_ms,s.allow_new_characters,
      (s.status='open' AND s.opens_at<=NOW()) AS available,
      COALESCE(c.status='ready' AND c.generation=s.generation,FALSE) AS has_character,
      CASE WHEN c.status='ready' AND c.generation=s.generation THEN p.value->>'display_name' END AS character_name,
      CASE WHEN c.status='ready' AND c.generation=s.generation THEN COALESCE((p.value->>'level')::INT,1) END AS character_level
      FROM game_servers s LEFT JOIN player_characters c ON c.server_id=s.server_id AND c.account_id=$1::UUID
      LEFT JOIN storage p ON p.user_id=c.account_id AND p.collection='player_profiles'
        AND p.key=s.server_id||':g'||s.generation||':main'
      WHERE s.status NOT IN ('deleted','provisioning','failed') ORDER BY s.created_at DESC,s.server_id DESC`,[ctx.userId]);
    const prefs=nk.sqlQuery('SELECT last_server_id FROM player_server_preferences WHERE account_id=$1::UUID',[ctx.userId]);
    return JSON.stringify({success:true,server_mode:'multi',servers,last_server_id:prefs.length?prefs[0].last_server_id:''});
};

const listMyCharacters: nkruntime.RpcFunction=(ctx,_logger,nk)=>{
    if (!ctx.userId) return serverFailure('AUTH_REQUIRED',401,'Authentication required');
    return JSON.stringify({success:true,characters:nk.sqlQuery(`SELECT c.server_id,c.generation,c.status,c.created_at,c.last_entered_at,s.display_name
      FROM player_characters c JOIN game_servers s ON s.server_id=c.server_id WHERE c.account_id=$1::UUID AND s.status<>'deleted' ORDER BY c.created_at`,[ctx.userId])});
};

const enterGameServer: nkruntime.RpcFunction=(ctx,_logger,nk,payload)=>{
    if (!ctx.userId) return serverFailure('AUTH_REQUIRED',401,'Authentication required');
    let req:any;try{req=serverRequest(payload);}catch(_e){return serverFailure('INVALID_REQUEST',400,'Invalid JSON');}
    const server=validatedServer(nk,req);if(server.error)return server.error;
    const chars=nk.sqlQuery(`SELECT status,generation FROM player_characters WHERE account_id=$1::UUID AND server_id=$2`,[ctx.userId,req.server_id]);
    if (!chars.length) return serverFailure('CHARACTER_NOT_FOUND',404,'Chưa có nhân vật trên máy chủ này.');
    if(chars[0].status!=='ready'||Number(chars[0].generation)!==req.generation)
        return serverFailure('CHARACTER_NOT_READY',409,'Nhân vật chưa sẵn sàng.');
    if(ctx.env&&ctx.env.MULTI_SERVER_ENABLED==='true')repairMultiLinkBoards(nk,ctx.userId,req.server_id,req.generation);
    nk.sqlExec(`UPDATE player_characters SET last_entered_at=NOW() WHERE account_id=$1::UUID AND server_id=$2 AND generation=$3`,[ctx.userId,req.server_id,req.generation]);
    nk.sqlExec(`INSERT INTO player_server_preferences(account_id,last_server_id) VALUES($1::UUID,$2)
      ON CONFLICT(account_id) DO UPDATE SET last_server_id=EXCLUDED.last_server_id`,[ctx.userId,req.server_id]);
    return JSON.stringify({success:true,server_id:server.server_id,generation:Number(server.generation),display_name:server.display_name,revision:Number(server.revision)});
};

// No registry seed or legacy migration at startup. An operator must reconcile S1 first.
// This guard is activated explicitly when migration has completed; config always validates context.
function serverAdmissionRpc(id: string, handler: nkruntime.RpcFunction): nkruntime.RpcFunction {
    const accountOnly=['session_status','admin_exp_test_access','admin_test_access','account_password_status','setup_account_password','google_link_status',
      'prepare_google_link','confirm_google_link','save_compliance_profile','get_compliance_profile','seed_game_data','publish_config_release','resolve_purchase_order'];
    if (id==='gift_code_admin' || accountOnly.indexOf(id)>=0 || (id.indexOf('admin_server_')===0 || id.indexOf('mail_admin_')===0) || id==='list_servers'||id==='list_my_characters'||id==='enter_server') return handler;
    return (ctx,logger,nk,payload)=>{
        if(id==='admob_ssv_confirm'||id==='google_play_rtdn_confirm')return handler(ctx,logger,nk,payload);
        if (!ctx.userId) return handler(ctx,logger,nk,payload); // verifier authentication stays in account guard
        if (!ctx.env || ctx.env.MULTI_SERVER_ENABLED!=='true') return handler(ctx,logger,nk,payload);
        let req:any;try{req=serverRequest(payload);}catch(_e){return serverFailure('INVALID_REQUEST',400,'Invalid JSON');}
        const server=validatedServer(nk,req);if(server.error)return server.error;
        const context:GameServerContext={accountId:ctx.userId,serverId:req.server_id,generation:req.generation};
        if(id==='create_character') {
            try{return withServerRequest(nk,context,()=>handler(ctx,logger,nk,payload));}
            catch(error){if(String(error).indexOf('SERVER_REQUEST_FENCED')>=0)return serverFailure('SERVER_UNAVAILABLE',409,'Máy chủ đã ngừng nhận thao tác.');throw error;}
        }
        const chars=nk.sqlQuery('SELECT 1 FROM player_characters WHERE account_id=$1::UUID AND server_id=$2 AND generation=$3 AND status=\'ready\'',[ctx.userId,req.server_id,req.generation]);
        if(!chars.length)return serverFailure('CHARACTER_NOT_READY',409,'Nhân vật chưa sẵn sàng.');
        if(id==='confirm_rewarded_ad'||id==='consume_ad_gameplay_reward') {
            const sessions=nk.sqlQuery('SELECT target_server_id,target_generation FROM monetization_ad_rewards WHERE ad_session_id=$1 AND user_id=$2',[String(req.ad_session_id||''),ctx.userId]);
            if(!sessions.length||sessions[0].target_server_id!==context.serverId||Number(sessions[0].target_generation)!==context.generation)
                return serverFailure('AD_TARGET_MISMATCH',409,'Ad session belongs to another character');
        }
        const runtime=characterRuntime(nk,context);
        try {
            return withServerRequest(nk,context,()=>handler(ctx,logger,runtime,payload));
        } catch(error) {
            if(String(error).indexOf('SERVER_REQUEST_FENCED')>=0)return serverFailure('SERVER_UNAVAILABLE',409,'Máy chủ đã ngừng nhận thao tác.');
            throw error;
        }
    };
}
