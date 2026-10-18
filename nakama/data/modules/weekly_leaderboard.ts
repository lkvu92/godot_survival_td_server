// C135: weekly reward standings are independent of mutable lifetime boards.
const WEEKLY_BOARDS = ["cultivation_realm", "campaign_stage", "combat_power"];

function validWeeklyLeaderboardConfig(cfg: any): boolean {
    if (!cfg || cfg.schema_version !== 1 || typeof cfg.enabled !== "boolean"
        || !Number.isSafeInteger(cfg.claim_days) || cfg.claim_days < 1 || cfg.claim_days > 90
        || !cfg.boards || typeof cfg.boards !== "object" || Array.isArray(cfg.boards)
        || Object.keys(cfg.boards).some(id => WEEKLY_BOARDS.indexOf(id) < 0)) return false;
    for (const id of WEEKLY_BOARDS) {
        const board = cfg.boards[id];
        if (!board || typeof board.enabled !== "boolean" || !Array.isArray(board.tiers) || board.tiers.length !== 13) return false;
        let next = 1;
        for (let i = 0; i < board.tiers.length; i++) {
            const tier = board.tiers[i], end = i < 10 ? i + 1 : [50, 200, 500][i - 10];
            if (!tier || tier.from !== next || tier.to !== end || !Array.isArray(tier.rewards)
                || !tier.rewards.length || tier.rewards.length > 8) return false;
            next = end + 1;
            for (const reward of tier.rewards) {
                if (!reward || !Number.isSafeInteger(reward.amount) || reward.amount <= 0 || reward.amount > 10000000) return false;
                if (reward.type === "resource") {
                    if (["gold", "gems"].indexOf(reward.id) < 0) return false;
                } else if (reward.type === "item") {
                    if (typeof reward.id !== "string" || !/^[a-z0-9_]{1,100}$/.test(reward.id) || reward.amount > 1000) return false;
                } else if (reward.type === "random_item") {
                    if (!Array.isArray(reward.pool) || !reward.pool.length || reward.pool.length > 128 || reward.amount > 1000
                        || reward.pool.some((item: any) => typeof item !== "string" || !/^[a-z0-9_]{1,100}$/.test(item))) return false;
                } else return false;
            }
        }
    }
    return true;
}

function weeklyConfigItemsExist(nk: nkruntime.Nakama, config: any): boolean {
    const ids: string[] = [];
    for (const id of WEEKLY_BOARDS) for (const tier of config.boards[id].tiers) for (const reward of tier.rewards) {
        for (const item of reward.type === "item" ? [reward.id] : reward.type === "random_item" ? reward.pool : []) {
            if (ids.indexOf(item) < 0) ids.push(item);
        }
    }
    if (!ids.length) return true;
    const found = nk.sqlQuery("SELECT id FROM game_items WHERE id IN (SELECT jsonb_array_elements_text($1::JSONB))", [JSON.stringify(ids)]);
    return found.length === ids.length;
}

