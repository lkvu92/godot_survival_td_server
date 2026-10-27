// C143: registry administration and explicitly planned, generation-scoped lifecycle.
function requireServerAdmin(ctx: nkruntime.Context): string|null {
    const configured=String(ctx.env && ctx.env.CONFIG_ADMIN_USER_ID || '');
    return ctx.userId && configured && ctx.userId===configured ? null : serverFailure('FORBIDDEN',403,'Forbidden');
}

function serverAdminHandler(action: string): nkruntime.RpcFunction {
    return (ctx,_logger,nk,payload)=>{
        const denied=requireServerAdmin(ctx);if(denied)return denied;
        let req:any;try{req=serverRequest(payload);}catch(_e){return serverFailure('INVALID_REQUEST',400,'Invalid JSON');}
        if(action==='list') {
            const limit=Number.isSafeInteger(req.limit)?Math.min(100,Math.max(1,req.limit)):50;
            const after=typeof req.after==='string'?req.after:'';
            const rows=nk.sqlQuery(`SELECT server_id,display_name,status,generation,revision,opens_at,
                allow_new_characters,placement_id,config_version FROM game_servers
                WHERE server_id>$1 ORDER BY server_id LIMIT $2`,[after,limit+1]);
            const more=rows.length>limit;if(more)rows.pop();
            return JSON.stringify({success:true,servers:rows,next_cursor:more?rows[rows.length-1].server_id:''});
        }
        if(typeof req.server_id!=='string'||!/^[a-z][a-z0-9_]{0,31}$/.test(req.server_id))return serverFailure('INVALID_SERVER_ID',400,'Invalid server ID');
        if(action==='inspect') {
            const rows=nk.sqlQuery(`SELECT s.server_id,s.display_name,s.status,s.generation,s.revision,s.opens_at,
                s.allow_new_characters,s.placement_id,s.config_version,
                (SELECT COUNT(*)::INT FROM player_characters c WHERE c.server_id=s.server_id) AS character_count,
                EXTRACT(EPOCH FROM NOW())*1000 AS snapshot_at_ms FROM game_servers s WHERE s.server_id=$1`,[req.server_id]);
            return rows.length?JSON.stringify({success:true,server:rows[0]}):serverFailure('SERVER_NOT_FOUND',404,'Server not found');
        }
        if(typeof req.reason!=='string'||!req.reason.trim()||req.reason.length>500)return serverFailure('REASON_REQUIRED',400,'A reason is required');
        if(action==='create') {
            if(typeof req.request_id!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(req.request_id))return serverFailure('REQUEST_ID_REQUIRED',400,'Invalid request ID');
            if(typeof req.display_name!=='string'||!req.display_name.trim()||req.display_name.length>100)return serverFailure('INVALID_NAME',400,'Invalid display name');
            if(!Number.isSafeInteger(req.config_version)||req.config_version<1)return serverFailure('CONFIG_REQUIRED',400,'Published config version required');
            if(typeof req.opens_at!=='string'||!Number.isFinite(Date.parse(req.opens_at)))return serverFailure('INVALID_OPEN_TIME',400,'ISO opening time required');
            const canonical=JSON.stringify({server_id:req.server_id,display_name:req.display_name.trim(),config_version:req.config_version,
                opens_at:new Date(req.opens_at).toISOString(),allow_new_characters:req.allow_new_characters===true,reason:req.reason.trim()});
            const previous=nk.sqlQuery('SELECT server_id,create_payload=$2::JSONB AS same FROM game_servers WHERE create_request_id=$1',[req.request_id,canonical]);
            if(previous.length)return previous[0].same?JSON.stringify({success:true,server_id:previous[0].server_id,replayed:true}):serverFailure('REQUEST_ID_CONFLICT',409,'Request ID already used with another payload');
            const release=nk.sqlQuery('SELECT 1 FROM remote_config_releases WHERE config_version=$1',[req.config_version]);
            if(!release.length)return serverFailure('CONFIG_NOT_FOUND',409,'Published config release not found');
            const rows=nk.sqlQuery(`WITH created AS (
                INSERT INTO game_servers(server_id,display_name,status,opens_at,allow_new_characters,config_version,create_request_id,create_payload)
                VALUES($1,$2,'disabled',$3::TIMESTAMPTZ,$4,$5,$6,$7::JSONB) ON CONFLICT DO NOTHING RETURNING *
            ), audited AS (
                INSERT INTO server_operation_audit(server_id,actor_id,action,reason,after_revision)
                SELECT server_id,$8::UUID,'create',$9,revision FROM created RETURNING id
            ) SELECT server_id,generation,revision,status FROM created`,[req.server_id,req.display_name.trim(),req.opens_at,
                req.allow_new_characters===true,req.config_version,req.request_id,canonical,ctx.userId,req.reason.trim()]);
            if(!rows.length) {
                const raced=nk.sqlQuery('SELECT server_id,create_payload=$2::JSONB AS same FROM game_servers WHERE create_request_id=$1',[req.request_id,canonical]);
                if(raced.length&&raced[0].same)return JSON.stringify({success:true,server_id:raced[0].server_id,replayed:true});
                return serverFailure('SERVER_EXISTS',409,'Server ID or request ID already exists');
            }
            return JSON.stringify({success:true,server:rows[0],replayed:false});
        }
        if(!Number.isSafeInteger(req.expected_revision)||req.expected_revision<1)return serverFailure('REVISION_REQUIRED',400,'Expected revision required');
        if(action==='expire_pending') {
            const rows=nk.sqlQuery(`WITH fenced AS (
              UPDATE game_servers SET revision=revision+1,updated_at=NOW() WHERE server_id=$1 AND revision=$2 AND status='disabled' AND active_requests=0
              RETURNING server_id,generation,revision
            ), orders AS (
              UPDATE monetization_purchase_orders o SET status='expired',updated_at=NOW() FROM fenced f
              WHERE o.target_server_id=f.server_id AND o.target_generation=f.generation AND o.status='pending' AND o.expires_at<=NOW()
                AND o.validated_at IS NULL AND NOT EXISTS(SELECT 1 FROM store_receipt_reservations r WHERE r.order_id=o.id) RETURNING o.id
            ), ads AS (
              UPDATE monetization_ad_rewards a SET status='expired' FROM fenced f WHERE a.target_server_id=f.server_id AND a.target_generation=f.generation
                AND a.status='prepared' AND a.expires_at<=NOW() RETURNING a.ad_session_id
            ), audit AS (
              INSERT INTO server_operation_audit(server_id,actor_id,action,reason,before_revision,after_revision)
              SELECT server_id,$3::UUID,'expire_pending',$4,$2,revision FROM fenced
            ) SELECT f.*,(SELECT COUNT(*) FROM orders) AS expired_orders,(SELECT COUNT(*) FROM ads) AS expired_ads FROM fenced f`,[req.server_id,req.expected_revision,ctx.userId,req.reason.trim()]);
            return rows.length?JSON.stringify({success:true,server:rows[0]}):serverFailure('SERVER_NOT_DRAINED',409,'Disable/drain and refresh revision first');
        }
        if(action==='disable') {
            const rows=nk.sqlQuery(`WITH changed AS (
                UPDATE game_servers SET status='disabled',revision=revision+1,updated_at=NOW()
                WHERE server_id=$1 AND revision=$2 AND status IN ('open','scheduled','maintenance','disabled')
                RETURNING server_id,generation,revision,status,active_requests
            ), audited AS (
                INSERT INTO server_operation_audit(server_id,actor_id,action,reason,before_revision,after_revision)
                SELECT server_id,$3::UUID,'disable',$4,$2,revision FROM changed RETURNING id
            ) SELECT * FROM changed`,[req.server_id,req.expected_revision,ctx.userId,req.reason.trim()]);
            return rows.length?JSON.stringify({success:true,server:rows[0],drained:Number(rows[0].active_requests)===0}):serverFailure('REVISION_OR_STATE_CONFLICT',409,'Server revision or state changed');
        }
        if(action==='enable') {
            if(!ctx.env || ctx.env.MULTI_SERVER_ENABLED!=='true')return serverFailure('FEATURE_DISABLED',409,'Enable multi-server only after migration and acceptance');
            const rows=nk.sqlQuery(`WITH changed AS (
              UPDATE game_servers s SET status='open',revision=revision+1,updated_at=NOW()
              WHERE s.server_id=$1 AND s.revision=$2 AND s.status IN ('disabled','maintenance','scheduled') AND s.active_requests=0
                AND NOT EXISTS(SELECT 1 FROM server_lifecycle_jobs j WHERE j.server_id=s.server_id AND j.status<>'succeeded')
                AND EXISTS(SELECT 1 FROM remote_config_releases r WHERE r.config_version=s.config_version)
              RETURNING server_id,generation,revision,status
            ), audited AS (
              INSERT INTO server_operation_audit(server_id,actor_id,action,reason,before_revision,after_revision)
              SELECT server_id,$3::UUID,'enable',$4,$2,revision FROM changed RETURNING id
            ) SELECT * FROM changed`,[req.server_id,req.expected_revision,ctx.userId,req.reason.trim()]);
            return rows.length?JSON.stringify({success:true,server:rows[0]}):serverFailure('REVISION_OR_STATE_CONFLICT',409,'Server state, config or drain check failed');
        }
        if(action==='update') {
            if(typeof req.display_name!=='string'||!req.display_name.trim()||req.display_name.length>100||typeof req.allow_new_characters!=='boolean'
              ||typeof req.opens_at!=='string'||!Number.isFinite(Date.parse(req.opens_at)))return serverFailure('INVALID_UPDATE',400,'Name, opening time and admission flag required');
            const rows=nk.sqlQuery(`WITH changed AS (
              UPDATE game_servers SET display_name=$3,opens_at=$4::TIMESTAMPTZ,allow_new_characters=$5,
                revision=revision+1,updated_at=NOW() WHERE server_id=$1 AND revision=$2 AND status IN ('disabled','maintenance','scheduled','open')
              RETURNING server_id,generation,revision,status
            ), audited AS (
              INSERT INTO server_operation_audit(server_id,actor_id,action,reason,before_revision,after_revision)
              SELECT server_id,$6::UUID,'update',$7,$2,revision FROM changed RETURNING id
            ) SELECT * FROM changed`,[req.server_id,req.expected_revision,req.display_name.trim(),req.opens_at,req.allow_new_characters,ctx.userId,req.reason.trim()]);
            return rows.length?JSON.stringify({success:true,server:rows[0]}):serverFailure('REVISION_OR_STATE_CONFLICT',409,'Server revision or state changed');
        }
        return serverFailure('UNSUPPORTED_ACTION',400,'Unsupported action');
    };
}

