// C143: shared tables, explicit server/generation keys; legacy weekly history stays intact.
function createServerWeeklyTables(nk:nkruntime.Nakama):void {
    nk.sqlExec(`CREATE TABLE IF NOT EXISTS server_weekly_periods (
      server_id TEXT NOT NULL REFERENCES game_servers(server_id),generation INT NOT NULL,period_id BIGINT NOT NULL,
      starts_at TIMESTAMPTZ NOT NULL,closes_at TIMESTAMPTZ NOT NULL,config_version BIGINT NOT NULL,config JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',finalized_at TIMESTAMPTZ,PRIMARY KEY(server_id,generation,period_id));
    CREATE TABLE IF NOT EXISTS server_weekly_scores (
      server_id TEXT NOT NULL,generation INT NOT NULL,period_id BIGINT NOT NULL,board_id TEXT NOT NULL,user_id UUID NOT NULL,
      score BIGINT NOT NULL CHECK(score>=0),achieved_at TIMESTAMPTZ NOT NULL,display_name TEXT NOT NULL,
      PRIMARY KEY(server_id,generation,period_id,board_id,user_id),
      FOREIGN KEY(server_id,generation,period_id) REFERENCES server_weekly_periods(server_id,generation,period_id));
    CREATE INDEX IF NOT EXISTS server_weekly_rank_idx ON server_weekly_scores(server_id,generation,period_id,board_id,score DESC,achieved_at,user_id);
    CREATE TABLE IF NOT EXISTS server_weekly_awards (
      server_id TEXT NOT NULL,generation INT NOT NULL,period_id BIGINT NOT NULL,board_id TEXT NOT NULL,user_id UUID NOT NULL,
      rank INT NOT NULL,score BIGINT NOT NULL,rewards JSONB NOT NULL,expires_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY(server_id,generation,period_id,board_id,user_id),
      FOREIGN KEY(server_id,generation,period_id) REFERENCES server_weekly_periods(server_id,generation,period_id));
    CREATE INDEX IF NOT EXISTS server_weekly_awards_user_idx ON server_weekly_awards(server_id,generation,user_id,board_id,period_id DESC);
    CREATE OR REPLACE FUNCTION server_weekly_tick(sid TEXT,gen INT,cfg JSONB,release_version BIGINT) RETURNS BIGINT LANGUAGE plpgsql AS $sw$
    DECLARE p RECORD;ts TIMESTAMPTZ;start_at TIMESTAMPTZ;active_id BIGINT;
    BEGIN
      PERFORM pg_advisory_xact_lock(hashtext('server_weekly/'||sid),gen);
      IF NOT EXISTS(SELECT 1 FROM game_servers WHERE server_id=sid AND generation=gen AND status='open') THEN RETURN NULL; END IF;
      ts:=clock_timestamp();
      FOR p IN SELECT * FROM server_weekly_periods WHERE server_id=sid AND generation=gen AND status='open' AND closes_at<=ts ORDER BY period_id LOOP
        INSERT INTO server_weekly_awards(server_id,generation,period_id,board_id,user_id,rank,score,rewards,expires_at)
        SELECT sid,gen,p.period_id,ranked.board_id,ranked.user_id,ranked.position,ranked.score,
          (SELECT jsonb_agg(CASE WHEN reward->>'type'='random_item' THEN
            jsonb_build_object('type','item','id',(reward->'pool')->>(get_byte(decode(md5(sid||gen::TEXT||p.period_id::TEXT||ranked.board_id||ranked.user_id::TEXT||ordinality::TEXT),'hex'),0)%jsonb_array_length(reward->'pool')),'amount',reward->'amount')
            ELSE reward END ORDER BY ordinality) FROM jsonb_array_elements(tier->'rewards') WITH ORDINALITY r(reward,ordinality)),
          p.closes_at+make_interval(days=>(p.config->>'claim_days')::INT)
        FROM (SELECT s.*,ROW_NUMBER() OVER(PARTITION BY board_id ORDER BY score DESC,achieved_at,user_id) AS position
          FROM server_weekly_scores s JOIN users u ON u.id=s.user_id
          WHERE s.server_id=sid AND s.generation=gen AND s.period_id=p.period_id
            AND COALESCE(u.disable_time,to_timestamp(0))<=to_timestamp(0)
            AND NOT EXISTS(SELECT 1 FROM account_link_state a WHERE a.user_id=s.user_id AND a.status='archived')) ranked
        CROSS JOIN LATERAL jsonb_array_elements(p.config->'boards'->ranked.board_id->'tiers') tier
        WHERE ranked.position BETWEEN (tier->>'from')::INT AND (tier->>'to')::INT AND (p.config->'boards'->ranked.board_id->>'enabled')::BOOL
        ON CONFLICT DO NOTHING;
        UPDATE server_weekly_periods SET status='finalized',finalized_at=ts WHERE server_id=sid AND generation=gen AND period_id=p.period_id;
      END LOOP;
      start_at:=date_trunc('week',ts AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';active_id:=EXTRACT(EPOCH FROM start_at)::BIGINT;
      IF EXISTS(SELECT 1 FROM server_weekly_periods WHERE server_id=sid AND generation=gen AND period_id=active_id AND status='open') THEN RETURN active_id; END IF;
      IF cfg IS NULL OR NOT COALESCE((cfg->>'enabled')::BOOL,FALSE) THEN RETURN NULL; END IF;
      INSERT INTO server_weekly_periods(server_id,generation,period_id,starts_at,closes_at,config_version,config)
        VALUES(sid,gen,active_id,start_at,start_at+INTERVAL '7 days',release_version,cfg) ON CONFLICT DO NOTHING;
      RETURN active_id;
    END $sw$;
    CREATE OR REPLACE FUNCTION server_weekly_record(sid TEXT,gen INT,uid UUID,points JSONB,player_name TEXT,cfg JSONB,release_version BIGINT) RETURNS BIGINT LANGUAGE plpgsql AS $sw$
    DECLARE active_id BIGINT;entry RECORD;frozen JSONB;ts TIMESTAMPTZ;
    BEGIN
      active_id:=server_weekly_tick(sid,gen,cfg,release_version);IF active_id IS NULL THEN RETURN NULL; END IF;
      SELECT config INTO frozen FROM server_weekly_periods WHERE server_id=sid AND generation=gen AND period_id=active_id AND status='open';
      IF frozen IS NULL THEN RETURN NULL; END IF;ts:=clock_timestamp();
      FOR entry IN SELECT key,value FROM jsonb_each_text(points) LOOP
        IF COALESCE((frozen->'boards'->entry.key->>'enabled')::BOOL,FALSE) AND entry.value::BIGINT>=0 THEN
          INSERT INTO server_weekly_scores(server_id,generation,period_id,board_id,user_id,score,achieved_at,display_name)
            VALUES(sid,gen,active_id,entry.key,uid,entry.value::BIGINT,ts,player_name)
          ON CONFLICT(server_id,generation,period_id,board_id,user_id) DO UPDATE SET score=EXCLUDED.score,
            achieved_at=CASE WHEN server_weekly_scores.score=EXCLUDED.score THEN server_weekly_scores.achieved_at ELSE EXCLUDED.achieved_at END,display_name=EXCLUDED.display_name;
        END IF;
      END LOOP;RETURN active_id;
    END $sw$;`,[]);
}