function createWeeklyLeaderboardTables(nk: nkruntime.Nakama): void {
    nk.sqlExec(`
CREATE TABLE IF NOT EXISTS weekly_leaderboard_periods (
    period_id BIGINT PRIMARY KEY, starts_at TIMESTAMPTZ NOT NULL, closes_at TIMESTAMPTZ NOT NULL,
    config_version BIGINT NOT NULL, config JSONB NOT NULL, status TEXT NOT NULL DEFAULT 'open', finalized_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS weekly_leaderboard_scores (
    period_id BIGINT NOT NULL REFERENCES weekly_leaderboard_periods(period_id), board_id TEXT NOT NULL,
    user_id UUID NOT NULL, score BIGINT NOT NULL CHECK(score >= 0), achieved_at TIMESTAMPTZ NOT NULL,
    display_name TEXT NOT NULL, PRIMARY KEY(period_id,board_id,user_id)
);
CREATE INDEX IF NOT EXISTS weekly_leaderboard_rank_idx ON weekly_leaderboard_scores(period_id,board_id,score DESC,achieved_at,user_id);
CREATE TABLE IF NOT EXISTS weekly_leaderboard_awards (
    period_id BIGINT NOT NULL REFERENCES weekly_leaderboard_periods(period_id), board_id TEXT NOT NULL,
    user_id UUID NOT NULL, rank INT NOT NULL, score BIGINT NOT NULL, rewards JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL, PRIMARY KEY(period_id,board_id,user_id)
);
CREATE INDEX IF NOT EXISTS weekly_leaderboard_awards_user_idx ON weekly_leaderboard_awards(user_id,board_id,period_id DESC);
CREATE OR REPLACE FUNCTION weekly_leaderboard_tick(cfg JSONB, release_version BIGINT) RETURNS BIGINT
LANGUAGE plpgsql AS $weekly$
DECLARE p RECORD; ts TIMESTAMPTZ; start_at TIMESTAMPTZ; active_id BIGINT;
BEGIN
    -- Shared by recording and finalization. Commands after this lock get fresh
    -- snapshots: a score committed before the cutoff cannot disappear in a race.
    PERFORM pg_advisory_xact_lock(135,1);
    ts := clock_timestamp();
    FOR p IN SELECT * FROM weekly_leaderboard_periods WHERE status='open' AND closes_at<=ts ORDER BY period_id LOOP
        INSERT INTO weekly_leaderboard_awards(period_id,board_id,user_id,rank,score,rewards,expires_at)
        SELECT p.period_id, ranked.board_id, ranked.user_id, ranked.position, ranked.score,
            (SELECT jsonb_agg(CASE WHEN reward->>'type'='random_item' THEN
                jsonb_build_object('type','item','id',(reward->'pool')->>(get_byte(decode(md5(p.period_id::TEXT||ranked.board_id||ranked.user_id::TEXT||ordinality::TEXT),'hex'),0) % jsonb_array_length(reward->'pool')),
                    'amount',reward->'amount') ELSE reward END ORDER BY ordinality)
             FROM jsonb_array_elements(tier->'rewards') WITH ORDINALITY r(reward,ordinality)),
            p.closes_at + make_interval(days => (p.config->>'claim_days')::INT)
        FROM (
            SELECT s.*, ROW_NUMBER() OVER(PARTITION BY board_id ORDER BY score DESC,achieved_at,user_id) AS position
            FROM weekly_leaderboard_scores s JOIN users u ON u.id=s.user_id
            WHERE s.period_id=p.period_id AND COALESCE(u.disable_time,to_timestamp(0))<=to_timestamp(0)
                AND NOT EXISTS(SELECT 1 FROM account_link_state a WHERE a.user_id=s.user_id AND a.status='archived')
        ) ranked
        CROSS JOIN LATERAL jsonb_array_elements(p.config->'boards'->ranked.board_id->'tiers') tier
        WHERE ranked.position BETWEEN (tier->>'from')::INT AND (tier->>'to')::INT
            AND (p.config->'boards'->ranked.board_id->>'enabled')::BOOL
        ON CONFLICT DO NOTHING;
        UPDATE weekly_leaderboard_periods SET status='finalized',finalized_at=ts WHERE period_id=p.period_id;
    END LOOP;
    IF cfg IS NULL THEN RETURN NULL; END IF;
    start_at := date_trunc('week',ts AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
    active_id := EXTRACT(EPOCH FROM start_at)::BIGINT;
    -- Settings edits apply next week; an existing period keeps its rules.
    IF EXISTS(SELECT 1 FROM weekly_leaderboard_periods WHERE period_id=active_id AND status='open') THEN RETURN active_id; END IF;
    IF NOT COALESCE((cfg->>'enabled')::BOOL,FALSE) THEN RETURN NULL; END IF;
    INSERT INTO weekly_leaderboard_periods(period_id,starts_at,closes_at,config_version,config)
        VALUES(active_id,start_at,start_at+INTERVAL '7 days',release_version,cfg) ON CONFLICT DO NOTHING;
    RETURN active_id;
END $weekly$;
CREATE OR REPLACE FUNCTION weekly_leaderboard_record(uid UUID, points JSONB, player_name TEXT, cfg JSONB, release_version BIGINT) RETURNS BIGINT
LANGUAGE plpgsql AS $weekly$
DECLARE active_id BIGINT; entry RECORD; frozen JSONB; ts TIMESTAMPTZ;
BEGIN
    active_id := weekly_leaderboard_tick(cfg,release_version);
    IF active_id IS NULL THEN RETURN NULL; END IF;
    SELECT config INTO frozen FROM weekly_leaderboard_periods WHERE period_id=active_id AND status='open';
    IF frozen IS NULL THEN RETURN NULL; END IF;
    ts := clock_timestamp();
    FOR entry IN SELECT key,value FROM jsonb_each_text(points) LOOP
        IF COALESCE((frozen->'boards'->entry.key->>'enabled')::BOOL,FALSE) AND entry.value::BIGINT>=0 THEN
            INSERT INTO weekly_leaderboard_scores(period_id,board_id,user_id,score,achieved_at,display_name)
            VALUES(active_id,entry.key,uid,entry.value::BIGINT,ts,player_name)
            ON CONFLICT(period_id,board_id,user_id) DO UPDATE SET score=EXCLUDED.score,
                achieved_at=CASE WHEN weekly_leaderboard_scores.score=EXCLUDED.score THEN weekly_leaderboard_scores.achieved_at ELSE EXCLUDED.achieved_at END,
                display_name=EXCLUDED.display_name;
        END IF;
    END LOOP;
    RETURN active_id;
END $weekly$;`, []);
}