function rpcAdminServerList(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return accountGuardedRpc('admin_server_list',serverAdminHandler('list'))(c,l,n,p);}
function rpcAdminServerInspect(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return accountGuardedRpc('admin_server_inspect',serverAdminHandler('inspect'))(c,l,n,p);}
function rpcAdminServerCreate(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return accountGuardedRpc('admin_server_create',serverAdminHandler('create'))(c,l,n,p);}
function rpcAdminServerDisable(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return accountGuardedRpc('admin_server_disable',serverAdminHandler('disable'))(c,l,n,p);}
function rpcAdminServerEnable(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return accountGuardedRpc('admin_server_enable',serverAdminHandler('enable'))(c,l,n,p);}
function rpcAdminServerUpdate(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return accountGuardedRpc('admin_server_update',serverAdminHandler('update'))(c,l,n,p);}
function rpcAdminServerExpirePending(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return accountGuardedRpc('admin_server_expire_pending',serverAdminHandler('expire_pending'))(c,l,n,p);}

function createServerLifecycleTables(nk:nkruntime.Nakama):void {
    nk.sqlExec(`CREATE TABLE IF NOT EXISTS server_operation_plans (
      id UUID PRIMARY KEY,server_id TEXT NOT NULL REFERENCES game_servers(server_id),action TEXT NOT NULL,
      generation INT NOT NULL,revision BIGINT NOT NULL,actor_id UUID NOT NULL,reason TEXT NOT NULL,
      manifest JSONB NOT NULL,manifest_hash TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '15 minutes');
    CREATE TABLE IF NOT EXISTS server_lifecycle_jobs (
      id UUID PRIMARY KEY,plan_id UUID NOT NULL UNIQUE REFERENCES server_operation_plans(id),
      server_id TEXT NOT NULL REFERENCES game_servers(server_id),request_id TEXT NOT NULL UNIQUE,
      request_payload JSONB NOT NULL,status TEXT NOT NULL DEFAULT 'queued',phase TEXT NOT NULL DEFAULT 'storage',
      cursor INT NOT NULL DEFAULT 0,lease_token UUID,lease_until TIMESTAMPTZ,heartbeat TIMESTAMPTZ,
      error TEXT NOT NULL DEFAULT '',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),finished_at TIMESTAMPTZ);
    CREATE UNIQUE INDEX IF NOT EXISTS server_lifecycle_active_uq ON server_lifecycle_jobs(server_id) WHERE status<>'succeeded';
    CREATE TABLE IF NOT EXISTS server_generation_snapshots (
      server_id TEXT NOT NULL REFERENCES game_servers(server_id),generation INT NOT NULL,
      plan_id UUID NOT NULL REFERENCES server_operation_plans(id),retired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      retain_until TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '7 days',PRIMARY KEY(server_id,generation));
    CREATE OR REPLACE FUNCTION server_lifecycle_begin(pid UUID,jid UUID,rid TEXT,body JSONB,actor UUID)
    RETURNS JSONB LANGUAGE plpgsql AS $life$
    DECLARE p server_operation_plans%ROWTYPE;s game_servers%ROWTYPE;j server_lifecycle_jobs%ROWTYPE; current_manifest JSONB;
    BEGIN
      SELECT * INTO p FROM server_operation_plans WHERE id=pid FOR UPDATE;
      IF NOT FOUND OR p.actor_id<>actor THEN RAISE EXCEPTION 'PLAN_NOT_FOUND'; END IF;
      SELECT * INTO j FROM server_lifecycle_jobs WHERE request_id=rid;
      IF FOUND THEN
        IF j.request_payload<>body THEN RAISE EXCEPTION 'REQUEST_ID_CONFLICT'; END IF;
        RETURN to_jsonb(j);
      END IF;
      IF p.expires_at<=NOW() THEN RAISE EXCEPTION 'PLAN_EXPIRED'; END IF;
      SELECT * INTO s FROM game_servers WHERE server_id=p.server_id FOR UPDATE;
      IF s.status NOT IN ('disabled','deleted') OR s.active_requests<>0 THEN RAISE EXCEPTION 'SERVER_NOT_DRAINED'; END IF;
      IF s.revision<>p.revision OR (p.action<>'cleanup' AND s.generation<>p.generation)
        OR p.manifest_hash<>body->>'manifest_hash' OR p.server_id<>body->>'server_id'
        OR p.action<>body->>'action' OR p.generation<>(body->>'expected_generation')::INT
        OR p.revision<>(body->>'expected_revision')::BIGINT THEN RAISE EXCEPTION 'PLAN_STALE'; END IF;
      IF p.action='cleanup' AND NOT EXISTS(SELECT 1 FROM server_generation_snapshots
        WHERE server_id=p.server_id AND generation=p.generation AND retain_until<=NOW()) THEN RAISE EXCEPTION 'RETENTION_BLOCKED'; END IF;
      current_manifest:=server_lifecycle_manifest(p.server_id,p.generation);
      IF current_manifest<>p.manifest THEN RAISE EXCEPTION 'PLAN_STALE'; END IF;
      IF jsonb_array_length(current_manifest->'unknown')>0 THEN RAISE EXCEPTION 'UNKNOWN_OWNERSHIP'; END IF;
      IF (current_manifest->>'pending_financial')::INT>0 THEN RAISE EXCEPTION 'PENDING_FINANCIAL_DELIVERY'; END IF;
      IF p.action='reset' AND (current_manifest->>'real_purchases')::INT>0 THEN RAISE EXCEPTION 'PAID_RESET_POLICY_REQUIRED'; END IF;
      INSERT INTO server_lifecycle_jobs(id,plan_id,server_id,request_id,request_payload) VALUES(jid,pid,p.server_id,rid,body);
      INSERT INTO server_generation_snapshots(server_id,generation,plan_id) VALUES(p.server_id,p.generation,pid) ON CONFLICT DO NOTHING;
      IF p.action='reset' THEN
        UPDATE player_characters SET status='retired' WHERE server_id=p.server_id AND generation=p.generation;
        UPDATE game_servers SET generation=generation+1,revision=revision+1,updated_at=NOW() WHERE server_id=p.server_id;
        UPDATE server_lifecycle_jobs SET status='succeeded',phase='complete',finished_at=NOW() WHERE id=jid;
      ELSE
        IF p.action='delete' THEN UPDATE game_servers SET status='deleting',revision=revision+1,updated_at=NOW() WHERE server_id=p.server_id; END IF;
      END IF;
      INSERT INTO server_operation_audit(server_id,actor_id,action,reason,before_revision,after_revision)
        SELECT p.server_id,actor,p.action,p.reason,p.revision,revision FROM game_servers WHERE server_id=p.server_id;
      RETURN (SELECT to_jsonb(x) FROM server_lifecycle_jobs x WHERE x.id=jid);
    END $life$;`,[]);
    // Exact, registered ownership only. Unknown collections are reported, never deleted.
    nk.sqlExec(`CREATE OR REPLACE FUNCTION server_lifecycle_manifest(sid TEXT,gen INT) RETURNS JSONB LANGUAGE plpgsql AS $manifest$
      BEGIN RETURN (SELECT jsonb_build_object(
        'storage',COALESCE((SELECT jsonb_agg(to_jsonb(o) ORDER BY collection,key,user_id) FROM
          (SELECT collection,key,user_id::TEXT,version,value,read,write FROM storage
           WHERE left(key,length(sid||':g'||gen||':'))=sid||':g'||gen||':'
           AND NOT account_identity_erasure_pending(user_id)
           AND collection=ANY($1$COLLECTIONS$1$::TEXT[])) o),'[]'::JSONB),
        'unknown',COALESCE((SELECT jsonb_agg(jsonb_build_object('collection',collection,'key',key)) FROM storage
          WHERE left(key,length(sid||':g'||gen||':'))=sid||':g'||gen||':'
          AND NOT account_identity_erasure_pending(user_id)
          AND NOT(collection=ANY($1$COLLECTIONS$1$::TEXT[]))),'[]'::JSONB),
        'characters',COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY account_id) FROM player_characters c WHERE server_id=sid AND generation=gen AND NOT account_identity_erasure_pending(account_id)),'[]'::JSONB),
        'pending_financial',(SELECT COUNT(*) FROM monetization_purchase_orders WHERE target_server_id=sid AND target_generation=gen AND status='pending')+
          (SELECT COUNT(*) FROM monetization_ad_rewards WHERE target_server_id=sid AND target_generation=gen AND status IN ('prepared','verified')),
        'real_purchases',(SELECT COUNT(*) FROM monetization_purchases WHERE target_server_id=sid AND target_generation=gen AND purchase_token_hash NOT LIKE 'mock:%'),
        'weekly_periods',COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY period_id) FROM server_weekly_periods p WHERE server_id=sid AND generation=gen),'[]'::JSONB),
        'weekly_scores',COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY period_id,board_id,user_id) FROM server_weekly_scores p WHERE server_id=sid AND generation=gen AND NOT account_identity_erasure_pending(user_id)),'[]'::JSONB),
        'weekly_awards',COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY period_id,board_id,user_id) FROM server_weekly_awards p WHERE server_id=sid AND generation=gen AND NOT account_identity_erasure_pending(user_id)),'[]'::JSONB))); END;
    $manifest$;`.replace(/\$1\$COLLECTIONS\$1\$/g,"'{"+CHARACTER_COLLECTIONS.join(',')+"}'"),[]);
}