function tickServerWeekly(nk:nkruntime.Nakama,scope:GameServerContext):any {
    const settings=weeklyPublishedConfig(nk);
    return nk.sqlQuery('SELECT server_weekly_tick($1,$2,$3::JSONB,$4::BIGINT) AS period_id,EXTRACT(EPOCH FROM clock_timestamp())*1000 AS server_time_ms',
        [scope.serverId,scope.generation,settings.config?JSON.stringify(settings.config):null,settings.version])[0];
}

function recordServerWeekly(nk:nkruntime.Nakama,scope:GameServerContext,userId:string,name:string,scores:any):void {
    const settings=weeklyPublishedConfig(nk);
    nk.sqlQuery('SELECT server_weekly_record($1,$2,$3::UUID,$4::JSONB,$5,$6::JSONB,$7::BIGINT)',
        [scope.serverId,scope.generation,userId,JSON.stringify(scores),name,settings.config?JSON.stringify(settings.config):null,settings.version]);
}

const readServerWeekly:nkruntime.RpcFunction=(ctx,_logger,nk,payload)=>{
    const scope=characterContext(nk);if(!scope)throw new Error('Missing weekly scope');
    const req=serverRequest(payload),board=String(req.board_id||'');
    if(WEEKLY_BOARDS.indexOf(board)<0)return serverFailure('INVALID_BOARD',400,'Unknown category');
    const tick=tickServerWeekly(nk,scope),args=[scope.serverId,scope.generation];
    const periods=tick.period_id?nk.sqlQuery(`SELECT period_id,EXTRACT(EPOCH FROM starts_at)*1000 AS starts_at_ms,
      EXTRACT(EPOCH FROM closes_at)*1000 AS closes_at_ms,config_version,config FROM server_weekly_periods
      WHERE server_id=$1 AND generation=$2 AND period_id=$3`,args.concat([tick.period_id])):[];
    const period=periods[0];if(period)period.config=parseJsonb(period.config);
    const config=period&&period.config.boards[board];
    const ranks=period?nk.sqlQuery(`SELECT * FROM (SELECT s.user_id::TEXT,s.display_name,s.score,
      ROW_NUMBER() OVER(ORDER BY s.score DESC,s.achieved_at,s.user_id) AS rank FROM server_weekly_scores s JOIN users u ON u.id=s.user_id
      WHERE s.server_id=$1 AND s.generation=$2 AND s.period_id=$3 AND s.board_id=$4 AND COALESCE(u.disable_time,to_timestamp(0))<=to_timestamp(0)
      AND NOT EXISTS(SELECT 1 FROM account_link_state a WHERE a.user_id=s.user_id AND a.status='archived')) ranked
      WHERE rank<=50 OR user_id=$5 ORDER BY rank`,[scope.serverId,scope.generation,period.period_id,board,ctx.userId]):[];
    const awards=nk.sqlQuery(`SELECT period_id,board_id,rank,score,rewards,EXTRACT(EPOCH FROM expires_at)*1000 AS expires_at_ms,
      expires_at<=clock_timestamp() AS expired FROM server_weekly_awards WHERE server_id=$1 AND generation=$2 AND user_id=$3::UUID AND board_id=$4 ORDER BY period_id DESC LIMIT 14`,[scope.serverId,scope.generation,ctx.userId,board]);
    const markers=awards.length?nk.storageRead(awards.map((a:any)=>({collection:'weekly_leaderboard_claims',key:weeklyClaimKey(a.period_id,board),userId:ctx.userId}))):[];
    for(const award of awards){award.rewards=parseJsonb(award.rewards);award.claimed=markers.some((o:any)=>o.key===weeklyClaimKey(award.period_id,board));}
    return JSON.stringify({success:true,server_id:scope.serverId,generation:scope.generation,server_time_ms:Number(tick.server_time_ms),enabled:!!(config&&config.enabled),
      period:period?{period_id:period.period_id,starts_at_ms:Number(period.starts_at_ms),closes_at_ms:Number(period.closes_at_ms),config_version:period.config_version}:null,
      claim_days:period?period.config.claim_days:null,tiers:config?config.tiers:[],records:ranks.filter((r:any)=>Number(r.rank)<=50),my_record:ranks.find((r:any)=>r.user_id===ctx.userId)||null,awards});
};