function weeklyPublishedConfig(nk: nkruntime.Nakama): any {
    const release = getActiveRemoteConfig(nk);
    const cfg = release.config && release.config.system && release.config.system.leaderboard_rewards;
    return { config: validWeeklyLeaderboardConfig(cfg) ? cfg : null, version: release.version };
}

function recordWeeklyLeaderboardScores(nk: nkruntime.Nakama, userId: string, name: string, scores: any): void {
    for (const board of WEEKLY_BOARDS) if (!Number.isSafeInteger(scores[board]) || scores[board] < 0) throw new Error("Invalid weekly score");
    const settings = weeklyPublishedConfig(nk);
    nk.sqlQuery("SELECT weekly_leaderboard_record($1::UUID,$2::JSONB,$3,$4::JSONB,$5::BIGINT) AS period_id",
        [userId, JSON.stringify(scores), name, settings.config ? JSON.stringify(settings.config) : null, settings.version]);
}

function tickWeeklyLeaderboards(nk: nkruntime.Nakama): any {
    const settings = weeklyPublishedConfig(nk);
    return nk.sqlQuery("SELECT weekly_leaderboard_tick($1::JSONB,$2::BIGINT) AS period_id, EXTRACT(EPOCH FROM clock_timestamp())*1000 AS server_time_ms",
        [settings.config ? JSON.stringify(settings.config) : null, settings.version])[0];
}

function weeklyClaimKey(period: any, board: string): string { return String(period) + "_" + board; }