function serverLifecycleHandler(action:string):nkruntime.RpcFunction {
    return (ctx,_logger,nk,payload)=>{
        const denied=requireServerAdmin(ctx);if(denied)return denied;
        let req:any;try{req=serverRequest(payload);}catch(_e){return serverFailure('INVALID_REQUEST',400,'Invalid JSON');}
        try {
            if(action==='job'||action==='step') {
                const jobs=nk.sqlQuery(`SELECT j.*,p.action,p.generation,p.manifest FROM server_lifecycle_jobs j
                  JOIN server_operation_plans p ON p.id=j.plan_id WHERE j.id=$1::UUID`,[String(req.job_id||'')]);
                if(!jobs.length)return serverFailure('JOB_NOT_FOUND',404,'Job not found');
                let job=jobs[0];
                if(action==='step'&&job.status!=='succeeded') {
                    const token=nk.uuidv4();
                    const locked=nk.sqlQuery(`UPDATE server_lifecycle_jobs SET lease_token=$2::UUID,lease_until=NOW()+INTERVAL '5 minutes',
                      status='running',heartbeat=NOW(),error='' WHERE id=$1::UUID AND lease_token IS NULL RETURNING id`,[job.id,token]);
                    if(!locked.length)return serverFailure('OPERATION_IN_PROGRESS',409,'Another step holds the lease');
                    try {
                        const manifest=parseJsonb(job.manifest);
                        const end=Math.min(Number(job.cursor)+100,manifest.storage.length);
                        for(let i=Number(job.cursor);i<end;i++) {
                            const row=manifest.storage[i];
                            const existing=nk.storageRead([{collection:row.collection,key:row.key,userId:row.user_id}]);
                            if(existing.length) {
                                if(existing[0].version!==row.version)throw new Error('INTEGRITY_CHECK_FAILED');
                                nk.storageDelete([{collection:row.collection,key:row.key,userId:row.user_id,version:row.version}]);
                            }
                        }
                        nk.sqlExec(`UPDATE server_lifecycle_jobs SET cursor=$3,heartbeat=NOW() WHERE id=$1::UUID AND lease_token=$2::UUID`,[job.id,token,end]);
                        if(end===manifest.storage.length) {
                            for(const board of ['cultivation_realm','campaign_stage','combat_power','combat_power_v2','best_wave','most_kills','total_wins']) {
                                // Nakama delete is idempotent; IDs use the same encoder as the repository.
                                nk.leaderboardDelete(job.server_id+':g'+job.generation+':'+board);
                            }
                            nk.sqlQuery(`WITH locked AS (
                              SELECT j.* FROM server_lifecycle_jobs j JOIN game_servers s ON s.server_id=j.server_id
                              WHERE j.id=$1::UUID AND j.lease_token=$2::UUID AND s.active_requests=0
                                AND s.status IN ('disabled','deleting','deleted') FOR UPDATE OF j,s
                            ), awards AS (DELETE FROM server_weekly_awards WHERE server_id=$3 AND generation=$4 AND EXISTS(SELECT 1 FROM locked)),
                            scores AS (DELETE FROM server_weekly_scores WHERE server_id=$3 AND generation=$4 AND EXISTS(SELECT 1 FROM locked)),
                            periods AS (DELETE FROM server_weekly_periods WHERE server_id=$3 AND generation=$4 AND EXISTS(SELECT 1 FROM locked)),
                            characters AS (DELETE FROM player_characters WHERE server_id=$3 AND generation=$4 AND EXISTS(SELECT 1 FROM locked)),
                            prefs AS (UPDATE player_server_preferences SET last_server_id=NULL WHERE last_server_id=$3 AND $5='delete' AND EXISTS(SELECT 1 FROM locked)),
                            registry AS (UPDATE game_servers SET status='deleted',revision=revision+1,updated_at=NOW() WHERE server_id=$3 AND $5='delete' AND EXISTS(SELECT 1 FROM locked))
                            UPDATE server_lifecycle_jobs SET status='succeeded',phase='complete',finished_at=NOW(),lease_until=NULL
                              WHERE id IN(SELECT id FROM locked) RETURNING id`,[job.id,token,job.server_id,job.generation,job.action]);
                        } else nk.sqlExec('UPDATE server_lifecycle_jobs SET lease_until=NULL,lease_token=NULL WHERE id=$1::UUID AND lease_token=$2::UUID',[job.id,token]);
                    } catch(error) {
                        nk.sqlExec(`UPDATE server_lifecycle_jobs SET status='blocked',error=$3,lease_until=NULL,lease_token=NULL WHERE id=$1::UUID AND lease_token=$2::UUID`,[job.id,token,String(error)]);
                        throw error;
                    }
                }
                const report=nk.sqlQuery('SELECT id,server_id,status,phase,cursor,error,created_at,finished_at FROM server_lifecycle_jobs WHERE id=$1::UUID',[job.id]);
                return JSON.stringify({success:true,job:report[0]});
            }
            if(typeof req.server_id!=='string'||!/^[a-z][a-z0-9_]{0,31}$/.test(req.server_id)||!Number.isSafeInteger(req.expected_generation)
              ||!Number.isSafeInteger(req.expected_revision)||['reset','delete','cleanup'].indexOf(req.action)<0)return serverFailure('INVALID_SCOPE',400,'Explicit action, server, generation and revision required');
            if(action==='execute') {
                if(typeof req.request_id!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(req.request_id))return serverFailure('REQUEST_ID_REQUIRED',400,'Invalid request ID');
                const body=JSON.stringify({server_id:req.server_id,action:req.action,expected_generation:req.expected_generation,
                  expected_revision:req.expected_revision,plan_id:req.plan_id,manifest_hash:req.manifest_hash});
                const rows=nk.sqlQuery('SELECT server_lifecycle_begin($1::UUID,$2::UUID,$3,$4::JSONB,$5::UUID) AS job',[req.plan_id,nk.uuidv4(),req.request_id,body,ctx.userId]);
                return JSON.stringify({success:true,job:parseJsonb(rows[0].job)});
            }
            if(typeof req.reason!=='string'||!req.reason.trim()||req.reason.length>500)return serverFailure('REASON_REQUIRED',400,'Reason required');
            const servers=nk.sqlQuery('SELECT * FROM game_servers WHERE server_id=$1',[req.server_id]);
            if(!servers.length)return serverFailure('SERVER_NOT_FOUND',404,'Server not found');
            const server=servers[0];
            if(['disabled','deleted'].indexOf(server.status)<0||Number(server.active_requests)!==0)return serverFailure('SERVER_NOT_DRAINED',409,'Disable and drain first');
            if(Number(server.revision)!==req.expected_revision||(req.action!=='cleanup'&&Number(server.generation)!==req.expected_generation)
              ||(req.action==='cleanup'&&req.expected_generation>=Number(server.generation)&&server.status!=='deleted'))return serverFailure('PLAN_STALE',409,'Scope changed');
            if(server.status==='deleted'&&req.action!=='cleanup')return serverFailure('SERVER_DELETED',409,'Tombstone cannot be reused');
            const id=nk.uuidv4();
            const rows=nk.sqlQuery(`WITH guard AS MATERIALIZED (SELECT server_id FROM game_servers WHERE server_id=$2 FOR UPDATE),
              m AS (SELECT server_lifecycle_manifest($2,$4) AS manifest FROM guard)
              INSERT INTO server_operation_plans(id,server_id,action,generation,revision,actor_id,reason,manifest,manifest_hash)
              SELECT $1::UUID,$2,$3,$4,$5,$6::UUID,$7,manifest,encode(sha256(convert_to(manifest::TEXT,'UTF8')),'hex') FROM m
              RETURNING id AS plan_id,manifest_hash,expires_at,manifest`,[id,req.server_id,req.action,req.expected_generation,req.expected_revision,ctx.userId,req.reason.trim()]);
            const m=parseJsonb(rows[0].manifest);
            return JSON.stringify({success:true,plan_id:id,manifest_hash:rows[0].manifest_hash,expires_at:rows[0].expires_at,
              counts:{storage:m.storage.length,unknown:m.unknown.length,characters:m.characters.length,pending_financial:m.pending_financial,real_purchases:m.real_purchases},
              retained:['account','entitlement','financial_ledger','receipt_dedupe','config_release','generation_snapshot']});
        } catch(error) {
            const message=String(error);
            const known=['PLAN_EXPIRED','PLAN_STALE','OPERATION_IN_PROGRESS','SERVER_NOT_DRAINED','PENDING_FINANCIAL_DELIVERY',
              'GENERATION_MISMATCH','INTEGRITY_CHECK_FAILED','RETENTION_BLOCKED','UNKNOWN_OWNERSHIP','PAID_RESET_POLICY_REQUIRED','REQUEST_ID_CONFLICT'];
            return serverFailure(known.find(code=>message.indexOf(code)>=0)||'LIFECYCLE_CONFLICT',409,message);
        }
    };
}