const claimServerWeekly:nkruntime.RpcFunction=(ctx,_logger,nk,payload)=>{
    const scope=characterContext(nk);if(!scope)throw new Error('Missing weekly scope');
    const req=serverRequest(payload),board=String(req.board_id||''),period=String(req.period_id||'');
    if(WEEKLY_BOARDS.indexOf(board)<0||!/^\d{1,12}$/.test(period))return serverFailure('INVALID_REWARD',400,'Invalid reward');
    const awards=nk.sqlQuery(`SELECT rewards,expires_at>clock_timestamp() AS available FROM server_weekly_awards
      WHERE server_id=$1 AND generation=$2 AND period_id=$3::BIGINT AND board_id=$4 AND user_id=$5::UUID`,[scope.serverId,scope.generation,period,board,ctx.userId]);
    if(!awards.length)return serverFailure('REWARD_NOT_FOUND',404,'Không có phần thưởng tuần này.');
    const rewards=parseJsonb(awards[0].rewards),key=weeklyClaimKey(period,board);
    const reads=nk.storageRead([{collection:'weekly_leaderboard_claims',key,userId:ctx.userId},{collection:'player_profiles',key:'main',userId:ctx.userId},{collection:'player_inventory',key:'items',userId:ctx.userId}]);
    const p=reads.find((o:any)=>o.collection==='player_profiles'),i=reads.find((o:any)=>o.collection==='player_inventory');
    if(!p||!i||!Array.isArray(i.value.items))return serverFailure('CHARACTER_INCOMPLETE',409,'Player data is incomplete');
    if(reads.some((o:any)=>o.collection==='weekly_leaderboard_claims'))return JSON.stringify({success:true,already_claimed:true,rewards,profile:p.value,inventory:i.value.items});
    if(!awards[0].available)return serverFailure('REWARD_EXPIRED',410,'Phần thưởng đã hết hạn nhận.');
    p.value.resources=p.value.resources||{};
    for(const reward of rewards) {
        if(reward.type==='resource'&&['gold','gems'].indexOf(reward.id)>=0) {
            const total=Number(p.value.resources[reward.id]||0)+Number(reward.amount);if(!Number.isSafeInteger(total))throw new Error('Resource limit');p.value.resources[reward.id]=total;
        }else if(reward.type==='item')addStoreInventoryItem(nk,i.value.items,reward.id,reward.amount);else throw new Error('Invalid stored reward');
    }
    try{nk.storageWrite([{collection:'player_profiles',key:'main',userId:ctx.userId,value:p.value,version:p.version},
      {collection:'player_inventory',key:'items',userId:ctx.userId,value:i.value,version:i.version},
      {collection:'weekly_leaderboard_claims',key,userId:ctx.userId,value:{period_id:period,board_id:board,rewards},version:'*'}] as any);}
    catch(_e){return serverFailure('DATA_CHANGED',409,'Dữ liệu vừa thay đổi. Vui lòng thử lại.');}
    return JSON.stringify({success:true,already_claimed:false,rewards,profile:p.value,inventory:i.value.items});
};