const readWeeklyLeaderboardRewards: nkruntime.RpcFunction = (ctx, _logger, nk, payload) => {
    if (!ctx.userId) return JSON.stringify({success:false,code:401,message:"Authentication required"});
    let req: any;
    try { req = JSON.parse(payload || "{}"); } catch (_) { return JSON.stringify({success:false,code:400,message:"Invalid JSON"}); }
    const board = String(req.board_id || "");
    if (WEEKLY_BOARDS.indexOf(board) < 0) return JSON.stringify({success:false,code:400,message:"Unknown category"});
    const tick = tickWeeklyLeaderboards(nk);
    const periods = tick.period_id ? nk.sqlQuery("SELECT period_id,EXTRACT(EPOCH FROM starts_at)*1000 AS starts_at_ms,EXTRACT(EPOCH FROM closes_at)*1000 AS closes_at_ms,config_version,config FROM weekly_leaderboard_periods WHERE period_id=$1", [tick.period_id]) : [];
    const period = periods[0];
    if (period) period.config = parseJsonb(period.config);
    const boardConfig = period && period.config.boards[board];
    const ranks = period ? nk.sqlQuery(`SELECT * FROM (
        SELECT s.user_id::TEXT,s.display_name,s.score,ROW_NUMBER() OVER(ORDER BY s.score DESC,s.achieved_at,s.user_id) AS rank
        FROM weekly_leaderboard_scores s JOIN users u ON u.id=s.user_id
        WHERE s.period_id=$1 AND s.board_id=$2 AND COALESCE(u.disable_time,to_timestamp(0))<=to_timestamp(0)
            AND NOT EXISTS(SELECT 1 FROM account_link_state a WHERE a.user_id=s.user_id AND a.status='archived')
        ) ranked WHERE rank<=50 OR user_id=$3 ORDER BY rank`, [period.period_id,board,ctx.userId]) : [];
    const awards = nk.sqlQuery(`SELECT period_id,board_id,rank,score,rewards,EXTRACT(EPOCH FROM expires_at)*1000 AS expires_at_ms,
        expires_at<=clock_timestamp() AS expired FROM weekly_leaderboard_awards WHERE user_id=$1::UUID AND board_id=$2 ORDER BY period_id DESC LIMIT 14`, [ctx.userId,board]);
    const markers = awards.length ? nk.storageRead(awards.map((a:any)=>({collection:"weekly_leaderboard_claims",key:weeklyClaimKey(a.period_id,board),userId:ctx.userId}))) : [];
    for (const award of awards) {
        award.rewards = parseJsonb(award.rewards);
        award.claimed = markers.some((o:any)=>o.key===weeklyClaimKey(award.period_id,board));
    }
    return JSON.stringify({success:true,server_time_ms:Number(tick.server_time_ms),enabled:!!(boardConfig && boardConfig.enabled),
        period:period ? {period_id:period.period_id,starts_at_ms:Number(period.starts_at_ms),closes_at_ms:Number(period.closes_at_ms),config_version:period.config_version} : null,
        claim_days:period ? period.config.claim_days : null,tiers:boardConfig ? boardConfig.tiers : [],records:ranks.filter((r:any)=>Number(r.rank)<=50),my_record:ranks.find((r:any)=>r.user_id===ctx.userId)||null,awards});
};

const getWeeklyLeaderboardRewards: nkruntime.RpcFunction = (ctx, logger, nk, payload) => {
    try { return readWeeklyLeaderboardRewards(ctx,logger,nk,payload); }
    catch (error) {
        if (logger && logger.error) logger.error("Weekly standings unavailable: " + String(error));
        return JSON.stringify({success:false,code:503,message:"Chưa tải được thưởng tuần. Vui lòng thử lại."});
    }
};