function rpcAdminServerPlan(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return accountGuardedRpc('admin_server_plan',serverLifecycleHandler('plan'))(c,l,n,p);}
function rpcAdminServerExecute(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return accountGuardedRpc('admin_server_execute',serverLifecycleHandler('execute'))(c,l,n,p);}
function rpcAdminServerJob(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return accountGuardedRpc('admin_server_job',serverLifecycleHandler('job'))(c,l,n,p);}
function rpcAdminServerJobStep(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return accountGuardedRpc('admin_server_job_step',serverLifecycleHandler('step'))(c,l,n,p);}

function serverFinancialHandler(retry:boolean):nkruntime.RpcFunction {
    return (ctx,logger,nk,payload)=>{
        const denied=requireServerAdmin(ctx);if(denied)return denied;
        let req:any;try{req=serverRequest(payload);}catch(_e){return serverFailure('INVALID_REQUEST',400,'Invalid JSON');}
        if(!retry)return JSON.stringify({success:true,events:nk.sqlQuery(`SELECT event_id,event_type,user_id,target_server_id,target_generation,status,reason,created_at
          FROM server_financial_inbox WHERE status='pending' AND event_id>$1 ORDER BY event_id LIMIT 100`,[String(req.after||'')])});
        const rows=nk.sqlQuery("SELECT * FROM server_financial_inbox WHERE event_id=$1 AND status='pending'",[String(req.event_id||'')]);
        if(!rows.length)return serverFailure('EVENT_NOT_PENDING',404,'Pending event not found');
        const event=rows[0],body=parseJsonb(event.payload);
        if(event.event_type!=='admob_ssv')return serverFailure('RECONCILIATION_POLICY_REQUIRED',409,'This financial event requires reviewed compensation/revocation, not reward replay');
        body.verifier_secret=String(ctx.env.MONETIZATION_VERIFIER_SECRET||'');
        // The recipient's account and original server admission guards still apply.
        const result=JSON.parse(withActiveAccount(nk,String(event.user_id),()=>admobSsvConfirm(ctx,logger,nk,JSON.stringify(body))));
        if(result.status==='success'&&result.data&&result.data.granted===true)nk.sqlExec("UPDATE server_financial_inbox SET status='resolved' WHERE event_id=$1",[event.event_id]);
        return JSON.stringify({success:result.status==='success',result});
    };
}
function rpcAdminServerFinancialList(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return accountGuardedRpc('admin_server_financial_list',serverFinancialHandler(false))(c,l,n,p);}
function rpcAdminServerFinancialRetry(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return accountGuardedRpc('admin_server_financial_retry',serverFinancialHandler(true))(c,l,n,p);}