const claimWeeklyLeaderboardRewardInternal: nkruntime.RpcFunction = (ctx, _logger, nk, payload) => {
    const fail = (code:number,message:string)=>JSON.stringify({success:false,code,message});
    if (!ctx.userId) return fail(401,"Authentication required");
    let req:any;
    try {req=JSON.parse(payload||"{}");} catch (_) {return fail(400,"Invalid JSON");}
    const board=String(req.board_id||""),period=String(req.period_id||"");
    if (WEEKLY_BOARDS.indexOf(board)<0 || !/^[0-9]{1,12}$/.test(period)) return fail(400,"Invalid weekly reward");
    const awards=nk.sqlQuery(`SELECT rewards,expires_at>clock_timestamp() AS available FROM weekly_leaderboard_awards
        WHERE period_id=$1::BIGINT AND board_id=$2 AND user_id=$3::UUID`,[period,board,ctx.userId]);
    if (!awards.length) return fail(404,"Không có phần thưởng tuần này.");
    awards[0].rewards = parseJsonb(awards[0].rewards);
    const key=weeklyClaimKey(period,board);
    const reads=nk.storageRead([{collection:"weekly_leaderboard_claims",key,userId:ctx.userId},
        {collection:"player_profiles",key:"main",userId:ctx.userId},{collection:"player_inventory",key:"items",userId:ctx.userId}]);
    const claimed=reads.find((o:any)=>o.collection==="weekly_leaderboard_claims");
    const profileObject=reads.find((o:any)=>o.collection==="player_profiles"),inventoryObject=reads.find((o:any)=>o.collection==="player_inventory");
    if (!profileObject || !inventoryObject) return fail(409,"Player data is incomplete");
    if (claimed) return JSON.stringify({success:true,already_claimed:true,rewards:awards[0].rewards,profile:profileObject.value,inventory:inventoryObject.value.items});
    if (!awards[0].available) return fail(410,"Phần thưởng đã hết hạn nhận.");
    const profile=profileObject.value,inventory=inventoryObject.value;
    if (!Array.isArray(inventory.items)) return fail(409,"Invalid inventory");
    profile.resources=profile.resources||{};
    for (const reward of awards[0].rewards) {
        if (reward.type==="resource" && ["gold","gems"].indexOf(reward.id)>=0) {
            const total=Number(profile.resources[reward.id]||0)+Number(reward.amount);
            if (!Number.isSafeInteger(total)) return fail(409,"Resource limit reached");
            profile.resources[reward.id]=total;
        } else if (reward.type==="item") addStoreInventoryItem(nk,inventory.items,reward.id,reward.amount);
        else return fail(409,"Invalid stored reward");
    }
    try {
        nk.storageWrite([
            {collection:"player_profiles",key:"main",userId:ctx.userId,value:profile,version:profileObject.version,permissionRead:1,permissionWrite:0},
            {collection:"player_inventory",key:"items",userId:ctx.userId,value:inventory,version:inventoryObject.version,permissionRead:1,permissionWrite:0},
            {collection:"weekly_leaderboard_claims",key,userId:ctx.userId,value:{period_id:period,board_id:board,rewards:awards[0].rewards},version:"*",permissionRead:1,permissionWrite:0}
        ]);
    } catch (_) {return fail(409,"Dữ liệu vừa thay đổi. Vui lòng tải lại và thử nhận thưởng.");}
    return JSON.stringify({success:true,already_claimed:false,rewards:awards[0].rewards,profile,inventory:inventory.items});
};

const claimWeeklyLeaderboardReward: nkruntime.RpcFunction = (ctx, logger, nk, payload) => {
    try { return claimWeeklyLeaderboardRewardInternal(ctx,logger,nk,payload); }
    catch (error) {
        if (logger && logger.error) logger.error("Weekly reward claim unavailable: " + String(error));
        return JSON.stringify({success:false,code:503,message:"Chưa thể nhận thưởng tuần. Vui lòng tải lại và thử lại."});
    }
};

const weeklyLeaderboardTickRpc: nkruntime.RpcFunction = (ctx, _logger, nk, _payload) => {
    // Userless RPCs require Nakama's existing runtime HTTP key at the gateway.
    if (ctx.userId && ctx.userId!==String(ctx.env.CONFIG_ADMIN_USER_ID||"")) return JSON.stringify({success:false,code:403,message:"Forbidden"});
    const result=tickWeeklyLeaderboards(nk);
    return JSON.stringify({success:true,...result});
};
