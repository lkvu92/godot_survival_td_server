function createServerWeeklyTables(nk) {
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
    END $sw$;`, []);
}
function tickServerWeekly(nk, scope) {
  const settings = weeklyPublishedConfig(nk);
  return nk.sqlQuery(
    "SELECT server_weekly_tick($1,$2,$3::JSONB,$4::BIGINT) AS period_id,EXTRACT(EPOCH FROM clock_timestamp())*1000 AS server_time_ms",
    [scope.serverId, scope.generation, settings.config ? JSON.stringify(settings.config) : null, settings.version]
  )[0];
}
function recordServerWeekly(nk, scope, userId, name, scores) {
  const settings = weeklyPublishedConfig(nk);
  nk.sqlQuery(
    "SELECT server_weekly_record($1,$2,$3::UUID,$4::JSONB,$5,$6::JSONB,$7::BIGINT)",
    [scope.serverId, scope.generation, userId, JSON.stringify(scores), name, settings.config ? JSON.stringify(settings.config) : null, settings.version]
  );
}
const readServerWeekly = (ctx, _logger, nk, payload) => {
  const scope = characterContext(nk);
  if (!scope) throw new Error("Missing weekly scope");
  const req = serverRequest(payload), board = String(req.board_id || "");
  if (WEEKLY_BOARDS.indexOf(board) < 0) return serverFailure("INVALID_BOARD", 400, "Unknown category");
  const tick = tickServerWeekly(nk, scope), args = [scope.serverId, scope.generation];
  const periods = tick.period_id ? nk.sqlQuery(`SELECT period_id,EXTRACT(EPOCH FROM starts_at)*1000 AS starts_at_ms,
      EXTRACT(EPOCH FROM closes_at)*1000 AS closes_at_ms,config_version,config FROM server_weekly_periods
      WHERE server_id=$1 AND generation=$2 AND period_id=$3`, args.concat([tick.period_id])) : [];
  const period = periods[0];
  if (period) period.config = parseJsonb(period.config);
  const config = period && period.config.boards[board];
  const ranks = period ? nk.sqlQuery(`SELECT * FROM (SELECT s.user_id::TEXT,s.display_name,s.score,
      ROW_NUMBER() OVER(ORDER BY s.score DESC,s.achieved_at,s.user_id) AS rank FROM server_weekly_scores s JOIN users u ON u.id=s.user_id
      WHERE s.server_id=$1 AND s.generation=$2 AND s.period_id=$3 AND s.board_id=$4 AND COALESCE(u.disable_time,to_timestamp(0))<=to_timestamp(0)
      AND NOT EXISTS(SELECT 1 FROM account_link_state a WHERE a.user_id=s.user_id AND a.status='archived')) ranked
      WHERE rank<=50 OR user_id=$5 ORDER BY rank`, [scope.serverId, scope.generation, period.period_id, board, ctx.userId]) : [];
  const awards = nk.sqlQuery(`SELECT period_id,board_id,rank,score,rewards,EXTRACT(EPOCH FROM expires_at)*1000 AS expires_at_ms,
      expires_at<=clock_timestamp() AS expired FROM server_weekly_awards WHERE server_id=$1 AND generation=$2 AND user_id=$3::UUID AND board_id=$4 ORDER BY period_id DESC LIMIT 14`, [scope.serverId, scope.generation, ctx.userId, board]);
  const markers = awards.length ? nk.storageRead(awards.map((a) => ({ collection: "weekly_leaderboard_claims", key: weeklyClaimKey(a.period_id, board), userId: ctx.userId }))) : [];
  for (const award of awards) {
    award.rewards = parseJsonb(award.rewards);
    award.claimed = markers.some((o) => o.key === weeklyClaimKey(award.period_id, board));
  }
  return JSON.stringify({
    success: true,
    server_id: scope.serverId,
    generation: scope.generation,
    server_time_ms: Number(tick.server_time_ms),
    enabled: !!(config && config.enabled),
    period: period ? { period_id: period.period_id, starts_at_ms: Number(period.starts_at_ms), closes_at_ms: Number(period.closes_at_ms), config_version: period.config_version } : null,
    claim_days: period ? period.config.claim_days : null,
    tiers: config ? config.tiers : [],
    records: ranks.filter((r) => Number(r.rank) <= 50),
    my_record: ranks.find((r) => r.user_id === ctx.userId) || null,
    awards
  });
};
const claimServerWeekly = (ctx, _logger, nk, payload) => {
  const scope = characterContext(nk);
  if (!scope) throw new Error("Missing weekly scope");
  const req = serverRequest(payload), board = String(req.board_id || ""), period = String(req.period_id || "");
  if (WEEKLY_BOARDS.indexOf(board) < 0 || !/^\d{1,12}$/.test(period)) return serverFailure("INVALID_REWARD", 400, "Invalid reward");
  const awards = nk.sqlQuery(`SELECT rewards,expires_at>clock_timestamp() AS available FROM server_weekly_awards
      WHERE server_id=$1 AND generation=$2 AND period_id=$3::BIGINT AND board_id=$4 AND user_id=$5::UUID`, [scope.serverId, scope.generation, period, board, ctx.userId]);
  if (!awards.length) return serverFailure("REWARD_NOT_FOUND", 404, "Kh\xF4ng c\xF3 ph\u1EA7n th\u01B0\u1EDFng tu\u1EA7n n\xE0y.");
  const rewards = parseJsonb(awards[0].rewards), key = weeklyClaimKey(period, board);
  const reads = nk.storageRead([{ collection: "weekly_leaderboard_claims", key, userId: ctx.userId }, { collection: "player_profiles", key: "main", userId: ctx.userId }, { collection: "player_inventory", key: "items", userId: ctx.userId }]);
  const p = reads.find((o) => o.collection === "player_profiles"), i = reads.find((o) => o.collection === "player_inventory");
  if (!p || !i || !Array.isArray(i.value.items)) return serverFailure("CHARACTER_INCOMPLETE", 409, "Player data is incomplete");
  if (reads.some((o) => o.collection === "weekly_leaderboard_claims")) return JSON.stringify({ success: true, already_claimed: true, rewards, profile: p.value, inventory: i.value.items });
  if (!awards[0].available) return serverFailure("REWARD_EXPIRED", 410, "Ph\u1EA7n th\u01B0\u1EDFng \u0111\xE3 h\u1EBFt h\u1EA1n nh\u1EADn.");
  p.value.resources = p.value.resources || {};
  for (const reward of rewards) {
    if (reward.type === "resource" && ["gold", "gems"].indexOf(reward.id) >= 0) {
      const total = Number(p.value.resources[reward.id] || 0) + Number(reward.amount);
      if (!Number.isSafeInteger(total)) throw new Error("Resource limit");
      p.value.resources[reward.id] = total;
    } else if (reward.type === "item") addStoreInventoryItem(nk, i.value.items, reward.id, reward.amount);
    else throw new Error("Invalid stored reward");
  }
  try {
    nk.storageWrite([
      { collection: "player_profiles", key: "main", userId: ctx.userId, value: p.value, version: p.version },
      { collection: "player_inventory", key: "items", userId: ctx.userId, value: i.value, version: i.version },
      { collection: "weekly_leaderboard_claims", key, userId: ctx.userId, value: { period_id: period, board_id: board, rewards }, version: "*" }
    ]);
  } catch (_e) {
    return serverFailure("DATA_CHANGED", 409, "D\u1EEF li\u1EC7u v\u1EEBa thay \u0111\u1ED5i. Vui l\xF2ng th\u1EED l\u1EA1i.");
  }
  return JSON.stringify({ success: true, already_claimed: false, rewards, profile: p.value, inventory: i.value.items });
};

function requireServerAdmin(ctx) {
  const configured = String(ctx.env && ctx.env.CONFIG_ADMIN_USER_ID || "");
  return ctx.userId && configured && ctx.userId === configured ? null : serverFailure("FORBIDDEN", 403, "Forbidden");
}
function serverAdminHandler(action) {
  return (ctx, _logger, nk, payload) => {
    const denied = requireServerAdmin(ctx);
    if (denied) return denied;
    let req;
    try {
      req = serverRequest(payload);
    } catch (_e) {
      return serverFailure("INVALID_REQUEST", 400, "Invalid JSON");
    }
    if (action === "list") {
      const limit = Number.isSafeInteger(req.limit) ? Math.min(100, Math.max(1, req.limit)) : 50;
      const after = typeof req.after === "string" ? req.after : "";
      const rows = nk.sqlQuery(`SELECT server_id,display_name,status,generation,revision,opens_at,
                allow_new_characters,placement_id,config_version FROM game_servers
                WHERE server_id>$1 ORDER BY server_id LIMIT $2`, [after, limit + 1]);
      const more = rows.length > limit;
      if (more) rows.pop();
      return JSON.stringify({ success: true, servers: rows, next_cursor: more ? rows[rows.length - 1].server_id : "" });
    }
    if (typeof req.server_id !== "string" || !/^[a-z][a-z0-9_]{0,31}$/.test(req.server_id)) return serverFailure("INVALID_SERVER_ID", 400, "Invalid server ID");
    if (action === "inspect") {
      const rows = nk.sqlQuery(`SELECT s.server_id,s.display_name,s.status,s.generation,s.revision,s.opens_at,
                s.allow_new_characters,s.placement_id,s.config_version,
                (SELECT COUNT(*)::INT FROM player_characters c WHERE c.server_id=s.server_id) AS character_count,
                EXTRACT(EPOCH FROM NOW())*1000 AS snapshot_at_ms FROM game_servers s WHERE s.server_id=$1`, [req.server_id]);
      return rows.length ? JSON.stringify({ success: true, server: rows[0] }) : serverFailure("SERVER_NOT_FOUND", 404, "Server not found");
    }
    if (typeof req.reason !== "string" || !req.reason.trim() || req.reason.length > 500) return serverFailure("REASON_REQUIRED", 400, "A reason is required");
    if (action === "create") {
      if (typeof req.request_id !== "string" || !/^[a-zA-Z0-9_-]{8,100}$/.test(req.request_id)) return serverFailure("REQUEST_ID_REQUIRED", 400, "Invalid request ID");
      if (typeof req.display_name !== "string" || !req.display_name.trim() || req.display_name.length > 100) return serverFailure("INVALID_NAME", 400, "Invalid display name");
      if (!Number.isSafeInteger(req.config_version) || req.config_version < 1) return serverFailure("CONFIG_REQUIRED", 400, "Published config version required");
      if (typeof req.opens_at !== "string" || !Number.isFinite(Date.parse(req.opens_at))) return serverFailure("INVALID_OPEN_TIME", 400, "ISO opening time required");
      const canonical = JSON.stringify({
        server_id: req.server_id,
        display_name: req.display_name.trim(),
        config_version: req.config_version,
        opens_at: new Date(req.opens_at).toISOString(),
        allow_new_characters: req.allow_new_characters === true,
        reason: req.reason.trim()
      });
      const previous = nk.sqlQuery("SELECT server_id,create_payload=$2::JSONB AS same FROM game_servers WHERE create_request_id=$1", [req.request_id, canonical]);
      if (previous.length) return previous[0].same ? JSON.stringify({ success: true, server_id: previous[0].server_id, replayed: true }) : serverFailure("REQUEST_ID_CONFLICT", 409, "Request ID already used with another payload");
      const release = nk.sqlQuery("SELECT 1 FROM remote_config_releases WHERE config_version=$1", [req.config_version]);
      if (!release.length) return serverFailure("CONFIG_NOT_FOUND", 409, "Published config release not found");
      const rows = nk.sqlQuery(`WITH created AS (
                INSERT INTO game_servers(server_id,display_name,status,opens_at,allow_new_characters,config_version,create_request_id,create_payload)
                VALUES($1,$2,'disabled',$3::TIMESTAMPTZ,$4,$5,$6,$7::JSONB) ON CONFLICT DO NOTHING RETURNING *
            ), audited AS (
                INSERT INTO server_operation_audit(server_id,actor_id,action,reason,after_revision)
                SELECT server_id,$8::UUID,'create',$9,revision FROM created RETURNING id
            ) SELECT server_id,generation,revision,status FROM created`, [
        req.server_id,
        req.display_name.trim(),
        req.opens_at,
        req.allow_new_characters === true,
        req.config_version,
        req.request_id,
        canonical,
        ctx.userId,
        req.reason.trim()
      ]);
      if (!rows.length) {
        const raced = nk.sqlQuery("SELECT server_id,create_payload=$2::JSONB AS same FROM game_servers WHERE create_request_id=$1", [req.request_id, canonical]);
        if (raced.length && raced[0].same) return JSON.stringify({ success: true, server_id: raced[0].server_id, replayed: true });
        return serverFailure("SERVER_EXISTS", 409, "Server ID or request ID already exists");
      }
      return JSON.stringify({ success: true, server: rows[0], replayed: false });
    }
    if (!Number.isSafeInteger(req.expected_revision) || req.expected_revision < 1) return serverFailure("REVISION_REQUIRED", 400, "Expected revision required");
    if (action === "expire_pending") {
      const rows = nk.sqlQuery(`WITH fenced AS (
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
            ) SELECT f.*,(SELECT COUNT(*) FROM orders) AS expired_orders,(SELECT COUNT(*) FROM ads) AS expired_ads FROM fenced f`, [req.server_id, req.expected_revision, ctx.userId, req.reason.trim()]);
      return rows.length ? JSON.stringify({ success: true, server: rows[0] }) : serverFailure("SERVER_NOT_DRAINED", 409, "Disable/drain and refresh revision first");
    }
    if (action === "disable") {
      const rows = nk.sqlQuery(`WITH changed AS (
                UPDATE game_servers SET status='disabled',revision=revision+1,updated_at=NOW()
                WHERE server_id=$1 AND revision=$2 AND status IN ('open','scheduled','maintenance','disabled')
                RETURNING server_id,generation,revision,status,active_requests
            ), audited AS (
                INSERT INTO server_operation_audit(server_id,actor_id,action,reason,before_revision,after_revision)
                SELECT server_id,$3::UUID,'disable',$4,$2,revision FROM changed RETURNING id
            ) SELECT * FROM changed`, [req.server_id, req.expected_revision, ctx.userId, req.reason.trim()]);
      return rows.length ? JSON.stringify({ success: true, server: rows[0], drained: Number(rows[0].active_requests) === 0 }) : serverFailure("REVISION_OR_STATE_CONFLICT", 409, "Server revision or state changed");
    }
    if (action === "enable") {
      if (!ctx.env || ctx.env.MULTI_SERVER_ENABLED !== "true") return serverFailure("FEATURE_DISABLED", 409, "Enable multi-server only after migration and acceptance");
      const rows = nk.sqlQuery(`WITH changed AS (
              UPDATE game_servers s SET status='open',revision=revision+1,updated_at=NOW()
              WHERE s.server_id=$1 AND s.revision=$2 AND s.status IN ('disabled','maintenance','scheduled') AND s.active_requests=0
                AND NOT EXISTS(SELECT 1 FROM server_lifecycle_jobs j WHERE j.server_id=s.server_id AND j.status<>'succeeded')
                AND EXISTS(SELECT 1 FROM remote_config_releases r WHERE r.config_version=s.config_version)
              RETURNING server_id,generation,revision,status
            ), audited AS (
              INSERT INTO server_operation_audit(server_id,actor_id,action,reason,before_revision,after_revision)
              SELECT server_id,$3::UUID,'enable',$4,$2,revision FROM changed RETURNING id
            ) SELECT * FROM changed`, [req.server_id, req.expected_revision, ctx.userId, req.reason.trim()]);
      return rows.length ? JSON.stringify({ success: true, server: rows[0] }) : serverFailure("REVISION_OR_STATE_CONFLICT", 409, "Server state, config or drain check failed");
    }
    if (action === "update") {
      if (typeof req.display_name !== "string" || !req.display_name.trim() || req.display_name.length > 100 || typeof req.allow_new_characters !== "boolean" || typeof req.opens_at !== "string" || !Number.isFinite(Date.parse(req.opens_at))) return serverFailure("INVALID_UPDATE", 400, "Name, opening time and admission flag required");
      const rows = nk.sqlQuery(`WITH changed AS (
              UPDATE game_servers SET display_name=$3,opens_at=$4::TIMESTAMPTZ,allow_new_characters=$5,
                revision=revision+1,updated_at=NOW() WHERE server_id=$1 AND revision=$2 AND status IN ('disabled','maintenance','scheduled','open')
              RETURNING server_id,generation,revision,status
            ), audited AS (
              INSERT INTO server_operation_audit(server_id,actor_id,action,reason,before_revision,after_revision)
              SELECT server_id,$6::UUID,'update',$7,$2,revision FROM changed RETURNING id
            ) SELECT * FROM changed`, [req.server_id, req.expected_revision, req.display_name.trim(), req.opens_at, req.allow_new_characters, ctx.userId, req.reason.trim()]);
      return rows.length ? JSON.stringify({ success: true, server: rows[0] }) : serverFailure("REVISION_OR_STATE_CONFLICT", 409, "Server revision or state changed");
    }
    return serverFailure("UNSUPPORTED_ACTION", 400, "Unsupported action");
  };
}
function rpcAdminServerList(c, l, n, p) {
  return accountGuardedRpc("admin_server_list", serverAdminHandler("list"))(c, l, n, p);
}
function rpcAdminServerInspect(c, l, n, p) {
  return accountGuardedRpc("admin_server_inspect", serverAdminHandler("inspect"))(c, l, n, p);
}
function rpcAdminServerCreate(c, l, n, p) {
  return accountGuardedRpc("admin_server_create", serverAdminHandler("create"))(c, l, n, p);
}
function rpcAdminServerDisable(c, l, n, p) {
  return accountGuardedRpc("admin_server_disable", serverAdminHandler("disable"))(c, l, n, p);
}
function rpcAdminServerEnable(c, l, n, p) {
  return accountGuardedRpc("admin_server_enable", serverAdminHandler("enable"))(c, l, n, p);
}
function rpcAdminServerUpdate(c, l, n, p) {
  return accountGuardedRpc("admin_server_update", serverAdminHandler("update"))(c, l, n, p);
}
function rpcAdminServerExpirePending(c, l, n, p) {
  return accountGuardedRpc("admin_server_expire_pending", serverAdminHandler("expire_pending"))(c, l, n, p);
}
function createServerLifecycleTables(nk) {
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
    END $life$;`, []);
  nk.sqlExec(`CREATE OR REPLACE FUNCTION server_lifecycle_manifest(sid TEXT,gen INT) RETURNS JSONB LANGUAGE plpgsql AS $manifest$
      BEGIN RETURN (SELECT jsonb_build_object(
        'storage',COALESCE((SELECT jsonb_agg(to_jsonb(o) ORDER BY collection,key,user_id) FROM
          (SELECT collection,key,user_id::TEXT,version,value,read,write FROM storage
           WHERE left(key,length(sid||':g'||gen||':'))=sid||':g'||gen||':'
           AND collection=ANY($1$COLLECTIONS$1$::TEXT[])) o),'[]'::JSONB),
        'unknown',COALESCE((SELECT jsonb_agg(jsonb_build_object('collection',collection,'key',key)) FROM storage
          WHERE left(key,length(sid||':g'||gen||':'))=sid||':g'||gen||':'
          AND NOT(collection=ANY($1$COLLECTIONS$1$::TEXT[]))),'[]'::JSONB),
        'characters',COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY account_id) FROM player_characters c WHERE server_id=sid AND generation=gen),'[]'::JSONB),
        'pending_financial',(SELECT COUNT(*) FROM monetization_purchase_orders WHERE target_server_id=sid AND target_generation=gen AND status='pending')+
          (SELECT COUNT(*) FROM monetization_ad_rewards WHERE target_server_id=sid AND target_generation=gen AND status IN ('prepared','verified')),
        'real_purchases',(SELECT COUNT(*) FROM monetization_purchases WHERE target_server_id=sid AND target_generation=gen AND purchase_token_hash NOT LIKE 'mock:%'),
        'weekly_periods',COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY period_id) FROM server_weekly_periods p WHERE server_id=sid AND generation=gen),'[]'::JSONB),
        'weekly_scores',COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY period_id,board_id,user_id) FROM server_weekly_scores p WHERE server_id=sid AND generation=gen),'[]'::JSONB),
        'weekly_awards',COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY period_id,board_id,user_id) FROM server_weekly_awards p WHERE server_id=sid AND generation=gen),'[]'::JSONB))); END;
    $manifest$;`.replace(/\$1\$COLLECTIONS\$1\$/g, "'{" + CHARACTER_COLLECTIONS.join(",") + "}'"), []);
}
function serverLifecycleHandler(action) {
  return (ctx, _logger, nk, payload) => {
    const denied = requireServerAdmin(ctx);
    if (denied) return denied;
    let req;
    try {
      req = serverRequest(payload);
    } catch (_e) {
      return serverFailure("INVALID_REQUEST", 400, "Invalid JSON");
    }
    try {
      if (action === "job" || action === "step") {
        const jobs = nk.sqlQuery(`SELECT j.*,p.action,p.generation,p.manifest FROM server_lifecycle_jobs j
                  JOIN server_operation_plans p ON p.id=j.plan_id WHERE j.id=$1::UUID`, [String(req.job_id || "")]);
        if (!jobs.length) return serverFailure("JOB_NOT_FOUND", 404, "Job not found");
        let job = jobs[0];
        if (action === "step" && job.status !== "succeeded") {
          const token = nk.uuidv4();
          const locked = nk.sqlQuery(`UPDATE server_lifecycle_jobs SET lease_token=$2::UUID,lease_until=NOW()+INTERVAL '5 minutes',
                      status='running',heartbeat=NOW(),error='' WHERE id=$1::UUID AND lease_token IS NULL RETURNING id`, [job.id, token]);
          if (!locked.length) return serverFailure("OPERATION_IN_PROGRESS", 409, "Another step holds the lease");
          try {
            const manifest = parseJsonb(job.manifest);
            const end = Math.min(Number(job.cursor) + 100, manifest.storage.length);
            for (let i = Number(job.cursor); i < end; i++) {
              const row = manifest.storage[i];
              const existing = nk.storageRead([{ collection: row.collection, key: row.key, userId: row.user_id }]);
              if (existing.length) {
                if (existing[0].version !== row.version) throw new Error("INTEGRITY_CHECK_FAILED");
                nk.storageDelete([{ collection: row.collection, key: row.key, userId: row.user_id, version: row.version }]);
              }
            }
            nk.sqlExec(`UPDATE server_lifecycle_jobs SET cursor=$3,heartbeat=NOW() WHERE id=$1::UUID AND lease_token=$2::UUID`, [job.id, token, end]);
            if (end === manifest.storage.length) {
              for (const board of ["cultivation_realm", "campaign_stage", "combat_power", "combat_power_v2", "best_wave", "most_kills", "total_wins"]) {
                nk.leaderboardDelete(job.server_id + ":g" + job.generation + ":" + board);
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
                              WHERE id IN(SELECT id FROM locked) RETURNING id`, [job.id, token, job.server_id, job.generation, job.action]);
            } else nk.sqlExec("UPDATE server_lifecycle_jobs SET lease_until=NULL,lease_token=NULL WHERE id=$1::UUID AND lease_token=$2::UUID", [job.id, token]);
          } catch (error) {
            nk.sqlExec(`UPDATE server_lifecycle_jobs SET status='blocked',error=$3,lease_until=NULL,lease_token=NULL WHERE id=$1::UUID AND lease_token=$2::UUID`, [job.id, token, String(error)]);
            throw error;
          }
        }
        const report = nk.sqlQuery("SELECT id,server_id,status,phase,cursor,error,created_at,finished_at FROM server_lifecycle_jobs WHERE id=$1::UUID", [job.id]);
        return JSON.stringify({ success: true, job: report[0] });
      }
      if (typeof req.server_id !== "string" || !/^[a-z][a-z0-9_]{0,31}$/.test(req.server_id) || !Number.isSafeInteger(req.expected_generation) || !Number.isSafeInteger(req.expected_revision) || ["reset", "delete", "cleanup"].indexOf(req.action) < 0) return serverFailure("INVALID_SCOPE", 400, "Explicit action, server, generation and revision required");
      if (action === "execute") {
        if (typeof req.request_id !== "string" || !/^[a-zA-Z0-9_-]{8,100}$/.test(req.request_id)) return serverFailure("REQUEST_ID_REQUIRED", 400, "Invalid request ID");
        const body = JSON.stringify({
          server_id: req.server_id,
          action: req.action,
          expected_generation: req.expected_generation,
          expected_revision: req.expected_revision,
          plan_id: req.plan_id,
          manifest_hash: req.manifest_hash
        });
        const rows2 = nk.sqlQuery("SELECT server_lifecycle_begin($1::UUID,$2::UUID,$3,$4::JSONB,$5::UUID) AS job", [req.plan_id, nk.uuidv4(), req.request_id, body, ctx.userId]);
        return JSON.stringify({ success: true, job: parseJsonb(rows2[0].job) });
      }
      if (typeof req.reason !== "string" || !req.reason.trim() || req.reason.length > 500) return serverFailure("REASON_REQUIRED", 400, "Reason required");
      const servers = nk.sqlQuery("SELECT * FROM game_servers WHERE server_id=$1", [req.server_id]);
      if (!servers.length) return serverFailure("SERVER_NOT_FOUND", 404, "Server not found");
      const server = servers[0];
      if (["disabled", "deleted"].indexOf(server.status) < 0 || Number(server.active_requests) !== 0) return serverFailure("SERVER_NOT_DRAINED", 409, "Disable and drain first");
      if (Number(server.revision) !== req.expected_revision || req.action !== "cleanup" && Number(server.generation) !== req.expected_generation || req.action === "cleanup" && req.expected_generation >= Number(server.generation) && server.status !== "deleted") return serverFailure("PLAN_STALE", 409, "Scope changed");
      if (server.status === "deleted" && req.action !== "cleanup") return serverFailure("SERVER_DELETED", 409, "Tombstone cannot be reused");
      const id = nk.uuidv4();
      const rows = nk.sqlQuery(`WITH m AS (SELECT server_lifecycle_manifest($2,$4) AS manifest)
              INSERT INTO server_operation_plans(id,server_id,action,generation,revision,actor_id,reason,manifest,manifest_hash)
              SELECT $1::UUID,$2,$3,$4,$5,$6::UUID,$7,manifest,encode(sha256(convert_to(manifest::TEXT,'UTF8')),'hex') FROM m
              RETURNING id AS plan_id,manifest_hash,expires_at,manifest`, [id, req.server_id, req.action, req.expected_generation, req.expected_revision, ctx.userId, req.reason.trim()]);
      const m = parseJsonb(rows[0].manifest);
      return JSON.stringify({
        success: true,
        plan_id: id,
        manifest_hash: rows[0].manifest_hash,
        expires_at: rows[0].expires_at,
        counts: { storage: m.storage.length, unknown: m.unknown.length, characters: m.characters.length, pending_financial: m.pending_financial, real_purchases: m.real_purchases },
        retained: ["account", "entitlement", "financial_ledger", "receipt_dedupe", "config_release", "generation_snapshot"]
      });
    } catch (error) {
      const message = String(error);
      const known = [
        "PLAN_EXPIRED",
        "PLAN_STALE",
        "OPERATION_IN_PROGRESS",
        "SERVER_NOT_DRAINED",
        "PENDING_FINANCIAL_DELIVERY",
        "GENERATION_MISMATCH",
        "INTEGRITY_CHECK_FAILED",
        "RETENTION_BLOCKED",
        "UNKNOWN_OWNERSHIP",
        "PAID_RESET_POLICY_REQUIRED",
        "REQUEST_ID_CONFLICT"
      ];
      return serverFailure(known.find((code) => message.indexOf(code) >= 0) || "LIFECYCLE_CONFLICT", 409, message);
    }
  };
}
function rpcAdminServerPlan(c, l, n, p) {
  return accountGuardedRpc("admin_server_plan", serverLifecycleHandler("plan"))(c, l, n, p);
}
function rpcAdminServerExecute(c, l, n, p) {
  return accountGuardedRpc("admin_server_execute", serverLifecycleHandler("execute"))(c, l, n, p);
}
function rpcAdminServerJob(c, l, n, p) {
  return accountGuardedRpc("admin_server_job", serverLifecycleHandler("job"))(c, l, n, p);
}
function rpcAdminServerJobStep(c, l, n, p) {
  return accountGuardedRpc("admin_server_job_step", serverLifecycleHandler("step"))(c, l, n, p);
}
function serverFinancialHandler(retry) {
  return (ctx, logger, nk, payload) => {
    const denied = requireServerAdmin(ctx);
    if (denied) return denied;
    let req;
    try {
      req = serverRequest(payload);
    } catch (_e) {
      return serverFailure("INVALID_REQUEST", 400, "Invalid JSON");
    }
    if (!retry) return JSON.stringify({ success: true, events: nk.sqlQuery(`SELECT event_id,event_type,user_id,target_server_id,target_generation,status,reason,created_at
          FROM server_financial_inbox WHERE status='pending' AND event_id>$1 ORDER BY event_id LIMIT 100`, [String(req.after || "")]) });
    const rows = nk.sqlQuery("SELECT * FROM server_financial_inbox WHERE event_id=$1 AND status='pending'", [String(req.event_id || "")]);
    if (!rows.length) return serverFailure("EVENT_NOT_PENDING", 404, "Pending event not found");
    const event = rows[0], body = parseJsonb(event.payload);
    if (event.event_type !== "admob_ssv") return serverFailure("RECONCILIATION_POLICY_REQUIRED", 409, "This financial event requires reviewed compensation/revocation, not reward replay");
    body.verifier_secret = String(ctx.env.MONETIZATION_VERIFIER_SECRET || "");
    const result = JSON.parse(withActiveAccount(nk, String(event.user_id), () => admobSsvConfirm(ctx, logger, nk, JSON.stringify(body))));
    if (result.status === "success" && result.data && result.data.granted === true) nk.sqlExec("UPDATE server_financial_inbox SET status='resolved' WHERE event_id=$1", [event.event_id]);
    return JSON.stringify({ success: result.status === "success", result });
  };
}
function rpcAdminServerFinancialList(c, l, n, p) {
  return accountGuardedRpc("admin_server_financial_list", serverFinancialHandler(false))(c, l, n, p);
}
function rpcAdminServerFinancialRetry(c, l, n, p) {
  return accountGuardedRpc("admin_server_financial_retry", serverFinancialHandler(true))(c, l, n, p);
}

const CHARACTER_COLLECTIONS = [
  "player_profiles",
  "player_inventory",
  "player_heroes",
  "player_stage_runs",
  "player_identity",
  "player_event_progress",
  "player_daily_checkin",
  "weekly_leaderboard_claims",
  "player_purchase_grants",
  "player_item_requests",
  "player_mail",
  "player_mail_deliveries"
];
function characterContext(nk) {
  return nk.__characterContext || null;
}
function characterRuntime(base, context) {
  const runtime = Object.create(base);
  runtime.__characterContext = Object.freeze(Object.assign({}, context));
  const shared = ["player_settings", "player_compliance_profiles", "player_entitlements"];
  const scoped = (collection) => CHARACTER_COLLECTIONS.indexOf(collection) >= 0;
  const allowed = (collection) => scoped(collection) || shared.indexOf(collection) >= 0;
  const observed = {};
  const identity = (ref) => (ref.userId || context.accountId) + "/" + ref.collection + "/" + ref.key;
  const encode = (ref, write) => {
    if (!allowed(ref.collection)) throw new Error("Unregistered Storage collection: " + ref.collection);
    const userId = ref.userId || context.accountId;
    if (write && userId !== context.accountId) throw new Error("Cross-account character write");
    return Object.assign(
      {},
      ref,
      { userId, key: scoped(ref.collection) ? characterStorageKey(context, ref.key) : ref.key },
      write && scoped(ref.collection) ? { permissionRead: 0, permissionWrite: 0 } : {}
    );
  };
  const decode = (row) => {
    if (!scoped(row.collection)) return row;
    const prefix = characterStorageKey(context, "_").slice(0, -1);
    if (row.key.indexOf(prefix) !== 0) throw new Error("Unexpected Storage scope");
    return Object.assign({}, row, { key: row.key.slice(prefix.length) });
  };
  runtime.storageRead = (refs) => {
    const rows = base.storageRead(refs.map((ref) => encode(ref, false))).map(decode);
    for (const ref of refs) observed[identity(ref)] = "*";
    for (const row of rows) observed[identity(row)] = row.version;
    return rows;
  };
  runtime.storageWrite = (writes) => base.storageWrite(writes.map((write) => {
    if (scoped(write.collection) && !write.version) {
      const version = observed[identity(write)];
      if (!version) throw new Error("Character write requires prior read or explicit version");
      write = Object.assign({}, write, { version });
    }
    return encode(write, true);
  })).map(decode).map((ack) => {
    observed[identity(ack)] = ack.version;
    return ack;
  });
  runtime.storageDelete = (refs) => base.storageDelete(refs.map((ref) => encode(ref, true)));
  const boards = ["best_wave", "most_kills", "total_wins", "cultivation_realm", "campaign_stage", "combat_power_v2"];
  const boardId = (id) => {
    if (boards.indexOf(id) < 0) throw new Error("Unknown character leaderboard");
    return context.serverId + ":g" + context.generation + ":" + id;
  };
  runtime.leaderboardRecordWrite = (id, ...args) => {
    const scopedId = boardId(id);
    base.leaderboardCreate(
      scopedId,
      true,
      "desc",
      id === "total_wins" ? "incr" : id === "combat_power_v2" ? "set" : "best",
      id === "combat_power_v2" ? "0 0 * * 1" : "",
      {}
    );
    return base.leaderboardRecordWrite.apply(base, [scopedId].concat(args));
  };
  for (const method of ["leaderboardRecordsList", "leaderboardRecordsHaystack", "leaderboardRecordDelete"]) {
    if (typeof base[method] === "function") runtime[method] = (id, ...args) => base[method].apply(base, [boardId(id)].concat(args));
  }
  return runtime;
}
function characterStorageKey(context, key) {
  if (!context.accountId || !/^[a-z][a-z0-9_]{0,31}$/.test(context.serverId) || !Number.isSafeInteger(context.generation) || context.generation < 1 || !key || key.length > 80)
    throw new Error("Invalid character Storage identity");
  return context.serverId + ":g" + context.generation + ":" + key;
}
function characterRead(nk, context, refs) {
  for (const ref of refs) if (CHARACTER_COLLECTIONS.indexOf(ref.collection) < 0) throw new Error("Collection is not character-owned");
  const prefix = characterStorageKey(context, "_").slice(0, -1);
  return nk.storageRead(refs.map((ref) => ({ collection: ref.collection, key: characterStorageKey(context, ref.key), userId: context.accountId }))).map((row) => Object.assign({}, row, { key: row.key.slice(prefix.length) }));
}
function characterWrite(nk, context, changes) {
  for (const change of changes) {
    if (CHARACTER_COLLECTIONS.indexOf(change.collection) < 0 || change.userId && change.userId !== context.accountId)
      throw new Error("Invalid character write scope");
    if (!change.version) throw new Error("Character writes require a version precondition");
  }
  const prefix = characterStorageKey(context, "_").slice(0, -1);
  const writes = changes.map((change) => Object.assign({}, change, {
    userId: context.accountId,
    key: characterStorageKey(context, change.key),
    permissionRead: 0,
    permissionWrite: 0
  }));
  return nk.storageWrite(writes).map((ack) => Object.assign({}, ack, { key: ack.key.slice(prefix.length) }));
}
const createServerCharacter = (ctx, _logger, nk, payload) => {
  if (!ctx.userId) return serverFailure("AUTH_REQUIRED", 401, "Authentication required");
  if (!ctx.env || ctx.env.MULTI_SERVER_ENABLED !== "true") return serverFailure("FEATURE_DISABLED", 409, "Multi-server is disabled");
  let req;
  try {
    req = serverRequest(payload);
  } catch (_e) {
    return serverFailure("INVALID_REQUEST", 400, "Invalid JSON");
  }
  const server = validatedServer(nk, req);
  if (server.error) return server.error;
  if (!server.allow_new_characters) return serverFailure("CHARACTER_CREATION_CLOSED", 409, "M\xE1y ch\u1EE7 t\u1EA1m ng\u1EEBng t\u1EA1o nh\xE2n v\u1EADt m\u1EDBi.");
  const reserved = nk.sqlQuery(`INSERT INTO player_characters(account_id,server_id,generation,status)
      SELECT $1::UUID,s.server_id,s.generation,'initializing' FROM game_servers s
      WHERE s.server_id=$2 AND s.generation=$3 AND s.status='open' AND s.opens_at<=NOW() AND s.allow_new_characters
      ON CONFLICT(account_id,server_id) DO UPDATE SET generation=EXCLUDED.generation,status='initializing',created_at=NOW(),last_entered_at=NULL
        WHERE player_characters.status='retired' AND player_characters.generation<EXCLUDED.generation
      RETURNING generation`, [ctx.userId, req.server_id, req.generation]);
  const existing = nk.sqlQuery("SELECT status,generation FROM player_characters WHERE account_id=$1::UUID AND server_id=$2", [ctx.userId, req.server_id]);
  if (!existing.length || Number(existing[0].generation) !== req.generation) return serverFailure("CHARACTER_NOT_READY", 409, "Vui l\xF2ng l\xE0m m\u1EDBi danh s\xE1ch m\xE1y ch\u1EE7.");
  if (existing[0].status === "ready") return JSON.stringify({ success: true, server_id: req.server_id, generation: req.generation, created: false });
  const context = { accountId: ctx.userId, serverId: req.server_id, generation: req.generation };
  const refs = [
    { collection: "player_profiles", key: "main" },
    { collection: "player_inventory", key: "items" },
    { collection: "player_heroes", key: "states" },
    { collection: "player_identity", key: "name" }
  ];
  const stored = characterRead(nk, context, refs);
  const name = "Tu Gi\u1EA3 " + nk.uuidv4().replace(/-/g, "").slice(0, 6).toUpperCase();
  const profile = defaultPlayerProfile(name);
  profile.server_id = context.serverId;
  profile.generation = context.generation;
  const values = {
    player_profiles: profile,
    player_inventory: { items: [], _iap_reward_ids: [] },
    player_heroes: { heroes: canonicalHeroStates(nk, {}) },
    player_identity: { display_name: name, name_changes_used: 0 }
  };
  const writes = refs.filter((ref) => !stored.some((row) => row.collection === ref.collection && row.key === ref.key)).map((ref) => ({ collection: ref.collection, key: ref.key, userId: ctx.userId, value: values[ref.collection], version: "*", permissionRead: 0, permissionWrite: 0 }));
  if (writes.length) characterWrite(nk, context, writes);
  nk.sqlExec(`UPDATE player_characters c SET status='ready' FROM game_servers s
      WHERE c.account_id=$1::UUID AND c.server_id=$2 AND c.generation=$3 AND c.status='initializing'
        AND s.server_id=c.server_id AND s.generation=c.generation AND s.status='open'`, [ctx.userId, req.server_id, req.generation]);
  return JSON.stringify({ success: true, server_id: req.server_id, generation: req.generation, created: reserved.length > 0 });
};

function createServerRegistryTables(nk) {
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
function withServerRequest(nk, context, action) {
  const lease = nk.sqlQuery(`UPDATE game_servers SET active_requests=active_requests+1
        WHERE server_id=$1 AND generation=$2 AND status='open' AND opens_at<=NOW() RETURNING server_id`, [context.serverId, context.generation]);
  if (!lease.length) throw new Error("SERVER_REQUEST_FENCED");
  try {
    return action();
  } finally {
    nk.sqlExec("UPDATE game_servers SET active_requests=active_requests-1 WHERE server_id=$1 AND active_requests>0", [context.serverId]);
  }
}
function serverFailure(reason, code, message) {
  return JSON.stringify({ success: false, status: "error", code, reason, message });
}
function serverRequest(payload) {
  const req = JSON.parse(payload || "{}");
  if (!req || typeof req !== "object" || Array.isArray(req)) throw new Error("Invalid request");
  return req;
}
function validatedServer(nk, req) {
  if (typeof req.server_id !== "string" || !/^[a-z][a-z0-9_]{0,31}$/.test(req.server_id))
    return { error: serverFailure("SERVER_REQUIRED", 400, "Vui l\xF2ng ch\u1ECDn m\xE1y ch\u1EE7.") };
  if (!Number.isSafeInteger(req.generation) || req.generation < 1)
    return { error: serverFailure("GENERATION_MISMATCH", 409, "Vui l\xF2ng ch\u1ECDn l\u1EA1i m\xE1y ch\u1EE7.") };
  const rows = nk.sqlQuery(`SELECT *, opens_at<=NOW() AS has_opened FROM game_servers WHERE server_id=$1`, [req.server_id]);
  if (!rows.length || rows[0].status === "deleted") return { error: serverFailure("SERVER_NOT_FOUND", 404, "M\xE1y ch\u1EE7 kh\xF4ng t\u1ED3n t\u1EA1i.") };
  const server = rows[0];
  if (Number(server.generation) !== req.generation) return { error: serverFailure("GENERATION_MISMATCH", 409, "M\xE1y ch\u1EE7 \u0111\xE3 thay \u0111\u1ED5i. Vui l\xF2ng ch\u1ECDn l\u1EA1i.") };
  if (server.status !== "open" || !server.has_opened) return { error: serverFailure("SERVER_UNAVAILABLE", 409, "M\xE1y ch\u1EE7 ch\u01B0a m\u1EDF ho\u1EB7c \u0111ang b\u1EA3o tr\xEC.") };
  return server;
}
const listGameServers = (ctx, _logger, nk) => {
  if (!ctx.userId) return serverFailure("AUTH_REQUIRED", 401, "Authentication required");
  if (!ctx.env || ctx.env.MULTI_SERVER_ENABLED !== "true") return JSON.stringify({ success: true, server_mode: "legacy", servers: [], last_server_id: "" });
  const servers = nk.sqlQuery(`SELECT s.server_id,s.display_name,s.status,s.generation,s.revision,
      EXTRACT(EPOCH FROM s.opens_at)*1000 AS opens_at_ms,EXTRACT(EPOCH FROM s.created_at)*1000 AS created_at_ms,s.allow_new_characters,
      (s.status='open' AND s.opens_at<=NOW()) AS available,
      COALESCE(c.status='ready' AND c.generation=s.generation,FALSE) AS has_character,
      CASE WHEN c.status='ready' AND c.generation=s.generation THEN p.value->>'display_name' END AS character_name,
      CASE WHEN c.status='ready' AND c.generation=s.generation THEN COALESCE((p.value->>'level')::INT,1) END AS character_level
      FROM game_servers s LEFT JOIN player_characters c ON c.server_id=s.server_id AND c.account_id=$1::UUID
      LEFT JOIN storage p ON p.user_id=c.account_id AND p.collection='player_profiles'
        AND p.key=s.server_id||':g'||s.generation||':main'
      WHERE s.status NOT IN ('deleted','provisioning','failed') ORDER BY s.created_at DESC,s.server_id DESC`, [ctx.userId]);
  const prefs = nk.sqlQuery("SELECT last_server_id FROM player_server_preferences WHERE account_id=$1::UUID", [ctx.userId]);
  return JSON.stringify({ success: true, server_mode: "multi", servers, last_server_id: prefs.length ? prefs[0].last_server_id : "" });
};
const listMyCharacters = (ctx, _logger, nk) => {
  if (!ctx.userId) return serverFailure("AUTH_REQUIRED", 401, "Authentication required");
  return JSON.stringify({ success: true, characters: nk.sqlQuery(`SELECT c.server_id,c.generation,c.status,c.created_at,c.last_entered_at,s.display_name
      FROM player_characters c JOIN game_servers s ON s.server_id=c.server_id WHERE c.account_id=$1::UUID AND s.status<>'deleted' ORDER BY c.created_at`, [ctx.userId]) });
};
const enterGameServer = (ctx, _logger, nk, payload) => {
  if (!ctx.userId) return serverFailure("AUTH_REQUIRED", 401, "Authentication required");
  let req;
  try {
    req = serverRequest(payload);
  } catch (_e) {
    return serverFailure("INVALID_REQUEST", 400, "Invalid JSON");
  }
  const server = validatedServer(nk, req);
  if (server.error) return server.error;
  const chars = nk.sqlQuery(`SELECT status,generation FROM player_characters WHERE account_id=$1::UUID AND server_id=$2`, [ctx.userId, req.server_id]);
  if (!chars.length) return serverFailure("CHARACTER_NOT_FOUND", 404, "Ch\u01B0a c\xF3 nh\xE2n v\u1EADt tr\xEAn m\xE1y ch\u1EE7 n\xE0y.");
  if (chars[0].status !== "ready" || Number(chars[0].generation) !== req.generation)
    return serverFailure("CHARACTER_NOT_READY", 409, "Nh\xE2n v\u1EADt ch\u01B0a s\u1EB5n s\xE0ng.");
  if (ctx.env && ctx.env.MULTI_SERVER_ENABLED === "true") repairMultiLinkBoards(nk, ctx.userId, req.server_id, req.generation);
  nk.sqlExec(`UPDATE player_characters SET last_entered_at=NOW() WHERE account_id=$1::UUID AND server_id=$2 AND generation=$3`, [ctx.userId, req.server_id, req.generation]);
  nk.sqlExec(`INSERT INTO player_server_preferences(account_id,last_server_id) VALUES($1::UUID,$2)
      ON CONFLICT(account_id) DO UPDATE SET last_server_id=EXCLUDED.last_server_id`, [ctx.userId, req.server_id]);
  return JSON.stringify({ success: true, server_id: server.server_id, generation: Number(server.generation), display_name: server.display_name, revision: Number(server.revision) });
};
function serverAdmissionRpc(id, handler) {
  const accountOnly = [
    "session_status",
    "admin_test_access",
    "account_password_status",
    "setup_account_password",
    "google_link_status",
    "prepare_google_link",
    "confirm_google_link",
    "save_compliance_profile",
    "get_compliance_profile",
    "seed_game_data",
    "publish_config_release",
    "resolve_purchase_order"
  ];
  if (accountOnly.indexOf(id) >= 0 || (id.indexOf("admin_server_") === 0 || id.indexOf("mail_admin_") === 0) || id === "list_servers" || id === "list_my_characters" || id === "enter_server") return handler;
  return (ctx, logger, nk, payload) => {
    if (id === "admob_ssv_confirm" || id === "google_play_rtdn_confirm") return handler(ctx, logger, nk, payload);
    if (!ctx.userId) return handler(ctx, logger, nk, payload);
    if (!ctx.env || ctx.env.MULTI_SERVER_ENABLED !== "true") return handler(ctx, logger, nk, payload);
    let req;
    try {
      req = serverRequest(payload);
    } catch (_e) {
      return serverFailure("INVALID_REQUEST", 400, "Invalid JSON");
    }
    const server = validatedServer(nk, req);
    if (server.error) return server.error;
    const context = { accountId: ctx.userId, serverId: req.server_id, generation: req.generation };
    if (id === "create_character") {
      try {
        return withServerRequest(nk, context, () => handler(ctx, logger, nk, payload));
      } catch (error) {
        if (String(error).indexOf("SERVER_REQUEST_FENCED") >= 0) return serverFailure("SERVER_UNAVAILABLE", 409, "M\xE1y ch\u1EE7 \u0111\xE3 ng\u1EEBng nh\u1EADn thao t\xE1c.");
        throw error;
      }
    }
    const chars = nk.sqlQuery("SELECT 1 FROM player_characters WHERE account_id=$1::UUID AND server_id=$2 AND generation=$3 AND status='ready'", [ctx.userId, req.server_id, req.generation]);
    if (!chars.length) return serverFailure("CHARACTER_NOT_READY", 409, "Nh\xE2n v\u1EADt ch\u01B0a s\u1EB5n s\xE0ng.");
    if (id === "confirm_rewarded_ad" || id === "consume_ad_gameplay_reward") {
      const sessions = nk.sqlQuery("SELECT target_server_id,target_generation FROM monetization_ad_rewards WHERE ad_session_id=$1 AND user_id=$2", [String(req.ad_session_id || ""), ctx.userId]);
      if (!sessions.length || sessions[0].target_server_id !== context.serverId || Number(sessions[0].target_generation) !== context.generation)
        return serverFailure("AD_TARGET_MISMATCH", 409, "Ad session belongs to another character");
    }
    const runtime = characterRuntime(nk, context);
    try {
      return withServerRequest(nk, context, () => handler(ctx, logger, runtime, payload));
    } catch (error) {
      if (String(error).indexOf("SERVER_REQUEST_FENCED") >= 0) return serverFailure("SERVER_UNAVAILABLE", 409, "M\xE1y ch\u1EE7 \u0111\xE3 ng\u1EEBng nh\u1EADn thao t\xE1c.");
      throw error;
    }
  };
}

function seedExtensionColumns() {
  return {
    "heroes": {
      "basic_attack_range": "REAL"
    },
    "arcs": {
      "boss_skill_ids": "JSONB",
      "enemy_visual_scale_multiplier": "REAL"
    },
    "stages": {
      "boss_skill_ids": "JSONB",
      "boss_skill_entry_indexes": "JSONB",
      "fragment_drop": "JSONB",
      "spawn_sequence": "JSONB",
      "stage_rules": "JSONB"
    },
    "cards": {
      "min_hero_level": "INT",
      "tier": "TEXT",
      "selection_weight": "REAL",
      "support_family": "TEXT"
    },
    "talismans": {
      "item_id": "TEXT",
      "skill_id": "TEXT",
      "category": "TEXT",
      "quality": "TEXT",
      "severe_repair_item_id": "TEXT",
      "stat_growth": "JSONB",
      "max_battle_uses": "INT",
      "durability_cost_per_cast": "INT",
      "durability_cost_per_battle": "INT",
      "repair_cost_per_point": "INT",
      "severe_repair_item_quantity": "INT"
    },
    "skills": {
      "metadata": "JSONB"
    }
  };
}
function createGameConfigTables(nk, logger) {
  nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS game_heroes (
            id              TEXT PRIMARY KEY,
            display_name    TEXT NOT NULL,
            role            TEXT DEFAULT '',
            element         TEXT DEFAULT '',
            description     TEXT DEFAULT '',
            auto_basic_attack BOOLEAN DEFAULT true,
            visual_scale    REAL DEFAULT 1.0,
            price           JSONB DEFAULT '{}',
            require         JSONB DEFAULT '{}',
            attributes      JSONB NOT NULL DEFAULT '{}',
            level_up_stats  JSONB DEFAULT '{}',
            starting_skills JSONB DEFAULT '[]',
            skill_pool      JSONB DEFAULT '[]',
            created_at      TIMESTAMPTZ DEFAULT NOW(),
            updated_at      TIMESTAMPTZ DEFAULT NOW()
        )
    `, []);
  try {
    nk.sqlExec("ALTER TABLE game_heroes ADD COLUMN IF NOT EXISTS visual_scale REAL DEFAULT 1.0", []);
  } catch (e) {
  }
  nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS game_enemies (
            id              TEXT PRIMARY KEY,
            display_name    TEXT NOT NULL,
            element         TEXT DEFAULT '',
            attack_type     TEXT DEFAULT 'melee',
            visual_scale    REAL DEFAULT 0.364,
            boss_visual_scale REAL DEFAULT 0.442,
            exp             INT DEFAULT 0,
            is_boss         BOOLEAN DEFAULT false,
            boss_scale      REAL DEFAULT 1.0,
            attributes      JSONB NOT NULL DEFAULT '{}',
            skills          JSONB DEFAULT '[]',
            attack_effects  JSONB DEFAULT '[]',
            generic_skills  JSONB DEFAULT '[]',
            boss_skills     JSONB DEFAULT '[]',
            reward          JSONB DEFAULT '{}',
            created_at      TIMESTAMPTZ DEFAULT NOW(),
            updated_at      TIMESTAMPTZ DEFAULT NOW()
        )
    `, []);
  nk.sqlExec("ALTER TABLE game_enemies ADD COLUMN IF NOT EXISTS generic_skills JSONB DEFAULT '[]'", []);
  nk.sqlExec("ALTER TABLE game_enemies ADD COLUMN IF NOT EXISTS attack_effects JSONB DEFAULT '[]'", []);
  nk.sqlExec("ALTER TABLE game_enemies ADD COLUMN IF NOT EXISTS visual_scale REAL DEFAULT 0.364", []);
  nk.sqlExec("ALTER TABLE game_enemies ADD COLUMN IF NOT EXISTS boss_visual_scale REAL DEFAULT 0.442", []);
  nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS game_items (
            id                  TEXT PRIMARY KEY,
            display_name        TEXT NOT NULL,
            description         TEXT DEFAULT '',
            category            TEXT DEFAULT '',
            rarity              TEXT DEFAULT 'common',
            icon_id             TEXT DEFAULT '',
            stackable           BOOLEAN DEFAULT true,
            max_stack           INT DEFAULT 999,
            sort_order          INT DEFAULT 0,
            expires_after_hours INT DEFAULT 0,
            tags                JSONB DEFAULT '[]',
            attributes          JSONB DEFAULT '{}',
            created_at          TIMESTAMPTZ DEFAULT NOW(),
            updated_at          TIMESTAMPTZ DEFAULT NOW()
        )
    `, []);
  nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS game_skills (
            id              TEXT PRIMARY KEY,
            display_name    TEXT NOT NULL,
            category        TEXT DEFAULT 'combat',
            skill_class     TEXT DEFAULT '',
            activation      TEXT DEFAULT 'auto',
            skill_type      TEXT DEFAULT '',
            element         TEXT DEFAULT '',
            description     TEXT DEFAULT '',
            positioning     JSONB DEFAULT '{}',
            deployment      JSONB DEFAULT '{}',
            vfx_frames      JSONB DEFAULT '[]',
            cast_config     JSONB DEFAULT '{}',
            description_rows JSONB DEFAULT '[]',
            criteria_unlock JSONB DEFAULT '{}',
			hero_level_unlock INT NOT NULL DEFAULT 1,
            levels          JSONB NOT NULL DEFAULT '[]',
            created_at      TIMESTAMPTZ DEFAULT NOW(),
            updated_at      TIMESTAMPTZ DEFAULT NOW()
        )
    `, []);
  nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS game_arcs (
            id              TEXT PRIMARY KEY,
            display_name    TEXT NOT NULL,
            description     TEXT DEFAULT '',
            level_min       INT DEFAULT 1,
            level_max       INT DEFAULT 10,
            element         TEXT DEFAULT '',
            sort_order      INT DEFAULT 0,
            enabled_if      JSONB DEFAULT '{}',
            stage_ids       JSONB DEFAULT '[]',
            created_at      TIMESTAMPTZ DEFAULT NOW()
        )
    `, []);
  try {
    nk.sqlExec("ALTER TABLE game_arcs ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0", []);
  } catch (e) {
  }
  nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS game_stages (
            id              TEXT PRIMARY KEY,
            arc_id          TEXT NOT NULL,
            level           INT DEFAULT 1,
            display_name    TEXT NOT NULL,
            description     TEXT DEFAULT '',
            sort_order      INT DEFAULT 0,
            exp_weight      REAL DEFAULT 1.0,
			is_boss         BOOLEAN DEFAULT false,
            background      TEXT DEFAULT '',
            music           TEXT DEFAULT '',
            enabled_if      JSONB DEFAULT '{}',
            difficulty_levels JSONB DEFAULT '[]',
            loot_table      JSONB DEFAULT '[]',
            created_at      TIMESTAMPTZ DEFAULT NOW(),
            updated_at      TIMESTAMPTZ DEFAULT NOW()
        )
    `, []);
  try {
    nk.sqlExec("ALTER TABLE game_stages ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0", []);
  } catch (e) {
  }
  try {
    nk.sqlExec("ALTER TABLE game_stages ADD COLUMN IF NOT EXISTS difficulty_levels JSONB DEFAULT '[]'", []);
  } catch (e) {
  }
  nk.sqlExec("ALTER TABLE game_stages ADD COLUMN IF NOT EXISTS is_boss BOOLEAN DEFAULT false", []);
  nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS game_stage_waves (
            id              SERIAL PRIMARY KEY,
            stage_id        TEXT NOT NULL,
            wave_index      INT NOT NULL,
            wave_id         TEXT DEFAULT '',
            display_name    TEXT DEFAULT '',
            entries         JSONB NOT NULL DEFAULT '[]',
            UNIQUE(stage_id, wave_index)
        )
    `, []);
  nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS game_stage_levels (
            id                  TEXT PRIMARY KEY,
            stage_id            TEXT NOT NULL REFERENCES game_stages(id) ON DELETE CASCADE,
            level_id            TEXT NOT NULL,
            display_name        TEXT NOT NULL,
            description         TEXT DEFAULT '',
            sort_order          INT DEFAULT 0,
            recommended_power   INT DEFAULT 0,
            exp_multiplier      REAL DEFAULT 1.0,
			stamina_cost        INT DEFAULT 1,
			gold_reward         INT DEFAULT 0,
            enemy_modifiers     JSONB DEFAULT '{}',
            loot_table          JSONB DEFAULT '[]',
			boss_loot_table     JSONB DEFAULT '[]',
            unlock_condition    JSONB DEFAULT '{}',
            stage_rules         JSONB DEFAULT '{}',
            ui                  JSONB DEFAULT '{}',
            created_at          TIMESTAMPTZ DEFAULT NOW(),
            updated_at          TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(stage_id, level_id)
        )
    `, []);
  nk.sqlExec("ALTER TABLE game_stage_levels ADD COLUMN IF NOT EXISTS stamina_cost INT DEFAULT 1", []);
  nk.sqlExec("ALTER TABLE game_stage_levels ADD COLUMN IF NOT EXISTS gold_reward INT DEFAULT 0", []);
  nk.sqlExec("ALTER TABLE game_stage_levels ADD COLUMN IF NOT EXISTS boss_loot_table JSONB DEFAULT '[]'", []);
  nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS game_cards (
            id              TEXT PRIMARY KEY,
            display_name    TEXT NOT NULL,
            card_type       TEXT DEFAULT '',
            rarity          TEXT DEFAULT 'common',
            icon_id         TEXT DEFAULT '',
            description     TEXT DEFAULT '',
            effect_description TEXT DEFAULT '',
            effect          JSONB DEFAULT '{}',
            created_at      TIMESTAMPTZ DEFAULT NOW()
        )
    `, []);
  nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS game_effects (
            id              TEXT PRIMARY KEY,
            display_name    TEXT NOT NULL,
            description     TEXT DEFAULT '',
            default_props   JSONB DEFAULT '{}',
			metadata        JSONB DEFAULT '{}',
            created_at      TIMESTAMPTZ DEFAULT NOW()
        )
    `, []);
  nk.sqlExec(`ALTER TABLE game_skills ADD COLUMN IF NOT EXISTS element TEXT DEFAULT ''`, []);
  nk.sqlExec(`ALTER TABLE game_skills ADD COLUMN IF NOT EXISTS cast_config JSONB DEFAULT '{}'`, []);
  nk.sqlExec(`ALTER TABLE game_skills ADD COLUMN IF NOT EXISTS description_rows JSONB DEFAULT '[]'`, []);
  nk.sqlExec(`ALTER TABLE game_skills ADD COLUMN IF NOT EXISTS hero_level_unlock INT NOT NULL DEFAULT 1`, []);
  nk.sqlExec("ALTER TABLE game_effects ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'", []);
  nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS game_talismans (
            id              INT PRIMARY KEY,
            display_name    TEXT NOT NULL,
            tier            TEXT DEFAULT '',
            element         TEXT DEFAULT 'metal',
            type            TEXT DEFAULT 'attack',
            level           INT DEFAULT 1,
            max_level       INT DEFAULT 30,
            is_equipped     BOOLEAN DEFAULT false,
            description     TEXT DEFAULT '',
            skill           TEXT DEFAULT '',
            stats           JSONB NOT NULL DEFAULT '{}',
            upgrade_exp     INT DEFAULT 0,
            upgrade_max_exp INT DEFAULT 20,
            materials       JSONB DEFAULT '[]',
            created_at      TIMESTAMPTZ DEFAULT NOW(),
            updated_at      TIMESTAMPTZ DEFAULT NOW()
        )
    `, []);
  try {
    nk.sqlExec("ALTER TABLE game_talismans ADD COLUMN IF NOT EXISTS element TEXT DEFAULT 'metal'", []);
  } catch (e) {
  }
  nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS game_config (
            key             TEXT PRIMARY KEY,
            value           JSONB NOT NULL DEFAULT '{}',
            updated_at      TIMESTAMPTZ DEFAULT NOW()
        )
    `, []);
  nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS game_content_configs (
            id          TEXT PRIMARY KEY,
            payload     JSONB NOT NULL DEFAULT '{}',
            active      BOOLEAN NOT NULL DEFAULT TRUE,
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `, []);
  nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS remote_config_settings (
            module TEXT NOT NULL CHECK (module IN ('system', 'game_play')),
            key TEXT NOT NULL,
            value_type TEXT NOT NULL CHECK (value_type IN ('int', 'float', 'bool', 'string', 'json')),
            value TEXT NOT NULL,
            description TEXT DEFAULT '',
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_by TEXT DEFAULT '',
            PRIMARY KEY (module, key)
        )
    `, []);
  nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS remote_config_releases (
            config_version INT PRIMARY KEY,
            snapshot JSONB NOT NULL,
            min_app_version TEXT NOT NULL,
            latest_app_version TEXT NOT NULL,
            store_url TEXT NOT NULL DEFAULT '',
            published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            published_by TEXT NOT NULL DEFAULT 'system'
        )
    `, []);
  const defaultSettings = {
    system: {
      stage_sweep: SWEEP_DEFAULTS,
      min_app_version: "1.0.0",
      latest_app_version: "1.0.0",
      supported_languages: ["vi", "en"],
      default_language: "vi",
      stamina_regen_interval_sec: 300,
      stamina_regen_amount: 1,
      ads_enabled: false,
      ads_interval_sec: 120,
      payment_enabled: false,
      leaderboard_rewards: { "schema_version": 1, "enabled": true, "claim_days": 30, "boards": { "cultivation_realm": { "enabled": true, "tiers": [{ "from": 1, "to": 1, "rewards": [{ "type": "resource", "id": "gems", "amount": 300 }, { "type": "resource", "id": "gold", "amount": 1e5 }, { "type": "item", "id": "element_enlightenment_charm", "amount": 3 }] }, { "from": 2, "to": 2, "rewards": [{ "type": "resource", "id": "gems", "amount": 250 }, { "type": "resource", "id": "gold", "amount": 9e4 }, { "type": "item", "id": "element_enlightenment_charm", "amount": 3 }] }, { "from": 3, "to": 3, "rewards": [{ "type": "resource", "id": "gems", "amount": 220 }, { "type": "resource", "id": "gold", "amount": 8e4 }, { "type": "item", "id": "element_enlightenment_charm", "amount": 2 }] }, { "from": 4, "to": 4, "rewards": [{ "type": "resource", "id": "gems", "amount": 200 }, { "type": "resource", "id": "gold", "amount": 75e3 }, { "type": "item", "id": "element_enlightenment_charm", "amount": 2 }] }, { "from": 5, "to": 5, "rewards": [{ "type": "resource", "id": "gems", "amount": 180 }, { "type": "resource", "id": "gold", "amount": 7e4 }, { "type": "item", "id": "element_enlightenment_charm", "amount": 2 }] }, { "from": 6, "to": 6, "rewards": [{ "type": "resource", "id": "gems", "amount": 160 }, { "type": "resource", "id": "gold", "amount": 65e3 }, { "type": "item", "id": "element_enlightenment_charm", "amount": 2 }] }, { "from": 7, "to": 7, "rewards": [{ "type": "resource", "id": "gems", "amount": 140 }, { "type": "resource", "id": "gold", "amount": 6e4 }, { "type": "item", "id": "element_enlightenment_charm", "amount": 1 }] }, { "from": 8, "to": 8, "rewards": [{ "type": "resource", "id": "gems", "amount": 120 }, { "type": "resource", "id": "gold", "amount": 55e3 }, { "type": "item", "id": "element_enlightenment_charm", "amount": 1 }] }, { "from": 9, "to": 9, "rewards": [{ "type": "resource", "id": "gems", "amount": 110 }, { "type": "resource", "id": "gold", "amount": 5e4 }, { "type": "item", "id": "element_enlightenment_charm", "amount": 1 }] }, { "from": 10, "to": 10, "rewards": [{ "type": "resource", "id": "gems", "amount": 100 }, { "type": "resource", "id": "gold", "amount": 45e3 }, { "type": "item", "id": "element_enlightenment_charm", "amount": 1 }] }, { "from": 11, "to": 50, "rewards": [{ "type": "resource", "id": "gems", "amount": 80 }, { "type": "resource", "id": "gold", "amount": 35e3 }, { "type": "item", "id": "element_enlightenment_charm", "amount": 1 }] }, { "from": 51, "to": 200, "rewards": [{ "type": "resource", "id": "gems", "amount": 50 }, { "type": "resource", "id": "gold", "amount": 25e3 }, { "type": "item", "id": "element_enlightenment_charm", "amount": 1 }] }, { "from": 201, "to": 500, "rewards": [{ "type": "resource", "id": "gems", "amount": 30 }, { "type": "resource", "id": "gold", "amount": 15e3 }] }] }, "campaign_stage": { "enabled": true, "tiers": [{ "from": 1, "to": 1, "rewards": [{ "type": "resource", "id": "gems", "amount": 300 }, { "type": "resource", "id": "gold", "amount": 1e5 }, { "type": "random_item", "pool": ["talisman_fragment_1", "talisman_fragment_2", "talisman_fragment_3", "talisman_fragment_4", "talisman_fragment_5", "talisman_fragment_6", "talisman_fragment_7", "talisman_fragment_8", "talisman_fragment_9", "talisman_fragment_10", "talisman_fragment_11", "talisman_fragment_12", "talisman_fragment_13", "talisman_fragment_14", "talisman_fragment_15"], "amount": 15 }] }, { "from": 2, "to": 2, "rewards": [{ "type": "resource", "id": "gems", "amount": 250 }, { "type": "resource", "id": "gold", "amount": 9e4 }, { "type": "random_item", "pool": ["talisman_fragment_1", "talisman_fragment_2", "talisman_fragment_3", "talisman_fragment_4", "talisman_fragment_5", "talisman_fragment_6", "talisman_fragment_7", "talisman_fragment_8", "talisman_fragment_9", "talisman_fragment_10", "talisman_fragment_11", "talisman_fragment_12", "talisman_fragment_13", "talisman_fragment_14", "talisman_fragment_15"], "amount": 12 }] }, { "from": 3, "to": 3, "rewards": [{ "type": "resource", "id": "gems", "amount": 220 }, { "type": "resource", "id": "gold", "amount": 8e4 }, { "type": "random_item", "pool": ["talisman_fragment_1", "talisman_fragment_2", "talisman_fragment_3", "talisman_fragment_4", "talisman_fragment_5", "talisman_fragment_6", "talisman_fragment_7", "talisman_fragment_8", "talisman_fragment_9", "talisman_fragment_10", "talisman_fragment_11", "talisman_fragment_12", "talisman_fragment_13", "talisman_fragment_14", "talisman_fragment_15"], "amount": 10 }] }, { "from": 4, "to": 4, "rewards": [{ "type": "resource", "id": "gems", "amount": 200 }, { "type": "resource", "id": "gold", "amount": 75e3 }, { "type": "random_item", "pool": ["talisman_fragment_1", "talisman_fragment_2", "talisman_fragment_3", "talisman_fragment_4", "talisman_fragment_5", "talisman_fragment_6", "talisman_fragment_7", "talisman_fragment_8", "talisman_fragment_9", "talisman_fragment_10", "talisman_fragment_11", "talisman_fragment_12", "talisman_fragment_13", "talisman_fragment_14", "talisman_fragment_15"], "amount": 9 }] }, { "from": 5, "to": 5, "rewards": [{ "type": "resource", "id": "gems", "amount": 180 }, { "type": "resource", "id": "gold", "amount": 7e4 }, { "type": "random_item", "pool": ["talisman_fragment_1", "talisman_fragment_2", "talisman_fragment_3", "talisman_fragment_4", "talisman_fragment_5", "talisman_fragment_6", "talisman_fragment_7", "talisman_fragment_8", "talisman_fragment_9", "talisman_fragment_10", "talisman_fragment_11", "talisman_fragment_12", "talisman_fragment_13", "talisman_fragment_14", "talisman_fragment_15"], "amount": 8 }] }, { "from": 6, "to": 6, "rewards": [{ "type": "resource", "id": "gems", "amount": 160 }, { "type": "resource", "id": "gold", "amount": 65e3 }, { "type": "random_item", "pool": ["talisman_fragment_1", "talisman_fragment_2", "talisman_fragment_3", "talisman_fragment_4", "talisman_fragment_5", "talisman_fragment_6", "talisman_fragment_7", "talisman_fragment_8", "talisman_fragment_9", "talisman_fragment_10", "talisman_fragment_11", "talisman_fragment_12", "talisman_fragment_13", "talisman_fragment_14", "talisman_fragment_15"], "amount": 7 }] }, { "from": 7, "to": 7, "rewards": [{ "type": "resource", "id": "gems", "amount": 140 }, { "type": "resource", "id": "gold", "amount": 6e4 }, { "type": "random_item", "pool": ["talisman_fragment_1", "talisman_fragment_2", "talisman_fragment_3", "talisman_fragment_4", "talisman_fragment_5", "talisman_fragment_6", "talisman_fragment_7", "talisman_fragment_8", "talisman_fragment_9", "talisman_fragment_10", "talisman_fragment_11", "talisman_fragment_12", "talisman_fragment_13", "talisman_fragment_14", "talisman_fragment_15"], "amount": 6 }] }, { "from": 8, "to": 8, "rewards": [{ "type": "resource", "id": "gems", "amount": 120 }, { "type": "resource", "id": "gold", "amount": 55e3 }, { "type": "random_item", "pool": ["talisman_fragment_1", "talisman_fragment_2", "talisman_fragment_3", "talisman_fragment_4", "talisman_fragment_5", "talisman_fragment_6", "talisman_fragment_7", "talisman_fragment_8", "talisman_fragment_9", "talisman_fragment_10", "talisman_fragment_11", "talisman_fragment_12", "talisman_fragment_13", "talisman_fragment_14", "talisman_fragment_15"], "amount": 5 }] }, { "from": 9, "to": 9, "rewards": [{ "type": "resource", "id": "gems", "amount": 110 }, { "type": "resource", "id": "gold", "amount": 5e4 }, { "type": "random_item", "pool": ["talisman_fragment_1", "talisman_fragment_2", "talisman_fragment_3", "talisman_fragment_4", "talisman_fragment_5", "talisman_fragment_6", "talisman_fragment_7", "talisman_fragment_8", "talisman_fragment_9", "talisman_fragment_10", "talisman_fragment_11", "talisman_fragment_12", "talisman_fragment_13", "talisman_fragment_14", "talisman_fragment_15"], "amount": 4 }] }, { "from": 10, "to": 10, "rewards": [{ "type": "resource", "id": "gems", "amount": 100 }, { "type": "resource", "id": "gold", "amount": 45e3 }, { "type": "random_item", "pool": ["talisman_fragment_1", "talisman_fragment_2", "talisman_fragment_3", "talisman_fragment_4", "talisman_fragment_5", "talisman_fragment_6", "talisman_fragment_7", "talisman_fragment_8", "talisman_fragment_9", "talisman_fragment_10", "talisman_fragment_11", "talisman_fragment_12", "talisman_fragment_13", "talisman_fragment_14", "talisman_fragment_15"], "amount": 3 }] }, { "from": 11, "to": 50, "rewards": [{ "type": "resource", "id": "gems", "amount": 80 }, { "type": "resource", "id": "gold", "amount": 35e3 }, { "type": "random_item", "pool": ["talisman_fragment_1", "talisman_fragment_2", "talisman_fragment_3", "talisman_fragment_4", "talisman_fragment_5", "talisman_fragment_6", "talisman_fragment_7", "talisman_fragment_8", "talisman_fragment_9", "talisman_fragment_10", "talisman_fragment_11", "talisman_fragment_12", "talisman_fragment_13", "talisman_fragment_14", "talisman_fragment_15"], "amount": 3 }] }, { "from": 51, "to": 200, "rewards": [{ "type": "resource", "id": "gems", "amount": 50 }, { "type": "resource", "id": "gold", "amount": 25e3 }, { "type": "random_item", "pool": ["talisman_fragment_1", "talisman_fragment_2", "talisman_fragment_3", "talisman_fragment_4", "talisman_fragment_5", "talisman_fragment_6", "talisman_fragment_7", "talisman_fragment_8", "talisman_fragment_9", "talisman_fragment_10", "talisman_fragment_11", "talisman_fragment_12", "talisman_fragment_13", "talisman_fragment_14", "talisman_fragment_15"], "amount": 2 }] }, { "from": 201, "to": 500, "rewards": [{ "type": "resource", "id": "gems", "amount": 30 }, { "type": "resource", "id": "gold", "amount": 15e3 }, { "type": "random_item", "pool": ["talisman_fragment_1", "talisman_fragment_2", "talisman_fragment_3", "talisman_fragment_4", "talisman_fragment_5", "talisman_fragment_6", "talisman_fragment_7", "talisman_fragment_8", "talisman_fragment_9", "talisman_fragment_10", "talisman_fragment_11", "talisman_fragment_12", "talisman_fragment_13", "talisman_fragment_14", "talisman_fragment_15"], "amount": 1 }] }] }, "combat_power": { "enabled": true, "tiers": [{ "from": 1, "to": 1, "rewards": [{ "type": "resource", "id": "gems", "amount": 300 }, { "type": "resource", "id": "gold", "amount": 1e5 }, { "type": "item", "id": "talisman_enhance_charm", "amount": 3 }] }, { "from": 2, "to": 2, "rewards": [{ "type": "resource", "id": "gems", "amount": 250 }, { "type": "resource", "id": "gold", "amount": 9e4 }, { "type": "item", "id": "talisman_enhance_charm", "amount": 3 }] }, { "from": 3, "to": 3, "rewards": [{ "type": "resource", "id": "gems", "amount": 220 }, { "type": "resource", "id": "gold", "amount": 8e4 }, { "type": "item", "id": "talisman_enhance_charm", "amount": 2 }] }, { "from": 4, "to": 4, "rewards": [{ "type": "resource", "id": "gems", "amount": 200 }, { "type": "resource", "id": "gold", "amount": 75e3 }, { "type": "item", "id": "talisman_enhance_charm", "amount": 2 }] }, { "from": 5, "to": 5, "rewards": [{ "type": "resource", "id": "gems", "amount": 180 }, { "type": "resource", "id": "gold", "amount": 7e4 }, { "type": "item", "id": "talisman_enhance_charm", "amount": 2 }] }, { "from": 6, "to": 6, "rewards": [{ "type": "resource", "id": "gems", "amount": 160 }, { "type": "resource", "id": "gold", "amount": 65e3 }, { "type": "item", "id": "talisman_enhance_charm", "amount": 2 }] }, { "from": 7, "to": 7, "rewards": [{ "type": "resource", "id": "gems", "amount": 140 }, { "type": "resource", "id": "gold", "amount": 6e4 }, { "type": "item", "id": "talisman_enhance_charm", "amount": 1 }] }, { "from": 8, "to": 8, "rewards": [{ "type": "resource", "id": "gems", "amount": 120 }, { "type": "resource", "id": "gold", "amount": 55e3 }, { "type": "item", "id": "talisman_enhance_charm", "amount": 1 }] }, { "from": 9, "to": 9, "rewards": [{ "type": "resource", "id": "gems", "amount": 110 }, { "type": "resource", "id": "gold", "amount": 5e4 }, { "type": "item", "id": "talisman_enhance_charm", "amount": 1 }] }, { "from": 10, "to": 10, "rewards": [{ "type": "resource", "id": "gems", "amount": 100 }, { "type": "resource", "id": "gold", "amount": 45e3 }, { "type": "item", "id": "talisman_enhance_charm", "amount": 1 }] }, { "from": 11, "to": 50, "rewards": [{ "type": "resource", "id": "gems", "amount": 80 }, { "type": "resource", "id": "gold", "amount": 35e3 }, { "type": "item", "id": "talisman_enhance_charm", "amount": 1 }] }, { "from": 51, "to": 200, "rewards": [{ "type": "resource", "id": "gems", "amount": 50 }, { "type": "resource", "id": "gold", "amount": 25e3 }, { "type": "item", "id": "talisman_enhance_charm", "amount": 1 }] }, { "from": 201, "to": 500, "rewards": [{ "type": "resource", "id": "gems", "amount": 30 }, { "type": "resource", "id": "gold", "amount": 15e3 }] }] } } },
      rewarded_ads: {
        schema_version: 2,
        placements: {
          stamina_dialog_ad: { type: "stamina", amount: 5, daily_limit: 3 },
          daily_mission_talisman_fragment_ad: { type: "daily_fragment", amount: 1, daily_limit: 3 },
          card_reroll_ad: { type: "card_reroll", amount: 1, run_limit: 3 },
          combat_revive_ad: { type: "combat_revive", amount: 1, run_limit: 1 },
          stage_reward_x2_ad: { type: "stage_reward_x2", amount: 2, daily_limit: 5 },
          talisman_enhance_charm_ad: { type: "item", amount: 1, item_id: "talisman_enhance_charm", daily_limit: 1 },
          element_enlightenment_charm_ad: { type: "item", amount: 1, item_id: "element_enlightenment_charm", daily_limit: 1 }
        },
        daily_mission: { completion_count: 3, fragment_quality: "low" }
      }
    },
    game_play: {
      boss_enrage_after_sec: 90,
      boss_enrage_hero_atk_per_sec: 0.01,
      regular_wave_warning_sec: 120,
      regular_wave_warning_delay_sec: 10,
      exp_to_level: [0, 100, 250, 450, 700],
      element_upgrade_stones: [10, 25, 50, 100, 200]
    }
  };
  const typeOf = (value) => {
    if (typeof value === "boolean") return "bool";
    if (typeof value === "number") return Number.isInteger(value) ? "int" : "float";
    if (typeof value === "string") return "string";
    return "json";
  };
  Object.keys(defaultSettings).forEach((module) => Object.keys(defaultSettings[module]).forEach((key) => {
    const value = defaultSettings[module][key];
    nk.sqlExec(
      `INSERT INTO remote_config_settings (module, key, value_type, value, description)
                    VALUES ($1, $2, $3, $4, 'Bootstrap setting') ON CONFLICT (module, key) DO NOTHING`,
      [module, key, typeOf(value), typeof value === "string" ? value : JSON.stringify(value)]
    );
  }));
  nk.sqlExec(`INSERT INTO remote_config_releases
                    (config_version, snapshot, min_app_version, latest_app_version, store_url, published_by)
                VALUES (1, $1::jsonb, '1.0.0', '1.0.0', '', 'system')
                ON CONFLICT (config_version) DO NOTHING`, [JSON.stringify(defaultSettings)]);
  const extensions = seedExtensionColumns();
  Object.keys(extensions).forEach((table) => Object.keys(extensions[table]).forEach((column) => {
    nk.sqlExec(`ALTER TABLE game_${table} ADD COLUMN IF NOT EXISTS ${column} ${extensions[table][column]}`, []);
  }));
  logger.info("Game config tables created/verified.");
}

function createMonetizationTables(nk, logger) {
  nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS game_store_products (
            product_id              TEXT PRIMARY KEY,
            pack_id                 TEXT NOT NULL UNIQUE,
            tab_id                  TEXT NOT NULL DEFAULT '',
            display_name            TEXT NOT NULL,
            description             TEXT NOT NULL DEFAULT '',
            badge                   TEXT NOT NULL DEFAULT '',
            icon_type               TEXT NOT NULL DEFAULT 'pack',
            icon_key                TEXT NOT NULL DEFAULT '',
            fallback_price          TEXT NOT NULL DEFAULT '',
            google_product_type     TEXT NOT NULL DEFAULT 'inapp',
            fulfillment_type        TEXT NOT NULL DEFAULT 'consumable',
            active                  BOOLEAN NOT NULL DEFAULT FALSE,
            unique_purchase         BOOLEAN NOT NULL DEFAULT FALSE,
            purchase_limit          INT NOT NULL DEFAULT 0,
            purchase_limit_period   TEXT NOT NULL DEFAULT '',
            ui                      JSONB NOT NULL DEFAULT '{}',
            created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `, []);
  nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS game_store_product_rewards (
            product_id              TEXT NOT NULL REFERENCES game_store_products(product_id) ON DELETE CASCADE,
            line_no                 INT NOT NULL,
            reward_type             TEXT NOT NULL,
            reward_id               TEXT NOT NULL,
            quantity                BIGINT NOT NULL CHECK (quantity > 0),
            metadata                JSONB NOT NULL DEFAULT '{}',
            PRIMARY KEY (product_id, line_no)
        )
    `, []);
  nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS monetization_purchase_orders (
            id                      TEXT PRIMARY KEY,
            user_id                 TEXT NOT NULL,
            product_id              TEXT NOT NULL REFERENCES game_store_products(product_id),
            status                  TEXT NOT NULL DEFAULT 'pending',
            reward_snapshot         JSONB NOT NULL,
            fulfillment_type        TEXT NOT NULL,
            transaction_id          TEXT NOT NULL DEFAULT '',
            purchase_token_hash     TEXT NOT NULL DEFAULT '',
            failure_reason          TEXT NOT NULL DEFAULT '',
            created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at              TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
            validated_at            TIMESTAMPTZ,
            fulfilled_at            TIMESTAMPTZ,
            updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `, []);
  nk.sqlExec(`ALTER TABLE monetization_purchase_orders ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'android';
        ALTER TABLE monetization_purchase_orders ADD COLUMN IF NOT EXISTS store_product_id TEXT NOT NULL DEFAULT '';
        ALTER TABLE monetization_purchase_orders ADD COLUMN IF NOT EXISTS target_server_id TEXT NOT NULL DEFAULT '';
        ALTER TABLE monetization_purchase_orders ADD COLUMN IF NOT EXISTS target_generation INT NOT NULL DEFAULT 0;
        CREATE TABLE IF NOT EXISTS game_store_platform_products (
            platform TEXT NOT NULL CHECK(platform IN ('android','ios')),
            product_id TEXT NOT NULL REFERENCES game_store_products(product_id),
            store_product_id TEXT NOT NULL,
            active BOOL NOT NULL DEFAULT FALSE,
            PRIMARY KEY(platform,product_id), UNIQUE(platform,store_product_id)
        )`, []);
  nk.sqlExec("CREATE INDEX IF NOT EXISTS purchase_orders_user_status_idx ON monetization_purchase_orders(user_id, status, created_at DESC)", []);
  nk.sqlExec("CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_one_pending_uq ON monetization_purchase_orders(user_id, product_id) WHERE status = 'pending'", []);
  nk.sqlExec("CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_token_uq ON monetization_purchase_orders(purchase_token_hash) WHERE purchase_token_hash <> ''", []);
  nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS player_monetization_entitlements (
            user_id                 TEXT PRIMARY KEY,
            no_ads_expires_at       TIMESTAMPTZ,
            source                  TEXT NOT NULL DEFAULT '',
            last_product_id         TEXT NOT NULL DEFAULT '',
            updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `, []);
  nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS monetization_purchases (
            id                      BIGSERIAL PRIMARY KEY,
            request_id              TEXT NOT NULL UNIQUE,
            user_id                 TEXT NOT NULL,
            platform                TEXT NOT NULL,
            product_id              TEXT NOT NULL,
            purchase_token_hash     TEXT NOT NULL DEFAULT '',
            order_id                TEXT NOT NULL DEFAULT '',
            status                  TEXT NOT NULL,
            granted_seconds         BIGINT NOT NULL DEFAULT 0,
            purchased_at            TIMESTAMPTZ,
            verified_at             TIMESTAMPTZ,
            consumed_at             TIMESTAMPTZ,
            created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `, []);
  nk.sqlExec(
    "CREATE UNIQUE INDEX IF NOT EXISTS monetization_purchases_token_hash_uq ON monetization_purchases(purchase_token_hash) WHERE purchase_token_hash <> ''",
    []
  );
  nk.sqlExec("ALTER TABLE monetization_purchases ADD COLUMN IF NOT EXISTS purchase_order_id TEXT NOT NULL DEFAULT ''", []);
  nk.sqlExec("ALTER TABLE monetization_purchases ALTER COLUMN granted_seconds TYPE BIGINT", []);
  nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS monetization_ad_rewards (
            ad_session_id           TEXT PRIMARY KEY,
            admob_transaction_id    TEXT UNIQUE,
            user_id                 TEXT NOT NULL,
            placement_id            TEXT NOT NULL,
            reward_type             TEXT NOT NULL,
            reward_amount           INT NOT NULL,
            status                  TEXT NOT NULL DEFAULT 'prepared',
            custom_data             TEXT NOT NULL DEFAULT '',
            context                 JSONB NOT NULL DEFAULT '{}',
            created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            verified_at             TIMESTAMPTZ,
            granted_at              TIMESTAMPTZ,
            consumed_at             TIMESTAMPTZ,
            expires_at              TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 minutes'
        )
    `, []);
  nk.sqlExec(
    "CREATE INDEX IF NOT EXISTS monetization_ad_rewards_user_status_idx ON monetization_ad_rewards(user_id, status, created_at DESC)",
    []
  );
  nk.sqlExec("ALTER TABLE monetization_ad_rewards ADD COLUMN IF NOT EXISTS context JSONB NOT NULL DEFAULT '{}'", []);
  nk.sqlExec("ALTER TABLE monetization_ad_rewards ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ", []);
  nk.sqlExec("ALTER TABLE monetization_ad_rewards ADD COLUMN IF NOT EXISTS delivery_source TEXT NOT NULL DEFAULT 'ad'", []);
  nk.sqlExec("ALTER TABLE monetization_ad_rewards ADD COLUMN IF NOT EXISTS client_request_id TEXT NOT NULL DEFAULT ''", []);
  nk.sqlExec("CREATE UNIQUE INDEX IF NOT EXISTS monetization_ad_request_uq ON monetization_ad_rewards(user_id,client_request_id) WHERE client_request_id<>''", []);
  nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS monetization_daily_reward_claims (
            user_id         TEXT NOT NULL,
            placement_id    TEXT NOT NULL,
            reward_date     DATE NOT NULL DEFAULT CURRENT_DATE,
            ad_session_id   TEXT NOT NULL UNIQUE,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (user_id, placement_id, reward_date)
        )
    `, []);
  nk.sqlExec("ALTER TABLE monetization_daily_reward_claims ADD COLUMN IF NOT EXISTS claim_slot INT NOT NULL DEFAULT 1", []);
  nk.sqlExec("ALTER TABLE monetization_daily_reward_claims ALTER COLUMN reward_date SET DEFAULT (NOW() AT TIME ZONE 'UTC')::DATE", []);
  nk.sqlExec(`DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='monetization_daily_reward_claims'::regclass AND contype='p' AND pg_get_constraintdef(oid) NOT LIKE '%claim_slot%') THEN
            ALTER TABLE monetization_daily_reward_claims DROP CONSTRAINT monetization_daily_reward_claims_pkey;
            ALTER TABLE monetization_daily_reward_claims ADD PRIMARY KEY (user_id,placement_id,reward_date,claim_slot);
        END IF;
    END $$`, []);
  nk.sqlExec(`INSERT INTO monetization_daily_reward_claims (user_id,placement_id,reward_date,claim_slot,ad_session_id)
        SELECT user_id,'stamina_dialog_ad',reward_date,slot,ad_session_id FROM (
            SELECT user_id,(granted_at AT TIME ZONE 'UTC')::DATE AS reward_date,ad_session_id,
                ROW_NUMBER() OVER (PARTITION BY user_id,(granted_at AT TIME ZONE 'UTC')::DATE ORDER BY granted_at,ad_session_id) AS slot
            FROM monetization_ad_rewards WHERE placement_id IN ('stamina_dialog_ad','main_menu_stamina')
                AND status='granted' AND granted_at IS NOT NULL
                AND (granted_at AT TIME ZONE 'UTC')::DATE=(NOW() AT TIME ZONE 'UTC')::DATE
        ) history WHERE slot<=3 ON CONFLICT DO NOTHING`, []);
  nk.sqlExec(`CREATE TABLE IF NOT EXISTS monetization_daily_fragment_rewards (
        user_id TEXT NOT NULL,
        reward_date DATE NOT NULL,
        item_id TEXT NOT NULL,
        granted_at TIMESTAMPTZ,
        PRIMARY KEY (user_id,reward_date)
    )`, []);
  nk.sqlExec("ALTER TABLE monetization_purchase_orders ADD COLUMN IF NOT EXISTS vip_exp BIGINT CHECK (vip_exp >= 0)", []);
  nk.sqlExec("ALTER TABLE monetization_purchase_orders ADD COLUMN IF NOT EXISTS vip_environment TEXT NOT NULL DEFAULT ''", []);
  nk.sqlExec(`CREATE TABLE IF NOT EXISTS player_vip_credits (
        purchase_id BIGINT PRIMARY KEY REFERENCES monetization_purchases(id),
        user_id TEXT NOT NULL,
        environment TEXT NOT NULL,
        exp BIGINT NOT NULL CHECK (exp >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`, []);
  nk.sqlExec("CREATE INDEX IF NOT EXISTS player_vip_credits_user_idx ON player_vip_credits(user_id, environment)", []);
  for (const table of ["monetization_purchases", "monetization_ad_rewards", "monetization_daily_reward_claims", "monetization_daily_fragment_rewards"]) {
    nk.sqlExec("ALTER TABLE " + table + " ADD COLUMN IF NOT EXISTS target_server_id TEXT NOT NULL DEFAULT ''; ALTER TABLE " + table + " ADD COLUMN IF NOT EXISTS target_generation INT NOT NULL DEFAULT 0", []);
  }
  nk.sqlExec(`DROP INDEX IF EXISTS purchase_orders_one_pending_uq;
      CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_one_pending_scope_uq ON monetization_purchase_orders(user_id,product_id,target_server_id,target_generation) WHERE status='pending';
      CREATE TABLE IF NOT EXISTS store_receipt_reservations (
        token_hash TEXT PRIMARY KEY,order_id TEXT NOT NULL UNIQUE REFERENCES monetization_purchase_orders(id),
        user_id TEXT NOT NULL,target_server_id TEXT NOT NULL,target_generation INT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`, []);
  nk.sqlExec(`DROP INDEX IF EXISTS monetization_ad_request_uq;
      CREATE UNIQUE INDEX IF NOT EXISTS monetization_ad_request_scope_uq ON monetization_ad_rewards(user_id,target_server_id,target_generation,client_request_id) WHERE client_request_id<>'';
      DO $scope$ BEGIN
        IF EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='monetization_daily_reward_claims'::regclass AND contype='p' AND pg_get_constraintdef(oid) NOT LIKE '%target_server_id%') THEN
          ALTER TABLE monetization_daily_reward_claims DROP CONSTRAINT monetization_daily_reward_claims_pkey;
          ALTER TABLE monetization_daily_reward_claims ADD PRIMARY KEY(user_id,target_server_id,target_generation,placement_id,reward_date,claim_slot);
        END IF;
        IF EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='monetization_daily_fragment_rewards'::regclass AND contype='p' AND pg_get_constraintdef(oid) NOT LIKE '%target_server_id%') THEN
          ALTER TABLE monetization_daily_fragment_rewards DROP CONSTRAINT monetization_daily_fragment_rewards_pkey;
          ALTER TABLE monetization_daily_fragment_rewards ADD PRIMARY KEY(user_id,target_server_id,target_generation,reward_date);
        END IF;
      END $scope$;
      CREATE TABLE IF NOT EXISTS server_financial_inbox(
        event_id TEXT PRIMARY KEY,event_type TEXT NOT NULL,user_id TEXT NOT NULL,target_server_id TEXT NOT NULL,target_generation INT NOT NULL,
        payload JSONB NOT NULL,status TEXT NOT NULL DEFAULT 'pending',reason TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`, []);
  nk.sqlExec(`CREATE TABLE IF NOT EXISTS store_purchase_voids(token_hash TEXT PRIMARY KEY,received_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
      CREATE OR REPLACE FUNCTION void_store_purchase(token TEXT) RETURNS JSONB LANGUAGE plpgsql AS $void$
      DECLARE changed JSONB;
      BEGIN
        INSERT INTO store_purchase_voids(token_hash) VALUES(token) ON CONFLICT DO NOTHING;
        WITH revoked AS (
          UPDATE monetization_purchases SET status='voided',updated_at=NOW() WHERE purchase_token_hash=token AND status<>'voided' RETURNING *
        ), expired_mail AS (
          UPDATE storage SET value=jsonb_set(jsonb_set(value,'{expires_at_ms}',to_jsonb((EXTRACT(EPOCH FROM clock_timestamp())*1000)::BIGINT)),
            '{purge_at_ms}',to_jsonb((EXTRACT(EPOCH FROM clock_timestamp()+INTERVAL '7 days')*1000)::BIGINT)),
            version=md5(version||clock_timestamp()::TEXT),update_time=NOW()
          WHERE collection='player_mail' AND value->>'source_id'='purchase:'||token AND value->>'claimed_at_ms' IS NULL
        ), entitlements AS (
          UPDATE player_monetization_entitlements e SET no_ads_expires_at=GREATEST(NOW(),e.no_ads_expires_at-(r.granted_seconds*INTERVAL '1 second')),
            source='google_play_voided',updated_at=NOW() FROM revoked r WHERE e.user_id=r.user_id
        ), queued AS (
          INSERT INTO server_financial_inbox(event_id,event_type,user_id,target_server_id,target_generation,payload,reason)
          SELECT 'void:'||token,'store_void',user_id,target_server_id,target_generation,jsonb_build_object('purchase_id',id),'REVIEW_CONSUMABLE_REVOCATION'
            FROM revoked WHERE target_server_id<>'' ON CONFLICT DO NOTHING
        ) SELECT to_jsonb(r) INTO changed FROM revoked r LIMIT 1;
        RETURN changed;
      END $void$;`, []);
  logger.info("Monetization tables created/verified.");
}

var __defProp = Object.defineProperty;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
function seedSqlLiteral(value) {
  if (value === null || value === void 0) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Non-finite SQL value");
    return String(value);
  }
  const text = String(value);
  if (text.indexOf("\0") >= 0) throw new Error("NUL is not supported");
  let tag = "$seed$";
  while (text.indexOf(tag) >= 0) tag = tag.slice(0, -1) + "x$";
  return tag + text + tag;
}
function seedBindSql(sql, params) {
  return sql.replace(/\$(\d+)/g, (_match, index) => {
    if (Number(index) > params.length) throw new Error("Missing SQL parameter");
    return seedSqlLiteral(params[Number(index) - 1]);
  });
}
function seedPgArray(values) {
  return "{" + values.map((value) => '"' + value.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"').join(",") + "}";
}
function validateSeedRequest(data) {
  const tables = ["heroes", "enemies", "items", "skills", "stages", "stage_levels", "arcs", "cards", "effects", "talismans", "store_catalog", "content_configs", "config", "remote_settings"];
  if (tables.indexOf(data.table) < 0) return "Unknown table";
  if (data.replace_all !== void 0 && typeof data.replace_all !== "boolean") return "replace_all must be boolean";
  if (data.table === "config") {
    return typeof data.config_key !== "string" || !data.config_key || !data.config_value || typeof data.config_value !== "object" || Array.isArray(data.config_value) ? "Invalid config" : "";
  }
  const ids = {};
  const extensions = seedExtensionColumns()[data.table] || {};
  for (const row of data.rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return "Invalid row";
    const id = data.table === "remote_settings" ? row.module + ":" + row.key : row.id;
    if (typeof id !== "string" && typeof id !== "number" || !String(id) || ids[String(id)]) return "Missing or duplicate id";
    ids[String(id)] = true;
    if (data.table === "store_catalog") {
      if (typeof row.product_id !== "string" || !row.product_id || ids["product:" + row.product_id]) return "Missing or duplicate product_id";
      ids["product:" + row.product_id] = true;
    }
    if (data.table === "talismans" && (!Number.isInteger(row.id) || row.id <= 0)) return "Invalid talisman id";
    if (["heroes", "enemies", "items", "skills", "stages", "arcs", "cards", "effects"].indexOf(data.table) >= 0 && (typeof row.display_name !== "string" || !row.display_name)) return "Missing display_name";
    if (data.table === "stage_levels" && (!row.stage_id || !row.level_id)) return "Missing stage reference";
    for (const key of Object.keys(extensions)) {
      if (row[key] === void 0) continue;
      const type = extensions[key];
      if (type === "INT" && (!Number.isInteger(row[key]) || row[key] < 0)) return "Invalid integer: " + key;
      if (type === "REAL" && (typeof row[key] !== "number" || !Number.isFinite(row[key]) || row[key] < 0)) return "Invalid number: " + key;
      if (type === "TEXT" && typeof row[key] !== "string") return "Invalid text: " + key;
      if (type === "JSONB" && (!row[key] || typeof row[key] !== "object")) return "Invalid JSON: " + key;
      if (["boss_skill_ids", "boss_skill_entry_indexes", "spawn_sequence"].indexOf(key) >= 0 && !Array.isArray(row[key])) return "Expected array: " + key;
      if (["fragment_drop", "stage_rules", "stat_growth", "metadata"].indexOf(key) >= 0 && Array.isArray(row[key])) return "Expected object: " + key;
    }
    if (row.waves !== void 0 && (!Array.isArray(row.waves) || row.waves.some((wave) => !wave || typeof wave !== "object" || wave.entries !== void 0 && !Array.isArray(wave.entries)))) return "Invalid waves";
    if (data.table === "content_configs" && (!row.payload || typeof row.payload !== "object" || Array.isArray(row.payload) && ["enemy_skills", "boss_skills"].indexOf(String(row.id)) < 0)) return "Invalid content config";
    if (data.table === "remote_settings") {
      if (["system", "game_play"].indexOf(row.module) < 0 || typeof row.key !== "string" || !row.key || typeof row.value !== "string") return "Invalid setting";
      try {
        parseRemoteSetting(row.value_type, row.value);
      } catch (_e) {
        return "Invalid setting type/value";
      }
      if (["ads_enabled", "payment_enabled"].indexOf(row.key) >= 0 && (row.module !== "system" || row.value_type !== "bool")) return "Feature flags must be system bools";
    }
  }
  return "";
}
const seedGameData = (ctx, logger, nk, payload) => {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _A, _B, _C, _D;
  if (ctx.userId && ctx.userId !== String(ctx.env.CONFIG_ADMIN_USER_ID || "")) {
    return JSON.stringify({ error: "Forbidden", code: 403 });
  }
  let data;
  try {
    data = JSON.parse(payload);
  } catch (_e2) {
    return JSON.stringify({ error: "Invalid JSON" });
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return JSON.stringify({ error: "Expected object" });
  if (data.table === "bundle") return seedGameDataBundle(ctx, logger, nk, data);
  const statements = [];
  const checks = [];
  const write = (sql, params) => {
    statements.push(seedBindSql(sql, params));
    const insert = /INSERT INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i.exec(sql);
    if (insert) {
      const columns = insert[2].split(",").map((value) => value.trim());
      const values = insert[3].split(",").map((value) => value.trim());
      const predicates = columns.map((column, i) => /^\$\d+(::\w+)?$/.test(values[i] || "") ? column + " IS NOT DISTINCT FROM (jsonb_populate_record(NULL::" + insert[1] + ",jsonb_build_object('" + column + "'," + seedBindSql(values[i], params) + ")))." + column : "").filter(Boolean);
      checks.push(`IF NOT EXISTS (SELECT 1 FROM ${insert[1]} WHERE ${predicates.join(" AND ")}) THEN RAISE EXCEPTION 'Seed readback mismatch'; END IF`);
    }
  };
  try {
    const table = data.table;
    const rows = data.rows;
    if (!table) {
      return JSON.stringify({ error: "Missing table" });
    }
    if (table !== "config" && (!Array.isArray(rows) || rows.length === 0)) {
      return JSON.stringify({ error: "Missing table or rows" });
    }
    const validation = validateSeedRequest(data);
    if (validation) return JSON.stringify({ error: validation });
    let inserted = 0;
    switch (table) {
      case "heroes":
        if (data.replace_all === true) {
          statements.push(`DO $prune$ BEGIN
                  IF to_regclass('storage') IS NOT NULL THEN
                    IF EXISTS(SELECT 1 FROM storage WHERE collection IN ('player_profiles','player_heroes'))
                      AND EXISTS(SELECT 1 FROM game_heroes WHERE NOT(id=ANY(${seedSqlLiteral(seedPgArray(rows.map((r) => r.id)))}::TEXT[])))
                      THEN RAISE EXCEPTION 'SEED_PRUNE_BLOCKED_PLAYER_REFERENCES'; END IF;
                  END IF;
                  IF to_regclass('monetization_purchases') IS NOT NULL THEN
                    IF EXISTS(SELECT 1 FROM monetization_purchases)
                      AND EXISTS(SELECT 1 FROM game_heroes WHERE NOT(id=ANY(${seedSqlLiteral(seedPgArray(rows.map((r) => r.id)))}::TEXT[])))
                      THEN RAISE EXCEPTION 'SEED_PRUNE_BLOCKED_FINANCIAL_HISTORY'; END IF;
                  END IF;
                END $prune$`);
          write("DELETE FROM game_heroes WHERE NOT (id = ANY($1::text[]))", [seedPgArray(rows.map((r) => r.id))]);
        }
        for (const row of rows) {
          write(`
                    INSERT INTO game_heroes (id, display_name, role, element, description,
                        auto_basic_attack, visual_scale, price, require, attributes, level_up_stats,
                        starting_skills, skill_pool)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb)
                    ON CONFLICT (id) DO UPDATE SET
                        display_name=EXCLUDED.display_name, role=EXCLUDED.role,
                        element=EXCLUDED.element, description=EXCLUDED.description,
                        auto_basic_attack=EXCLUDED.auto_basic_attack, visual_scale=EXCLUDED.visual_scale, price=EXCLUDED.price,
                        require=EXCLUDED.require, attributes=EXCLUDED.attributes,
                        level_up_stats=EXCLUDED.level_up_stats, starting_skills=EXCLUDED.starting_skills,
                        skill_pool=EXCLUDED.skill_pool, updated_at=NOW()
                `, [
            row.id,
            row.display_name,
            row.role || "",
            row.element || "",
            row.description || "",
            row.auto_basic_attack !== false,
            (_a = row.visual_scale) != null ? _a : 1,
            JSON.stringify(row.price || {}),
            JSON.stringify(row.require || {}),
            JSON.stringify(row.attributes || {}),
            JSON.stringify(row.level_up_stats || {}),
            JSON.stringify(row.starting_skills || []),
            JSON.stringify(row.skill_pool || [])
          ]);
          inserted++;
        }
        break;
      case "enemies":
        for (const row of rows) {
          write(`
                    INSERT INTO game_enemies (id, display_name, element, attack_type, visual_scale, boss_visual_scale, exp,
                        is_boss, boss_scale, attributes, skills, attack_effects, generic_skills, boss_skills, reward)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb,$14::jsonb,$15::jsonb)
                    ON CONFLICT (id) DO UPDATE SET
                        display_name=EXCLUDED.display_name, element=EXCLUDED.element,
                        attack_type=EXCLUDED.attack_type, visual_scale=EXCLUDED.visual_scale,
                        boss_visual_scale=EXCLUDED.boss_visual_scale, exp=EXCLUDED.exp,
                        is_boss=EXCLUDED.is_boss, boss_scale=EXCLUDED.boss_scale,
                        attributes=EXCLUDED.attributes, skills=EXCLUDED.skills, attack_effects=EXCLUDED.attack_effects, generic_skills=EXCLUDED.generic_skills,
                        boss_skills=EXCLUDED.boss_skills, reward=EXCLUDED.reward,
                        updated_at=NOW()
                `, [
            row.id,
            row.display_name,
            row.element || "",
            row.attack_type || "melee",
            (_b = row.visual_scale) != null ? _b : 0.364,
            (_c = row.boss_visual_scale) != null ? _c : 0.442,
            (_d = row.exp) != null ? _d : 0,
            row.is_boss || false,
            (_e = row.boss_scale) != null ? _e : 1,
            JSON.stringify(row.attributes || {}),
            JSON.stringify(row.skills || []),
            JSON.stringify(row.attack_effects || []),
            JSON.stringify(row.generic_skills || []),
            JSON.stringify(row.boss_skills || []),
            JSON.stringify(row.reward || {})
          ]);
          inserted++;
        }
        break;
      case "items":
        for (const row of rows) {
          write(`
                    INSERT INTO game_items (id, display_name, description, category, rarity,
                        icon_id, stackable, max_stack, sort_order, expires_after_hours, tags, attributes)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb)
                    ON CONFLICT (id) DO UPDATE SET
                        display_name=EXCLUDED.display_name, description=EXCLUDED.description,
                        category=EXCLUDED.category, rarity=EXCLUDED.rarity,
                        icon_id=EXCLUDED.icon_id, stackable=EXCLUDED.stackable,
                        max_stack=EXCLUDED.max_stack, sort_order=EXCLUDED.sort_order,
                        expires_after_hours=EXCLUDED.expires_after_hours,
                        tags=EXCLUDED.tags, attributes=EXCLUDED.attributes, updated_at=NOW()
                `, [
            row.id,
            row.display_name,
            row.description || "",
            row.category || "",
            row.rarity || "common",
            row.icon_id || "",
            row.stackable !== false,
            (_f = row.max_stack) != null ? _f : 999,
            (_g = row.order) != null ? _g : 0,
            (_h = row.expires_after_hours) != null ? _h : 0,
            JSON.stringify(row.tags || []),
            JSON.stringify(row.attributes || {})
          ]);
          inserted++;
        }
        break;
      case "skills":
        for (const row of rows) {
          write(`
                    INSERT INTO game_skills (id, display_name, category, skill_class,
                        activation, skill_type, element, description, positioning, deployment,
                        vfx_frames, cast_config, description_rows, criteria_unlock, hero_level_unlock, levels)
					VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb,$14::jsonb,$15,$16::jsonb)
                    ON CONFLICT (id) DO UPDATE SET
                        display_name=EXCLUDED.display_name, category=EXCLUDED.category,
                        skill_class=EXCLUDED.skill_class, activation=EXCLUDED.activation,
                        skill_type=EXCLUDED.skill_type, element=EXCLUDED.element, description=EXCLUDED.description,
                        positioning=EXCLUDED.positioning, deployment=EXCLUDED.deployment,
                        vfx_frames=EXCLUDED.vfx_frames, cast_config=EXCLUDED.cast_config,
						description_rows=EXCLUDED.description_rows, criteria_unlock=EXCLUDED.criteria_unlock, hero_level_unlock=EXCLUDED.hero_level_unlock,
                        levels=EXCLUDED.levels, updated_at=NOW()
                `, [
            row.id,
            row.display_name,
            row.category || "combat",
            row.skill_class || "",
            row.activation || "auto",
            row.skill_type || "",
            row.element || "",
            row.description || "",
            JSON.stringify(row.positioning || {}),
            JSON.stringify(row.deployment || {}),
            JSON.stringify(row.vfx_frames || []),
            JSON.stringify(row.cast_config || {}),
            JSON.stringify(row.description_rows || []),
            JSON.stringify(row.createria_unlock || row.criteria_unlock || {}),
            Math.max(1, Number((_i = row.hero_level_unlock) != null ? _i : 1)),
            JSON.stringify(row.levels || [])
          ]);
          inserted++;
        }
        break;
      case "stages":
        for (const row of rows) {
          write(`
                    INSERT INTO game_stages (id, arc_id, level, display_name, description,
                        sort_order, exp_weight, is_boss, background, music, enabled_if, difficulty_levels, loot_table)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb)
                    ON CONFLICT (id) DO UPDATE SET
                        arc_id=EXCLUDED.arc_id, level=EXCLUDED.level,
                        display_name=EXCLUDED.display_name, description=EXCLUDED.description,
						sort_order=EXCLUDED.sort_order, exp_weight=EXCLUDED.exp_weight, is_boss=EXCLUDED.is_boss,
                        background=EXCLUDED.background, music=EXCLUDED.music,
                        enabled_if=EXCLUDED.enabled_if, difficulty_levels=EXCLUDED.difficulty_levels,
                        loot_table=EXCLUDED.loot_table,
                        updated_at=NOW()
                `, [
            row.id,
            row.arc_id,
            (_j = row.level) != null ? _j : 1,
            row.display_name,
            row.description || "",
            (_l = (_k = row.order) != null ? _k : row.sort_order) != null ? _l : 0,
            (_m = row.exp_weight) != null ? _m : 1,
            row.is_boss || false,
            row.background || "",
            row.music || "",
            JSON.stringify(row.enabled_if || {}),
            JSON.stringify(row.difficulty_levels || []),
            JSON.stringify(row.loot_table || [])
          ]);
          const waves = row.waves || [];
          write("DELETE FROM game_stage_waves WHERE stage_id = $1", [row.id]);
          for (let i = 0; i < waves.length; i++) {
            const wave = waves[i];
            write(`
                        INSERT INTO game_stage_waves (stage_id, wave_index, wave_id, display_name, entries)
                        VALUES ($1, $2, $3, $4, $5::jsonb)
                        ON CONFLICT (stage_id, wave_index) DO UPDATE SET
                            wave_id=EXCLUDED.wave_id, display_name=EXCLUDED.display_name,
                            entries=EXCLUDED.entries
                    `, [
              row.id,
              i,
              wave.wave_id || wave.id || "",
              wave.display_name || "",
              JSON.stringify(wave.entries || [])
            ]);
          }
          inserted++;
        }
        break;
      case "stage_levels":
        for (const row of rows) {
          write(`
                    INSERT INTO game_stage_levels (id, stage_id, level_id, display_name, description,
                        sort_order, recommended_power, exp_multiplier, stamina_cost, gold_reward, enemy_modifiers, loot_table, boss_loot_table,
                        unlock_condition, stage_rules, ui)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb,$14::jsonb,$15::jsonb,$16::jsonb)
                    ON CONFLICT (id) DO UPDATE SET
                        stage_id=EXCLUDED.stage_id, level_id=EXCLUDED.level_id,
                        display_name=EXCLUDED.display_name, description=EXCLUDED.description,
                        sort_order=EXCLUDED.sort_order, recommended_power=EXCLUDED.recommended_power,
                        exp_multiplier=EXCLUDED.exp_multiplier, stamina_cost=EXCLUDED.stamina_cost, gold_reward=EXCLUDED.gold_reward,
						enemy_modifiers=EXCLUDED.enemy_modifiers, loot_table=EXCLUDED.loot_table, boss_loot_table=EXCLUDED.boss_loot_table, unlock_condition=EXCLUDED.unlock_condition,
                        stage_rules=EXCLUDED.stage_rules, ui=EXCLUDED.ui, updated_at=NOW()
                `, [
            row.id,
            row.stage_id,
            row.level_id,
            row.display_name || row.level_id,
            row.description || "",
            (_o = (_n = row.order) != null ? _n : row.sort_order) != null ? _o : 0,
            (_p = row.recommended_power) != null ? _p : 0,
            (_q = row.exp_multiplier) != null ? _q : 1,
            (_r = row.stamina_cost) != null ? _r : 1,
            (_s = row.gold_reward) != null ? _s : 0,
            JSON.stringify(row.enemy_modifiers || {}),
            JSON.stringify(row.loot_table || []),
            JSON.stringify(row.boss_loot_table || []),
            JSON.stringify(row.unlock_condition || {}),
            JSON.stringify(row.stage_rules || {}),
            JSON.stringify(row.ui || {})
          ]);
          inserted++;
        }
        break;
      case "arcs":
        for (const row of rows) {
          write(`
                    INSERT INTO game_arcs (id, display_name, description, level_min, level_max,
                        element, sort_order, enabled_if, stage_ids)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)
                    ON CONFLICT (id) DO UPDATE SET
                        display_name=EXCLUDED.display_name, description=EXCLUDED.description,
                        level_min=EXCLUDED.level_min, level_max=EXCLUDED.level_max,
                        element=EXCLUDED.element, sort_order=EXCLUDED.sort_order,
                        enabled_if=EXCLUDED.enabled_if, stage_ids=EXCLUDED.stage_ids
                `, [
            row.id,
            row.display_name,
            row.description || "",
            (_t = row.level_min) != null ? _t : 1,
            (_u = row.level_max) != null ? _u : 10,
            row.element || "",
            (_w = (_v = row.order) != null ? _v : row.sort_order) != null ? _w : 0,
            JSON.stringify(row.enabled_if || {}),
            JSON.stringify(row.stage_ids || [])
          ]);
          inserted++;
        }
        break;
      case "cards":
        for (const row of rows) {
          write(`
                    INSERT INTO game_cards (id, display_name, card_type, rarity, icon_id,
                        description, effect_description, effect)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
                    ON CONFLICT (id) DO UPDATE SET
                        display_name=EXCLUDED.display_name, card_type=EXCLUDED.card_type,
                        rarity=EXCLUDED.rarity, icon_id=EXCLUDED.icon_id,
                        description=EXCLUDED.description, effect_description=EXCLUDED.effect_description,
                        effect=EXCLUDED.effect
                `, [
            row.id,
            row.display_name,
            row.card_type || "",
            row.rarity || "common",
            row.icon_id || "",
            row.description || "",
            row.effect_description || "",
            JSON.stringify(row.effect || {})
          ]);
          inserted++;
        }
        break;
      case "effects":
        for (const row of rows) {
          const metadata = __spreadValues({}, row);
          delete metadata.id;
          delete metadata.display_name;
          delete metadata.description;
          delete metadata.default_props;
          write(`
                    INSERT INTO game_effects (id, display_name, description, default_props, metadata)
                    VALUES ($1,$2,$3,$4::jsonb,$5::jsonb)
                    ON CONFLICT (id) DO UPDATE SET
                        display_name=EXCLUDED.display_name, description=EXCLUDED.description,
                        default_props=EXCLUDED.default_props, metadata=EXCLUDED.metadata
                `, [
            row.id,
            row.display_name,
            row.description || "",
            JSON.stringify(row.default_props || {}),
            JSON.stringify(metadata)
          ]);
          inserted++;
        }
        break;
      case "talismans":
        for (const row of rows) {
          const numericId = Number((_x = row.id) != null ? _x : 0);
          const qualityTier = numericId <= 15 ? "H\u1EA1 ph\u1EA9m" : numericId <= 25 ? "Trung ph\u1EA9m" : "Th\u01B0\u1EE3ng ph\u1EA9m";
          const elementOrder = ["metal", "wood", "water", "fire", "earth"];
          const normalizedElement = row.element || elementOrder[Math.max(0, numericId - 16) % elementOrder.length];
          write(`
                    INSERT INTO game_talismans (id, display_name, tier, element, type, level, max_level,
                        is_equipped, description, skill, stats, upgrade_exp, upgrade_max_exp, materials)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14::jsonb)
                    ON CONFLICT (id) DO UPDATE SET
                        display_name=EXCLUDED.display_name, tier=EXCLUDED.tier, element=EXCLUDED.element,
                        type=EXCLUDED.type, level=EXCLUDED.level, max_level=EXCLUDED.max_level,
                        is_equipped=EXCLUDED.is_equipped, description=EXCLUDED.description,
                        skill=EXCLUDED.skill, stats=EXCLUDED.stats, upgrade_exp=EXCLUDED.upgrade_exp,
                        upgrade_max_exp=EXCLUDED.upgrade_max_exp, materials=EXCLUDED.materials,
                        updated_at=NOW()
                `, [
            row.id,
            row.name || row.display_name || "",
            row.tier || qualityTier,
            normalizedElement,
            row.type || "attack",
            (_y = row.level) != null ? _y : 1,
            (_z = row.max_level) != null ? _z : 30,
            row.is_equipped === true,
            row.description || "",
            row.skill || "",
            JSON.stringify(row.stats || {}),
            (_A = row.upgrade_exp) != null ? _A : 0,
            (_B = row.upgrade_max_exp) != null ? _B : 20,
            JSON.stringify(row.materials || [])
          ]);
          inserted++;
        }
        break;
      case "store_catalog":
        if (data.replace_all === true) write("UPDATE game_store_products SET active = FALSE, updated_at = NOW()", []);
        for (const row of rows) {
          const rewards = Array.isArray(row.rewards) ? row.rewards : [];
          if (!row.product_id || !row.id || rewards.length === 0) {
            return JSON.stringify({ error: `Invalid store product: ${row.product_id || row.id || "unknown"}` });
          }
          for (const reward of rewards) {
            if (!reward || ["item", "hero", "currency", "entitlement", "stamina"].indexOf(reward.reward_type) < 0 || !reward.reward_id || !Number.isSafeInteger(reward.quantity) || reward.quantity <= 0) {
              return JSON.stringify({ error: `Invalid reward in product ${row.product_id}` });
            }
            if (reward.reward_type === "item" && nk.sqlQuery("SELECT id FROM game_items WHERE id = $1", [reward.reward_id]).length === 0) {
              return JSON.stringify({ error: `Unknown item ${reward.reward_id} in product ${row.product_id}` });
            }
            if (reward.reward_type === "hero" && nk.sqlQuery("SELECT id FROM game_heroes WHERE id = $1", [reward.reward_id]).length === 0) {
              return JSON.stringify({ error: `Unknown hero ${reward.reward_id} in product ${row.product_id}` });
            }
            if (reward.reward_type === "item" || reward.reward_type === "hero") {
              const refTable = reward.reward_type === "item" ? "game_items" : "game_heroes";
              checks.push(`IF NOT EXISTS(SELECT 1 FROM ${refTable} WHERE id=${seedSqlLiteral(reward.reward_id)}) THEN RAISE EXCEPTION 'Store reward reference missing at commit'; END IF`);
            }
          }
          write(`
                    INSERT INTO game_store_products
                        (product_id, pack_id, tab_id, display_name, description, badge,
                         icon_type, icon_key, fallback_price, google_product_type,
                         fulfillment_type, active, unique_purchase, purchase_limit,
                         purchase_limit_period, ui)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb)
                    ON CONFLICT (product_id) DO UPDATE SET
                        pack_id=EXCLUDED.pack_id, tab_id=EXCLUDED.tab_id,
                        display_name=EXCLUDED.display_name, description=EXCLUDED.description,
                        badge=EXCLUDED.badge, icon_type=EXCLUDED.icon_type, icon_key=EXCLUDED.icon_key,
                        fallback_price=EXCLUDED.fallback_price, google_product_type=EXCLUDED.google_product_type,
                        fulfillment_type=EXCLUDED.fulfillment_type, active=EXCLUDED.active,
                        unique_purchase=EXCLUDED.unique_purchase, purchase_limit=EXCLUDED.purchase_limit,
                        purchase_limit_period=EXCLUDED.purchase_limit_period, ui=EXCLUDED.ui,
                        updated_at=NOW()
                `, [
            row.product_id,
            row.id,
            row.tab_id || "",
            row.name || row.title || row.id,
            row.desc || row.subtitle || "",
            row.badge || "",
            row.icon_type || "pack",
            row.icon_key || "",
            row.price || row.display_price || "",
            "inapp",
            row.fulfillment_type || "consumable",
            row.active === true,
            row.unique_purchase === true,
            Number((_C = row.purchase_limit) != null ? _C : 0),
            row.purchase_limit_period || "",
            JSON.stringify(row)
          ]);
          write("DELETE FROM game_store_product_rewards WHERE product_id = $1", [row.product_id]);
          rewards.forEach((reward, index) => write(`
                    INSERT INTO game_store_product_rewards
                        (product_id, line_no, reward_type, reward_id, quantity, metadata)
                    VALUES ($1,$2,$3,$4,$5,$6::jsonb)
                `, [
            row.product_id,
            index + 1,
            reward.reward_type,
            reward.reward_id,
            Number(reward.quantity),
            JSON.stringify(reward.metadata || {})
          ]));
          inserted++;
        }
        break;
      case "content_configs":
        for (const row of rows) {
          if (!row.id || !row.payload) return JSON.stringify({ error: "Invalid content config" });
          if (String(row.id) === "events") {
            const validationError = eventValidateConfig(row.payload);
            if (validationError) return JSON.stringify({ error: `Invalid events config: ${validationError}` });
          }
          write(`
                    INSERT INTO game_content_configs (id, payload, active, updated_at)
                    VALUES ($1, $2::jsonb, $3, NOW())
                    ON CONFLICT (id) DO UPDATE SET payload=EXCLUDED.payload,
                        active=EXCLUDED.active, updated_at=NOW()
                `, [row.id, JSON.stringify(row.payload), row.active !== false]);
          inserted++;
        }
        break;
      case "remote_settings":
        for (const row of rows) {
          write(
            `INSERT INTO remote_config_settings (module,key,value_type,value,description,is_active,updated_by)
                    VALUES ($1,$2,$3,$4,$5,$6,$7)
                    ON CONFLICT (module,key) DO UPDATE SET value_type=EXCLUDED.value_type,
                    value=EXCLUDED.value,description=EXCLUDED.description,is_active=EXCLUDED.is_active,
                    updated_by=EXCLUDED.updated_by,updated_at=NOW()`,
            [row.module, row.key, row.value_type, row.value, (_D = row.description) != null ? _D : "", row.is_active !== false, ctx.userId || "http-key-seed"]
          );
          inserted++;
        }
        break;
      case "config":
        write(`
                INSERT INTO game_config (key, value)
                VALUES ($1, $2::jsonb)
                ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()
            `, [data.config_key || "progression", JSON.stringify(data.config_value || {})]);
        inserted = 1;
        break;
      default:
        return JSON.stringify({ error: `Unknown table: ${table}` });
    }
    const columns = seedExtensionColumns()[table];
    if (columns) for (const row of rows) {
      const fields = Object.keys(columns).filter((key) => key === "metadata" || row[key] !== void 0);
      if (!fields.length) continue;
      const params = [row.id];
      const assignments = fields.map((key) => {
        let value = row[key];
        if (table === "skills" && key === "metadata") {
          value = __spreadValues({}, row);
          [
            "id",
            "display_name",
            "category",
            "skill_class",
            "activation",
            "skill_type",
            "element",
            "description",
            "positioning",
            "deployment",
            "vfx_frames",
            "cast_config",
            "description_rows",
            "criteria_unlock",
            "createria_unlock",
            "hero_level_unlock",
            "levels",
            "metadata"
          ].forEach((k) => delete value[k]);
        }
        params.push(columns[key] === "JSONB" ? JSON.stringify(value) : value);
        return `${key}=$${params.length}${columns[key] === "JSONB" ? "::jsonb" : ""}`;
      });
      write(`UPDATE game_${table} SET ${assignments.join(",")} WHERE id=$1`, params);
      const predicates = fields.map((key, index) => `${key} IS NOT DISTINCT FROM (jsonb_populate_record(NULL::game_${table},jsonb_build_object('${key}',${seedSqlLiteral(params[index + 1])}${columns[key] === "JSONB" ? "::jsonb" : ""}))).${key}`);
      checks.push(`IF NOT EXISTS (SELECT 1 FROM game_${table} WHERE id=${seedSqlLiteral(row.id)} AND ${predicates.join(" AND ")}) THEN RAISE EXCEPTION 'Seed extension readback mismatch'; END IF`);
    }
    const body = "BEGIN\nPERFORM pg_advisory_xact_lock(143,2);\n" + statements.concat(checks).join(";\n") + ";\nEND";
    nk.sqlExec("DO " + seedSqlLiteral(body), []);
    logger.info(`Seeded ${inserted} rows into ${table}`);
    return JSON.stringify({ success: true, table, inserted });
  } catch (error) {
    logger.error("Seed request failed: %s", String(error));
    return JSON.stringify({ error: "Seed failed; no changes committed", code: 422 });
  }
};
function seedGameDataBundle(ctx, logger, nk, data) {
  if (!Array.isArray(data.requests) || data.requests.length < 1 || data.requests.length > 100)
    return JSON.stringify({ error: "Invalid seed bundle", code: 400 });
  const compiled = [];
  const results = [];
  const staged = {};
  const planner = Object.create(nk);
  planner.sqlExec = (sql, params) => {
    compiled.push(params.length ? seedBindSql(sql, params) : sql);
  };
  planner.sqlQuery = (sql, params) => {
    for (const table of ["items", "heroes"]) {
      if (sql === "SELECT id FROM game_" + table + " WHERE id = $1" && staged[table] && staged[table].indexOf(String(params[0])) >= 0)
        return [{ id: params[0] }];
    }
    return nk.sqlQuery(sql, params);
  };
  for (let i = 0; i < data.requests.length; i++) {
    const request = data.requests[i];
    if (!request || request.table === "bundle") return JSON.stringify({ error: "Nested or invalid seed bundle", request_index: i });
    const result = JSON.parse(seedGameData(ctx, logger, planner, JSON.stringify(request)));
    if (result.success !== true) return JSON.stringify({ error: result.error || "Seed validation failed", request_index: i, table: request.table });
    results.push(result);
    if (request.table === "items" || request.table === "heroes") staged[request.table] = (staged[request.table] || []).concat(request.rows.map((r) => String(r.id)));
  }
  try {
    nk.sqlExec("DO " + seedSqlLiteral("BEGIN\nPERFORM pg_advisory_xact_lock(143,2);\n" + compiled.map((sql) => "EXECUTE " + seedSqlLiteral(sql) + ";").join("\n") + "\nEND"), []);
    return JSON.stringify({ success: true, table: "bundle", atomic: true, results });
  } catch (error) {
    logger.error("Atomic seed bundle rolled back: %s", String(error));
    return JSON.stringify({ error: "Atomic seed bundle rolled back", code: 409 });
  }
}

const EVENT_TIMEZONE_OFFSET_MS = 7 * 60 * 60 * 1e3;
const EVENT_UPCOMING_WINDOW_MS = 24 * 60 * 60 * 1e3;
function eventObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function eventConfig(nk) {
  return eventObject(readContentConfig(nk, "events"));
}
function eventDefinitions(nk) {
  const raw = eventConfig(nk);
  return (Array.isArray(raw.events) ? raw.events : []).filter((entry) => entry && entry.active !== false && String(entry.event_id || "").length > 0 && Array.isArray(entry.quests));
}
function eventValidateConfig(config) {
  const events = config && Array.isArray(config.events) ? config.events : [];
  if (events.length === 0) return "events must contain at least one campaign";
  const identities = [];
  const supported = [
    "stage_clear",
    "enemy_kill",
    "specific_stage_clear",
    "element_upgrade",
    "talisman_enhance",
    "profile_complete",
    "user_level_reached",
    "stamina_spent",
    "item_earned"
  ];
  for (const campaign of events) {
    const id = String(campaign && campaign.event_id || "");
    const version = Math.max(0, Math.floor(Number(campaign && campaign.version || 0)));
    if (!id || version < 1) return "event_id and positive version are required";
    const identity = `${id}:v${version}`;
    if (identities.indexOf(identity) >= 0) return `duplicate event identity ${identity}`;
    identities.push(identity);
    const start = eventParseTime(campaign.starts_at);
    const end = eventParseTime(campaign.ends_at);
    if (start <= 0 || end <= start) return `${identity} has an invalid time window`;
    const interval = String(eventObject(campaign.recurrence).interval || "none");
    if (["none", "week", "month", "year"].indexOf(interval) < 0) return `${identity} has an invalid recurrence interval`;
    const duration = end - start;
    if (interval === "week" && duration >= 7 * 864e5 || interval === "month" && duration >= 28 * 864e5 || interval === "year" && duration >= 365 * 864e5) {
      return `${identity} duration overlaps its recurrence interval`;
    }
    if (!Array.isArray(campaign.quests) || campaign.quests.length === 0) return `${identity} has no quests`;
    const questIds = [];
    for (const quest of campaign.quests) {
      const questId = String(quest && quest.quest_id || "");
      if (!questId || questIds.indexOf(questId) >= 0) return `${identity} has an invalid or duplicate quest_id`;
      questIds.push(questId);
      if (supported.indexOf(String(quest.type || "")) < 0 || Number(quest.target || 0) <= 0) return `${identity}/${questId} is invalid`;
      const tracks = eventRewardTracks(quest);
      if (tracks.normal.length === 0) return `${identity}/${questId} requires a normal reward track`;
    }
  }
  return "";
}
function eventParseTime(value) {
  const parsed = Date.parse(String(value || ""));
  return isNaN(parsed) ? 0 : parsed;
}
function eventLocalParts(ms) {
  const date = new Date(ms + EVENT_TIMEZONE_OFFSET_MS);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds()
  };
}
function eventLocalEpoch(year, month, day, hour, minute, second) {
  const shifted = Date.UTC(year, month, day, hour, minute, second);
  const check = new Date(shifted);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month || check.getUTCDate() !== day) return 0;
  return shifted - EVENT_TIMEZONE_OFFSET_MS;
}
function eventMonthlyOccurrence(anchor, monthIndex) {
  const year = Math.floor(monthIndex / 12);
  const month = (monthIndex % 12 + 12) % 12;
  return eventLocalEpoch(year, month, anchor.day, anchor.hour, anchor.minute, anchor.second);
}
function eventYearlyOccurrence(anchor, year) {
  return eventLocalEpoch(year, anchor.month, anchor.day, anchor.hour, anchor.minute, anchor.second);
}
function eventOccurrence(campaign, now) {
  const anchorStart = eventParseTime(campaign.starts_at);
  const anchorEnd = eventParseTime(campaign.ends_at);
  const duration = anchorEnd - anchorStart;
  if (anchorStart <= 0 || duration <= 0) return null;
  const interval = String(eventObject(campaign.recurrence).interval || "none").toLowerCase();
  let currentStart = anchorStart;
  let nextStart = anchorStart;
  if (interval === "week") {
    const step = 7 * 864e5;
    const index = Math.max(0, Math.floor((now - anchorStart) / step));
    currentStart = anchorStart + index * step;
    nextStart = now < anchorStart ? anchorStart : currentStart + step;
  } else if (interval === "month") {
    const anchor = eventLocalParts(anchorStart);
    const current = eventLocalParts(now);
    let monthIndex = current.year * 12 + current.month;
    currentStart = eventMonthlyOccurrence(anchor, monthIndex);
    while ((currentStart <= 0 || currentStart > now) && monthIndex >= anchor.year * 12 + anchor.month) {
      monthIndex--;
      currentStart = eventMonthlyOccurrence(anchor, monthIndex);
    }
    let nextIndex = Math.max(monthIndex + 1, anchor.year * 12 + anchor.month);
    nextStart = eventMonthlyOccurrence(anchor, nextIndex);
    while (nextStart <= 0 || nextStart <= now) {
      nextIndex++;
      nextStart = eventMonthlyOccurrence(anchor, nextIndex);
    }
  } else if (interval === "year") {
    const anchor = eventLocalParts(anchorStart);
    let year = eventLocalParts(now).year;
    currentStart = eventYearlyOccurrence(anchor, year);
    while ((currentStart <= 0 || currentStart > now) && year >= anchor.year) {
      year--;
      currentStart = eventYearlyOccurrence(anchor, year);
    }
    let nextYear = Math.max(year + 1, anchor.year);
    nextStart = eventYearlyOccurrence(anchor, nextYear);
    while (nextStart <= 0 || nextStart <= now) {
      nextYear++;
      nextStart = eventYearlyOccurrence(anchor, nextYear);
    }
  } else {
    currentStart = anchorStart;
    nextStart = anchorStart;
  }
  if (currentStart >= anchorStart && now >= currentStart && now < currentStart + duration) {
    return {
      occurrence_id: String(currentStart),
      starts_at_ms: currentStart,
      ends_at_ms: currentStart + duration,
      phase: "active"
    };
  }
  if (nextStart > now && nextStart - now <= EVENT_UPCOMING_WINDOW_MS) {
    return {
      occurrence_id: String(nextStart),
      starts_at_ms: nextStart,
      ends_at_ms: nextStart + duration,
      phase: "upcoming"
    };
  }
  return null;
}
function eventStorageKey(eventId, version, occurrenceId) {
  return `${eventId}_v${version}_${occurrenceId}`.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 120);
}
function eventEmptyState(campaign, occurrence) {
  return {
    event_id: String(campaign.event_id),
    version: Math.max(1, Number(campaign.version || 1)),
    occurrence_id: occurrence.occurrence_id,
    progress: {},
    claimed: {},
    processed_receipts: []
  };
}
function eventReadState(nk, userId, campaign, occurrence) {
  const key = eventStorageKey(String(campaign.event_id), Math.max(1, Number(campaign.version || 1)), occurrence.occurrence_id);
  const found = nk.storageRead([{ collection: "player_event_progress", key, userId }]);
  const object = found.length > 0 ? found[0] : null;
  const raw = object ? eventObject(object.value) : eventEmptyState(campaign, occurrence);
  return { key, object, state: {
    event_id: String(campaign.event_id),
    version: Math.max(1, Number(campaign.version || 1)),
    occurrence_id: occurrence.occurrence_id,
    progress: eventObject(raw.progress),
    claimed: eventObject(raw.claimed),
    processed_receipts: Array.isArray(raw.processed_receipts) ? raw.processed_receipts.map((id) => String(id)).slice(-200) : []
  } };
}
function eventRequirements(campaign, profile) {
  const requirements = eventObject(campaign.requirements);
  const levelRequired = Math.max(1, Math.floor(Number(requirements.level || 1)));
  const vipRequired = Math.max(0, Math.floor(Number(requirements.vip || 0)));
  const level = Math.max(1, Math.floor(Number(profile.level || 1)));
  const vip = Math.max(0, Math.floor(Number(profile.vip || 0)));
  const missing = {};
  if (level < levelRequired) missing.level = { required: levelRequired, current: level };
  if (vip < vipRequired) missing.vip = { required: vipRequired, current: vip };
  return {
    eligible: Object.keys(missing).length === 0,
    required_level: levelRequired,
    required_vip: vipRequired,
    missing_requirements: missing
  };
}
function eventProfileComplete(compliance) {
  return compliance.is_verified === true && String(compliance.full_name || "").length >= 2 && String(compliance.birth_date || "").length > 0 && String(compliance.id_number || "").length > 0 && String(compliance.phone_number || "").length >= 8 && String(compliance.email || "").indexOf("@") > 0;
}
function eventQuestProgress(quest, state, profile, compliance) {
  const id = String(quest.quest_id || "");
  const type = String(quest.type || "");
  let value = Math.max(0, Number(eventObject(state.progress)[id] || 0));
  if (type === "user_level_reached") value = Math.max(value, Number(profile.level || 1));
  if (type === "profile_complete") value = Math.max(value, eventProfileComplete(compliance) ? 1 : 0);
  return value;
}
function eventRewardTracks(quest) {
  const rewards = eventObject(quest.rewards);
  const normal = Array.isArray(rewards.normal) ? rewards.normal : [];
  const vipRaw = rewards.vip;
  const vip = Array.isArray(vipRaw) ? { required_vip: 1, grants: vipRaw } : {
    required_vip: Math.max(0, Number(eventObject(vipRaw).required_vip || 1)),
    grants: Array.isArray(eventObject(vipRaw).grants) ? eventObject(vipRaw).grants : []
  };
  return { normal, vip };
}
function eventView(campaign, occurrence, state, profile, compliance) {
  const requirements = eventRequirements(campaign, profile);
  const claimed = eventObject(state.claimed);
  const quests = campaign.quests.map((quest) => {
    const id = String(quest.quest_id || "");
    const target = Math.max(1, Number(quest.target || 1));
    const progress = eventQuestProgress(quest, state, profile, compliance);
    const tracks = eventRewardTracks(quest);
    const questClaims = eventObject(claimed[id]);
    return {
      quest_id: id,
      name: String(quest.name || id),
      type: String(quest.type || ""),
      target,
      progress: Math.min(progress, target),
      completed: progress >= target,
      icon_type: String(quest.icon_type || "pack"),
      icon_key: String(quest.icon_key || "gem_pouch"),
      filters: eventObject(quest.filters),
      rewards: tracks,
      claimed: { normal: questClaims.normal === true, vip: questClaims.vip === true }
    };
  });
  let status = occurrence.phase === "upcoming" ? "upcoming" : requirements.eligible ? "processing" : "ineligible";
  if (status === "processing" && quests.length > 0 && quests.every((quest) => quest.completed)) status = "completed";
  return {
    event_id: String(campaign.event_id),
    version: Math.max(1, Number(campaign.version || 1)),
    occurrence_id: occurrence.occurrence_id,
    title: String(campaign.title || "S\u1EF0 KI\u1EC6N"),
    subtitle: String(campaign.subtitle || ""),
    description: String(campaign.description || ""),
    banner_title: String(campaign.banner_title || campaign.title || ""),
    route_id: String(campaign.route_id || ""),
    starts_at_ms: occurrence.starts_at_ms,
    ends_at_ms: occurrence.ends_at_ms,
    status,
    requirements: { level: requirements.required_level, vip: requirements.required_vip },
    missing_requirements: requirements.missing_requirements,
    quests
  };
}
function eventQuestMatches(quest, triggerType, context) {
  if (String(quest.type || "") !== triggerType) return false;
  const filters = eventObject(quest.filters);
  if (triggerType === "specific_stage_clear") {
    const stages = Array.isArray(filters.stage_ids) ? filters.stage_ids : [];
    return stages.length === 0 || stages.indexOf(String(context.stage_id || "")) >= 0;
  }
  if (triggerType === "element_upgrade") {
    const elements = Array.isArray(filters.elements) ? filters.elements : [];
    return elements.length === 0 || elements.indexOf(String(context.element || "")) >= 0;
  }
  if (triggerType === "talisman_enhance") {
    const talismans = Array.isArray(filters.talisman_ids) ? filters.talisman_ids : [];
    return talismans.length === 0 || talismans.map((id) => String(id)).indexOf(String(context.talisman_id || "")) >= 0;
  }
  if (triggerType === "item_earned") {
    const itemId = String(context.item_id || "");
    const ids = Array.isArray(filters.item_ids) ? filters.item_ids : [];
    const prefixes = Array.isArray(filters.item_prefixes) ? filters.item_prefixes : [];
    return ids.length === 0 && prefixes.length === 0 || ids.indexOf(itemId) >= 0 || prefixes.some((prefix) => itemId.indexOf(String(prefix)) === 0);
  }
  return true;
}
function eventRecord(nk, userId, triggerType, amount, context, idempotencyKey) {
  if (!userId || amount <= 0 || !idempotencyKey) return;
  try {
    const now = Date.now();
    const profileObjects = nk.storageRead([{ collection: "player_profiles", key: "main", userId }]);
    if (profileObjects.length === 0) return;
    const profile = eventObject(profileObjects[0].value);
    profile.vip = readVipProgress(nk, userId, vipRuntimeMode).level;
    for (const campaign of eventDefinitions(nk)) {
      const occurrence = eventOccurrence(campaign, now);
      if (!occurrence || occurrence.phase !== "active" || !eventRequirements(campaign, profile).eligible) continue;
      const matching = campaign.quests.filter((quest) => eventQuestMatches(quest, triggerType, context));
      if (matching.length === 0) continue;
      const stored = eventReadState(nk, userId, campaign, occurrence);
      const receipt = `${triggerType}:${idempotencyKey}`.slice(0, 180);
      if (stored.state.processed_receipts.indexOf(receipt) >= 0) continue;
      for (const quest of matching) {
        const questId = String(quest.quest_id || "");
        const previous = Math.max(0, Number(stored.state.progress[questId] || 0));
        stored.state.progress[questId] = triggerType === "user_level_reached" ? Math.max(previous, amount) : previous + amount;
      }
      stored.state.processed_receipts.push(receipt);
      stored.state.processed_receipts = stored.state.processed_receipts.slice(-200);
      nk.storageWrite([{
        collection: "player_event_progress",
        key: stored.key,
        userId,
        value: stored.state,
        permissionRead: 1,
        permissionWrite: 0,
        version: stored.object ? stored.object.version : "*"
      }]);
    }
  } catch (_error) {
  }
}
function eventGrantItem(nk, items, itemId, amount) {
  if (!itemId || amount <= 0 || nk.sqlQuery("SELECT id FROM game_items WHERE id = $1", [itemId]).length === 0) return false;
  const existing = items.find((entry) => entry && String(entry.item_id || "") === itemId && entry.unique !== true);
  if (existing) existing.quantity = Math.max(0, Number(existing.quantity || 0)) + amount;
  else items.push({ item_id: itemId, quantity: amount, acquired_at: (/* @__PURE__ */ new Date()).toISOString() });
  return true;
}
function eventApplyGrants(nk, profile, items, grants) {
  const issued = [];
  for (const raw of grants) {
    const grant = eventObject(raw);
    const type = String(grant.type || "");
    const amount = Math.max(0, Math.floor(Number(grant.amount || 0)));
    if (amount <= 0) return null;
    if (type === "resource") {
      const id = String(grant.id || "");
      if (id !== "gold" && id !== "gems") return null;
      profile.resources = eventObject(profile.resources);
      profile.resources[id] = Math.max(0, Number(profile.resources[id] || 0)) + amount;
      issued.push({ type, id, amount });
    } else if (type === "stamina") {
      profile.stamina = Math.max(Number(profile.stamina || 0), Math.min(30, Math.max(0, Number(profile.stamina || 0)) + amount));
      issued.push({ type, amount });
    } else if (type === "item" || type === "random_item") {
      let id = String(grant.id || "");
      if (type === "random_item") {
        const pool = Array.isArray(grant.pool) ? grant.pool : [];
        if (pool.length === 0) return null;
        id = String(pool[Math.floor(Math.random() * pool.length)] || "");
      }
      if (!eventGrantItem(nk, items, id, amount)) return null;
      issued.push({ type: "item", id, amount });
    } else return null;
  }
  return issued;
}
const eventList = (ctx, _logger, nk, _payload) => {
  const now = Date.now();
  const base = nk.storageRead([
    { collection: "player_profiles", key: "main", userId: ctx.userId },
    { collection: "player_compliance_profiles", key: "profile", userId: ctx.userId }
  ]);
  const profileObject = base.find((entry) => entry.collection === "player_profiles");
  if (!profileObject) return JSON.stringify({ success: false, message: "Player profile is unavailable" });
  const profile = eventObject(profileObject.value);
  profile.vip = readVipProgress(nk, ctx.userId, monetizationMode(ctx)).level;
  const complianceObject = base.find((entry) => entry.collection === "player_compliance_profiles");
  const compliance = complianceObject ? eventObject(complianceObject.value) : {};
  const activeEvents = [];
  const upcomingEvents = [];
  for (const campaign of eventDefinitions(nk)) {
    const occurrence = eventOccurrence(campaign, now);
    if (!occurrence) continue;
    const stored = eventReadState(nk, ctx.userId, campaign, occurrence);
    const view = eventView(campaign, occurrence, stored.state, profile, compliance);
    if (occurrence.phase === "upcoming") upcomingEvents.push(view);
    else activeEvents.push(view);
  }
  const newestFirst = (a, b) => Number(b.starts_at_ms) - Number(a.starts_at_ms);
  activeEvents.sort(newestFirst);
  upcomingEvents.sort(newestFirst);
  return JSON.stringify({ success: true, server_time_ms: now, active_events: activeEvents, upcoming_events: upcomingEvents });
};
const eventClaim = (ctx, _logger, nk, payload) => {
  let req = {};
  try {
    req = JSON.parse(payload || "{}");
  } catch (_error) {
    return JSON.stringify({ success: false, message: "Invalid JSON" });
  }
  const eventId = String(req.event_id || "");
  const occurrenceId = String(req.occurrence_id || "");
  const questId = String(req.quest_id || "");
  const track = String(req.track || "normal");
  if (track !== "normal" && track !== "vip") return JSON.stringify({ success: false, message: "Invalid reward track" });
  const campaign = eventDefinitions(nk).find((entry) => String(entry.event_id) === eventId);
  const occurrence = campaign ? eventOccurrence(campaign, Date.now()) : null;
  if (!campaign || !occurrence || occurrence.phase !== "active" || occurrence.occurrence_id !== occurrenceId) {
    return JSON.stringify({ success: false, message: "Event occurrence is not active" });
  }
  const objects = nk.storageRead([
    { collection: "player_profiles", key: "main", userId: ctx.userId },
    { collection: "player_inventory", key: "items", userId: ctx.userId },
    { collection: "player_compliance_profiles", key: "profile", userId: ctx.userId }
  ]);
  const profileObject = objects.find((entry) => entry.collection === "player_profiles");
  const inventoryObject = objects.find((entry) => entry.collection === "player_inventory");
  const complianceObject = objects.find((entry) => entry.collection === "player_compliance_profiles");
  if (!profileObject || !inventoryObject) return JSON.stringify({ success: false, message: "Player data is incomplete" });
  const profile = eventObject(profileObject.value);
  profile.vip = readVipProgress(nk, ctx.userId, monetizationMode(ctx)).level;
  const inventory = eventObject(inventoryObject.value);
  const items = Array.isArray(inventory.items) ? inventory.items : [];
  const compliance = complianceObject ? eventObject(complianceObject.value) : {};
  const requirements = eventRequirements(campaign, profile);
  if (!requirements.eligible) return JSON.stringify({ success: false, message: "Event requirements are not met" });
  const quest = campaign.quests.find((entry) => String(entry.quest_id || "") === questId);
  if (!quest) return JSON.stringify({ success: false, message: "Unknown event quest" });
  const stored = eventReadState(nk, ctx.userId, campaign, occurrence);
  const progress = eventQuestProgress(quest, stored.state, profile, compliance);
  if (progress < Math.max(1, Number(quest.target || 1))) return JSON.stringify({ success: false, message: "Quest is not completed" });
  const questClaims = eventObject(stored.state.claimed[questId]);
  if (questClaims[track] === true) return JSON.stringify({ success: false, message: "Reward was already claimed" });
  const tracks = eventRewardTracks(quest);
  const grants = track === "normal" ? tracks.normal : tracks.vip.grants;
  if (!Array.isArray(grants) || grants.length === 0) return JSON.stringify({ success: false, message: "Reward track is unavailable" });
  if (track === "vip" && Number(profile.vip || 0) < Number(tracks.vip.required_vip || 1)) {
    return JSON.stringify({ success: false, message: "VIP requirement is not met" });
  }
  const issued = eventApplyGrants(nk, profile, items, grants);
  if (!issued) return JSON.stringify({ success: false, message: "Invalid event reward configuration" });
  questClaims[track] = true;
  stored.state.claimed[questId] = questClaims;
  inventory.items = items;
  const writes = nk.storageWrite([
    {
      collection: "player_profiles",
      key: "main",
      userId: ctx.userId,
      value: profile,
      permissionRead: 1,
      permissionWrite: 0,
      version: profileObject.version
    },
    {
      collection: "player_inventory",
      key: "items",
      userId: ctx.userId,
      value: inventory,
      permissionRead: 1,
      permissionWrite: 0,
      version: inventoryObject.version
    },
    {
      collection: "player_event_progress",
      key: stored.key,
      userId: ctx.userId,
      value: stored.state,
      permissionRead: 1,
      permissionWrite: 0,
      version: stored.object ? stored.object.version : "*"
    }
  ]);
  if (writes.length !== 3) return JSON.stringify({ success: false, message: "Could not persist event reward" });
  return JSON.stringify({
    success: true,
    event_id: eventId,
    occurrence_id: occurrenceId,
    quest_id: questId,
    track,
    grants: issued,
    profile,
    inventory: items,
    event: eventView(campaign, occurrence, stored.state, profile, compliance)
  });
};

function processSeedExtensions(row, table) {
  if (!row) return row;
  const columns = seedExtensionColumns()[table] || {};
  Object.keys(columns).forEach((key) => {
    if (row[key] === null || row[key] === void 0) delete row[key];
    else if (columns[key] === "JSONB") row[key] = parseJsonb(row[key]);
  });
  return row;
}
function decodeUtf8Bytes(val) {
  let str = "";
  const batchSize = 1e3;
  for (let i = 0; i < val.length; i += batchSize) {
    str += String.fromCharCode.apply(null, val.slice(i, i + batchSize));
  }
  try {
    return decodeURIComponent(escape(str));
  } catch (e) {
    let out = "";
    let i = 0;
    while (i < val.length) {
      const c = val[i++];
      if (c < 128) {
        out += String.fromCharCode(c);
      } else if (c > 191 && c < 224) {
        const c2 = val[i++];
        out += String.fromCharCode((c & 31) << 6 | c2 & 63);
      } else if (c > 223 && c < 240) {
        const c2 = val[i++];
        const c3 = val[i++];
        out += String.fromCharCode((c & 15) << 12 | (c2 & 63) << 6 | c3 & 63);
      } else if (c > 239 && c < 248) {
        const c2 = val[i++];
        const c3 = val[i++];
        const c4 = val[i++];
        const u = ((c & 7) << 18 | (c2 & 63) << 12 | (c3 & 63) << 6 | c4 & 63) - 65536;
        out += String.fromCharCode((u >> 10) + 55296, (u & 1023) + 56320);
      }
    }
    return out;
  }
}
function parseJsonb(val) {
  if (val === null || val === void 0) return null;
  if (typeof val === "string") {
    try {
      return JSON.parse(val);
    } catch (e) {
      return val;
    }
  }
  const isByteView = typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(val);
  if (Array.isArray(val) || isByteView) {
    const bytes = Array.isArray(val) ? val : Array.prototype.slice.call(val);
    if (bytes.length > 0 && typeof bytes[0] === "number") {
      try {
        const jsonStr = decodeUtf8Bytes(bytes);
        return JSON.parse(jsonStr);
      } catch (e) {
        return val;
      }
    }
  }
  return val;
}
function processHero(row) {
  if (!row) return row;
  processSeedExtensions(row, "heroes");
  row.attributes = parseJsonb(row.attributes);
  row.level_up_stats = parseJsonb(row.level_up_stats);
  row.price = parseJsonb(row.price);
  row.require = parseJsonb(row.require);
  row.skill_pool = parseJsonb(row.skill_pool);
  row.starting_skills = parseJsonb(row.starting_skills);
  return row;
}
function processEnemy(row) {
  if (!row) return row;
  row.attributes = parseJsonb(row.attributes);
  row.boss_skills = parseJsonb(row.boss_skills);
  row.attack_effects = parseJsonb(row.attack_effects);
  row.generic_skills = parseJsonb(row.generic_skills);
  row.reward = parseJsonb(row.reward);
  row.skills = parseJsonb(row.skills);
  return row;
}
function processItem(row) {
  if (!row) return row;
  row.attributes = parseJsonb(row.attributes);
  row.tags = parseJsonb(row.tags);
  return row;
}
function processSkill(row) {
  if (!row) return row;
  const metadata = parseJsonb(row.metadata);
  delete row.metadata;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    Object.keys(metadata).forEach((key) => {
      if (!(key in row)) row[key] = metadata[key];
    });
  }
  row.levels = parseJsonb(row.levels);
  row.criteria_unlock = parseJsonb(row.criteria_unlock);
  row.positioning = parseJsonb(row.positioning);
  row.deployment = parseJsonb(row.deployment);
  row.vfx_frames = parseJsonb(row.vfx_frames);
  row.cast_config = parseJsonb(row.cast_config) || {};
  row.description_rows = parseJsonb(row.description_rows) || [];
  return row;
}
function processArc(row) {
  if (!row) return row;
  processSeedExtensions(row, "arcs");
  row.enabled_if = parseJsonb(row.enabled_if);
  row.stage_ids = parseJsonb(row.stage_ids);
  return row;
}
function processCard(row) {
  if (!row) return row;
  processSeedExtensions(row, "cards");
  row.effect = parseJsonb(row.effect);
  return row;
}
function processTalisman(row) {
  if (!row) return row;
  processSeedExtensions(row, "talismans");
  row.stats = parseJsonb(row.stats);
  row.materials = parseJsonb(row.materials);
  if (!row.name && row.display_name) row.name = row.display_name;
  return row;
}
function processEffect(row) {
  if (!row) return row;
  row.default_props = parseJsonb(row.default_props);
  const metadata = parseJsonb(row.metadata);
  delete row.metadata;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    Object.assign(row, metadata);
  }
  return row;
}
function processStage(row, nk) {
  if (!row) return row;
  processSeedExtensions(row, "stages");
  row.enabled_if = parseJsonb(row.enabled_if);
  row.difficulty_levels = parseJsonb(row.difficulty_levels);
  row.loot_table = parseJsonb(row.loot_table);
  const waves = nk.sqlQuery(
    "SELECT * FROM game_stage_waves WHERE stage_id = $1 ORDER BY wave_index",
    [row.id]
  );
  row.waves = waves.map((w) => ({
    id: w.wave_id || w.id,
    wave_id: w.wave_id,
    display_name: w.display_name,
    entries: parseJsonb(w.entries)
  }));
  return row;
}
function processStageLevel(row) {
  if (!row) return row;
  row.enemy_modifiers = parseJsonb(row.enemy_modifiers);
  row.loot_table = parseJsonb(row.loot_table);
  row.boss_loot_table = parseJsonb(row.boss_loot_table);
  row.unlock_condition = parseJsonb(row.unlock_condition);
  row.stage_rules = parseJsonb(row.stage_rules);
  row.ui = parseJsonb(row.ui);
  return row;
}
function stageLevelsWithCompletionLoot(nk) {
  const base = nk, readOnly = Object.create(base), reads = {};
  readOnly.sqlQuery = (query, args) => {
    const key = JSON.stringify([query, args]);
    if (!Object.prototype.hasOwnProperty.call(reads, key)) reads[key] = base.sqlQuery(query, args);
    return reads[key];
  };
  nk = readOnly;
  const stages = nk.sqlQuery("SELECT id,arc_id,is_boss FROM game_stages", []);
  const rules = sweepConfig(nk), ticketProbabilities = rules.ticket_probabilities;
  return nk.sqlQuery("SELECT * FROM game_stage_levels ORDER BY stage_id, sort_order, id", []).map((raw) => {
    const row = processStageLevel(raw), stage = stages.find((s) => s.id === row.stage_id);
    if (stage) row.completion_loot = stageCompletionLoot(nk, stage, row, ticketProbabilities, rules);
    return row;
  });
}
function buildStoreConfigs(nk) {
  const products = nk.sqlQuery("SELECT * FROM game_store_products ORDER BY tab_id, product_id", []);
  const platformProducts = nk.sqlQuery("SELECT platform,product_id,store_product_id,active FROM game_store_platform_products ORDER BY platform,product_id", []);
  const packsByTab = {};
  let firstTopup = {};
  products.forEach((row) => {
    const ui = parseJsonb(row.ui) || {};
    const rewards = nk.sqlQuery(
      "SELECT reward_type, reward_id, quantity, metadata FROM game_store_product_rewards WHERE product_id = $1 ORDER BY line_no",
      [row.product_id]
    ).map((reward) => ({
      reward_type: String(reward.reward_type),
      reward_id: String(reward.reward_id),
      quantity: Number(reward.quantity),
      metadata: parseJsonb(reward.metadata) || {}
    }));
    ui.product_id = String(row.product_id);
    ui.store_product_ids = { android: String(row.product_id) };
    for (const mapping of platformProducts) if (String(mapping.product_id) === String(row.product_id)) {
      if (mapping.active === true) ui.store_product_ids[String(mapping.platform)] = String(mapping.store_product_id);
      else delete ui.store_product_ids[String(mapping.platform)];
    }
    ui.id = String(row.pack_id);
    ui.active = row.active === true;
    ui.fulfillment_type = String(row.fulfillment_type);
    ui.rewards = rewards;
    if (String(row.tab_id) === "first_topup") {
      ui.grant_lines = rewards;
      ui.rewards = Array.isArray(ui.presentation_rewards) ? ui.presentation_rewards : [];
      firstTopup = ui;
    } else {
      const tabId = String(row.tab_id);
      if (!packsByTab[tabId]) packsByTab[tabId] = [];
      packsByTab[tabId].push(ui);
    }
  });
  return { packs: { packs_by_tab: packsByTab }, first_topup: firstTopup };
}
function readContentConfig(nk, id) {
  const rows = nk.sqlQuery("SELECT payload FROM game_content_configs WHERE id = $1 AND active = TRUE", [id]);
  return rows.length > 0 ? parseJsonb(rows[0].payload) || {} : {};
}
const getGameConfig = (ctx, logger, nk, payload) => {
  const req = JSON.parse(payload);
  const table = req.table;
  switch (table) {
    case "heroes":
      return JSON.stringify(nk.sqlQuery("SELECT * FROM game_heroes ORDER BY id", []).map(processHero));
    case "enemies":
      return JSON.stringify(nk.sqlQuery("SELECT * FROM game_enemies ORDER BY id", []).map(processEnemy));
    case "items":
      return JSON.stringify(nk.sqlQuery("SELECT * FROM game_items ORDER BY sort_order, id", []).map(processItem));
    case "skills":
      return JSON.stringify(nk.sqlQuery("SELECT * FROM game_skills ORDER BY id", []).map(processSkill));
    case "arcs":
      return JSON.stringify(nk.sqlQuery("SELECT * FROM game_arcs ORDER BY sort_order, id", []).map(processArc));
    case "cards":
      return JSON.stringify(nk.sqlQuery("SELECT * FROM game_cards ORDER BY id", []).map(processCard));
    case "talismans":
      return JSON.stringify(nk.sqlQuery("SELECT * FROM game_talismans ORDER BY id", []).map(processTalisman));
    case "effects":
      return JSON.stringify(nk.sqlQuery("SELECT * FROM game_effects ORDER BY id", []).map(processEffect));
    case "stages": {
      const stages = nk.sqlQuery("SELECT * FROM game_stages ORDER BY sort_order, level, id", []);
      return JSON.stringify(stages.map((s) => processStage(s, nk)));
    }
    case "stage_levels":
      return JSON.stringify(stageLevelsWithCompletionLoot(nk));
    case "progression": {
      const rows = nk.sqlQuery("SELECT value FROM game_config WHERE key = 'progression'", []);
      return rows.length > 0 ? JSON.stringify(parseJsonb(rows[0].value)) : "{}";
    }
    case "packs":
      return JSON.stringify(buildStoreConfigs(nk).packs);
    case "first_topup":
      return JSON.stringify(buildStoreConfigs(nk).first_topup);
    case "daily_checkin":
      return JSON.stringify(readContentConfig(nk, "daily_checkin"));
    case "events":
      return JSON.stringify(readContentConfig(nk, "events"));
    case "tribulation":
      return JSON.stringify(readContentConfig(nk, "tribulation"));
    case "all": {
      const result = { schema_version: 2 };
      result.heroes = nk.sqlQuery("SELECT * FROM game_heroes ORDER BY id", []).map(processHero);
      result.enemies = nk.sqlQuery("SELECT * FROM game_enemies ORDER BY id", []).map(processEnemy);
      result.items = nk.sqlQuery("SELECT * FROM game_items ORDER BY sort_order, id", []).map(processItem);
      result.skills = nk.sqlQuery("SELECT * FROM game_skills ORDER BY id", []).map(processSkill);
      result.arcs = nk.sqlQuery("SELECT * FROM game_arcs ORDER BY sort_order, id", []).map(processArc);
      result.cards = nk.sqlQuery("SELECT * FROM game_cards ORDER BY id", []).map(processCard);
      result.effects = nk.sqlQuery("SELECT * FROM game_effects ORDER BY id", []).map(processEffect);
      const stages = nk.sqlQuery("SELECT * FROM game_stages ORDER BY sort_order, level, id", []);
      result.stages = stages.map((s) => processStage(s, nk));
      result.stage_levels = stageLevelsWithCompletionLoot(nk);
      const progRows = nk.sqlQuery("SELECT value FROM game_config WHERE key = 'progression'", []);
      result.progression = progRows.length > 0 ? parseJsonb(progRows[0].value) : {};
      const store = buildStoreConfigs(nk);
      result.packs = store.packs;
      result.first_topup = store.first_topup;
      result.daily_checkin = readContentConfig(nk, "daily_checkin");
      result.events = readContentConfig(nk, "events");
      result.stamina = readContentConfig(nk, "stamina");
      result.tribulation = readContentConfig(nk, "tribulation");
      result.enemy_skills = readContentConfig(nk, "enemy_skills");
      result.boss_skills = readContentConfig(nk, "boss_skills");
      result.vip = readContentConfig(nk, "vip");
      result.rewarded_ads = rewardedAdsConfig(nk);
      result.talismans = nk.sqlQuery("SELECT * FROM game_talismans ORDER BY id", []).map(processTalisman);
      return JSON.stringify(result);
    }
    default:
      throw new Error(`Unknown config table: ${table}`);
  }
};
function compareVersions(left, right) {
  const a = left.split(".").map((v) => Number(v) || 0);
  const b = right.split(".").map((v) => Number(v) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) < (b[i] || 0) ? -1 : 1;
  }
  return 0;
}
const getConfigBootstrap = (ctx, _logger, nk, payload) => {
  if (!ctx.userId) return JSON.stringify({ status: "error", code: 401, message: "Authentication required" });
  let request = {};
  try {
    request = JSON.parse(payload || "{}");
  } catch (_e) {
    return JSON.stringify({ status: "error", code: 400, message: "Invalid JSON" });
  }
  const platform = String(request.platform || "").toLowerCase();
  if (platform !== "android" && platform !== "ios") {
    return JSON.stringify({ status: "error", code: 400, message: "Unsupported platform" });
  }
  const release = nk.sqlQuery(`SELECT config_version, snapshot, min_app_version, latest_app_version, store_url,
        EXTRACT(EPOCH FROM NOW())::BIGINT AS server_time
        FROM remote_config_releases ORDER BY config_version DESC LIMIT 1`, []);
  if (release.length === 0) return JSON.stringify({ status: "error", code: 503, message: "No config release" });
  const row = release[0];
  const snapshot = parseJsonb(row.snapshot) || {};
  const urls = snapshot.system && snapshot.system.store_urls;
  row.store_url = urls && typeof urls[platform] === "string" ? urls[platform] : platform === "android" ? row.store_url : "";
  const appVersion = String(request.app_version || "0.0.0");
  if (compareVersions(appVersion, String(row.min_app_version)) < 0) {
    return JSON.stringify({
      status: "force_update",
      config_version: Number(row.config_version),
      min_app_version: row.min_app_version,
      latest_app_version: row.latest_app_version,
      store_url: row.store_url,
      server_time: Number(row.server_time)
    });
  }
  return JSON.stringify({
    status: compareVersions(appVersion, String(row.latest_app_version)) < 0 ? "soft_update" : "ok",
    config_version: Number(row.config_version),
    min_app_version: row.min_app_version,
    latest_app_version: row.latest_app_version,
    store_url: row.store_url,
    config: parseJsonb(row.snapshot),
    server_time: Number(row.server_time)
  });
};
function getActiveRemoteConfig(nk) {
  const rows = nk.sqlQuery("SELECT config_version, snapshot FROM remote_config_releases ORDER BY config_version DESC LIMIT 1", []);
  if (rows.length === 0) return { version: 0, config: {} };
  return { version: Number(rows[0].config_version || 0), config: parseJsonb(rows[0].snapshot) || {} };
}
function isRemoteFlagEnabled(nk, key) {
  const active = getActiveRemoteConfig(nk);
  return Boolean(active.config && active.config.system && active.config.system[key] === true);
}
function getRemoteConfigValue(nk, module, key, fallback) {
  const active = getActiveRemoteConfig(nk);
  const values = active.config && active.config[module];
  return values && values[key] !== void 0 ? values[key] : fallback;
}
function invokeWithVersionGate(ctx, logger, nk, payload, handler) {
  let request = {};
  try {
    request = JSON.parse(payload || "{}");
  } catch (_e) {
    return JSON.stringify({ status: "error", code: 400, message: "Invalid JSON" });
  }
  const active = getActiveRemoteConfig(nk);
  const minVersion = String(getRemoteConfigValue(nk, "system", "min_app_version", "0.0.0"));
  const appVersion = String(request.app_version || "0.0.0");
  if (compareVersions(appVersion, minVersion) < 0) {
    return JSON.stringify({
      status: "force_update",
      error: "force_update",
      code: 426,
      config_version: active.version,
      min_app_version: minVersion,
      latest_app_version: getRemoteConfigValue(nk, "system", "latest_app_version", minVersion),
      store_url: ""
    });
  }
  const raw = handler(ctx, logger, sweepResourceRuntime(nk, ctx.userId), payload);
  try {
    const response = JSON.parse(raw || "{}");
    if (response && typeof response === "object" && !Array.isArray(response)) {
      response.config_version = active.version;
      return JSON.stringify(response);
    }
  } catch (_e) {
  }
  return raw;
}
const gatedGetGameConfig = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, getGameConfig);
const gatedPublishConfigRelease = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, publishConfigRelease);
const gatedSavePlayerProfile = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, savePlayerProfile);
const gatedLoadPlayerProfile = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, loadPlayerProfile);
const gatedAbandonRun = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, abandonRun);
const gatedUpdateInventory = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, updateInventory);
const gatedTalismanAction = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, talismanAction);
const gatedStorePurchase = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, storePurchase);
const gatedTalismanCast = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, talismanCast);
const gatedUseConsumable = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, useConsumable);
const gatedSpendResource = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, spendResource);
const gatedPurchaseStamina = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, purchaseStamina);
const gatedPurchaseHero = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, purchaseHero);
const gatedStartStage = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, startStage);
const gatedUpgradeElement = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, upgradeElement);
const gatedAwardStageProgression = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, awardStageProgression);
const gatedTribulationAction = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, tribulationAction);
const gatedGetMonetizationStatus = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, getMonetizationStatus);
const gatedGetDailyPackStatus = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, getDailyPackStatus);
const gatedClaimDailyPack = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, claimDailyPack);
const gatedCreatePurchaseOrder = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, createPurchaseOrder);
const gatedSyncPlayPurchase = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, syncPlayPurchase);
const gatedIapGoogleClaim = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, iapGoogleClaim);
const gatedPrepareRewardedAd = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, prepareRewardedAd);
const gatedConfirmRewardedAd = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, confirmRewardedAd);
const gatedConsumeAdGameplayReward = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, consumeAdGameplayReward);
const gatedSaveComplianceProfile = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, saveComplianceProfile);
const gatedGetComplianceProfile = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, getComplianceProfile);
const gatedDailyCheckinStatus = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, dailyCheckinStatus);
const gatedDailyCheckinClaim = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, dailyCheckinClaim);
const gatedEventList = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, eventList);
const gatedEventClaim = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, eventClaim);
function parseRemoteSetting(valueType, raw) {
  if (valueType === "int") {
    const value = Number(raw);
    if (!Number.isInteger(value)) throw new Error("Expected int");
    return value;
  }
  if (valueType === "float") {
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new Error("Expected float");
    return value;
  }
  if (valueType === "bool") {
    if (raw !== "true" && raw !== "false") throw new Error("Expected bool");
    return raw === "true";
  }
  if (valueType === "json") return JSON.parse(raw);
  if (valueType === "string") return raw;
  throw new Error("Unknown setting type");
}
const publishConfigRelease = (ctx, _logger, nk, payload) => {
  if (!ctx.userId || ctx.userId !== String(ctx.env.CONFIG_ADMIN_USER_ID || "")) {
    return JSON.stringify({ status: "error", code: 403, message: "Forbidden" });
  }
  let request = {};
  try {
    request = JSON.parse(payload || "{}");
  } catch (_e) {
    return JSON.stringify({ status: "error", code: 400, message: "Invalid JSON" });
  }
  const rows = nk.sqlQuery("SELECT module, key, value_type, value FROM remote_config_settings WHERE is_active = TRUE ORDER BY module, key", []);
  const snapshot = { system: {}, game_play: {} };
  try {
    rows.forEach((row) => {
      snapshot[String(row.module)][String(row.key)] = parseRemoteSetting(String(row.value_type), String(row.value));
    });
  } catch (e) {
    return JSON.stringify({ status: "error", code: 422, message: String(e) });
  }
  const minVersion = String(snapshot.system.min_app_version || "");
  if (snapshot.system.mailbox !== void 0) {
    const mail = snapshot.system.mailbox;
    if (!mail || !Number.isSafeInteger(mail.warning_hours) || mail.warning_hours < 1 || mail.warning_hours > 720 || !Number.isSafeInteger(mail.retention_days) || mail.retention_days < 1 || mail.retention_days > 365)
      return JSON.stringify({ status: "error", code: 422, message: "Invalid system.mailbox" });
  }
  if (snapshot.system.stage_sweep !== void 0) {
    try {
      sweepValidateConfig(snapshot.system.stage_sweep);
    } catch (_error) {
      return JSON.stringify({ status: "error", code: 422, message: "Invalid system.stage_sweep" });
    }
  }
  if (!validRewardedAdsConfig(snapshot.system.rewarded_ads)) return JSON.stringify({ status: "error", code: 422, message: "Missing or invalid system.rewarded_ads" });
  if (snapshot.system.leaderboard_rewards !== void 0 && (!validWeeklyLeaderboardConfig(snapshot.system.leaderboard_rewards) || !weeklyConfigItemsExist(nk, snapshot.system.leaderboard_rewards))) return JSON.stringify({ status: "error", code: 422, message: "Invalid system.leaderboard_rewards or unknown reward items" });
  const latestVersion = String(snapshot.system.latest_app_version || "");
  if (typeof snapshot.system.ads_enabled !== "boolean" || typeof snapshot.system.payment_enabled !== "boolean") {
    return JSON.stringify({ status: "error", code: 422, message: "Missing or invalid monetization flags" });
  }
  if (!minVersion || !latestVersion || compareVersions(minVersion, latestVersion) > 0) {
    return JSON.stringify({ status: "error", code: 422, message: "Invalid app-version settings" });
  }
  const active = getActiveRemoteConfig(nk);
  const version = active.version + 1;
  nk.sqlExec(
    `INSERT INTO remote_config_releases
        (config_version, snapshot, min_app_version, latest_app_version, store_url, published_by)
        VALUES ($1, $2::jsonb, $3, $4, $5, $6)`,
    [version, JSON.stringify(snapshot), minVersion, latestVersion, String(request.store_url || ""), ctx.userId]
  );
  return JSON.stringify({ status: "ok", config_version: version });
};

const HERO_ID_MIGRATIONS = { ice_demoness: "hero_1", flame_archer: "hero_2" };
const adminTestAccess = (ctx, _logger, nk) => {
  if (!ctx.userId) return JSON.stringify({ success: true, allowed: false });
  const rows = nk.sqlQuery(
    "SELECT 1 FROM users WHERE id=$1::UUID AND LOWER(email)=LOWER($2) AND COALESCE(EXTRACT(EPOCH FROM disable_time),0)=0 LIMIT 1",
    [ctx.userId, "lkvu92@gmail.com"]
  );
  return JSON.stringify({ success: true, allowed: rows.length > 0 });
};
function ensurePlayerName(nk, userId, profile) {
  if (!Number.isSafeInteger(Number(profile.name_changes_used || 0)) || Number(profile.name_changes_used || 0) < 0) throw new Error("Invalid rename counter");
  const identities = nk.storageRead([{ collection: "player_identity", key: "name", userId }]);
  if (identities.length) {
    const identity = identities[0].value;
    if (!Number.isSafeInteger(Number(identity.name_changes_used || 0)) || Number(identity.name_changes_used || 0) < 0) throw new Error("Invalid identity rename counter");
    const used = Math.max(0, Number(identity.name_changes_used || 0), Number(profile.name_changes_used || 0));
    const changed = profile.display_name !== identity.display_name || Number(profile.name_changes_used || 0) !== used;
    if (Number(identity.name_changes_used || 0) !== used) nk.storageWrite([{
      collection: "player_identity",
      key: "name",
      userId,
      value: Object.assign({}, identity, { name_changes_used: used }),
      permissionRead: 1,
      permissionWrite: 0,
      version: identities[0].version
    }]);
    profile.display_name = identity.display_name;
    profile.name_changes_used = used;
    return changed;
  }
  const account = nk.accountGetId(userId);
  const existing = String(profile.display_name || "").trim();
  const generatedGoogle = !!account.user.googleId && existing === String(account.user.username || "") && !Number(profile.name_changes_used || 0);
  if (!existing || generatedGoogle) profile.display_name = account.user.googleId ? "Tu Gi\u1EA3 " + nk.uuidv4().replace(/-/g, "").slice(0, 6).toUpperCase() : String(account.user.username || "").trim() || "Tu Gi\u1EA3 " + nk.uuidv4().replace(/-/g, "").slice(0, 6).toUpperCase();
  nk.storageWrite([{
    collection: "player_identity",
    key: "name",
    userId,
    value: { display_name: profile.display_name, name_changes_used: Math.max(0, Number(profile.name_changes_used || 0)) },
    permissionRead: 1,
    permissionWrite: 0,
    version: "*"
  }]);
  return !existing || generatedGoogle;
}
const renamePlayer = (ctx, _logger, nk, payload) => {
  const fail = (code, message) => JSON.stringify({ success: false, code, message });
  if (!ctx.userId) return fail(401, "C\u1EA7n \u0111\u0103ng nh\u1EADp l\u1EA1i.");
  let req;
  try {
    req = JSON.parse(payload || "{}");
  } catch (_e) {
    return fail(400, "T\xEAn ng\u01B0\u1EDDi ch\u01A1i kh\xF4ng h\u1EE3p l\u1EC7.");
  }
  if (!req || typeof req.display_name !== "string" || req.display_name.length > 200) return fail(400, "T\xEAn ng\u01B0\u1EDDi ch\u01A1i kh\xF4ng h\u1EE3p l\u1EC7.");
  const name = req.display_name.trim();
  if (Array.from(name).length < 3 || Array.from(name).length > 24 || /[\x00-\x1f\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff<>\[\]]/.test(name))
    return fail(400, "T\xEAn c\u1EA7n t\u1EEB 3 \u0111\u1EBFn 24 k\xFD t\u1EF1, kh\xF4ng ch\u1EE9a k\xFD t\u1EF1 \u0111i\u1EC1u khi\u1EC3n ho\u1EB7c k\xFD hi\u1EC7u \u0111\u1ECBnh d\u1EA1ng.");
  const rows = nk.storageRead([{ collection: "player_profiles", key: "main", userId: ctx.userId }]);
  if (!rows.length) return fail(409, "Ch\u01B0a t\u1EA3i \u0111\u01B0\u1EE3c h\u1ED3 s\u01A1. H\xE3y \u0111\u0103ng nh\u1EADp l\u1EA1i.");
  const profile = rows[0].value;
  try {
    ensurePlayerName(nk, ctx.userId, profile);
  } catch (_e) {
    return fail(409, "Ch\u01B0a \u0111\u1ED3ng b\u1ED9 \u0111\u01B0\u1EE3c l\u01B0\u1EE3t \u0111\u1ED5i t\xEAn. H\xE3y t\u1EA3i l\u1EA1i h\u1ED3 s\u01A1.");
  }
  const identities = nk.storageRead([{ collection: "player_identity", key: "name", userId: ctx.userId }]);
  const used = Math.max(0, Number(profile.name_changes_used || 0));
  const inventoryRows = nk.storageRead([{ collection: "player_inventory", key: "items", userId: ctx.userId }]);
  const inventoryValue = inventoryRows.length ? inventoryRows[0].value : { items: [] };
  if (profile.display_name === name) return used > 0 ? JSON.stringify({ success: true, display_name: name, name_changes_used: used, idempotent: true, inventory: inventoryValue.items || [] }) : fail(400, "H\xE3y nh\u1EADp t\xEAn m\u1EDBi kh\xE1c t\xEAn hi\u1EC7n t\u1EA1i.");
  const items = Array.isArray(inventoryValue.items) ? inventoryValue.items : [];
  if (used >= 1) {
    const card = items.find((entry) => entry.item_id === "rename_talisman" && Number.isSafeInteger(entry.quantity) && entry.quantity > 0);
    if (!card) return fail(409, "C\u1EA7n 1 Th\u1EBB \u0111\u1ED5i t\xEAn. B\u1EA1n \u0111\xE3 s\u1EED d\u1EE5ng l\u01B0\u1EE3t \u0111\u1ED5i t\xEAn mi\u1EC5n ph\xED.");
    card.quantity -= 1;
    inventoryValue.items = items.filter((entry) => entry.quantity > 0);
  }
  profile.display_name = name;
  profile.name_changes_used = used + 1;
  const writes = [
    {
      collection: "player_profiles",
      key: "main",
      userId: ctx.userId,
      value: profile,
      permissionRead: 1,
      permissionWrite: 0,
      version: rows[0].version
    },
    {
      collection: "player_identity",
      key: "name",
      userId: ctx.userId,
      value: { display_name: name, name_changes_used: used + 1 },
      permissionRead: 1,
      permissionWrite: 0,
      version: identities[0].version
    }
  ];
  if (used >= 1) writes.push({
    collection: "player_inventory",
    key: "items",
    userId: ctx.userId,
    value: inventoryValue,
    permissionRead: 1,
    permissionWrite: 0,
    version: inventoryRows[0].version
  });
  try {
    nk.storageWrite(writes);
  } catch (_e) {
    return fail(409, "H\u1ED3 s\u01A1 \u0111\xE3 thay \u0111\u1ED5i. H\xE3y t\u1EA3i l\u1EA1i h\u1ED3 s\u01A1 tr\u01B0\u1EDBc khi th\u1EED l\u1EA1i.");
  }
  return JSON.stringify({
    success: true,
    display_name: name,
    name_changes_used: used + 1,
    used_free: used === 0,
    consumed_item_id: used >= 1 ? "rename_talisman" : "",
    inventory: inventoryValue.items || []
  });
};
const setPlayerAvatar = (ctx, _logger, nk, payload) => {
  if (!ctx.userId) return JSON.stringify({ success: false, code: 401, message: "Authentication required" });
  let req;
  try {
    req = JSON.parse(payload || "{}");
  } catch (_e) {
    return JSON.stringify({ success: false, code: 400, message: "Invalid JSON" });
  }
  if (!req || typeof req !== "object" || Array.isArray(req)) return JSON.stringify({ success: false, code: 400 });
  const heroId = String(req.hero_id || "");
  const heroes = nk.storageRead([{ collection: "player_heroes", key: "states", userId: ctx.userId }]);
  const owned = canonicalHeroStates(nk, heroes.length ? heroes[0].value : null).some((hero) => hero.hero_id === heroId && hero.owned === true);
  if (!owned) return JSON.stringify({ success: false, code: 403, message: "Hero is not owned" });
  const profiles = nk.storageRead([{ collection: "player_profiles", key: "main", userId: ctx.userId }]);
  if (!profiles.length) return JSON.stringify({ success: false, code: 409, message: "Profile is not available" });
  const profile = profiles[0].value || {};
  if (profile.avatar_url !== heroId) {
    profile.avatar_url = heroId;
    profile.avatar_revision = Math.max(Date.now(), Number(profile.avatar_revision || 0) + 1);
    try {
      nk.storageWrite([{ collection: "player_profiles", key: "main", userId: ctx.userId, value: profile, version: profiles[0].version, permissionRead: 1, permissionWrite: 0 }]);
    } catch (_e) {
      return JSON.stringify({ success: false, code: 409, message: "Profile changed; please retry" });
    }
  }
  return JSON.stringify({ success: true, avatar_url: heroId, avatar_revision: Number(profile.avatar_revision || 0) });
};
const getPlayerAvatars = (ctx, _logger, nk, payload) => {
  if (!ctx.userId) return JSON.stringify({ success: false, code: 401 });
  let req;
  try {
    req = JSON.parse(payload || "{}");
  } catch (_e) {
    return JSON.stringify({ success: false, code: 400 });
  }
  if (!req || typeof req !== "object" || Array.isArray(req)) return JSON.stringify({ success: false, code: 400 });
  if (!Array.isArray(req.user_ids) || req.user_ids.length > 20) return JSON.stringify({ success: false, code: 400 });
  const ids = [];
  for (const id of req.user_ids) {
    if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return JSON.stringify({ success: false, code: 400 });
    if (ids.indexOf(id) < 0) ids.push(id);
  }
  const avatars = {};
  if (!ids.length) return JSON.stringify({ success: true, avatars });
  const catalog = nk.sqlQuery("SELECT id FROM game_heroes ORDER BY id", []).map((row) => String(row.id));
  const objects = nk.storageRead(ids.map((userId) => ({ collection: "player_profiles", key: "main", userId })));
  for (const object of objects) {
    const avatar = String((object.value || {}).avatar_url || "");
    avatars[object.userId] = catalog.indexOf(avatar) >= 0 ? avatar : "hero_1";
  }
  return JSON.stringify({ success: true, avatars });
};
function defaultPlayerProfile(displayName) {
  return {
    display_name: displayName,
    avatar_url: "hero_1",
    level: 1,
    exp: 0,
    next_level_exp: 1e3,
    progression_version: 2,
    vip: 0,
    vip_exp: 0,
    stamina: 30,
    last_stamina_update: 0,
    resources: { gold: 1e3, gems: 100 },
    elements: { metal: 0, wood: 0, water: 0, fire: 0, earth: 0 },
    unlocked_arcs: ["arc_0", "arc_2"],
    unlocked_stages: [
      { stage_id: "stage_0_1", unlocked_levels: ["normal", "epic", "legend"] },
      { stage_id: "stage_flame_frontier", unlocked_levels: ["normal"] }
    ],
    completed_stage_levels: []
  };
}
function defaultPlayerSettings() {
  return { master_volume: 1, music: 1, sfx: 1, show_damage: true, show_enemy_hp: true };
}
function canonicalHeroStates(nk, source) {
  const byId = {};
  const states = source && Array.isArray(source.heroes) ? source.heroes : [];
  for (const entry of states) {
    if (!entry || !entry.hero_id) continue;
    const id = String(entry.hero_id);
    const targetId = HERO_ID_MIGRATIONS[id] || id;
    if (!byId[targetId] || id === targetId) byId[targetId] = entry;
  }
  const rows = nk.sqlQuery("SELECT id, price, attributes FROM game_heroes ORDER BY id", []);
  return rows.map((hero) => {
    const id = String(hero.id);
    const existing = byId[id];
    const price = parseJsonObject(hero.price);
    const freeHero = Number(price.gold || 0) <= 0 && Number(price.gems || 0) <= 0;
    return {
      hero_id: id,
      level: existing ? Math.max(1, Number(existing.level || 1)) : 1,
      exp: existing ? Math.max(0, Number(existing.exp || 0)) : 0,
      next_level_exp: existing ? Math.max(0, Number(existing.next_level_exp || 1e3)) : 1e3,
      owned: existing ? existing.owned === true : freeHero,
      current_attribute: existing && existing.current_attribute ? existing.current_attribute : parseJsonObject(hero.attributes)
    };
  });
}
const savePlayerProfile = (ctx, logger, nk, payload) => {
  const data = JSON.parse(payload);
  const writes = [];
  const stored = nk.storageRead([
    { collection: "player_profiles", key: "main", userId: ctx.userId },
    { collection: "player_heroes", key: "states", userId: ctx.userId }
  ]);
  let storedProfile = null;
  let storedHeroes = null;
  for (const object of stored) {
    if (object.collection === "player_profiles") storedProfile = object;
    if (object.collection === "player_heroes") storedHeroes = object;
  }
  if (data.profile || !storedProfile) {
    if (storedProfile) {
      const authoritative = storedProfile.value || {};
      cultivationEnsureProfile(nk, authoritative, false);
      data.profile.resources = authoritative.resources || { gold: 0, gems: 0 };
      [
        "talent_tier",
        "talent_score",
        "main_element",
        "element_affinities",
        "affinity_flags",
        "comprehension_points",
        "unlocked_laws",
        "breakthrough"
      ].forEach((key) => {
        data.profile[key] = authoritative[key];
      });
      data.profile = Object.assign({}, authoritative, {
        display_name: String(authoritative.display_name || ""),
        // Explicit avatar changes use set_player_avatar. Delayed cloud
        // saves must never undo a newer confirmed selection.
        avatar_url: String(authoritative.avatar_url || "hero_1")
      });
      ensurePlayerName(nk, ctx.userId, data.profile);
    } else {
      data.profile = defaultPlayerProfile("");
      ensurePlayerName(nk, ctx.userId, data.profile);
      cultivationEnsureProfile(nk, data.profile, false);
    }
    writes.push({
      collection: "player_profiles",
      key: "main",
      userId: ctx.userId,
      value: data.profile,
      permissionRead: 1,
      permissionWrite: 0,
      version: storedProfile ? storedProfile.version : "*"
    });
  }
  if (data.heroes || !storedHeroes) {
    const sanitizedStates = canonicalHeroStates(nk, storedHeroes ? storedHeroes.value : null);
    data.heroes = {
      heroes: sanitizedStates,
      _iap_reward_ids: storedHeroes && storedHeroes.value ? storedHeroes.value._iap_reward_ids || [] : []
    };
    writes.push({
      collection: "player_heroes",
      key: "states",
      userId: ctx.userId,
      value: data.heroes,
      permissionRead: 1,
      permissionWrite: 0,
      version: storedHeroes ? storedHeroes.version : "*"
    });
  }
  if (data.inventory || !nk.storageRead([{ collection: "player_inventory", key: "items", userId: ctx.userId }]).length) {
    const storedInventory = nk.storageRead([{ collection: "player_inventory", key: "items", userId: ctx.userId }]);
    data.inventory = storedInventory.length > 0 && storedInventory[0].value ? storedInventory[0].value : { items: [], _iap_reward_ids: [] };
    writes.push({
      collection: "player_inventory",
      key: "items",
      userId: ctx.userId,
      value: data.inventory,
      permissionRead: 1,
      permissionWrite: 0
    });
  }
  if (data.settings || !nk.storageRead([{ collection: "player_settings", key: "prefs", userId: ctx.userId }]).length) {
    writes.push({
      collection: "player_settings",
      key: "prefs",
      userId: ctx.userId,
      value: data.settings || defaultPlayerSettings(),
      permissionRead: 1,
      permissionWrite: 0
    });
  }
  if (writes.length > 0) {
    nk.storageWrite(writes);
  }
  return JSON.stringify({ success: true });
};
const abandonRun = (ctx, _logger, nk, payload) => {
  let req;
  try {
    req = JSON.parse(payload || "{}");
  } catch (_) {
    return JSON.stringify({ success: false, message: "Invalid JSON" });
  }
  if (!req || typeof req !== "object" || Array.isArray(req)) return JSON.stringify({ success: false, message: "Invalid request" });
  const runId = String(req.run_id || "");
  const encounterId = String(req.encounter_id || "");
  if (!ctx.userId || !runId && !encounterId || runId.length > 128 || encounterId.length > 128) {
    return JSON.stringify({ success: false, message: "Run identity is required" });
  }
  const objects = nk.storageRead([
    { collection: "player_stage_runs", key: "active", userId: ctx.userId },
    { collection: "player_profiles", key: "main", userId: ctx.userId }
  ]);
  const stage = objects.find((o) => o.collection === "player_stage_runs");
  const storedProfile = objects.find((o) => o.collection === "player_profiles");
  if (runId && (!stage || String(stage.value.run_id || "") !== runId) || encounterId && (!storedProfile || String((storedProfile.value.breakthrough || {}).encounter_id || "") !== encounterId)) {
    return JSON.stringify({ success: false, message: "Run identity no longer matches" });
  }
  const writes = [];
  if (runId && stage && stage.value.status === "active") {
    const run = stage.value;
    run.status = "abandoned";
    run.abandoned_at_ms = Date.now();
    writes.push({
      collection: "player_stage_runs",
      key: "active",
      userId: ctx.userId,
      value: run,
      permissionRead: 1,
      permissionWrite: 0,
      version: stage.version
    });
  }
  if (encounterId && storedProfile && (storedProfile.value.breakthrough || {}).in_tribulation === true) {
    cultivationEnsureProfile(nk, storedProfile.value, true);
    if ((storedProfile.value.activity || {}).type === "combat") delete storedProfile.value.activity;
    writes.push({
      collection: "player_profiles",
      key: "main",
      userId: ctx.userId,
      value: storedProfile.value,
      permissionRead: 1,
      permissionWrite: 0,
      version: storedProfile.version
    });
  }
  if (runId && stage && stage.value.status === "abandoned" && storedProfile && (storedProfile.value.activity || {}).type === "combat") {
    delete storedProfile.value.activity;
    if (!writes.some((w) => w.collection === "player_profiles")) writes.push({ collection: "player_profiles", key: "main", userId: ctx.userId, value: storedProfile.value, version: storedProfile.version, permissionRead: 1, permissionWrite: 0 });
  }
  try {
    if (writes.length) nk.storageWrite(writes);
  } catch (_) {
    return JSON.stringify({ success: false, message: "Run changed; please retry exiting" });
  }
  return JSON.stringify({ success: true, profile: storedProfile ? storedProfile.value : {} });
};
const loadPlayerProfile = (ctx, logger, nk, payload) => {
  let request = {};
  try {
    request = JSON.parse(payload || "{}");
  } catch (_) {
    return JSON.stringify({ success: false, message: "Invalid payload JSON" });
  }
  if (!request || typeof request !== "object" || Array.isArray(request)) return JSON.stringify({ success: false, message: "Invalid request" });
  const freshLogin = request.fresh_login === true;
  const objects = nk.storageRead([
    { collection: "player_profiles", key: "main", userId: ctx.userId },
    { collection: "player_heroes", key: "states", userId: ctx.userId },
    { collection: "player_inventory", key: "items", userId: ctx.userId },
    { collection: "player_settings", key: "prefs", userId: ctx.userId },
    { collection: "player_compliance_profiles", key: "profile", userId: ctx.userId },
    { collection: "player_stage_runs", key: "active", userId: ctx.userId }
  ]);
  const result = { profile: {}, heroes: {}, inventory: {}, settings: {}, compliance_profile: {} };
  let profileObject = null;
  let inventoryObject = null;
  let activeRunObject = null;
  for (const obj of objects) {
    switch (obj.collection) {
      case "player_profiles":
        result.profile = obj.value;
        profileObject = obj;
        break;
      case "player_heroes":
        result.heroes = obj.value;
        break;
      case "player_inventory":
        result.inventory = obj.value;
        inventoryObject = obj;
        break;
      case "player_settings":
        result.settings = obj.value;
        break;
      case "player_compliance_profiles":
        result.compliance_profile = obj.value;
        break;
      case "player_stage_runs":
        activeRunObject = obj;
        break;
    }
  }
  const repairWrites = [];
  if (freshLogin && activeRunObject) {
    const activeRun = activeRunObject.value && typeof activeRunObject.value === "object" ? activeRunObject.value : {};
    if (String(activeRun.status || "") === "active") {
      activeRun.status = "abandoned";
      activeRun.abandoned_at_ms = Date.now();
      repairWrites.push({
        collection: "player_stage_runs",
        key: "active",
        userId: ctx.userId,
        value: activeRun,
        permissionRead: 1,
        permissionWrite: 0,
        version: activeRunObject.version
      });
    }
  }
  if (!profileObject) {
    result.profile = defaultPlayerProfile("");
    ensurePlayerName(nk, ctx.userId, result.profile);
    cultivationEnsureProfile(nk, result.profile, false);
    repairWrites.push({
      collection: "player_profiles",
      key: "main",
      userId: ctx.userId,
      value: result.profile,
      permissionRead: 1,
      permissionWrite: 0,
      version: "*"
    });
  } else if (ensurePlayerName(nk, ctx.userId, result.profile)) {
    repairWrites.push({
      collection: "player_profiles",
      key: "main",
      userId: ctx.userId,
      value: result.profile,
      permissionRead: 1,
      permissionWrite: 0,
      version: profileObject.version
    });
  }
  if (freshLogin && profileObject && (result.profile.activity || {}).type === "combat") {
    delete result.profile.activity;
    if (!repairWrites.some((w) => w.collection === "player_profiles")) repairWrites.push({ collection: "player_profiles", key: "main", userId: ctx.userId, value: result.profile, version: profileObject.version, permissionRead: 1, permissionWrite: 0 });
  }
  const canonicalHeroes = canonicalHeroStates(nk, result.heroes);
  const heroesChanged = !result.heroes || JSON.stringify(result.heroes.heroes || []) !== JSON.stringify(canonicalHeroes);
  if (heroesChanged) {
    result.heroes = { heroes: canonicalHeroes, _iap_reward_ids: result.heroes && result.heroes._iap_reward_ids ? result.heroes._iap_reward_ids : [] };
    const previousHero = objects.find((obj) => obj.collection === "player_heroes");
    repairWrites.push({
      collection: "player_heroes",
      key: "states",
      userId: ctx.userId,
      value: result.heroes,
      permissionRead: 1,
      permissionWrite: 0,
      version: previousHero ? previousHero.version : "*"
    });
  }
  const inventoryWasMissing = !result.inventory || Object.keys(result.inventory).length === 0;
  if (inventoryWasMissing) {
    result.inventory = { items: [], _iap_reward_ids: [] };
  }
  if (inventoryWasMissing) {
    repairWrites.push({
      collection: "player_inventory",
      key: "items",
      userId: ctx.userId,
      value: result.inventory,
      permissionRead: 1,
      permissionWrite: 0,
      version: inventoryObject ? inventoryObject.version : "*"
    });
  }
  if (!result.settings || Object.keys(result.settings).length === 0) {
    result.settings = defaultPlayerSettings();
    repairWrites.push({
      collection: "player_settings",
      key: "prefs",
      userId: ctx.userId,
      value: result.settings,
      permissionRead: 1,
      permissionWrite: 0,
      version: "*"
    });
  }
  if (repairWrites.length > 0) {
    const repaired = nk.storageWrite(repairWrites);
    if (profileObject) {
      const profileAck = repaired.find((ack) => ack.collection === "player_profiles" && ack.key === "main");
      if (profileAck) profileObject.version = profileAck.version;
    }
  }
  result.monetization = buildMonetizationResponse(nk, ctx.userId, monetizationMode(ctx));
  if (result.profile && typeof result.profile === "object" && Object.keys(result.profile).length > 0) {
    let profileChanged = cultivationEnsureProfile(nk, result.profile, freshLogin);
    if (cultivationEnsurePreview(nk, result.profile)) profileChanged = true;
    const nowRows = nk.sqlQuery("SELECT EXTRACT(EPOCH FROM NOW())::BIGINT AS now", []);
    const realNow = Number(nowRows.length > 0 ? nowRows[0].now : 0);
    const now = Math.floor(sweepStaminaTime(result.profile, realNow * 1e3) / 1e3);
    const interval = Math.max(1, Number(getRemoteConfigValue(nk, "system", "stamina_regen_interval_sec", 300)));
    const amount = Math.max(0, Number(getRemoteConfigValue(nk, "system", "stamina_regen_amount", 1)));
    const hasLastStaminaUpdate = Number(result.profile.last_stamina_update || 0) > 0;
    const last = hasLastStaminaUpdate ? Math.max(0, Number(result.profile.last_stamina_update)) : now;
    const currentStamina = Math.max(0, Number(result.profile.stamina || 0));
    const ticks = currentStamina < 30 && now > last ? Math.floor((now - last) / interval) : 0;
    if (ticks > 0 && amount > 0) {
      result.profile.stamina = Math.min(30, currentStamina + ticks * amount);
      result.profile.last_stamina_update = result.profile.stamina >= 30 ? now : last + ticks * interval;
      profileChanged = true;
    } else if (currentStamina >= 30 && last !== now) {
      result.profile.stamina = currentStamina;
      result.profile.last_stamina_update = now;
      profileChanged = true;
    } else if (!hasLastStaminaUpdate) {
      result.profile.last_stamina_update = now;
      profileChanged = true;
    }
    const appliedLast = Math.max(0, Number(result.profile.last_stamina_update || now));
    const elapsedInTick = Math.max(0, now - appliedLast) % interval;
    const canRegenerate = Number(result.profile.stamina || 0) < 30 && amount > 0;
    result.stamina_regen = {
      amount: canRegenerate ? amount : 0,
      interval_sec: interval,
      seconds_remaining: canRegenerate ? interval - elapsedInTick : 0,
      server_time: realNow
    };
    if (!result.profile.avatar_url) {
      result.profile.avatar_url = "hero_1";
    }
    const uArcs = result.profile.unlocked_arcs || [];
    if (Array.isArray(uArcs) && !uArcs.includes("arc_0")) {
      uArcs.unshift("arc_0");
      result.profile.unlocked_arcs = uArcs;
      profileChanged = true;
    }
    const uStages = result.profile.unlocked_stages || [];
    if (Array.isArray(uStages) && !uStages.some((s) => s && s.stage_id === "stage_0_1")) {
      uStages.unshift({
        stage_id: "stage_0_1",
        unlocked_levels: ["normal", "epic", "legend"]
      });
      result.profile.unlocked_stages = uStages;
      profileChanged = true;
    }
    if (profileChanged && profileObject) {
      nk.storageWrite([{
        collection: "player_profiles",
        key: "main",
        userId: ctx.userId,
        value: result.profile,
        permissionRead: 1,
        permissionWrite: 0,
        version: profileObject.version
      }]);
    }
  }
  if (result.profile && typeof writePlayerLeaderboardRecords === "function") {
    try {
      writePlayerLeaderboardRecords(nk, ctx.userId, result.profile, result.profile.display_name);
    } catch (e) {
      logger.warn("Weekly/profile leaderboard sync deferred: " + String(e));
    }
  }
  const vip = result.monetization.vip;
  if (vip && vip.configured) {
    result.profile.vip = vip.level;
    result.profile.vip_exp = vip.exp;
    result.profile.vip_progress = vip;
  }
  return JSON.stringify(result);
};
const saveComplianceProfile = (ctx, logger, nk, payload) => {
  if (!ctx.userId) {
    return JSON.stringify({ success: false, message: "Unauthorized" });
  }
  let data = {};
  try {
    data = JSON.parse(payload || "{}");
  } catch (e) {
    return JSON.stringify({ success: false, message: "Invalid payload JSON" });
  }
  const fullName = String(data.full_name || "").trim().slice(0, 100);
  const birthDate = String(data.birth_date || "").trim().slice(0, 30);
  const idNumber = String(data.id_number || "").trim().slice(0, 30);
  const phoneNumber = String(data.phone_number || "").trim().slice(0, 20);
  const email = String(data.email || "").trim().slice(0, 120);
  const complianceData = {
    user_id: ctx.userId,
    full_name: fullName,
    birth_date: birthDate,
    id_number: idNumber,
    phone_number: phoneNumber,
    email,
    is_verified: fullName.length >= 2 && phoneNumber.length >= 8,
    updated_at: Math.floor(Date.now() / 1e3)
  };
  nk.storageWrite([
    {
      collection: "player_compliance_profiles",
      key: "profile",
      userId: ctx.userId,
      value: complianceData,
      permissionRead: 1,
      permissionWrite: 0
    }
  ]);
  if (eventProfileComplete(complianceData)) {
    eventRecord(nk, ctx.userId, "profile_complete", 1, {}, `profile:${complianceData.updated_at}`);
  }
  return JSON.stringify({
    success: true,
    profile: complianceData
  });
};
const getComplianceProfile = (ctx, logger, nk, _payload) => {
  if (!ctx.userId) {
    return JSON.stringify({ success: false, message: "Unauthorized" });
  }
  const objects = nk.storageRead([
    { collection: "player_compliance_profiles", key: "profile", userId: ctx.userId }
  ]);
  if (objects.length > 0 && objects[0].value) {
    return JSON.stringify({
      success: true,
      profile: objects[0].value
    });
  }
  return JSON.stringify({
    success: true,
    profile: {}
  });
};

const LOGIN_REPLACED_MESSAGE = "T\xE0i kho\u1EA3n \u0111\xE3 \u0111\u01B0\u1EE3c \u0111\u0103ng nh\u1EADp \u1EDF thi\u1EBFt b\u1ECB kh\xE1c";
function createSingleLoginTable(nk) {
  nk.sqlExec(`CREATE TABLE IF NOT EXISTS player_login_sessions (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        generation TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`, []);
}
function beforeSingleLogin(_ctx, _logger, nk, request) {
  if (request && request.account) {
    request.account.vars = Object.assign({}, request.account.vars || {}, { login_generation: nk.uuidv4() });
  }
  return request;
}
function beforeSingleLoginEmail(ctx, logger, nk, request) {
  return beforeSingleLogin(ctx, logger, nk, beforeEmailPasswordSetup(ctx, logger, nk, request));
}
function afterSingleLogin(ctx, logger, nk, _session, request) {
  const generation = String((ctx.vars || {}).login_generation || ((request.account || {}).vars || {}).login_generation || "");
  if (!ctx.userId || !generation) throw Error("Missing server login generation");
  nk.sqlExec(`INSERT INTO player_login_sessions(user_id,generation) VALUES($1::UUID,$2)
        ON CONFLICT(user_id) DO UPDATE SET generation=EXCLUDED.generation,updated_at=NOW()`, [ctx.userId, generation]);
  try {
    nk.notificationSend(ctx.userId, "Session changed", { type: "session_changed" }, 131, void 0, false);
  } catch (error) {
    logger.warn("Login change push failed; reconnect/RPC guards remain authoritative: %s", String(error));
  }
}
function requireCurrentLogin(ctx, nk) {
  if (!ctx.userId) return null;
  const generation = String((ctx.vars || {}).login_generation || "");
  const rows = generation ? nk.sqlQuery("SELECT generation FROM player_login_sessions WHERE user_id=$1::UUID", [ctx.userId]) : [];
  if (!generation || !rows.length || String(rows[0].generation) !== generation) {
    return JSON.stringify({ success: false, status: "error", code: 401, reason: "SESSION_REPLACED", message: LOGIN_REPLACED_MESSAGE });
  }
  return null;
}
const sessionStatus = (_ctx, _logger, _nk) => JSON.stringify({ success: true });
function createAccountLinkTables(nk) {
  nk.sqlExec(`CREATE TABLE IF NOT EXISTS account_link_state (
        user_id UUID PRIMARY KEY, status TEXT NOT NULL DEFAULT 'active',
        active_requests INT NOT NULL DEFAULT 0 CHECK(active_requests>=0), merged_into UUID
    );
    CREATE TABLE IF NOT EXISTS account_link_intents (
        id UUID PRIMARY KEY, initiator UUID NOT NULL, other_id UUID NOT NULL, google_id TEXT NOT NULL,
        identity_snapshot JSONB NOT NULL, versions JSONB NOT NULL, finance_snapshot JSONB NOT NULL DEFAULT '{}',
        expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '5 minutes',
        status TEXT NOT NULL DEFAULT 'prepared', winner_id UUID
    );
    CREATE TABLE IF NOT EXISTS account_link_archives (
        loser_id UUID PRIMARY KEY, winner_id UUID NOT NULL, intent_id UUID NOT NULL UNIQUE,
        snapshot JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE account_link_intents ADD COLUMN IF NOT EXISTS finance_snapshot JSONB NOT NULL DEFAULT '{}'`, []);
  nk.sqlExec(`CREATE OR REPLACE FUNCTION account_link_finance_snapshot(p_a UUID,p_b UUID)
    RETURNS JSONB LANGUAGE SQL STABLE AS $$ SELECT jsonb_build_object(
        'entitlements',(SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY user_id),'[]'::JSONB) FROM player_monetization_entitlements e WHERE user_id IN(p_a::TEXT,p_b::TEXT)),
        'purchases',(SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY id),'[]'::JSONB) FROM monetization_purchases p WHERE user_id IN(p_a::TEXT,p_b::TEXT)),
        'orders',(SELECT COALESCE(jsonb_agg(to_jsonb(o) ORDER BY id),'[]'::JSONB) FROM monetization_purchase_orders o WHERE user_id IN(p_a::TEXT,p_b::TEXT)),
        'vip',(SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY purchase_id),'[]'::JSONB) FROM player_vip_credits c WHERE user_id IN(p_a::TEXT,p_b::TEXT))
    ) $$`, []);
  nk.sqlExec(`CREATE OR REPLACE FUNCTION commit_google_account_link(p_ticket UUID,p_actor UUID,p_keep UUID)
    RETURNS JSONB LANGUAGE plpgsql AS $$
    DECLARE t account_link_intents%ROWTYPE; a users%ROWTYPE; b users%ROWTYPE;
        w users%ROWTYPE; l users%ROWTYPE; versions_now JSONB; identities_now JSONB;
        remaining_seconds DOUBLE PRECISION; profile_value JSONB; heroes_value JSONB;
        reward RECORD; uid UUID;
    BEGIN
        SELECT * INTO t FROM account_link_intents WHERE id=p_ticket FOR UPDATE;
        IF NOT FOUND OR t.initiator<>p_actor THEN RAISE EXCEPTION 'Invalid link ticket'; END IF;
        IF t.status='completed' THEN
            IF t.winner_id<>p_keep THEN RAISE EXCEPTION 'Ticket already used for another choice'; END IF;
            RETURN jsonb_build_object('winner_id',t.winner_id,'replayed',TRUE);
        END IF;
        IF t.expires_at<=NOW() OR p_keep NOT IN (t.initiator,t.other_id) THEN RAISE EXCEPTION 'Link preview expired or invalid choice'; END IF;
        FOR uid IN SELECT v FROM unnest(ARRAY[t.initiator,t.other_id]) v ORDER BY v LOOP
            INSERT INTO account_link_state(user_id) VALUES(uid) ON CONFLICT DO NOTHING;
            PERFORM 1 FROM account_link_state WHERE user_id=uid FOR UPDATE;
        END LOOP;
        IF EXISTS(SELECT 1 FROM account_link_state WHERE user_id IN(t.initiator,t.other_id)
            AND (status<>'active' OR active_requests<>0)) THEN RAISE EXCEPTION 'Account is busy or archived; retry'; END IF;
        PERFORM 1 FROM users WHERE id IN(t.initiator,t.other_id) ORDER BY id FOR UPDATE;
        SELECT * INTO a FROM users WHERE id=t.initiator;
        SELECT * INTO b FROM users WHERE id=t.other_id;
        IF a.id IS NULL OR b.id IS NULL OR COALESCE(EXTRACT(EPOCH FROM a.disable_time),0)>0
            OR COALESCE(EXTRACT(EPOCH FROM b.disable_time),0)>0 OR b.google_id IS DISTINCT FROM t.google_id THEN
            RAISE EXCEPTION 'Account identity changed'; END IF;
        SELECT jsonb_object_agg(id::TEXT,jsonb_build_object('email',email,'google',google_id,'password',password,'custom',custom_id,'disabled',disable_time))
            INTO identities_now FROM users WHERE id IN(t.initiator,t.other_id);
        IF identities_now IS DISTINCT FROM t.identity_snapshot THEN RAISE EXCEPTION 'Account identity changed; refresh preview'; END IF;
        IF p_keep=a.id THEN w:=a; l:=b; ELSE w:=b; l:=a; END IF;
        IF COALESCE(a.email,'')<>'' AND COALESCE(b.email,'')<>'' AND LOWER(a.email)<>LOWER(b.email) THEN RAISE EXCEPTION 'Different email credentials require support'; END IF;
        IF COALESCE(a.google_id,'')<>'' AND COALESCE(b.google_id,'')<>'' AND a.google_id<>b.google_id THEN RAISE EXCEPTION 'Different Google identities require support'; END IF;
        IF EXISTS(SELECT 1 FROM unnest(ARRAY['custom_id','apple_id','facebook_id','facebook_instant_game_id','gamecenter_id','steam_id']) k
            WHERE COALESCE(to_jsonb(l)->>k,'')<>'') THEN RAISE EXCEPTION 'Other linked identities require support'; END IF;
        IF EXISTS(SELECT 1 FROM monetization_purchase_orders WHERE user_id IN(a.id::TEXT,b.id::TEXT) AND status='pending' AND (expires_at>NOW() OR validated_at IS NOT NULL))
            OR EXISTS(SELECT 1 FROM monetization_ad_rewards WHERE user_id IN(a.id::TEXT,b.id::TEXT) AND (status='verified' OR (status='prepared' AND expires_at>NOW())))
            OR EXISTS(SELECT 1 FROM storage WHERE user_id IN(a.id,b.id) AND collection='player_profiles' AND value->'sweep'->>'status' IN ('running','cancelling','blocked'))
        OR EXISTS(SELECT 1 FROM storage WHERE user_id IN(a.id,b.id) AND collection='player_stage_runs' AND key='active'
                AND value->>'status'='active' AND COALESCE((value->>'expires_at_ms')::BIGINT,0)>EXTRACT(EPOCH FROM NOW())*1000) THEN
            RAISE EXCEPTION 'Finish active run, ad or purchase before linking'; END IF;
        PERFORM 1 FROM storage WHERE user_id IN(a.id,b.id) ORDER BY user_id,collection,key FOR UPDATE;
        SELECT COALESCE(jsonb_object_agg(user_id::TEXT||'/'||collection||'/'||key,version),'{}'::JSONB)
            INTO versions_now FROM storage WHERE user_id IN(a.id,b.id);
        IF versions_now IS DISTINCT FROM t.versions THEN RAISE EXCEPTION 'Progress changed; refresh preview'; END IF;
        IF account_link_finance_snapshot(a.id,b.id) IS DISTINCT FROM t.finance_snapshot THEN RAISE EXCEPTION 'Progress changed after purchase/refund; refresh preview'; END IF;
        IF NOT EXISTS(SELECT 1 FROM storage WHERE user_id=w.id AND collection='player_profiles' AND key='main') THEN RAISE EXCEPTION 'Selected profile unavailable'; END IF;
        IF NOT EXISTS(SELECT 1 FROM storage WHERE user_id=w.id AND collection='player_heroes' AND key='states') THEN RAISE EXCEPTION 'Selected hero profile unavailable'; END IF;
        INSERT INTO account_link_archives(loser_id,winner_id,intent_id,snapshot)
        SELECT l.id,w.id,t.id,jsonb_build_object('identity',to_jsonb(l),'winner_identity',to_jsonb(w),'finance',t.finance_snapshot,
            'storage',(SELECT COALESCE(jsonb_agg(to_jsonb(s)),'[]'::JSONB) FROM storage s WHERE user_id IN(a.id,b.id)),
            'entitlements',(SELECT COALESCE(jsonb_agg(to_jsonb(e)),'[]'::JSONB) FROM player_monetization_entitlements e WHERE user_id IN(a.id::TEXT,b.id::TEXT)));
        -- Preserve verified purchased hero ownership, never transfer hero levels or consumable balances.
        SELECT COALESCE(value,'{}'::JSONB) INTO heroes_value FROM storage WHERE user_id=w.id AND collection='player_heroes' AND key='states';
        heroes_value:=COALESCE(heroes_value,'{}'::JSONB);
        FOR reward IN SELECT DISTINCT r->>'reward_id' AS hero_id FROM monetization_purchase_orders o,
            LATERAL jsonb_array_elements(o.reward_snapshot) r WHERE o.user_id=l.id::TEXT AND o.status='fulfilled' AND r->>'reward_type'='hero'
            AND EXISTS(SELECT 1 FROM monetization_purchases p WHERE COALESCE(NULLIF(p.purchase_order_id,''),p.request_id)=o.id AND p.status IN('verified','consumed')) LOOP
            IF EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(heroes_value->'heroes','[]'::JSONB)) h WHERE h->>'hero_id'=reward.hero_id) THEN
                heroes_value:=jsonb_set(heroes_value,'{heroes}',(SELECT jsonb_agg(CASE WHEN h->>'hero_id'=reward.hero_id THEN h||'{"owned":true}'::JSONB ELSE h END)
                    FROM jsonb_array_elements(heroes_value->'heroes') h));
            ELSE
                heroes_value:=jsonb_set(heroes_value,'{heroes}',COALESCE(heroes_value->'heroes','[]'::JSONB)||jsonb_build_array(jsonb_build_object(
                    'hero_id',reward.hero_id,'owned',TRUE,'level',1,'exp',0,'next_level_exp',0,
                    'current_attribute',COALESCE((SELECT attributes FROM game_heroes WHERE id=reward.hero_id),'{}'::JSONB))));
            END IF;
        END LOOP;
        UPDATE storage SET value=heroes_value,version=md5(random()::TEXT||clock_timestamp()::TEXT),update_time=NOW()
            WHERE user_id=w.id AND collection='player_heroes' AND key='states' AND value IS DISTINCT FROM heroes_value;
        SELECT value INTO profile_value FROM storage WHERE user_id=w.id AND collection='player_profiles' AND key='main';
        profile_value:=jsonb_set(profile_value,'{display_name}',to_jsonb(COALESCE(NULLIF(profile_value->>'display_name',''),
            CASE WHEN COALESCE(w.google_id,'')<>'' THEN 'Tu Gi\u1EA3 '||UPPER(LEFT(REPLACE(w.id::TEXT,'-',''),6)) ELSE w.username END)));
        profile_value:=jsonb_set(profile_value,'{name_changes_used}',to_jsonb(GREATEST(
            COALESCE((profile_value->>'name_changes_used')::INT,0),
            COALESCE((SELECT (value->>'name_changes_used')::INT FROM storage WHERE user_id=l.id AND collection='player_profiles' AND key='main'),0),
            COALESCE((SELECT MAX((value->>'name_changes_used')::INT) FROM storage WHERE user_id IN(w.id,l.id) AND collection='player_identity' AND key='name'),0))));
        INSERT INTO storage(collection,key,user_id,value,version,read,write,create_time,update_time)
        VALUES('player_identity','name',w.id,jsonb_build_object('display_name',profile_value->>'display_name','name_changes_used',profile_value->'name_changes_used'),
            md5(random()::TEXT||clock_timestamp()::TEXT),1,0,NOW(),NOW())
        ON CONFLICT(collection,key,user_id) DO UPDATE SET value=EXCLUDED.value,version=EXCLUDED.version,update_time=NOW();
        FOR reward IN SELECT r->>'reward_id' AS item_id,SUM((r->>'quantity')::BIGINT) AS quantity FROM monetization_purchase_orders o,
            LATERAL jsonb_array_elements(o.reward_snapshot) r WHERE o.user_id=l.id::TEXT AND o.status='fulfilled'
                AND r->>'reward_type'='entitlement' AND r->>'reward_id'<>'no_ads_seconds'
                AND EXISTS(SELECT 1 FROM monetization_purchases p WHERE COALESCE(NULLIF(p.purchase_order_id,''),p.request_id)=o.id AND p.status IN('verified','consumed')) GROUP BY r->>'reward_id' LOOP
            profile_value:=jsonb_set(profile_value,'{iap_entitlements}',COALESCE(profile_value->'iap_entitlements','{}'::JSONB)||
                jsonb_build_object(reward.item_id,GREATEST(COALESCE((profile_value->'iap_entitlements'->>reward.item_id)::BIGINT,0),reward.quantity)));
        END LOOP;
        profile_value:=jsonb_set(profile_value,'{owned_iap_products}',(SELECT COALESCE(jsonb_agg(DISTINCT product),'[]'::JSONB) FROM (
            SELECT jsonb_array_elements_text(COALESCE(profile_value->'owned_iap_products','[]'::JSONB)) AS product
            UNION SELECT o.product_id FROM monetization_purchase_orders o WHERE o.user_id=l.id::TEXT AND o.status='fulfilled' AND o.fulfillment_type='non_consumable'
                AND EXISTS(SELECT 1 FROM monetization_purchases p WHERE COALESCE(NULLIF(p.purchase_order_id,''),p.request_id)=o.id AND p.status IN('verified','consumed'))
        ) products));
        UPDATE storage SET value=profile_value,version=md5(random()::TEXT||clock_timestamp()::TEXT),update_time=NOW()
            WHERE user_id=w.id AND collection='player_profiles' AND key='main' AND value IS DISTINCT FROM profile_value;
        SELECT GREATEST(0,EXTRACT(EPOCH FROM no_ads_expires_at-NOW())) INTO remaining_seconds FROM player_monetization_entitlements WHERE user_id=l.id::TEXT FOR UPDATE;
        IF COALESCE(remaining_seconds,0)>0 THEN
            INSERT INTO player_monetization_entitlements(user_id,no_ads_expires_at,source,updated_at)
                VALUES(w.id::TEXT,NOW()+make_interval(secs=>remaining_seconds),'account_link',NOW())
                ON CONFLICT(user_id) DO UPDATE SET no_ads_expires_at=GREATEST(NOW(),COALESCE(player_monetization_entitlements.no_ads_expires_at,NOW()))+make_interval(secs=>remaining_seconds),source='account_link',updated_at=NOW();
            UPDATE player_monetization_entitlements SET no_ads_expires_at=NOW(),updated_at=NOW() WHERE user_id=l.id::TEXT;
        END IF;
        UPDATE monetization_purchase_orders SET status='expired',updated_at=NOW() WHERE user_id IN(a.id::TEXT,b.id::TEXT) AND status='pending' AND expires_at<=NOW();
        UPDATE monetization_purchase_orders SET user_id=w.id::TEXT WHERE user_id=l.id::TEXT;
        UPDATE monetization_purchases SET user_id=w.id::TEXT WHERE user_id=l.id::TEXT;
        UPDATE player_vip_credits SET user_id=w.id::TEXT WHERE user_id=l.id::TEXT;
        IF EXISTS(SELECT 1 FROM monetization_daily_reward_claims c WHERE c.user_id IN(a.id::TEXT,b.id::TEXT)
            AND c.reward_date=(NOW() AT TIME ZONE 'UTC')::DATE
            AND COALESCE((SELECT (snapshot->'system'->'rewarded_ads'->'placements'->(CASE WHEN c.placement_id='main_menu_stamina' THEN 'stamina_dialog_ad' ELSE c.placement_id END)->>'daily_limit')::INT
                FROM remote_config_releases ORDER BY config_version DESC LIMIT 1),0)<=0) THEN RAISE EXCEPTION 'Reward quota config unavailable; retry after server config update'; END IF;
        -- Conservative spent quota is reserved under fresh marker sessions; do not grant any reward.
        INSERT INTO monetization_daily_reward_claims(user_id,placement_id,reward_date,claim_slot,ad_session_id)
        SELECT w.id::TEXT,p.placement_id,(NOW() AT TIME ZONE 'UTC')::DATE,s.slot,'merge:'||t.id::TEXT||':'||p.placement_id||':'||s.slot
        FROM (SELECT DISTINCT CASE WHEN placement_id='main_menu_stamina' THEN 'stamina_dialog_ad' ELSE placement_id END AS placement_id FROM monetization_daily_reward_claims WHERE user_id IN(a.id::TEXT,b.id::TEXT) AND reward_date=(NOW() AT TIME ZONE 'UTC')::DATE) p
        CROSS JOIN LATERAL generate_series(1,COALESCE((SELECT (snapshot->'system'->'rewarded_ads'->'placements'->p.placement_id->>'daily_limit')::INT FROM remote_config_releases ORDER BY config_version DESC LIMIT 1),0)) s(slot)
        ON CONFLICT DO NOTHING;
        -- Clear loser credentials before assigning unique provider/email columns to winner.
        UPDATE users SET email=NULL,password=NULL,google_id=NULL,custom_id=NULL,disable_time=NOW(),update_time=NOW() WHERE id=l.id;
        UPDATE users SET email=COALESCE(NULLIF(w.email,''),l.email),password=COALESCE(w.password,l.password),google_id=t.google_id,update_time=NOW() WHERE id=w.id;
        UPDATE user_device SET user_id=w.id WHERE user_id=l.id;
        UPDATE account_link_archives SET winner_id=w.id WHERE winner_id=l.id;
        UPDATE account_link_state SET merged_into=w.id WHERE merged_into=l.id;
        UPDATE account_link_state SET status='archived',merged_into=w.id WHERE user_id=l.id;
        UPDATE account_link_intents SET status='completed',winner_id=w.id WHERE id=t.id;
        RETURN jsonb_build_object('winner_id',w.id,'loser_id',l.id,'replayed',FALSE);
    END $$`, []);
}
function withActiveAccount(nk, userId, action) {
  const lease = nk.sqlQuery(`INSERT INTO account_link_state(user_id,active_requests) VALUES($1::UUID,1)
        ON CONFLICT(user_id) DO UPDATE SET active_requests=account_link_state.active_requests+1
        WHERE account_link_state.status='active' RETURNING user_id`, [userId]);
  if (!lease.length) throw new Error("Account archived after linking; sign in again");
  try {
    return action();
  } finally {
    nk.sqlExec("UPDATE account_link_state SET active_requests=GREATEST(0,active_requests-1) WHERE user_id=$1::UUID", [userId]);
  }
}
function accountGuardedRpc(id, handler) {
  handler = serverAdmissionRpc(id, handler);
  return (ctx, logger, nk, payload) => {
    const rejected = requireCurrentLogin(ctx, nk);
    if (rejected) return rejected;
    if (id === "confirm_google_link") return handler(ctx, logger, nk, payload);
    let owner = ctx.userId;
    if (!owner && (id === "admob_ssv_confirm" || id === "google_play_rtdn_confirm")) {
      let req;
      try {
        req = JSON.parse(payload || "{}");
      } catch (_e) {
        return JSON.stringify({ success: false, code: 400 });
      }
      if (!req || typeof req !== "object") return JSON.stringify({ success: false, code: 400 });
      if (String(req.verifier_secret || "") !== String(ctx.env.MONETIZATION_VERIFIER_SECRET || "") || !ctx.env.MONETIZATION_VERIFIER_SECRET) return JSON.stringify({ success: false, code: 403 });
      if (id === "admob_ssv_confirm") owner = String(req.user_id || "");
      else {
        const rows = nk.sqlQuery("SELECT user_id FROM monetization_purchases WHERE purchase_token_hash=$1 LIMIT 1", [String(req.purchase_token_hash || "")]);
        owner = rows.length ? String(rows[0].user_id) : "";
      }
    }
    if (!owner) return handler(ctx, logger, nk, payload);
    try {
      return withActiveAccount(nk, owner, () => handler(ctx, logger, nk, payload));
    } catch (error) {
      if (String(error).indexOf("Account archived") >= 0) {
        if (id === "admob_ssv_confirm") {
          const req = serverRequest(payload);
          const rows = nk.sqlQuery("SELECT 1 FROM monetization_ad_rewards WHERE ad_session_id=$1 AND user_id=$2 AND status='granted'", [String(req.ad_session_id || ""), owner]);
          if (rows.length) return JSON.stringify({ status: "success", data: { granted: true, idempotent: true } });
        }
        return JSON.stringify({ success: false, status: "error", code: 401, message: "Account archived after linking; sign in again" });
      }
      throw error;
    }
  };
}
function isLinkedReceiptOwner(nk, receiptOwner, userId) {
  if (receiptOwner === userId) return true;
  return nk.sqlQuery("SELECT 1 FROM account_link_archives WHERE loser_id=$1::UUID AND winner_id=$2::UUID", [receiptOwner, userId]).length > 0;
}
function beforeEmailPasswordSetup(_ctx, _logger, nk, request) {
  const email = request && request.account && request.account.email;
  const password = request && request.account && request.account.password;
  if (typeof email !== "string" || typeof password !== "string" || password.length < 8 || email.length > 255) return request;
  const rows = nk.sqlQuery(`SELECT 1 FROM users WHERE email=$1
        AND COALESCE(google_id,'')<>'' AND COALESCE(octet_length(password),0)=0
        AND COALESCE(EXTRACT(EPOCH FROM disable_time),0)=0 LIMIT 1`, [email.toLowerCase()]);
  if (rows.length) throw { code: 9, message: "PASSWORD_SETUP_REQUIRED: T\xE0i kho\u1EA3n n\xE0y \u0111\xE3 \u0111\u0103ng nh\u1EADp b\u1EB1ng Google nh\u01B0ng ch\u01B0a c\xE0i \u0111\u1EB7t m\u1EADt kh\u1EA9u email. H\xE3y x\xE1c nh\u1EADn Google \u0111\u1EC3 c\xE0i \u0111\u1EB7t m\u1EADt kh\u1EA9u." };
  return request;
}
const accountPasswordStatus = (ctx, _logger, nk) => {
  if (!ctx.userId) return JSON.stringify({ success: false, code: 401, message: "C\u1EA7n \u0111\u0103ng nh\u1EADp l\u1EA1i." });
  const rows = nk.sqlQuery(`SELECT email, COALESCE(octet_length(password),0)>0 AS has_password,
        COALESCE(google_id,'')<>'' AS google_linked FROM users
        WHERE id=$1::UUID AND COALESCE(EXTRACT(EPOCH FROM disable_time),0)=0`, [ctx.userId]);
  if (!rows.length) return JSON.stringify({ success: false, code: 403, message: "T\xE0i kho\u1EA3n kh\xF4ng kh\u1EA3 d\u1EE5ng." });
  const row = rows[0];
  return JSON.stringify({
    success: true,
    email: String(row.email || ""),
    has_password: !!row.has_password,
    can_setup: !!row.google_linked && !!row.email && !row.has_password
  });
};
const setupAccountPassword = (ctx, _logger, nk, payload) => {
  const fail = (code, message) => JSON.stringify({ success: false, code, message });
  if (!ctx.userId) return fail(401, "C\u1EA7n \u0111\u0103ng nh\u1EADp l\u1EA1i.");
  if (!payload || payload.length > 2e4) return fail(400, "Th\xF4ng tin c\xE0i \u0111\u1EB7t kh\xF4ng h\u1EE3p l\u1EC7.");
  let req;
  try {
    req = JSON.parse(payload);
  } catch (_e) {
    return fail(400, "Th\xF4ng tin c\xE0i \u0111\u1EB7t kh\xF4ng h\u1EE3p l\u1EC7.");
  }
  if (!req || typeof req !== "object" || Array.isArray(req) || typeof req.password !== "string" || typeof req.id_token !== "string") return fail(400, "Th\xF4ng tin c\xE0i \u0111\u1EB7t kh\xF4ng h\u1EE3p l\u1EC7.");
  const password = req.password, token = req.id_token;
  let bytes = 0;
  try {
    bytes = encodeURIComponent(password).replace(/%[0-9A-F]{2}|./g, "x").length;
  } catch (_e) {
    return fail(400, "M\u1EADt kh\u1EA9u ch\u1EE9a k\xFD t\u1EF1 kh\xF4ng h\u1EE3p l\u1EC7.");
  }
  if (Array.from(password).length < 8 || bytes > 72) return fail(400, "M\u1EADt kh\u1EA9u c\u1EA7n \xEDt nh\u1EA5t 8 k\xFD t\u1EF1 v\xE0 t\u1ED1i \u0111a 72 byte UTF-8.");
  if (!token || token.length > 16384) return fail(400, "H\xE3y x\xE1c nh\u1EADn l\u1EA1i t\xE0i kho\u1EA3n Google.");
  const rows = nk.sqlQuery(`SELECT email,google_id,COALESCE(octet_length(password),0)>0 AS has_password
        FROM users WHERE id=$1::UUID AND COALESCE(EXTRACT(EPOCH FROM disable_time),0)=0`, [ctx.userId]);
  if (!rows.length) return fail(403, "T\xE0i kho\u1EA3n kh\xF4ng kh\u1EA3 d\u1EE5ng.");
  const row = rows[0];
  if (row.has_password) return fail(409, "T\xE0i kho\u1EA3n \u0111\xE3 c\xF3 m\u1EADt kh\u1EA9u. H\xE3y \u0111\u0103ng nh\u1EADp b\u1EB1ng m\u1EADt kh\u1EA9u \u0111\xE3 t\u1EA1o.");
  if (!row.email || !row.google_id) return fail(409, "T\xE0i kho\u1EA3n c\u1EA7n c\xF3 email v\xE0 li\xEAn k\u1EBFt Google tr\u01B0\u1EDBc khi c\xE0i \u0111\u1EB7t m\u1EADt kh\u1EA9u.");
  let google;
  try {
    google = nk.authenticateGoogle(token, "", false);
  } catch (_e) {
    return fail(403, "Kh\xF4ng th\u1EC3 x\xE1c th\u1EF1c Google. H\xE3y ch\u1ECDn l\u1EA1i t\xE0i kho\u1EA3n Google.");
  }
  if (google.userId !== ctx.userId) return fail(403, "H\xE3y ch\u1ECDn \u0111\xFAng Google \u0111\xE3 li\xEAn k\u1EBFt v\u1EDBi t\xE0i kho\u1EA3n hi\u1EC7n t\u1EA1i.");
  try {
    const hash = nk.bcryptHash(password);
    const updated = nk.sqlQuery(`UPDATE users SET password=convert_to($4,'UTF8'),update_time=NOW()
            WHERE id=$1::UUID AND email=$2 AND google_id=$3 AND COALESCE(octet_length(password),0)=0
            AND COALESCE(EXTRACT(EPOCH FROM disable_time),0)=0 RETURNING id`, [ctx.userId, row.email, row.google_id, hash]);
    if (!updated.length) return fail(409, "Th\xF4ng tin t\xE0i kho\u1EA3n \u0111\xE3 thay \u0111\u1ED5i. H\xE3y m\u1EDF l\u1EA1i c\xE0i \u0111\u1EB7t m\u1EADt kh\u1EA9u.");
  } catch (_e) {
    return fail(500, "Ch\u01B0a th\u1EC3 l\u01B0u m\u1EADt kh\u1EA9u. H\xE3y ki\u1EC3m tra tr\u1EA1ng th\xE1i t\xE0i kho\u1EA3n r\u1ED3i th\u1EED l\u1EA1i.");
  }
  return JSON.stringify({ success: true, message: "\u0110\xE3 c\xE0i \u0111\u1EB7t m\u1EADt kh\u1EA9u. B\u1EA1n c\xF3 th\u1EC3 \u0111\u0103ng nh\u1EADp b\u1EB1ng email ho\u1EB7c Google v\xE0o c\xF9ng t\xE0i kho\u1EA3n." });
};
const googleLinkStatus = (ctx, _logger, nk) => {
  if (!ctx.userId) return JSON.stringify({ success: false, code: 401 });
  return JSON.stringify({ success: true, linked: !!nk.accountGetId(ctx.userId).user.googleId });
};
function accountLinkSummary(nk, userId) {
  const objects = nk.storageRead([
    { collection: "player_profiles", key: "main", userId },
    { collection: "player_heroes", key: "states", userId },
    { collection: "player_inventory", key: "items", userId }
  ]);
  const profile = objects.find((o) => o.collection === "player_profiles");
  if (!profile) throw new Error("Account profile unavailable; sign in to both accounts once");
  const p = profile.value || {};
  const heroes = objects.find((o) => o.collection === "player_heroes");
  const inventory = objects.find((o) => o.collection === "player_inventory");
  const entitlement = readEntitlementRow(nk, userId);
  return {
    user_id: userId,
    name: String(p.display_name || nk.accountGetId(userId).user.username),
    avatar_url: String(p.avatar_url || "hero_1"),
    level: Number(p.level || 1),
    vip: readVipProgress(nk, userId, vipRuntimeMode),
    resources: p.resources || {},
    heroes: canonicalHeroStates(nk, heroes ? heroes.value : null).filter((h) => h.owned).map((h) => ({ hero_id: h.hero_id, level: h.level })),
    completed_stages: Array.isArray(p.completed_stage_levels) ? p.completed_stage_levels.length : 0,
    inventory_count: inventory && Array.isArray(inventory.value.items) ? inventory.value.items.length : 0,
    no_ads_expires_at: Number(entitlement.no_ads_expires_at || 0),
    server_time: Number(entitlement.server_time || 0)
  };
}
function multiAccountLinkSummary(nk, userId) {
  const characters = nk.sqlQuery(`SELECT c.server_id,c.generation,c.status,s.display_name,
      COALESCE(p.value->>'display_name','') AS name,COALESCE((p.value->>'level')::INT,1) AS level
      FROM player_characters c JOIN game_servers s ON s.server_id=c.server_id
      LEFT JOIN storage p ON p.user_id=c.account_id AND p.collection='player_profiles' AND p.key=c.server_id||':g'||c.generation||':main'
      WHERE c.account_id=$1::UUID ORDER BY c.server_id`, [userId]);
  const entitlement = readEntitlementRow(nk, userId);
  return {
    user_id: userId,
    name: nk.accountGetId(userId).user.username,
    level: 1,
    heroes: [],
    resources: {},
    characters,
    no_ads_expires_at: Number(entitlement.no_ads_expires_at || 0),
    server_time: Number(entitlement.server_time || 0)
  };
}
function multiLinkSnapshot(nk, a, b) {
  return parseJsonb(nk.sqlQuery("SELECT multi_account_link_snapshot($1::UUID,$2::UUID) AS value", [a, b])[0].value);
}
function createMultiAccountLinkFunctions(nk) {
  nk.sqlExec(`ALTER TABLE account_link_intents ADD COLUMN IF NOT EXISTS multi_snapshot JSONB;
    CREATE TABLE IF NOT EXISTS account_link_server_tasks(
      intent_id UUID NOT NULL,server_id TEXT NOT NULL,generation INT NOT NULL,loser_id UUID NOT NULL,winner_id UUID NOT NULL,
      copy_records BOOL NOT NULL,done BOOL NOT NULL DEFAULT FALSE,PRIMARY KEY(intent_id,server_id,generation));
    CREATE OR REPLACE FUNCTION multi_account_link_snapshot(a UUID,b UUID) RETURNS JSONB LANGUAGE plpgsql AS $snap$
    BEGIN RETURN jsonb_build_object(
      'characters',(SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY server_id,account_id),'[]'::JSONB) FROM player_characters c WHERE account_id IN(a,b)),
      'servers',(SELECT COALESCE(jsonb_agg(jsonb_build_object('server_id',s.server_id,'generation',s.generation,'revision',s.revision,'status',s.status) ORDER BY s.server_id),'[]'::JSONB)
        FROM game_servers s WHERE EXISTS(SELECT 1 FROM player_characters c WHERE c.server_id=s.server_id AND c.account_id IN(a,b))),
      'ads',(SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY ad_session_id),'[]'::JSONB) FROM monetization_ad_rewards c WHERE user_id IN(a::TEXT,b::TEXT)),
      'quotas',(SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY target_server_id,target_generation,user_id,placement_id,reward_date,claim_slot),'[]'::JSONB)
        FROM monetization_daily_reward_claims c WHERE user_id IN(a::TEXT,b::TEXT)),
      'fragments',(SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY target_server_id,target_generation,user_id,reward_date),'[]'::JSONB)
        FROM monetization_daily_fragment_rewards c WHERE user_id IN(a::TEXT,b::TEXT))); END $snap$;
    CREATE OR REPLACE FUNCTION commit_multi_google_account_link(ticket UUID,actor UUID,keep UUID) RETURNS JSONB LANGUAGE plpgsql AS $merge$
    DECLARE t account_link_intents%ROWTYPE;a users%ROWTYPE;b users%ROWTYPE;w users%ROWTYPE;l users%ROWTYPE;
      uid UUID;sid TEXT;versions_now JSONB;identities_now JSONB;seconds_left DOUBLE PRECISION;
    BEGIN
      SELECT * INTO t FROM account_link_intents WHERE id=ticket FOR UPDATE;
      IF NOT FOUND OR t.initiator<>actor OR t.multi_snapshot IS NULL THEN RAISE EXCEPTION 'INVALID_MULTI_LINK_TICKET'; END IF;
      IF t.status='completed' THEN
        IF t.winner_id<>keep THEN RAISE EXCEPTION 'TICKET_CHOICE_CONFLICT'; END IF;
        RETURN jsonb_build_object('winner_id',keep,'replayed',TRUE);
      END IF;
      IF t.expires_at<=NOW() OR keep NOT IN(t.initiator,t.other_id) THEN RAISE EXCEPTION 'LINK_PREVIEW_EXPIRED'; END IF;
      FOR uid IN SELECT v FROM unnest(ARRAY[t.initiator,t.other_id]) v ORDER BY v LOOP
        INSERT INTO account_link_state(user_id) VALUES(uid) ON CONFLICT DO NOTHING;
        PERFORM 1 FROM account_link_state WHERE user_id=uid FOR UPDATE;
      END LOOP;
      IF EXISTS(SELECT 1 FROM account_link_state WHERE user_id IN(t.initiator,t.other_id) AND (status<>'active' OR active_requests<>0)) THEN RAISE EXCEPTION 'ACCOUNT_BUSY'; END IF;
      FOR sid IN SELECT DISTINCT c.server_id FROM player_characters c WHERE account_id IN(t.initiator,t.other_id) ORDER BY c.server_id LOOP
        PERFORM 1 FROM game_servers WHERE server_id=sid FOR UPDATE;
        IF EXISTS(SELECT 1 FROM game_servers WHERE server_id=sid AND (active_requests<>0 OR status NOT IN('open','disabled','maintenance','scheduled')))
          OR EXISTS(SELECT 1 FROM server_lifecycle_jobs WHERE server_id=sid AND status<>'succeeded') THEN RAISE EXCEPTION 'SERVER_BUSY'; END IF;
      END LOOP;
      PERFORM 1 FROM users WHERE id IN(t.initiator,t.other_id) ORDER BY id FOR UPDATE;
      SELECT * INTO a FROM users WHERE id=t.initiator;SELECT * INTO b FROM users WHERE id=t.other_id;
      SELECT jsonb_object_agg(id::TEXT,jsonb_build_object('email',email,'google',google_id,'password',password,'custom',custom_id,'disabled',disable_time))
        INTO identities_now FROM users WHERE id IN(t.initiator,t.other_id);
      IF a.id IS NULL OR b.id IS NULL OR identities_now IS DISTINCT FROM t.identity_snapshot
        OR b.google_id IS DISTINCT FROM t.google_id OR COALESCE(EXTRACT(EPOCH FROM a.disable_time),0)>0
        OR COALESCE(EXTRACT(EPOCH FROM b.disable_time),0)>0 THEN RAISE EXCEPTION 'IDENTITY_CHANGED'; END IF;
      IF keep=a.id THEN w:=a;l:=b;ELSE w:=b;l:=a;END IF;
      IF COALESCE(a.email,'')<>'' AND COALESCE(b.email,'')<>'' AND LOWER(a.email)<>LOWER(b.email) THEN RAISE EXCEPTION 'EMAIL_CONFLICT'; END IF;
      IF COALESCE(a.google_id,'')<>'' AND COALESCE(b.google_id,'')<>'' AND a.google_id<>b.google_id THEN RAISE EXCEPTION 'GOOGLE_CONFLICT'; END IF;
      IF EXISTS(SELECT 1 FROM unnest(ARRAY['custom_id','apple_id','facebook_id','facebook_instant_game_id','gamecenter_id','steam_id']) k
        WHERE COALESCE(to_jsonb(l)->>k,'')<>'') THEN RAISE EXCEPTION 'OTHER_PROVIDER_REQUIRES_SUPPORT'; END IF;
      IF EXISTS(SELECT 1 FROM monetization_purchase_orders WHERE user_id IN(a.id::TEXT,b.id::TEXT) AND status='pending')
        OR EXISTS(SELECT 1 FROM monetization_ad_rewards WHERE user_id IN(a.id::TEXT,b.id::TEXT) AND status IN('prepared','verified'))
        OR EXISTS(SELECT 1 FROM storage WHERE user_id IN(a.id,b.id) AND collection='player_profiles' AND value->'sweep'->>'status' IN ('running','cancelling','blocked'))
        OR EXISTS(SELECT 1 FROM storage WHERE user_id IN(a.id,b.id) AND collection='player_stage_runs'
          AND value->>'status'='active' AND COALESCE((value->>'expires_at_ms')::BIGINT,0)>EXTRACT(EPOCH FROM NOW())*1000)
        THEN RAISE EXCEPTION 'FINISH_ACTIVE_DELIVERIES_OR_RUN'; END IF;
      PERFORM 1 FROM storage WHERE user_id IN(a.id,b.id) ORDER BY user_id,collection,key FOR UPDATE;
      SELECT COALESCE(jsonb_object_agg(user_id::TEXT||'/'||collection||'/'||key,version),'{}'::JSONB) INTO versions_now FROM storage WHERE user_id IN(a.id,b.id);
      IF versions_now IS DISTINCT FROM t.versions OR account_link_finance_snapshot(a.id,b.id) IS DISTINCT FROM t.finance_snapshot
        OR multi_account_link_snapshot(a.id,b.id) IS DISTINCT FROM t.multi_snapshot THEN RAISE EXCEPTION 'PREVIEW_STALE'; END IF;
      -- Paid conflicting characters require a reviewed compensation policy, not silent loss or replay.
      IF EXISTS(SELECT 1 FROM player_characters x JOIN player_characters y ON y.server_id=x.server_id AND y.generation=x.generation
        JOIN monetization_purchases p ON p.target_server_id=x.server_id AND p.target_generation=x.generation
        WHERE x.account_id=w.id AND y.account_id=l.id AND p.user_id IN(w.id::TEXT,l.id::TEXT) AND p.status IN('verified','consumed'))
        THEN RAISE EXCEPTION 'PAID_CHARACTER_CONFLICT_REQUIRES_SUPPORT'; END IF;
      INSERT INTO account_link_archives(loser_id,winner_id,intent_id,snapshot)
        SELECT l.id,w.id,t.id,jsonb_build_object('identity',to_jsonb(l),'winner_identity',to_jsonb(w),'finance',t.finance_snapshot,'multi',t.multi_snapshot,
          'storage',(SELECT COALESCE(jsonb_agg(to_jsonb(s)),'[]'::JSONB) FROM storage s WHERE user_id IN(a.id,b.id)));
      INSERT INTO account_link_server_tasks(intent_id,server_id,generation,loser_id,winner_id,copy_records)
        SELECT t.id,c.server_id,c.generation,l.id,w.id,NOT EXISTS(SELECT 1 FROM player_characters x WHERE x.account_id=w.id AND x.server_id=c.server_id)
        FROM player_characters c WHERE c.account_id=l.id;
      -- Only non-overlapping characters transfer. Exact keys and versions are preserved.
      INSERT INTO storage(collection,key,user_id,value,version,read,write,create_time,update_time)
        SELECT o.collection,o.key,w.id,o.value,o.version,0,0,o.create_time,NOW() FROM storage o JOIN player_characters c
          ON c.account_id=o.user_id AND left(o.key,length(c.server_id||':g'||c.generation||':'))=c.server_id||':g'||c.generation||':'
        WHERE o.user_id=l.id AND o.collection=ANY('{player_profiles,player_inventory,player_heroes,player_stage_runs,player_identity,player_event_progress,player_daily_checkin,weekly_leaderboard_claims,player_purchase_grants,player_item_requests,player_mail,player_mail_deliveries}'::TEXT[])
          AND NOT EXISTS(SELECT 1 FROM player_characters other WHERE other.account_id=w.id AND other.server_id=c.server_id);
      UPDATE server_weekly_scores s SET user_id=w.id WHERE user_id=l.id AND NOT EXISTS(SELECT 1 FROM player_characters c WHERE c.account_id=w.id AND c.server_id=s.server_id);
      UPDATE server_weekly_awards s SET user_id=w.id WHERE user_id=l.id AND NOT EXISTS(SELECT 1 FROM player_characters c WHERE c.account_id=w.id AND c.server_id=s.server_id);
      INSERT INTO player_characters(account_id,server_id,generation,status,created_at,last_entered_at)
        SELECT w.id,c.server_id,c.generation,c.status,c.created_at,c.last_entered_at FROM player_characters c WHERE c.account_id=l.id
          AND NOT EXISTS(SELECT 1 FROM player_characters other WHERE other.account_id=w.id AND other.server_id=c.server_id);
      UPDATE player_characters SET status='retired' WHERE account_id=l.id;
      SELECT GREATEST(0,EXTRACT(EPOCH FROM no_ads_expires_at-NOW())) INTO seconds_left FROM player_monetization_entitlements WHERE user_id=l.id::TEXT FOR UPDATE;
      IF COALESCE(seconds_left,0)>0 THEN
        INSERT INTO player_monetization_entitlements(user_id,no_ads_expires_at,source) VALUES(w.id::TEXT,NOW()+make_interval(secs=>seconds_left),'account_link')
          ON CONFLICT(user_id) DO UPDATE SET no_ads_expires_at=GREATEST(NOW(),COALESCE(player_monetization_entitlements.no_ads_expires_at,NOW()))+make_interval(secs=>seconds_left),source='account_link',updated_at=NOW();
        UPDATE player_monetization_entitlements SET no_ads_expires_at=NOW(),updated_at=NOW() WHERE user_id=l.id::TEXT;
      END IF;
      UPDATE monetization_purchase_orders SET user_id=w.id::TEXT WHERE user_id=l.id::TEXT;
      UPDATE monetization_purchases SET user_id=w.id::TEXT WHERE user_id=l.id::TEXT;
      UPDATE player_vip_credits SET user_id=w.id::TEXT WHERE user_id=l.id::TEXT;
      UPDATE store_receipt_reservations SET user_id=w.id::TEXT WHERE user_id=l.id::TEXT;
      IF EXISTS(SELECT 1 FROM monetization_daily_reward_claims c WHERE user_id IN(a.id::TEXT,b.id::TEXT)
        AND reward_date=(NOW() AT TIME ZONE 'UTC')::DATE AND COALESCE((SELECT (snapshot->'system'->'rewarded_ads'->'placements'->c.placement_id->>'daily_limit')::INT
          FROM remote_config_releases ORDER BY config_version DESC LIMIT 1),0)<=0) THEN RAISE EXCEPTION 'REWARD_QUOTA_CONFIG_UNAVAILABLE'; END IF;
      INSERT INTO monetization_daily_reward_claims(user_id,target_server_id,target_generation,placement_id,reward_date,claim_slot,ad_session_id)
        SELECT w.id::TEXT,q.target_server_id,q.target_generation,q.placement_id,(NOW() AT TIME ZONE 'UTC')::DATE,slot,
          'merge:'||t.id||':'||md5(q.target_server_id||':'||q.target_generation||':'||q.placement_id)||':'||slot
        FROM (SELECT DISTINCT target_server_id,target_generation,placement_id FROM monetization_daily_reward_claims
          WHERE user_id IN(a.id::TEXT,b.id::TEXT) AND reward_date=(NOW() AT TIME ZONE 'UTC')::DATE) q
        CROSS JOIN LATERAL generate_series(1,(SELECT (snapshot->'system'->'rewarded_ads'->'placements'->q.placement_id->>'daily_limit')::INT
          FROM remote_config_releases ORDER BY config_version DESC LIMIT 1)) slot ON CONFLICT DO NOTHING;
      INSERT INTO monetization_daily_fragment_rewards(user_id,target_server_id,target_generation,reward_date,item_id,granted_at)
        SELECT w.id::TEXT,target_server_id,target_generation,reward_date,item_id,granted_at FROM monetization_daily_fragment_rewards WHERE user_id=l.id::TEXT
        ON CONFLICT DO NOTHING;
      UPDATE users SET email=NULL,password=NULL,google_id=NULL,custom_id=NULL,disable_time=NOW(),update_time=NOW() WHERE id=l.id;
      UPDATE users SET email=COALESCE(NULLIF(w.email,''),l.email),password=COALESCE(w.password,l.password),google_id=t.google_id,update_time=NOW() WHERE id=w.id;
      UPDATE user_device SET user_id=w.id WHERE user_id=l.id;
      UPDATE account_link_archives SET winner_id=w.id WHERE winner_id=l.id;
      UPDATE account_link_state SET merged_into=w.id WHERE merged_into=l.id;
      UPDATE account_link_state SET status='archived',merged_into=w.id WHERE user_id=l.id;
      UPDATE account_link_intents SET status='completed',winner_id=w.id WHERE id=t.id;
      RETURN jsonb_build_object('winner_id',w.id,'loser_id',l.id,'replayed',FALSE);
    END $merge$;`, []);
}
function repairMultiLinkBoards(nk, winner, server, generation) {
  const tasks = nk.sqlQuery("SELECT * FROM account_link_server_tasks WHERE winner_id=$1::UUID AND server_id=$2 AND generation=$3 AND done=FALSE ORDER BY intent_id", [winner, server, generation]);
  if (!tasks.length) return;
  withServerRequest(nk, { accountId: winner, serverId: server, generation }, () => {
    for (const task of tasks) {
      for (const board of ["best_wave", "most_kills", "total_wins", "cultivation_realm", "campaign_stage", "combat_power_v2"]) {
        const id = server + ":g" + generation + ":" + board;
        let records;
        try {
          records = nk.leaderboardRecordsList(id, [String(task.loser_id)], 1, "", 0);
        } catch (error) {
          if (/not found|not exist/i.test(String(error))) continue;
          throw error;
        }
        const record = (records.ownerRecords || []).find((r) => r.ownerId === String(task.loser_id));
        if (!record) continue;
        if (task.copy_records) nk.leaderboardRecordWrite(id, winner, record.username, record.score, record.subscore, record.metadata, "best");
        nk.leaderboardRecordDelete(id, String(task.loser_id));
      }
      nk.sqlExec("UPDATE account_link_server_tasks SET done=TRUE WHERE intent_id=$1::UUID AND server_id=$2 AND generation=$3", [task.intent_id, server, generation]);
    }
  });
}
function readAccountLinkSnapshot(nk, a, b) {
  const rows = nk.sqlQuery(`SELECT
        (SELECT jsonb_object_agg(id::TEXT,jsonb_build_object('email',email,'google',google_id,'password',password,'custom',custom_id,'disabled',disable_time)) FROM users WHERE id IN($1::UUID,$2::UUID)) AS identities,
        (SELECT COALESCE(jsonb_object_agg(user_id::TEXT||'/'||collection||'/'||key,version),'{}'::JSONB) FROM storage WHERE user_id IN($1::UUID,$2::UUID)) AS versions,
        account_link_finance_snapshot($1::UUID,$2::UUID) AS finance`, [a, b]);
  if (!rows.length) throw new Error("Account snapshot unavailable");
  return { identities: parseJsonb(rows[0].identities), versions: parseJsonb(rows[0].versions), finance: parseJsonb(rows[0].finance) };
}
function canonicalLinkSnapshot(value) {
  function sorted(v) {
    if (Array.isArray(v)) return v.map(sorted);
    if (!v || typeof v !== "object") return v;
    const result = {};
    for (const key of Object.keys(v).sort()) result[key] = sorted(v[key]);
    return result;
  }
  return JSON.stringify(sorted(value));
}
const prepareGoogleLink = (ctx, _logger, nk, payload) => {
  if (!ctx.userId) return JSON.stringify({ success: false, code: 401 });
  let req;
  try {
    req = JSON.parse(payload || "{}");
  } catch (_e) {
    return JSON.stringify({ success: false, code: 400 });
  }
  const token = String(req && req.id_token || "");
  if (!token || token.length > 16384) return JSON.stringify({ success: false, code: 400, message: "Missing Google ID token" });
  let google;
  try {
    google = nk.authenticateGoogle(token, "", false);
  } catch (error) {
    if (String(error).toLowerCase().indexOf("user account not found") < 0) return JSON.stringify({ success: false, code: 401, message: "Google verification failed" });
    try {
      nk.linkGoogle(ctx.userId, token);
      return JSON.stringify({ success: true, linked: true });
    } catch (_e) {
      return JSON.stringify({ success: false, code: 409, message: "Google identity changed; retry sign-in" });
    }
  }
  if (google.userId === ctx.userId) return JSON.stringify({ success: true, linked: true, already_linked: true });
  try {
    const multi = !!(ctx.env && ctx.env.MULTI_SERVER_ENABLED === "true");
    const a = nk.accountGetId(ctx.userId), b = nk.accountGetId(google.userId);
    if (a.disableTime || b.disableTime) throw new Error("Account is disabled");
    if (a.email && b.email && a.email.toLowerCase() !== b.email.toLowerCase()) throw new Error("Different email credentials require support");
    if (a.user.googleId && a.user.googleId !== b.user.googleId) throw new Error("Different Google identities require support");
    if (!multi) {
      readVipProgress(nk, ctx.userId, vipRuntimeMode);
      readVipProgress(nk, google.userId, vipRuntimeMode);
    }
    const snapshot = readAccountLinkSnapshot(nk, ctx.userId, google.userId);
    const accounts = multi ? [multiAccountLinkSummary(nk, ctx.userId), multiAccountLinkSummary(nk, google.userId)] : [accountLinkSummary(nk, ctx.userId), accountLinkSummary(nk, google.userId)];
    const multiSnapshot = multi ? multiLinkSnapshot(nk, ctx.userId, google.userId) : null;
    if (canonicalLinkSnapshot(snapshot) !== canonicalLinkSnapshot(readAccountLinkSnapshot(nk, ctx.userId, google.userId))) throw new Error("Progress changed; refresh preview");
    const ticket = nk.uuidv4();
    const rows = nk.sqlQuery(`INSERT INTO account_link_intents(id,initiator,other_id,google_id,identity_snapshot,versions,finance_snapshot,multi_snapshot)
            VALUES($1::UUID,$2::UUID,$3::UUID,$4,$5::JSONB,$6::JSONB,$7::JSONB,$8::JSONB)
            RETURNING EXTRACT(EPOCH FROM expires_at)::BIGINT AS expires_at`, [
      ticket,
      ctx.userId,
      google.userId,
      b.user.googleId,
      JSON.stringify(snapshot.identities),
      JSON.stringify(snapshot.versions),
      JSON.stringify(snapshot.finance),
      multiSnapshot ? JSON.stringify(multiSnapshot) : null
    ]);
    return JSON.stringify({ success: true, conflict: true, ticket, accounts, server_mode: multi ? "multi" : "legacy", expires_at: Number(rows[0].expires_at) });
  } catch (error) {
    return JSON.stringify({ success: false, code: 409, message: String(error) });
  }
};
const confirmGoogleLink = (ctx, logger, nk, payload) => {
  if (!ctx.userId) return JSON.stringify({ success: false, code: 401 });
  let req;
  try {
    req = JSON.parse(payload || "{}");
  } catch (_e) {
    return JSON.stringify({ success: false, code: 400 });
  }
  if (!req || req.confirmed !== true || !req.ticket || !req.keep_user_id) return JSON.stringify({ success: false, code: 400, message: "Explicit confirmation required" });
  try {
    const multi = !!(ctx.env && ctx.env.MULTI_SERVER_ENABLED === "true");
    const rows = nk.sqlQuery("SELECT " + (multi ? "commit_multi_google_account_link" : "commit_google_account_link") + "($1::UUID,$2::UUID,$3::UUID) AS result", [String(req.ticket), ctx.userId, String(req.keep_user_id)]);
    const result = parseJsonb(rows[0].result);
    const archives = nk.sqlQuery("SELECT loser_id::TEXT FROM account_link_archives WHERE intent_id=$1::UUID", [String(req.ticket)]);
    for (const archive of archives) {
      const loser = String(archive.loser_id);
      nk.usersBanId([loser]);
      nk.sessionLogout(loser);
      for (const board of ["cultivation_realm", "campaign_stage", "combat_power", "combat_power_v2", "best_wave", "most_kills", "total_wins"]) {
        try {
          nk.leaderboardRecordDelete(board, loser);
        } catch (_e) {
        }
      }
    }
    if (multi) {
      const tasks = nk.sqlQuery("SELECT DISTINCT server_id,generation FROM account_link_server_tasks WHERE winner_id=$1::UUID AND done=FALSE ORDER BY server_id", [String(result.winner_id)]);
      for (const task of tasks) {
        try {
          withActiveAccount(nk, String(result.winner_id), () => repairMultiLinkBoards(nk, String(result.winner_id), String(task.server_id), Number(task.generation)));
        } catch (error) {
          logger.warn("Link board repair remains queued: %s", String(error));
        }
      }
    }
    return JSON.stringify({ success: true, winner_id: String(result.winner_id), reauthenticate: true });
  } catch (error) {
    logger.warn("Account link confirmation did not complete: %s", String(error));
    return JSON.stringify({ success: false, code: 409, message: String(error) });
  }
};

const useConsumable = (ctx, _logger, nk, payload) => {
  const fail = (message) => JSON.stringify({ success: false, message });
  let req;
  try {
    req = JSON.parse(payload || "{}");
  } catch (_) {
    return fail("Invalid JSON");
  }
  if (!req || typeof req !== "object" || Array.isArray(req)) return fail("Invalid request");
  const itemId = String(req.item_id || ""), requestId = String(req.request_id || ""), runId = String(req.run_id || "");
  const quantity = req.quantity === void 0 ? 1 : req.quantity;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(requestId) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) return fail("Invalid request");
  const fingerprint = JSON.stringify(["use_consumable", itemId, quantity, runId]);
  const stored = nk.storageRead([
    { collection: "player_profiles", key: "main", userId: ctx.userId },
    { collection: "player_inventory", key: "items", userId: ctx.userId },
    { collection: "player_item_requests", key: requestId, userId: ctx.userId },
    { collection: "player_stage_runs", key: "active", userId: ctx.userId }
  ]);
  const profileObject = stored.find((row) => row.collection === "player_profiles");
  const inventoryObject = stored.find((row) => row.collection === "player_inventory");
  const previous = stored.find((row) => row.collection === "player_item_requests");
  const runObject = stored.find((row) => row.collection === "player_stage_runs");
  if (!profileObject || !inventoryObject) return fail("Profile is incomplete");
  const profile = talismanJsonObject(profileObject.value), inventory = talismanJsonObject(inventoryObject.value);
  const items = Array.isArray(inventory.items) ? inventory.items : [];
  if (previous) {
    if (previous.value.fingerprint !== fingerprint) return fail("Request ID conflict");
    return JSON.stringify({ success: true, duplicate: true, inventory: items, profile, effect: previous.value.effect, receipt_id: requestId });
  }
  const rows = nk.sqlQuery("SELECT attributes FROM game_items WHERE id=$1", [itemId]);
  if (!rows.length) return fail("Unknown item");
  const attrs = talismanJsonObject(rows[0].attributes), effect = talismanJsonObject(attrs.effect);
  const kind = String(effect.kind || ""), value = Number(effect.value);
  if (attrs.enabled === false || attrs.use_action !== "use_consumable" || !Number.isFinite(value) || value <= 0) return fail("Item effect is unavailable");
  if (talismanItemQuantity(items, itemId) < quantity) return fail("Not enough items");
  const run = runObject ? talismanJsonObject(runObject.value) : {};
  const now = Date.now(), combat = effect.context === "combat";
  if (combat) {
    if (!runId || quantity !== 1 || run.run_id !== runId || run.status !== "active" || now >= Number(run.expires_at_ms || 0)) return fail("No active stage run");
    if (req.paused !== false || kind !== "revive" && req.alive !== true) return fail("Cannot use while paused or dead");
    if ((profile.breakthrough || {}).in_tribulation) return fail("Items unavailable in tribulation");
    const cooldowns = talismanJsonObject(run.item_cooldowns);
    if (now < Number(cooldowns[itemId] || 0)) return fail("Item is on cooldown");
    if (kind === "revive" && (req.alive !== false || Number(run.item_revives || 0) >= 1)) return fail("Revive unavailable");
    if (["attack", "defense", "cooldown", "resistance", "critical", "attack_speed", "heal", "shield", "slow", "revive"].indexOf(kind) < 0) return fail("Unsupported combat effect");
    if (!Number.isFinite(Number(effect.duration || 0)) || !Number.isFinite(Number(effect.cooldown)) || Number(effect.cooldown) < 0) return fail("Invalid combat config");
    cooldowns[itemId] = now + Number(effect.cooldown) * 1e3;
    run.item_cooldowns = cooldowns;
    if (kind === "revive") run.item_revives = Number(run.item_revives || 0) + 1;
  } else {
    if (runId || run.status === "active" && now < Number(run.expires_at_ms || 0) || (profile.breakthrough || {}).in_tribulation) return fail("Use this item outside combat");
    if (kind === "gold") {
      const resources = talismanJsonObject(profile.resources);
      const total = Number(resources.gold || 0) + value * quantity;
      if (!Number.isSafeInteger(total)) return fail("Resource overflow");
      resources.gold = total;
      profile.resources = resources;
    } else if (kind === "exp") {
      const threshold = progressionNextUserExp(nk, Number(profile.level || 1));
      if (Number(profile.level || 1) >= PROGRESSION_MAX_LEVEL || isBreakthroughMilestone(Number(profile.level || 1)) && Number(profile.exp || 0) >= threshold) return fail("Level or breakthrough cap reached");
      if (quantity > 1) {
        const preview = JSON.parse(JSON.stringify(profile));
        progressionApplyUser(nk, preview, value * (quantity - 1));
        if (preview.level >= PROGRESSION_MAX_LEVEL || isBreakthroughMilestone(preview.level) && preview.exp >= progressionNextUserExp(nk, preview.level)) return fail("Reduce quantity to avoid wasting items at the breakthrough cap");
      }
      progressionApplyUser(nk, profile, value * quantity);
      cultivationEnsurePreview(nk, profile);
      progressionReconcileLevelUnlocks(nk, profile);
    } else if (kind === "stamina") {
      const before = Number(profile.stamina || 0);
      if (before >= 30 || quantity > 1 && before + (quantity - 1) * value >= 30) return fail("Stamina full or quantity exceeds capacity");
      profile.stamina = Math.min(30, before + value * quantity);
      if (profile.stamina === 30) profile.last_stamina_update = Math.floor(sweepStaminaTime(profile, now) / 1e3);
    } else if (kind === "affinity") {
      if (CULTIVATION_ELEMENTS.indexOf(String(effect.element)) < 0) return fail("Unsupported element");
      cultivationEnsureSources(profile);
      const element = String(effect.element), before = Number(profile.element_affinities[element] || 0);
      const cap = Number(effect.cap);
      if (!Number.isFinite(cap) || before >= cap || quantity > 1 && before + (quantity - 1) * value >= cap) return fail("Affinity cap reached");
      profile.element_sources.fruit[element] = cultivationRound1(Number(profile.element_sources.fruit[element] || 0) + Math.min(value * quantity, cap - before));
      cultivationRebuildSources(profile);
    } else return fail("Unsupported item effect");
  }
  if (!talismanRemoveItems(items, itemId, quantity)) return fail("Inventory changed");
  inventory.items = items;
  const writes = [
    { collection: "player_profiles", key: "main", userId: ctx.userId, value: profile, version: profileObject.version, permissionRead: 1, permissionWrite: 0 },
    { collection: "player_inventory", key: "items", userId: ctx.userId, value: inventory, version: inventoryObject.version, permissionRead: 1, permissionWrite: 0 },
    { collection: "player_item_requests", key: requestId, userId: ctx.userId, value: { fingerprint, effect, created_at: now }, version: "*", permissionRead: 1, permissionWrite: 0 }
  ];
  if (combat) writes.push({ collection: "player_stage_runs", key: "active", userId: ctx.userId, value: run, version: runObject.version, permissionRead: 1, permissionWrite: 0 });
  try {
    nk.storageWrite(writes);
  } catch (_) {
    return fail("Data changed; retry the same request");
  }
  if (!combat && typeof writePlayerLeaderboardRecords === "function") {
    try {
      writePlayerLeaderboardRecords(nk, ctx.userId, profile, profile.display_name);
    } catch (_) {
    }
  }
  return JSON.stringify({ success: true, inventory: items, profile, effect, receipt_id: requestId });
};
const storePurchase = (ctx, logger, nk, payload) => {
  let req;
  try {
    req = JSON.parse(payload || "{}");
  } catch (_) {
    return JSON.stringify({ success: false, message: "Invalid JSON" });
  }
  if (!req || typeof req !== "object" || req.purchase_protocol !== 2 || !["gold", "gems"].includes(req.currency) || typeof req.item_id !== "string" || !req.item_id || typeof req.request_id !== "string") {
    return JSON.stringify({ success: false, purchase_protocol: 2, message: "Invalid store currency or purchase protocol" });
  }
  const response = JSON.parse(talismanAction(ctx, logger, nk, JSON.stringify(Object.assign({}, req, { action: "buy_material" }))));
  return JSON.stringify(Object.assign(response, { purchase_protocol: 2, item_id: req.item_id, currency: req.currency }));
};
const updateInventory = (ctx, logger, nk, payload) => {
  const req = JSON.parse(payload);
  const action = req.action;
  const itemId = req.item_id;
  const quantity = req.quantity || 0;
  if (!itemId || quantity <= 0) {
    throw new Error("Invalid item_id or quantity");
  }
  if (itemId === SWEEP_TICKET) return JSON.stringify({ success: false, code: "SWEEP_TICKET_MANAGED", message: "V\xE9 c\xE0n qu\xE9t ch\u1EC9 \u0111\u01B0\u1EE3c s\u1EED d\u1EE5ng trong C\xE0n qu\xE9t." });
  const itemRows = nk.sqlQuery("SELECT * FROM game_items WHERE id = $1", [itemId]);
  if (itemRows.length === 0) {
    throw new Error(`Unknown item: ${itemId}`);
  }
  const itemDef = itemRows[0];
  const stored = nk.storageRead([
    { collection: "player_inventory", key: "items", userId: ctx.userId }
  ]);
  let inventory = [];
  let iapRewardIds = [];
  if (stored.length > 0 && stored[0].value && stored[0].value.items) {
    inventory = stored[0].value.items;
    iapRewardIds = Array.isArray(stored[0].value._iap_reward_ids) ? stored[0].value._iap_reward_ids : [];
  }
  if (action === "add") {
    return JSON.stringify({ success: false, message: "Client item grants are forbidden" });
  } else if (action === "remove") {
    let remaining = quantity;
    let total = 0;
    for (const entry of inventory) {
      if (entry.item_id === itemId) total += entry.quantity || 0;
    }
    if (total < quantity) {
      return JSON.stringify({ success: false, message: "Not enough items" });
    }
    for (let i = inventory.length - 1; i >= 0 && remaining > 0; i--) {
      if (inventory[i].item_id !== itemId) continue;
      const current = inventory[i].quantity || 0;
      const taken = Math.min(current, remaining);
      remaining -= taken;
      if (taken >= current) {
        inventory.splice(i, 1);
      } else {
        inventory[i].quantity = current - taken;
      }
    }
  }
  nk.storageWrite([{
    collection: "player_inventory",
    key: "items",
    userId: ctx.userId,
    value: { items: inventory, _iap_reward_ids: iapRewardIds },
    version: stored.length ? stored[0].version : "*",
    permissionRead: 1,
    permissionWrite: 0
  }]);
  return JSON.stringify({ success: true, inventory });
};
function talismanJsonObject(value) {
  const decoded = parseJsonb(value);
  if (decoded && typeof decoded === "object" && !Array.isArray(decoded)) return decoded;
  if (typeof decoded === "string") {
    try {
      const parsed = JSON.parse(decoded);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (_e) {
      return {};
    }
  }
  return {};
}
function talismanItemQuantity(items, itemId) {
  return items.filter((entry) => entry && String(entry.item_id || "") === itemId).reduce((sum, entry) => sum + Math.max(0, Number(entry.quantity || 0)), 0);
}
function talismanRemoveItems(items, itemId, quantity) {
  if (!itemId || quantity <= 0 || talismanItemQuantity(items, itemId) < quantity) return false;
  let remaining = quantity;
  for (let i = items.length - 1; i >= 0 && remaining > 0; i--) {
    const entry = items[i];
    if (!entry || String(entry.item_id || "") !== itemId) continue;
    const current = Math.max(0, Number(entry.quantity || 0));
    const taken = Math.min(current, remaining);
    remaining -= taken;
    entry.quantity = current - taken;
    if (entry.quantity <= 0) items.splice(i, 1);
  }
  return remaining === 0;
}
const TALISMAN_ENHANCE_CHARM_ID = "talisman_enhance_charm";
function talismanCharmMultiplier(nk) {
  const rows = nk.sqlQuery("SELECT attributes FROM game_items WHERE id = $1", [TALISMAN_ENHANCE_CHARM_ID]);
  if (rows.length === 0) return 1;
  const attrs = talismanJsonObject(rows[0].attributes);
  if (String(attrs.upgrade_context || "") !== "talisman") return 1;
  return Math.max(1, Number(attrs.success_rate_multiplier || 1));
}
function serverGrantInventoryItem(nk, items, itemId, quantity) {
  if (!itemId || quantity <= 0) return false;
  const rows = nk.sqlQuery("SELECT stackable, max_stack FROM game_items WHERE id = $1", [itemId]);
  const isFragment = /^talisman_fragment_([1-9]|[12][0-9]|30)$/.test(itemId);
  if (rows.length === 0 && !isFragment) return false;
  const stackable = isFragment || rows[0].stackable !== false;
  const maxStack = isFragment ? 999999 : Math.max(1, Math.floor(Number(rows[0].max_stack || 999)));
  if (!stackable) {
    for (let i = 0; i < quantity; i++) items.push({ item_id: itemId, quantity: 1, acquired_at: (/* @__PURE__ */ new Date()).toISOString() });
    return true;
  }
  let remaining = quantity;
  for (const entry of items) {
    if (remaining <= 0) break;
    if (!entry || String(entry.item_id || "") !== itemId) continue;
    const current = Math.max(0, Math.floor(Number(entry.quantity || 0)));
    const added = Math.min(Math.max(0, maxStack - current), remaining);
    entry.quantity = current + added;
    remaining -= added;
  }
  while (remaining > 0) {
    const added = Math.min(maxStack, remaining);
    items.push({ item_id: itemId, quantity: added, acquired_at: (/* @__PURE__ */ new Date()).toISOString() });
    remaining -= added;
  }
  return true;
}
function talismanConfig(nk) {
  const rows = nk.sqlQuery("SELECT value FROM game_config WHERE key = 'progression'", []);
  if (rows.length === 0) return {};
  return talismanJsonObject(talismanJsonObject(rows[0].value).talisman_system);
}
function talismanDurabilityFactor(config, durability) {
  const tiers = Array.isArray(config.durability_tiers) ? config.durability_tiers : [];
  const value = Math.max(0, Math.min(100, Number(durability || 0)));
  for (const tier of tiers) if (tier && value <= Number(tier.max)) return Number(tier.factor || 0);
  return 1;
}
function talismanEffectiveStats(stats, factor) {
  const result = {};
  const source = talismanJsonObject(stats);
  for (const key of Object.keys(source)) {
    const value = Number(source[key]);
    if (Number.isFinite(value)) result[key] = value * factor;
  }
  return result;
}
function talismanUpgradeSuccessRate(upgrade, currentLevel) {
  const configured = Array.isArray(upgrade.success_rates_by_current_level) ? upgrade.success_rates_by_current_level : [];
  if (currentLevel >= 0 && currentLevel < configured.length) {
    return Math.max(0, Math.min(100, Math.floor(Number(configured[currentLevel] || 0))));
  }
  if (currentLevel < 5) return 100;
  if (currentLevel < 10) return 80 - (currentLevel - 5) * 5;
  if (currentLevel < 15) return 50 - (currentLevel - 10) * 2;
  if (currentLevel < 20) return 40 - (currentLevel - 15) * 2;
  if (currentLevel < 25) return 25 - (currentLevel - 20) * 2;
  return Math.max(0, 15 - (currentLevel - 25) * 3);
}
function talismanUpgradeQuote(nk, level, items, resources, talismanId = 0) {
  const upgrade = talismanJsonObject(talismanConfig(nk).upgrade);
  const maxLevel = Math.max(1, Math.floor(Number(upgrade.max_level || 30)));
  const currentLevel = Math.max(1, Math.floor(Number(level || 1)));
  if (currentLevel >= maxLevel) return { maxed: true, current_level: currentLevel, target_level: maxLevel };
  const targetLevel = currentLevel + 1;
  const tiers = Array.isArray(upgrade.tiers) ? upgrade.tiers : [];
  const tier = tiers.find((entry) => entry && currentLevel >= Number(entry.current_level_min || 0) && currentLevel <= Number(entry.current_level_max || 0));
  if (!tier) return { error: "Missing talisman upgrade tier", current_level: currentLevel, target_level: targetLevel };
  const quantityPerLevel = Math.floor(Number(upgrade.material_quantity_per_level || 0));
  if (!isFinite(quantityPerLevel) || quantityPerLevel <= 0) return { error: "Missing Heavenly Crystal cost config; reseed progression", success: false };
  const materialQuantity = currentLevel * quantityPerLevel;
  const gold = talismanJsonObject(upgrade.gold);
  let goldCost = Number(gold.low_base || 10) + currentLevel * Number(gold.low_growth || 4);
  if (targetLevel >= 21) goldCost = Number(gold.high_base || 200) + (currentLevel - 20) * Number(gold.high_growth || 20);
  else if (targetLevel >= 11) goldCost = Number(gold.medium_base || 50) + (currentLevel - 10) * Number(gold.medium_growth || 10);
  const materialId = String(tier.material_id || "");
  const milestones = talismanJsonObject(upgrade.fragment_milestones);
  const fallbackMilestone = [10, 20, 30].indexOf(targetLevel) >= 0 ? targetLevel : 0;
  const fragmentQuantity = Math.max(0, Math.floor(Number(milestones[String(targetLevel)] || fallbackMilestone)));
  const fragmentId = talismanId > 0 ? `talisman_fragment_${talismanId}` : "";
  const successRate = talismanUpgradeSuccessRate(upgrade, currentLevel);
  return {
    maxed: false,
    current_level: currentLevel,
    target_level: targetLevel,
    material_id: materialId,
    material_quantity: materialQuantity,
    material_owned: talismanItemQuantity(items, materialId),
    gold_cost: Math.max(0, Math.floor(goldCost)),
    gold_owned: Math.max(0, Number(resources.gold || 0)),
    success_rate: successRate,
    fragment_id: fragmentId,
    fragment_quantity: fragmentQuantity,
    fragment_owned: fragmentId ? talismanItemQuantity(items, fragmentId) : 0
  };
}
function talismanServerNowMs() {
  return Date.now();
}
function talismanCreateStageRun(nk, userId, stageId, difficultyId) {
  const objects = nk.storageRead([
    { collection: "player_inventory", key: "items", userId },
    { collection: "player_stage_runs", key: "active", userId }
  ]);
  const inventoryObject = objects.find((entry) => entry.collection === "player_inventory");
  const previousRun = objects.find((entry) => entry.collection === "player_stage_runs");
  const inventoryValue = inventoryObject ? talismanJsonObject(inventoryObject.value) : { items: [] };
  const items = Array.isArray(inventoryValue.items) ? inventoryValue.items : [];
  const equipped = items.find((entry) => entry && entry.is_equipped === true && /^talisman_[0-9]+$/.test(String(entry.item_id || "")));
  let talisman = null;
  if (equipped) {
    const rows = nk.sqlQuery("SELECT attributes FROM game_items WHERE id = $1 AND category = 'talisman'", [String(equipped.item_id)]);
    if (rows.length > 0) {
      const attrs = talismanJsonObject(rows[0].attributes);
      talisman = {
        instance_id: String(equipped.instance_id || ""),
        item_id: String(equipped.item_id || ""),
        skill_id: String(equipped.skill_id || attrs.skill_id || ""),
        level: Math.max(1, Math.floor(Number(equipped.level || 1))),
        durability: Math.max(0, Math.floor(Number(equipped.durability === void 0 ? 100 : equipped.durability))),
        max_uses: Math.max(0, Math.floor(Number(equipped.max_battle_uses || attrs.max_battle_uses || 0))),
        durability_cost_per_cast: Math.max(0, Math.floor(Number(attrs.durability_cost_per_cast || 0))),
        durability_cost_per_battle: Math.max(0, Math.floor(Number(attrs.durability_cost_per_battle || 0)))
      };
    }
  }
  const now = talismanServerNowMs();
  const waveRows = nk.sqlQuery("SELECT COUNT(*) AS wave_count FROM game_stage_waves WHERE stage_id = $1", [stageId]);
  const waveCount = waveRows.length > 0 ? Math.max(1, Math.floor(Number(waveRows[0].wave_count || 1))) : 1;
  const run = {
    run_id: nk.uuidv4(),
    stage_id: stageId,
    difficulty_id: difficultyId,
    status: "active",
    started_at_ms: now,
    expires_at_ms: now + 2 * 60 * 60 * 1e3,
    // A victory cannot be settled immediately after start. This is not a
    // replacement for a fully authoritative combat simulation, but it
    // rejects impossible instant-win reports using server-owned stage data.
    min_win_duration_ms: Math.min(12e4, Math.max(3e3, waveCount * 1500)),
    cast_seq: 0,
    talisman_uses: 0,
    last_talisman_cast_at_ms: 0,
    ad_card_rerolls_used: 0,
    talisman
  };
  return { run, version: previousRun ? previousRun.version : "*" };
}
const talismanCast = (ctx, _logger, nk, payload) => {
  let req = {};
  try {
    req = JSON.parse(payload || "{}");
  } catch (_e) {
    return JSON.stringify({ success: false, message: "Invalid JSON" });
  }
  const runId = String(req.run_id || "");
  const skillId = String(req.skill_id || "");
  const castSeq = Math.floor(Number(req.cast_seq || 0));
  if (!runId || !skillId || !Number.isSafeInteger(castSeq) || castSeq <= 0) {
    return JSON.stringify({ success: false, message: "Invalid talisman cast request" });
  }
  const objects = nk.storageRead([
    { collection: "player_stage_runs", key: "active", userId: ctx.userId },
    { collection: "player_inventory", key: "items", userId: ctx.userId }
  ]);
  const runObject = objects.find((entry) => entry.collection === "player_stage_runs");
  const inventoryObject = objects.find((entry) => entry.collection === "player_inventory");
  if (!runObject || !inventoryObject) return JSON.stringify({ success: false, message: "No active server run" });
  const run = talismanJsonObject(runObject.value);
  const inventoryValue = talismanJsonObject(inventoryObject.value);
  const items = Array.isArray(inventoryValue.items) ? inventoryValue.items : [];
  const snapshot = run.talisman && typeof run.talisman === "object" ? run.talisman : null;
  const now = talismanServerNowMs();
  if (String(run.run_id || "") !== runId || String(run.status || "") !== "active" || now > Number(run.expires_at_ms || 0)) {
    return JSON.stringify({ success: false, message: "Run is not active" });
  }
  if (!snapshot || String(snapshot.skill_id || "") !== skillId) {
    return JSON.stringify({ success: false, message: "Skill is not provided by the equipped talisman" });
  }
  const skillRows = nk.sqlQuery("SELECT skill_class, activation, levels FROM game_skills WHERE id = $1", [skillId]);
  if (skillRows.length === 0) return JSON.stringify({ success: false, message: "Unknown talisman skill" });
  if (String(skillRows[0].skill_class || "").toLowerCase() === "passive" || String(skillRows[0].activation || "").toLowerCase() === "passive") {
    return JSON.stringify({ success: false, message: "Passive talisman skills cannot be cast" });
  }
  const currentSeq = Math.max(0, Math.floor(Number(run.cast_seq || 0)));
  if (castSeq === currentSeq) {
    const equippedRetry = items.find((entry) => entry && String(entry.instance_id || "") === String(snapshot.instance_id || ""));
    return JSON.stringify({
      success: true,
      duplicate: true,
      cast_seq: currentSeq,
      uses_left: Math.max(0, Number(snapshot.max_uses || 0) - Number(run.talisman_uses || 0)),
      durability: equippedRetry ? Number(equippedRetry.durability || 0) : 0,
      inventory: items
    });
  }
  if (castSeq !== currentSeq + 1) return JSON.stringify({ success: false, message: "Invalid cast sequence", expected_seq: currentSeq + 1 });
  const equipped = items.find((entry) => entry && entry.is_equipped === true && String(entry.instance_id || "") === String(snapshot.instance_id || "") && String(entry.item_id || "") === String(snapshot.item_id || ""));
  if (!equipped) return JSON.stringify({ success: false, message: "Equipped talisman changed during run" });
  const durability = Math.max(0, Math.floor(Number(equipped.durability === void 0 ? 100 : equipped.durability)));
  if (durability <= 0) return JSON.stringify({ success: false, message: "Talisman is broken" });
  const uses = Math.max(0, Math.floor(Number(run.talisman_uses || 0)));
  const maxUses = Math.max(0, Math.floor(Number(snapshot.max_uses || 0)));
  if (maxUses > 0 && uses >= maxUses) return JSON.stringify({ success: false, message: "Talisman battle-use limit reached" });
  const levels = parseJsonb(skillRows[0].levels) || [];
  const stats = levels.length > 0 ? talismanJsonObject(levels[0].stats) : {};
  const baseCooldownMs = Math.max(0, Number(stats.cooldown || 0) * 1e3);
  const minimumCooldownMs = Math.floor(baseCooldownMs * 0.35);
  const lastCastAt = Math.max(0, Number(run.last_talisman_cast_at_ms || 0));
  if (lastCastAt > 0 && now - lastCastAt < minimumCooldownMs) {
    return JSON.stringify({ success: false, message: "Talisman skill is on cooldown", retry_after_ms: minimumCooldownMs - (now - lastCastAt) });
  }
  const durabilityCost = Math.max(0, Math.floor(Number(snapshot.durability_cost_per_cast || 0)));
  equipped.durability = Math.max(0, durability - durabilityCost);
  run.cast_seq = castSeq;
  run.talisman_uses = uses + 1;
  run.last_talisman_cast_at_ms = now;
  inventoryValue.items = items;
  nk.storageWrite([
    {
      collection: "player_stage_runs",
      key: "active",
      userId: ctx.userId,
      value: run,
      permissionRead: 1,
      permissionWrite: 0,
      version: runObject.version
    },
    {
      collection: "player_inventory",
      key: "items",
      userId: ctx.userId,
      value: inventoryValue,
      permissionRead: 1,
      permissionWrite: 0,
      version: inventoryObject.version
    }
  ]);
  return JSON.stringify({
    success: true,
    duplicate: false,
    cast_seq: castSeq,
    uses_left: maxUses > 0 ? Math.max(0, maxUses - uses - 1) : -1,
    durability: equipped.durability,
    inventory: items
  });
};
const talismanAction = (ctx, _logger, nk, payload) => {
  let req = {};
  try {
    req = JSON.parse(payload || "{}");
  } catch (_e) {
    return JSON.stringify({ success: false, message: "Invalid JSON" });
  }
  const action = String(req.action || "");
  if (["equip", "upgrade", "repair", "quote_upgrade", "quote_craft", "craft", "buy_fragment", "buy_material", "reroll_talent"].indexOf(action) < 0) {
    return JSON.stringify({ success: false, message: "Unsupported talisman action" });
  }
  const stored = nk.storageRead([
    { collection: "player_inventory", key: "items", userId: ctx.userId },
    { collection: "player_profiles", key: "main", userId: ctx.userId }
  ]);
  const inventoryObject = stored.find((entry) => entry.collection === "player_inventory");
  const profileObject = stored.find((entry) => entry.collection === "player_profiles");
  if (!inventoryObject || !profileObject) {
    return JSON.stringify({ success: false, message: "Player profile is incomplete" });
  }
  const inventoryValue = talismanJsonObject(inventoryObject.value);
  const profile = talismanJsonObject(profileObject.value);
  const items = Array.isArray(inventoryValue.items) ? inventoryValue.items : [];
  const resources = talismanJsonObject(profile.resources);
  let rerolledTalent = null;
  let upgradeAttempted = false;
  let upgradeSucceeded = true;
  let upgradeSuccessRate = 0;
  let charmConsumed = false;
  const talismanId = Math.max(0, Math.floor(Number(req.talisman_id || 0)));
  const itemId = `talisman_${talismanId}`;
  let target = items.find((entry) => entry && String(entry.item_id || "") === itemId);
  const requestId = String(req.request_id || "");
  const isItemRequest = action === "buy_material" || action === "reroll_talent";
  const fingerprint = JSON.stringify([action, action === "reroll_talent" ? "spirit_root_reset" : String(req.item_id || ""), req.currency === void 0 ? "gold" : String(req.currency)]);
  if (isItemRequest) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) return JSON.stringify({ success: false, message: "M\xE3 y\xEAu c\u1EA7u kh\xF4ng h\u1EE3p l\u1EC7" });
    const previous = nk.storageRead([{ collection: "player_item_requests", key: requestId, userId: ctx.userId }]);
    if (previous.length) {
      if (previous[0].value.fingerprint !== fingerprint) return JSON.stringify({ success: false, message: "M\xE3 y\xEAu c\u1EA7u \u0111\xE3 d\xF9ng cho giao d\u1ECBch kh\xE1c" });
      return JSON.stringify({ success: true, duplicate: true, inventory: items, resources, profile, rolled: previous[0].value.rolled });
    }
  }
  const handledRequestIds = Array.isArray(inventoryValue._talisman_request_ids) ? inventoryValue._talisman_request_ids : [];
  if ((action === "craft" || action === "buy_fragment") && requestId && handledRequestIds.indexOf(requestId) >= 0) {
    return JSON.stringify({ success: true, duplicate: true, inventory: items, resources });
  }
  if (action === "reroll_talent") {
    if (!requestId || requestId.length > 128) return JSON.stringify({ success: false, message: "M\xE3 y\xEAu c\u1EA7u kh\xF4ng h\u1EE3p l\u1EC7" });
    const receipts = Array.isArray(inventoryValue._talent_reroll_receipts) ? inventoryValue._talent_reroll_receipts : [];
    const receipt = receipts.find((entry) => entry.request_id === requestId);
    if (receipt) return JSON.stringify({ success: true, duplicate: true, rolled: receipt.rolled, inventory: items, profile, resources });
    const active = nk.storageRead([{ collection: "player_stage_runs", key: "active", userId: ctx.userId }]);
    if (active.length && active[0].value.status === "active" && Number(active[0].value.expires_at_ms) > Date.now() || profile.breakthrough && profile.breakthrough.in_tribulation) {
      return JSON.stringify({ success: false, message: "Kh\xF4ng th\u1EC3 t\u1EA9y thi\xEAn ph\xFA khi \u0111ang trong tr\u1EADn ho\u1EB7c Thi\xEAn Ki\u1EBFp" });
    }
    const catalog = nk.sqlQuery("SELECT attributes FROM game_items WHERE id=$1", ["spirit_root_reset"]);
    if (!catalog.length || talismanJsonObject(catalog[0].attributes).use_action !== "reroll_talent") return JSON.stringify({ success: false, message: "T\u1EA9y Linh Qu\u1EA3 ch\u01B0a \u0111\u01B0\u1EE3c c\u1EA5u h\xECnh" });
    if (!talismanRemoveItems(items, "spirit_root_reset", 1)) return JSON.stringify({ success: false, message: "C\u1EA7n 1 T\u1EA9y Linh Qu\u1EA3" });
    rerolledTalent = cultivationRollProfile();
    const progressionRows = nk.sqlQuery("SELECT value FROM game_config WHERE key = 'progression'", []);
    const rerollConfig = progressionRows.length ? talismanJsonObject(talismanJsonObject(progressionRows[0].value).consumables).reroll : null;
    if (!rerollConfig || !Number.isFinite(rerollConfig.main_growth) || !Number.isFinite(rerollConfig.secondary_growth)) return JSON.stringify({ success: false, message: "Thi\u1EBFu c\u1EA5u h\xECnh t\u0103ng tr\u01B0\u1EDFng thi\xEAn ph\xFA" });
    cultivationApplyReroll(profile, rerolledTalent, rerollConfig);
    if (profile.breakthrough) Object.assign(profile.breakthrough, { count_rolled: false, tribulation_count: 0, encounter_id: "", encounter_seed: 0, skill_set: [] });
    receipts.push({ request_id: requestId, rolled: rerolledTalent });
    inventoryValue._talent_reroll_receipts = receipts.slice(-100);
  } else if (action === "buy_material") {
    const requestedItemId = String(req.item_id || "");
    const currency = req.currency === void 0 ? "gold" : String(req.currency);
    if (["gold", "gems"].indexOf(currency) < 0 || !requestedItemId || !requestId || requestId.length > 128) {
      return JSON.stringify({ success: false, message: "Y\xEAu c\u1EA7u mua v\u1EADt ph\u1EA9m kh\xF4ng h\u1EE3p l\u1EC7" });
    }
    const receipts = Array.isArray(inventoryValue._store_receipts) ? inventoryValue._store_receipts : [];
    const receipt = receipts.find((entry) => entry.request_id === requestId);
    if (receipt) {
      if (receipt.item_id !== requestedItemId || receipt.currency !== currency) return JSON.stringify({ success: false, message: "M\xE3 giao d\u1ECBch \u0111\xE3 d\xF9ng cho v\u1EADt ph\u1EA9m kh\xE1c" });
      return JSON.stringify({ success: true, duplicate: true, inventory: items, resources });
    }
    if (handledRequestIds.indexOf(requestId) >= 0) return JSON.stringify({ success: false, message: "M\xE3 giao d\u1ECBch \u0111\xE3 \u0111\u01B0\u1EE3c s\u1EED d\u1EE5ng" });
    const store = talismanJsonObject(talismanConfig(nk).store);
    const materialProducts = Array.isArray(store.materials) ? store.materials : [];
    const product = materialProducts.find((entry) => entry && String(entry.item_id || "") === requestedItemId && String(entry.currency || "") === currency);
    if (!product || product.enabled === false) return JSON.stringify({ success: false, message: "V\u1EADt ph\u1EA9m ch\u01B0a \u0111\u01B0\u1EE3c b\xE1n b\u1EB1ng lo\u1EA1i ti\u1EC1n n\xE0y" });
    const price = Number(product.price);
    const grantQuantity = Number(product.quantity);
    if (!Number.isSafeInteger(price) || price <= 0 || !Number.isSafeInteger(grantQuantity) || grantQuantity <= 0) return JSON.stringify({ success: false, message: "C\u1EA5u h\xECnh gi\xE1 kh\xF4ng h\u1EE3p l\u1EC7" });
    const balance = Number(resources[currency] || 0);
    if (!Number.isSafeInteger(balance) || balance < 0) return JSON.stringify({ success: false, message: "S\u1ED1 d\u01B0 kh\xF4ng h\u1EE3p l\u1EC7; vui l\xF2ng \u0111\u1ED3ng b\u1ED9 l\u1EA1i h\u1ED3 s\u01A1" });
    if (balance < price) return JSON.stringify({ success: false, message: currency === "gold" ? "Kh\xF4ng \u0111\u1EE7 V\xE0ng" : "Kh\xF4ng \u0111\u1EE7 Gem" });
    if (!serverGrantInventoryItem(nk, items, requestedItemId, grantQuantity)) {
      return JSON.stringify({ success: false, message: "Kh\xF4ng th\u1EC3 c\u1EA5p v\u1EADt ph\u1EA9m" });
    }
    resources[currency] = balance - price;
    receipts.push({ request_id: requestId, item_id: requestedItemId, currency });
    inventoryValue._store_receipts = receipts.slice(-100);
    if (requestId) handledRequestIds.push(requestId);
  } else if (action === "buy_fragment") {
    const quantity = Math.max(1, Math.floor(Number(req.quantity || 1)));
    if (talismanId < 26 || talismanId > 30) return JSON.stringify({ success: false, message: "Only high-quality fragments are sold for gems" });
    const cost = 100 * quantity;
    if (Number(resources.gems || 0) < cost) return JSON.stringify({ success: false, message: "Not enough gems" });
    if (!serverGrantInventoryItem(nk, items, `talisman_fragment_${talismanId}`, quantity)) return JSON.stringify({ success: false, message: "Fragment grant failed" });
    resources.gems = Number(resources.gems || 0) - cost;
    if (requestId) handledRequestIds.push(requestId);
  } else if (action === "quote_craft" || action === "craft") {
    if (target) return JSON.stringify({ success: false, message: "Talisman is already owned" });
    const rows = nk.sqlQuery("SELECT attributes FROM game_items WHERE id = $1 AND category = 'talisman'", [itemId]);
    if (rows.length === 0) return JSON.stringify({ success: false, message: "Unknown talisman catalog item" });
    const attrs = talismanJsonObject(rows[0].attributes);
    const quality = String(attrs.quality || (talismanId <= 15 ? "low" : talismanId <= 25 ? "mid" : "high"));
    const qualities = talismanJsonObject(talismanConfig(nk).qualities);
    const qualityCfg = talismanJsonObject(qualities[quality]);
    const fragmentId = `talisman_fragment_${talismanId}`;
    const fragmentQuantity = Math.max(1, Number(qualityCfg.craft_fragments || 100));
    const goldCost = Math.max(0, Number(qualityCfg.craft_gold || 0));
    const quote = {
      fragment_id: fragmentId,
      fragment_quantity: fragmentQuantity,
      fragment_owned: talismanItemQuantity(items, fragmentId),
      gold_cost: goldCost,
      gold_owned: Number(resources.gold || 0)
    };
    if (action === "quote_craft") return JSON.stringify({ success: true, quote });
    if (quote.fragment_owned < fragmentQuantity) return JSON.stringify({ success: false, message: "Not enough talisman fragments", quote });
    if (quote.gold_owned < goldCost) return JSON.stringify({ success: false, message: "Not enough gold", quote });
    if (!talismanRemoveItems(items, fragmentId, fragmentQuantity)) return JSON.stringify({ success: false, message: "Fragment debit failed" });
    resources.gold = quote.gold_owned - goldCost;
    const baseStats = talismanJsonObject(attrs.base_stats);
    target = {
      instance_id: `talisman_${ctx.userId}_${Date.now()}`,
      item_id: itemId,
      category: "talisman",
      quantity: 1,
      acquired_at: (/* @__PURE__ */ new Date()).toISOString(),
      level: 1,
      exp: 0,
      max_exp: 1,
      durability: Number(attrs.base_durability || 100),
      max_durability: Number(attrs.max_durability || 100),
      is_equipped: false,
      is_repairable: attrs.is_repairable !== false,
      skill_id: String(attrs.skill_id || `skill_talisman_${talismanId}`),
      tier_name: String(attrs.tier_name || ""),
      base_rolled_stats: baseStats,
      current_stats: baseStats,
      reforge_affixes: []
    };
    items.push(target);
    if (requestId) handledRequestIds.push(requestId);
  } else if (action === "equip") {
    if (talismanId > 0 && !target) return JSON.stringify({ success: false, message: "Talisman is not owned" });
    for (const entry of items) {
      if (entry && /^talisman_[0-9]+$/.test(String(entry.item_id || ""))) {
        entry.is_equipped = talismanId > 0 && String(entry.item_id) === itemId;
      }
    }
  } else {
    if (!target) return JSON.stringify({ success: false, message: "Talisman is not owned" });
    const rows = nk.sqlQuery("SELECT attributes FROM game_items WHERE id = $1 AND category = 'talisman'", [itemId]);
    if (rows.length === 0) return JSON.stringify({ success: false, message: "Unknown talisman catalog item" });
    const attrs = talismanJsonObject(rows[0].attributes);
    const durability = Math.max(0, Number(target.durability === void 0 ? 100 : target.durability));
    const maxDurability = Math.max(1, Number(target.max_durability || attrs.max_durability || 100));
    if (action === "quote_upgrade") {
      const quote = talismanUpgradeQuote(nk, Number(target.level || 1), items, resources, talismanId);
      if (quote.error) return JSON.stringify({ success: false, message: String(quote.error) });
      return JSON.stringify({ success: true, quote });
    }
    if (action === "upgrade") {
      const useCharm = req.use_charm === true;
      if (durability <= 0) return JSON.stringify({ success: false, message: "Repair the talisman before upgrading" });
      let level = Math.max(1, Math.floor(Number(target.level || 1)));
      const quote = talismanUpgradeQuote(nk, level, items, resources, talismanId);
      if (quote.maxed === true) return JSON.stringify({ success: false, message: "Talisman is already max level", quote });
      if (quote.error) return JSON.stringify({ success: false, message: String(quote.error) });
      if (Number(resources.gold || 0) < Number(quote.gold_cost || 0)) {
        return JSON.stringify({ success: false, message: `Not enough gold (need ${quote.gold_cost})`, quote });
      }
      if (Number(quote.material_owned || 0) < Number(quote.material_quantity || 0)) {
        return JSON.stringify({ success: false, message: `Not enough ${quote.material_id} (need ${quote.material_quantity})`, quote });
      }
      const fragmentQuantity = Number(quote.fragment_quantity || 0);
      const fragmentId = `talisman_fragment_${talismanId}`;
      if (fragmentQuantity > 0 && talismanItemQuantity(items, fragmentId) < fragmentQuantity) {
        return JSON.stringify({ success: false, message: `Not enough ${fragmentId} (need ${fragmentQuantity})`, quote });
      }
      if (useCharm && talismanItemQuantity(items, TALISMAN_ENHANCE_CHARM_ID) < 1) {
        return JSON.stringify({ success: false, message: "Not enough talisman enhancement charm", quote });
      }
      if (!talismanRemoveItems(items, String(quote.material_id), Number(quote.material_quantity))) {
        return JSON.stringify({ success: false, message: "Material debit failed" });
      }
      if (fragmentQuantity > 0 && !talismanRemoveItems(items, fragmentId, fragmentQuantity)) {
        return JSON.stringify({ success: false, message: "Fragment debit failed", quote });
      }
      if (useCharm && !talismanRemoveItems(items, TALISMAN_ENHANCE_CHARM_ID, 1)) {
        return JSON.stringify({ success: false, message: "Enhancement charm debit failed", quote });
      }
      charmConsumed = useCharm;
      resources.gold = Number(resources.gold || 0) - Number(quote.gold_cost || 0);
      upgradeAttempted = true;
      const baseSuccessRate = Math.max(0, Math.min(100, Math.floor(Number(quote.success_rate || 0))));
      upgradeSuccessRate = Math.min(100, Math.round(baseSuccessRate * (useCharm ? talismanCharmMultiplier(nk) : 1)));
      upgradeSucceeded = Math.random() <= upgradeSuccessRate * 0.01;
      if (!upgradeSucceeded) {
      } else {
        const growth = talismanJsonObject(attrs.stat_growth);
        const currentStats = talismanJsonObject(target.current_stats);
        for (const key of Object.keys(growth)) currentStats[key] = Number(currentStats[key] || 0) + Number(growth[key] || 0);
        level = Number(quote.target_level);
        target.level = level;
        target.exp = 0;
        target.max_exp = 1;
        target.current_stats = currentStats;
      }
    } else {
      if (target.is_repairable === false || attrs.is_repairable === false) return JSON.stringify({ success: false, message: "Talisman cannot be repaired" });
      if (durability >= maxDurability) return JSON.stringify({ success: false, message: "Talisman does not need repair" });
      const costPerPoint = Math.max(0, Number(attrs.repair_cost_per_point || 50));
      let goldCost = (maxDurability - durability) * costPerPoint;
      if (durability <= 0) goldCost = maxDurability * costPerPoint * Math.max(1, Number(talismanConfig(nk).severe_break_gold_multiplier || 2));
      if (Number(resources.gold || 0) < goldCost) return JSON.stringify({ success: false, message: `Not enough gold (need ${goldCost})` });
      if (durability <= 0) {
        const repairItemId = String(attrs.severe_repair_item_id || "");
        const repairItemQuantity = Math.max(0, Math.floor(Number(attrs.severe_repair_item_quantity || 0)));
        if (!(repairItemId && repairItemQuantity > 0 && talismanRemoveItems(items, repairItemId, repairItemQuantity))) {
          const gemCost = Math.max(0, Math.floor(Number(talismanConfig(nk).severe_break_gem_cost || 10)));
          if (Number(resources.gems || 0) < gemCost) return JSON.stringify({ success: false, message: `Not enough gems (need ${gemCost})` });
          resources.gems = Number(resources.gems || 0) - gemCost;
        }
      }
      resources.gold = Number(resources.gold || 0) - goldCost;
      target.durability = maxDurability;
    }
  }
  inventoryValue.items = items;
  inventoryValue._talisman_request_ids = handledRequestIds.slice(-100);
  profile.resources = resources;
  const actionWrites = [
    {
      collection: "player_inventory",
      key: "items",
      userId: ctx.userId,
      value: inventoryValue,
      permissionRead: 1,
      permissionWrite: 0,
      version: inventoryObject.version
    },
    {
      collection: "player_profiles",
      key: "main",
      userId: ctx.userId,
      value: profile,
      permissionRead: 1,
      permissionWrite: 0,
      version: profileObject.version
    }
  ];
  if (isItemRequest) actionWrites.push({
    collection: "player_item_requests",
    key: requestId,
    userId: ctx.userId,
    value: { fingerprint, rolled: rerolledTalent, created_at: Date.now() },
    permissionRead: 1,
    permissionWrite: 0,
    version: "*"
  });
  try {
    nk.storageWrite(actionWrites);
  } catch (_e) {
    return JSON.stringify({ success: false, message: "D\u1EEF li\u1EC7u \u0111\xE3 thay \u0111\u1ED5i. Vui l\xF2ng \u0111\u1ED3ng b\u1ED9 r\u1ED3i th\u1EED l\u1EA1i." });
  }
  if (rerolledTalent && typeof writePlayerLeaderboardRecords === "function") {
    try {
      writePlayerLeaderboardRecords(nk, ctx.userId, profile, profile.display_name);
    } catch (_) {
    }
  }
  if (action === "upgrade" && upgradeSucceeded) {
    eventRecord(
      nk,
      ctx.userId,
      "talisman_enhance",
      1,
      { talisman_id: talismanId },
      requestId || `${talismanId}:${Number(target ? target.level : 0)}`
    );
  }
  const durabilityFactor = target ? talismanDurabilityFactor(talismanConfig(nk), Number(target.durability || 0)) : 0;
  const effectiveStats = target ? talismanEffectiveStats(target.current_stats, durabilityFactor) : {};
  return JSON.stringify({
    success: action === "upgrade" ? upgradeSucceeded : true,
    attempted: upgradeAttempted,
    consumed: upgradeAttempted,
    charm_consumed: charmConsumed,
    success_rate: upgradeSuccessRate,
    message: action === "upgrade" && !upgradeSucceeded ? "Talisman enhancement failed" : "",
    inventory: items,
    resources,
    profile: rerolledTalent ? profile : void 0,
    rolled: rerolledTalent || void 0,
    level: target ? Number(target.level || 1) : 0,
    exp: target ? Number(target.exp || 0) : 0,
    max_exp: target ? Number(target.max_exp || 20) : 0,
    durability: target ? Number(target.durability || 0) : 0,
    durability_factor: durabilityFactor,
    effective_stats: effectiveStats,
    quote: target ? talismanUpgradeQuote(nk, Number(target.level || 1), items, resources, talismanId) : {}
  });
};

function parseJsonObject(value) {
  const parsed = parseJsonb(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}
const STAMINA_CAP_RESOURCE = 30;
function elementUpgradeRequirement(nk, elementName, level) {
  const tiers = level < 10 ? "low" : level < 20 ? "medium" : "high";
  const tierStart = level < 10 ? 0 : level < 20 ? 10 : 20;
  const configured = getRemoteConfigValue(nk, "game_play", "element_upgrade_stones", []);
  const costs = Array.isArray(configured) ? configured : [];
  const fallback = 1 << level - tierStart + 1;
  const stoneCount = Math.max(1, Number(costs[Math.min(level, Math.max(costs.length - 1, 0))] || fallback));
  const stoneId = tiers === "high" ? `rune_${elementName}_high` : `stone_${elementName}_${tiers}`;
  const goldCost = level >= 20 ? 200 + (level - 20) * 20 : level >= 10 ? 50 + (level - 10) * 10 : 10 + level * 4;
  return { stoneId, stoneCount, goldCost };
}
function elementSuccessRate(level) {
  if (level < 5) return 1;
  if (level < 10) return 0.8 - (level - 5) * 0.05;
  if (level < 15) return 0.5 - (level - 10) * 0.02;
  if (level < 20) return 0.4 - (level - 15) * 0.02;
  if (level < 25) return 0.25 - (level - 20) * 0.02;
  return Math.max(0, 0.15 - (level - 25) * 0.03);
}
const ELEMENT_ENLIGHTENMENT_CHARM_ID = "element_enlightenment_charm";
function upgradeCharmMultiplier(nk, itemId, context) {
  const rows = nk.sqlQuery("SELECT attributes FROM game_items WHERE id = $1", [itemId]);
  if (rows.length === 0) return 1;
  const attrs = parseJsonObject(rows[0].attributes);
  if (String(attrs.upgrade_context || "") !== context) return 1;
  return Math.max(1, Number(attrs.success_rate_multiplier || 1));
}
const upgradeElement = (ctx, _logger, nk, payload) => {
  let req = {};
  try {
    req = JSON.parse(payload || "{}");
  } catch (_e) {
    return JSON.stringify({ success: false, message: "Invalid JSON" });
  }
  const element = String(req.element || "");
  const useCharm = req.use_charm === true;
  if (["metal", "wood", "water", "fire", "earth"].indexOf(element) < 0) return JSON.stringify({ success: false, message: "Invalid element" });
  const stored = nk.storageRead([
    { collection: "player_profiles", key: "main", userId: ctx.userId },
    { collection: "player_inventory", key: "items", userId: ctx.userId }
  ]);
  const profileObject = stored.find((entry) => entry.collection === "player_profiles");
  const inventoryObject = stored.find((entry) => entry.collection === "player_inventory");
  if (!profileObject || !inventoryObject) return JSON.stringify({ success: false, message: "Player profile is incomplete" });
  const profile = parseJsonObject(profileObject.value);
  const inventory = parseJsonObject(inventoryObject.value);
  const elements = parseJsonObject(profile.elements);
  const level = Math.max(0, Number(elements[element] || 0));
  if (level >= 30) return JSON.stringify({ success: false, message: "Element is already max level" });
  const requirement = elementUpgradeRequirement(nk, element, level);
  const resources = parseJsonObject(profile.resources);
  const items = Array.isArray(inventory.items) ? inventory.items : [];
  const owned = items.filter((item) => item && String(item.item_id) === requirement.stoneId).reduce((sum, item) => sum + Math.max(0, Number(item.quantity || 0)), 0);
  const charmOwned = items.filter((item) => item && String(item.item_id) === ELEMENT_ENLIGHTENMENT_CHARM_ID).reduce((sum, item) => sum + Math.max(0, Number(item.quantity || 0)), 0);
  if (Number(resources.gold || 0) < requirement.goldCost) return JSON.stringify({ success: false, message: "Not enough gold" });
  if (owned < requirement.stoneCount) return JSON.stringify({ success: false, message: "Not enough stones" });
  if (useCharm && charmOwned < 1) return JSON.stringify({ success: false, message: "Not enough enlightenment charm" });
  resources.gold = Number(resources.gold || 0) - requirement.goldCost;
  let remaining = requirement.stoneCount;
  for (let i = items.length - 1; i >= 0 && remaining > 0; i--) {
    const item = items[i];
    if (!item || String(item.item_id) !== requirement.stoneId) continue;
    const taken = Math.min(remaining, Math.max(0, Number(item.quantity || 0)));
    item.quantity = Number(item.quantity || 0) - taken;
    remaining -= taken;
    if (item.quantity <= 0) items.splice(i, 1);
  }
  if (useCharm) {
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (!item || String(item.item_id) !== ELEMENT_ENLIGHTENMENT_CHARM_ID) continue;
      item.quantity = Number(item.quantity || 0) - 1;
      if (item.quantity <= 0) items.splice(i, 1);
      break;
    }
  }
  const baseRate = elementSuccessRate(level);
  const effectiveRate = Math.min(1, baseRate * (useCharm ? upgradeCharmMultiplier(nk, ELEMENT_ENLIGHTENMENT_CHARM_ID, "element") : 1));
  const success = Math.random() <= effectiveRate;
  if (success) elements[element] = level + 1;
  profile.elements = elements;
  profile.resources = resources;
  inventory.items = items;
  nk.storageWrite([
    { collection: "player_profiles", key: "main", userId: ctx.userId, value: profile, permissionRead: 1, permissionWrite: 0, version: profileObject.version },
    { collection: "player_inventory", key: "items", userId: ctx.userId, value: inventory, permissionRead: 1, permissionWrite: 0, version: inventoryObject.version }
  ]);
  if (success) eventRecord(nk, ctx.userId, "element_upgrade", 1, { element }, `${element}:${Number(elements[element] || level)}`);
  return JSON.stringify({
    success,
    attempted: true,
    consumed: true,
    charm_consumed: useCharm,
    success_rate: Math.round(effectiveRate * 100),
    new_level: Number(elements[element] || level),
    element,
    profile,
    inventory,
    message: success ? "Element upgraded" : "Element upgrade failed"
  });
};
function debitResource(profile, resourceId, amount) {
  if (resourceId !== "gold" && resourceId !== "gems") {
    return { success: false, message: "Unsupported currency" };
  }
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return { success: false, message: "Invalid amount" };
  }
  const resources = parseJsonObject(profile.resources);
  const current = Number(resources[resourceId] || 0);
  if (!Number.isSafeInteger(current) || current < amount) {
    return {
      success: false,
      message: `Not enough ${resourceId} (have ${current}, need ${amount})`
    };
  }
  resources[resourceId] = current - amount;
  profile.resources = resources;
  return { success: true, remaining: resources[resourceId] };
}
const spendResource = (ctx, logger, nk, payload) => {
  const req = JSON.parse(payload || "{}");
  const resourceId = String(req.resource_id || "");
  const amount = Number(req.amount || 0);
  const stored = nk.storageRead([
    { collection: "player_profiles", key: "main", userId: ctx.userId }
  ]);
  if (stored.length === 0) {
    return JSON.stringify({ success: false, message: "No profile found" });
  }
  const profile = stored[0].value;
  const debit = debitResource(profile, resourceId, amount);
  if (!debit.success) return JSON.stringify(debit);
  nk.storageWrite([{
    collection: "player_profiles",
    key: "main",
    userId: ctx.userId,
    value: profile,
    permissionRead: 1,
    permissionWrite: 0,
    version: stored[0].version
  }]);
  return JSON.stringify(debit);
};
const purchaseStamina = (ctx, _logger, nk, _payload) => {
  const staminaAmount = 15;
  const prices = [30, 40, 50];
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const stored = nk.storageRead([
    { collection: "player_profiles", key: "main", userId: ctx.userId }
  ]);
  if (stored.length === 0) {
    return JSON.stringify({ success: false, message: "No profile found" });
  }
  const profileObject = stored[0];
  const profile = parseJsonObject(profileObject.value);
  const purchaseDay = String(profile.stamina_purchase_day || "");
  const purchasesToday = purchaseDay === today ? Math.max(0, Math.min(prices.length, Number(profile.stamina_purchases_today || 0))) : 0;
  if (purchasesToday >= prices.length) {
    return JSON.stringify({
      success: false,
      message: "Daily stamina purchase limit reached",
      purchases_today: purchasesToday
    });
  }
  if (Number(profile.stamina || 0) >= STAMINA_CAP_RESOURCE) return JSON.stringify({ success: false, message: "Stamina is already full" });
  const gemCost = prices[purchasesToday];
  const debit = debitResource(profile, "gems", gemCost);
  if (!debit.success) {
    return JSON.stringify({
      success: false,
      message: debit.message,
      gem_cost: gemCost,
      purchases_today: purchasesToday,
      gems: Number(parseJsonObject(profile.resources).gems || 0)
    });
  }
  const currentStamina = Math.max(0, Math.min(STAMINA_CAP_RESOURCE, Number(profile.stamina || 0)));
  const staminaAdded = Math.max(0, Math.min(staminaAmount, STAMINA_CAP_RESOURCE - currentStamina));
  profile.stamina = currentStamina + staminaAdded;
  profile.stamina_purchase_day = today;
  profile.stamina_purchases_today = purchasesToday + 1;
  nk.storageWrite([{
    collection: "player_profiles",
    key: "main",
    userId: ctx.userId,
    value: profile,
    permissionRead: 1,
    permissionWrite: 0,
    version: profileObject.version
  }]);
  return JSON.stringify({
    success: true,
    stamina_added: staminaAdded,
    stamina: profile.stamina,
    gems: debit.remaining,
    gem_cost: gemCost,
    purchases_today: purchasesToday + 1,
    purchases_remaining: prices.length - purchasesToday - 1,
    purchase_day: today
  });
};
const purchaseHero = (ctx, logger, nk, payload) => {
  const req = JSON.parse(payload || "{}");
  const heroId = String(req.hero_id || "");
  const currencyId = String(req.currency_id || "");
  if (!heroId || currencyId !== "gold" && currencyId !== "gems") {
    return JSON.stringify({ success: false, message: "Invalid purchase request" });
  }
  const rows = nk.sqlQuery(
    "SELECT id, display_name, price, require FROM game_heroes WHERE id = $1",
    [heroId]
  );
  if (rows.length === 0) {
    return JSON.stringify({ success: false, message: "Hero does not exist" });
  }
  const hero = rows[0];
  const price = parseJsonObject(hero.price);
  const requirement = parseJsonObject(hero.require);
  const cost = Number(price[currencyId] || 0);
  const isFree = Number(price.gold || 0) <= 0 && Number(price.gems || 0) <= 0;
  if (!isFree && (!Number.isSafeInteger(cost) || cost <= 0)) {
    return JSON.stringify({ success: false, message: "Hero is not sold for this currency" });
  }
  const stored = nk.storageRead([
    { collection: "player_profiles", key: "main", userId: ctx.userId },
    { collection: "player_heroes", key: "states", userId: ctx.userId }
  ]);
  let profileObject = null;
  let heroesObject = null;
  for (const object of stored) {
    if (object.collection === "player_profiles") profileObject = object;
    if (object.collection === "player_heroes") heroesObject = object;
  }
  if (!profileObject || !heroesObject) {
    return JSON.stringify({ success: false, message: "Player profile is incomplete" });
  }
  const profile = parseJsonObject(profileObject.value);
  const heroesData = parseJsonObject(heroesObject.value);
  const heroes = Array.isArray(heroesData.heroes) ? heroesData.heroes : [];
  const state = heroes.find((entry) => entry && String(entry.hero_id || "") === heroId);
  if (!state) {
    return JSON.stringify({ success: false, message: "Hero state is missing" });
  }
  if (state.owned === true) {
    return JSON.stringify({ success: false, message: "Hero is already owned" });
  }
  const requiredLevel = Math.max(1, Number(requirement.level || 1));
  const requiredVip = Math.max(0, Number(requirement.vip || 0));
  const playerLevel = Math.max(1, Number(profile.level || 1));
  const playerVip = readVipProgress(nk, ctx.userId, monetizationMode(ctx)).level;
  const requirementMet = playerLevel >= requiredLevel || requiredVip > 0 && playerVip >= requiredVip;
  if (!requirementMet) {
    return JSON.stringify({
      success: false,
      message: `Requires level ${requiredLevel}` + (requiredVip > 0 ? ` or VIP ${requiredVip}` : "")
    });
  }
  let debit = {
    success: true,
    remaining: Number(parseJsonObject(profile.resources)[currencyId] || 0)
  };
  if (!isFree) {
    debit = debitResource(profile, currencyId, cost);
    if (!debit.success) return JSON.stringify(debit);
  }
  state.owned = true;
  nk.storageWrite([
    {
      collection: "player_profiles",
      key: "main",
      userId: ctx.userId,
      value: profile,
      permissionRead: 1,
      permissionWrite: 0,
      version: profileObject.version
    },
    {
      collection: "player_heroes",
      key: "states",
      userId: ctx.userId,
      value: { heroes },
      permissionRead: 1,
      permissionWrite: 0,
      version: heroesObject.version
    }
  ]);
  logger.info("Hero purchased user=%s hero=%s currency=%s cost=%d", ctx.userId, heroId, currencyId, isFree ? 0 : cost);
  return JSON.stringify({
    success: true,
    message: `Unlocked ${String(hero.display_name || heroId)}`,
    hero_id: heroId,
    currency_id: currencyId,
    cost: isFree ? 0 : cost,
    remaining: debit.remaining
  });
};
const startStage = (ctx, _logger, nk, payload) => {
  let req = {};
  try {
    req = JSON.parse(payload || "{}");
  } catch (_) {
    return JSON.stringify({ success: false, message: "Invalid JSON" });
  }
  const stageId = String(req.stage_id || "");
  const levelId = String(req.level_id || "");
  if (!stageId || !levelId) return JSON.stringify({ success: false, message: "Invalid stage" });
  const stored = nk.storageRead([{ collection: "player_profiles", key: "main", userId: ctx.userId }]);
  if (stored.length === 0) return JSON.stringify({ success: false, message: "Player profile is incomplete" });
  const profile = parseJsonObject(stored[0].value);
  const sweepBlock = sweepCombatError(profile);
  if (sweepBlock) return JSON.stringify(sweepBlock);
  if ((profile.breakthrough || {}).in_tribulation === true) return JSON.stringify({ success: false, code: "COMBAT_ACTIVE", message: "Tribulation is active" });
  const existingRuns = nk.storageRead([{ collection: "player_stage_runs", key: "active", userId: ctx.userId }]);
  if (existingRuns.length && existingRuns[0].value.status === "active" && Number(existingRuns[0].value.expires_at_ms) > Date.now()) return JSON.stringify({ success: false, code: "COMBAT_ACTIVE", message: "Combat is active" });
  if (stageId === "stage_0_admin_test") {
    const allowed = nk.sqlQuery("SELECT 1 FROM users WHERE id=$1::UUID AND LOWER(email)=LOWER($2) AND COALESCE(EXTRACT(EPOCH FROM disable_time),0)=0 LIMIT 1", [ctx.userId, "lkvu92@gmail.com"]);
    if (!allowed.length) return JSON.stringify({ success: false, code: "FORBIDDEN" });
    const state = talismanCreateStageRun(nk, ctx.userId, stageId, levelId);
    profile.activity = { type: "combat", activity_id: state.run.run_id };
    nk.storageWrite([{ collection: "player_profiles", key: "main", userId: ctx.userId, value: profile, version: stored[0].version, permissionRead: 1, permissionWrite: 0 }, { collection: "player_stage_runs", key: "active", userId: ctx.userId, value: state.run, version: state.version, permissionRead: 1, permissionWrite: 0 }]);
    return JSON.stringify({ success: true, run_id: state.run.run_id, stamina_cost: 0, stamina_remaining: profile.stamina });
  }
  try {
    sweepConfig(nk);
  } catch (_error) {
    return JSON.stringify({ success: false, code: "SWEEP_CONFIG_INVALID", message: "Stage grading configuration is unavailable" });
  }
  progressionReconcileCampaignUnlocks(nk, profile);
  const unlock = (Array.isArray(profile.unlocked_stages) ? profile.unlocked_stages : []).find((entry) => entry && String(entry.stage_id || entry) === stageId);
  const unlockedLevels = unlock && typeof unlock === "object" && Array.isArray(unlock.unlocked_levels) ? unlock.unlocked_levels : unlock ? ["normal"] : [];
  if (unlockedLevels.indexOf(levelId) === -1) return JSON.stringify({ success: false, message: "Stage level is locked" });
  const rows = nk.sqlQuery("SELECT stamina_cost FROM game_stage_levels WHERE stage_id = $1 AND level_id = $2", [stageId, levelId]);
  if (rows.length === 0) return JSON.stringify({ success: false, message: "Unknown stage level" });
  const cost = Math.max(0, Number(rows[0].stamina_cost || 0));
  const stamina = Math.max(0, Number(profile.stamina || 0));
  if (stamina < cost) return JSON.stringify({ success: false, message: "Not enough stamina", stamina_cost: cost, stamina });
  profile.stamina = stamina - cost;
  const runState = talismanCreateStageRun(nk, ctx.userId, stageId, levelId);
  profile.activity = { type: "combat", activity_id: runState.run.run_id };
  nk.storageWrite([
    {
      collection: "player_profiles",
      key: "main",
      userId: ctx.userId,
      value: profile,
      permissionRead: 1,
      permissionWrite: 0,
      version: stored[0].version
    },
    {
      collection: "player_stage_runs",
      key: "active",
      userId: ctx.userId,
      value: runState.run,
      permissionRead: 1,
      permissionWrite: 0,
      version: runState.version
    }
  ]);
  if (cost > 0) eventRecord(
    nk,
    ctx.userId,
    "stamina_spent",
    cost,
    { stage_id: stageId, difficulty_id: levelId },
    String(runState.run.run_id)
  );
  return JSON.stringify({
    success: true,
    stamina_cost: cost,
    stamina_remaining: profile.stamina,
    run_id: runState.run.run_id,
    talisman: runState.run.talisman
  });
};

const PROGRESSION_VERSION = 2;
const PROGRESSION_MAX_LEVEL = 50;
const PROGRESSION_HERO_BASE_EXP = 1e3;
const PROGRESSION_GROWTH = 1.25;
const PROGRESSION_USER_RATIO = 5;
const CULTIVATION_MAX_ATTEMPTS = 3;
const CULTIVATION_ELEMENTS = ["metal", "wood", "water", "fire", "earth"];
const CULTIVATION_TIERS = [
  { id: "thai_co", weight: 1, score_min: 90, score_max: 100, main_min: 0.8, main_max: 0.95, base_waves: 7 },
  { id: "cuc_pham", weight: 5, score_min: 80, score_max: 90, main_min: 0.6, main_max: 0.8, base_waves: 6 },
  { id: "thien_linh_can", weight: 10, score_min: 70, score_max: 80, main_min: 0.5, main_max: 0.7, base_waves: 5 },
  { id: "thuong_pham", weight: 15, score_min: 60, score_max: 70, main_min: 0.4, main_max: 0.6, base_waves: 4 },
  { id: "trung_pham", weight: 20, score_min: 50, score_max: 60, main_min: 0.3, main_max: 0.5, base_waves: 3 },
  { id: "ha_pham", weight: 49, score_min: 10, score_max: 50, main_min: 0.2, main_max: 0.4, base_waves: 2 }
];
function cultivationConfig() {
  return {
    max_attempts: CULTIVATION_MAX_ATTEMPTS,
    penalty_exp_percent: 0.3,
    element_cap: 400,
    reward_base: 5,
    reward_main_bonus: 2.5,
    reward_secondary_variance: 0.5,
    reward_main_variance: 1,
    reward_multiplier_min: 0.8,
    reward_multiplier_max: 1.2,
    performance_weight: 0.2,
    failure_penalty: 0.05,
    luck_min: -0.1,
    luck_max: 0.1,
    elements: CULTIVATION_ELEMENTS,
    tiers: CULTIVATION_TIERS,
    wave_delta: [
      { delta: 0, weight: 70 },
      { delta: -1, weight: 15 },
      { delta: 1, weight: 10 },
      { delta: 2, weight: 5 }
    ]
  };
}
function cultivationRound1(value) {
  return Math.round(value * 10) / 10;
}
function cultivationEnsureSources(profile) {
  if (profile.element_sources && profile.element_sources.version === 1) return;
  const current = profile.element_affinities || {};
  const tribulation = {}, fruit = {}, base = {}, growth = {};
  const history = (profile.breakthrough || {}).history || [];
  const unclassifiedHistory = history.some((row) => !row.gains && !(row.reward || {}).gains);
  CULTIVATION_ELEMENTS.forEach((id) => {
    tribulation[id] = cultivationRound1(history.reduce((sum, row) => sum + Math.max(0, Number((row.gains || (row.reward || {}).gains || {})[id] || 0)), 0));
    tribulation[id] = Math.min(Math.max(0, Number(current[id] || 0)), tribulation[id]);
  });
  const remaining = CULTIVATION_ELEMENTS.reduce((sum, id) => sum + Math.max(0, Number(current[id] || 0) - tribulation[id]), 0);
  const ratio = unclassifiedHistory ? 0 : remaining > 0 ? Math.min(1, Math.max(0, Number(profile.talent_score || remaining)) / remaining) : 1;
  CULTIVATION_ELEMENTS.forEach((id) => {
    const value = Math.max(0, Number(current[id] || 0) - tribulation[id]);
    base[id] = cultivationRound1(value * ratio);
    fruit[id] = cultivationRound1(value - base[id]);
    growth[id] = 0;
  });
  profile.element_sources = { version: 1, base, growth_per_level: growth, growth_levels: Number(profile.level || 1), tribulation, fruit };
}
function cultivationRebuildSources(profile) {
  const sources = profile.element_sources;
  const totals = {};
  CULTIVATION_ELEMENTS.forEach((id) => {
    totals[id] = cultivationRound1(Math.max(0, Number(sources.base[id] || 0) + Number(sources.growth_per_level[id] || 0) * Number(sources.growth_levels || 0) + Number(sources.tribulation[id] || 0) + Number(sources.fruit[id] || 0)));
  });
  profile.element_affinities = totals;
}
function cultivationApplyReroll(profile, rolled, config) {
  cultivationEnsureSources(profile);
  const sources = profile.element_sources;
  sources.base = rolled.element_affinities;
  sources.growth_levels = Number(profile.level || 1);
  CULTIVATION_ELEMENTS.forEach((id) => {
    sources.growth_per_level[id] = Number(id === rolled.main_element ? config.main_growth : config.secondary_growth);
  });
  profile.talent_tier = rolled.talent_tier;
  profile.talent_score = rolled.talent_score;
  profile.main_element = rolled.main_element;
  cultivationRebuildSources(profile);
}
function isBreakthroughMilestone(level) {
  return level < PROGRESSION_MAX_LEVEL && level % 10 === 9;
}
function cultivationSplit(mainElement, mainPct) {
  const result = {};
  result[mainElement] = mainPct;
  let open = CULTIVATION_ELEMENTS.filter((id) => id !== mainElement);
  const cap = Math.min(0.25, mainPct);
  let remaining = 1 - mainPct;
  while (remaining > 1e-5 && open.length > 0) {
    const weights = {};
    let totalWeight = 0;
    open.forEach((id) => {
      weights[id] = 0.01 + Math.random() * 0.99;
      totalWeight += weights[id];
    });
    let distributed = 0;
    const nextOpen = [];
    open.forEach((id) => {
      const available = cap - Number(result[id] || 0);
      const applied = Math.min(available, remaining * weights[id] / totalWeight);
      result[id] = Number(result[id] || 0) + applied;
      distributed += applied;
      if (available - applied > 1e-5) nextOpen.push(id);
    });
    remaining -= distributed;
    open = nextOpen;
  }
  return result;
}
function cultivationRollProfile() {
  const roll = Math.floor(Math.random() * 100) + 1;
  let cursor = 0;
  let tier = CULTIVATION_TIERS[CULTIVATION_TIERS.length - 1];
  for (let i = 0; i < CULTIVATION_TIERS.length; i++) {
    cursor += CULTIVATION_TIERS[i].weight;
    if (roll <= cursor) {
      tier = CULTIVATION_TIERS[i];
      break;
    }
  }
  const score = cultivationRound1(tier.score_min + Math.random() * (tier.score_max - tier.score_min));
  const mainElement = CULTIVATION_ELEMENTS[Math.floor(Math.random() * CULTIVATION_ELEMENTS.length)];
  const u = Math.random();
  const mainPct = tier.main_min + (tier.main_max - tier.main_min) * u * u;
  const percentages = cultivationSplit(mainElement, mainPct);
  const affinities = {};
  let sum = 0;
  CULTIVATION_ELEMENTS.forEach((id) => {
    affinities[id] = cultivationRound1(score * Number(percentages[id] || 0));
    sum += affinities[id];
  });
  affinities[mainElement] = cultivationRound1(affinities[mainElement] + score - cultivationRound1(sum));
  CULTIVATION_ELEMENTS.forEach((id) => {
    if (id === mainElement || Number(affinities[id] || 0) <= Number(affinities[mainElement] || 0)) return;
    const transfer = cultivationRound1((Number(affinities[id]) - Number(affinities[mainElement]) + 0.1) * 0.5);
    affinities[id] = cultivationRound1(Number(affinities[id]) - transfer);
    affinities[mainElement] = cultivationRound1(Number(affinities[mainElement]) + transfer);
  });
  return { talent_tier: tier.id, talent_score: score, main_element: mainElement, element_affinities: affinities };
}
function cultivationDefaultBreakthrough(history) {
  return {
    milestone_level: 0,
    attempts_left: CULTIVATION_MAX_ATTEMPTS,
    tribulation_count: 0,
    count_rolled: false,
    in_tribulation: false,
    failures: 0,
    ruleset_version: 1,
    encounter_id: "",
    encounter_seed: 0,
    skill_set: [],
    started_at: 0,
    history: Array.isArray(history) ? history : []
  };
}
function cultivationPhase2Encounter(state) {
  const waveCount = Math.max(1, Math.min(9, Number(state.tribulation_count || 1)));
  const skills = ["loi_tru"];
  if (waveCount >= 2) skills.push("loi_vong");
  if (waveCount >= 3) skills.push("loi_vuc");
  if (waveCount >= 5) skills.push("thien_phat");
  state.ruleset_version = 2;
  state.encounter_id = `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  state.encounter_seed = Math.floor(Math.random() * 2147483647);
  state.skill_set = skills;
  state.started_at = Date.now();
}
function cultivationEnsureProfile(nk, profile, recoverInterrupted) {
  let changed = false;
  const required = ["talent_tier", "talent_score", "main_element", "element_affinities"];
  if (required.some((key) => profile[key] === void 0 || profile[key] === null)) {
    const rolled = cultivationRollProfile();
    required.forEach((key) => {
      if (profile[key] === void 0 || profile[key] === null) profile[key] = rolled[key];
    });
    changed = true;
  }
  if (!Array.isArray(profile.affinity_flags)) {
    profile.affinity_flags = [];
    changed = true;
  }
  if (!Number.isFinite(Number(profile.comprehension_points))) {
    profile.comprehension_points = 0;
    changed = true;
  }
  if (!Array.isArray(profile.unlocked_laws)) {
    profile.unlocked_laws = [];
    changed = true;
  }
  if (!profile.breakthrough || typeof profile.breakthrough !== "object" || Array.isArray(profile.breakthrough)) {
    profile.breakthrough = cultivationDefaultBreakthrough();
    changed = true;
  }
  const state = profile.breakthrough;
  const history = Array.isArray(state.history) ? state.history : [];
  const defaults = cultivationDefaultBreakthrough(history);
  Object.keys(defaults).forEach((key) => {
    if (state[key] === void 0) {
      state[key] = defaults[key];
      changed = true;
    }
  });
  state.attempts_left = Math.max(0, Math.min(CULTIVATION_MAX_ATTEMPTS, Math.floor(Number(state.attempts_left))));
  state.tribulation_count = Math.max(0, Math.min(9, Math.floor(Number(state.tribulation_count))));
  state.failures = Math.max(0, Math.floor(Number(state.failures)));
  if (recoverInterrupted && state.in_tribulation === true) {
    state.in_tribulation = false;
    state.failures += 1;
    state.attempts_left = Math.max(0, state.attempts_left - 1);
    if (state.attempts_left <= 0) {
      const threshold = progressionNextUserExp(nk, Math.max(1, Number(profile.level || 1)));
      profile.exp = Math.max(0, Number(profile.exp || 0) - Math.round(threshold * 0.3));
      state.attempts_left = CULTIVATION_MAX_ATTEMPTS;
      state.penalty_applied = true;
    }
    changed = true;
  }
  return changed;
}
function cultivationRollWaves(profile) {
  const state = profile.breakthrough || cultivationDefaultBreakthrough();
  const history = Array.isArray(state.history) ? state.history : [];
  if (history.length === 0) {
    const tier = CULTIVATION_TIERS.filter((item) => item.id === String(profile.talent_tier || ""))[0];
    return Math.max(1, Math.min(9, Number(tier ? tier.base_waves : 2)));
  }
  const previous = Math.max(1, Math.min(9, Number(history[history.length - 1].waves || 1)));
  const roll = Math.floor(Math.random() * 100) + 1;
  let cursor = 0;
  let delta = 0;
  const options = cultivationConfig().wave_delta;
  for (let i = 0; i < options.length; i++) {
    cursor += options[i].weight;
    if (roll <= cursor) {
      delta = options[i].delta;
      break;
    }
  }
  return Math.max(1, Math.min(9, previous + delta));
}
function cultivationEnsurePreview(nk, profile) {
  const level = Math.max(1, Math.min(PROGRESSION_MAX_LEVEL, Number(profile.level || 1)));
  const threshold = progressionNextUserExp(nk, level);
  if (!isBreakthroughMilestone(level) || threshold <= 0 || Number(profile.exp || 0) < threshold) return false;
  let state = profile.breakthrough || cultivationDefaultBreakthrough();
  let changed = false;
  if (Number(state.milestone_level || 0) !== level) {
    state = cultivationDefaultBreakthrough(state.history);
    state.milestone_level = level;
    changed = true;
  }
  if (state.count_rolled !== true) {
    profile.breakthrough = state;
    state.tribulation_count = cultivationRollWaves(profile);
    state.count_rolled = true;
    changed = true;
  }
  profile.breakthrough = state;
  return changed;
}
function cultivationReward(profile, waves, failures, hpRatio) {
  cultivationEnsureSources(profile);
  const config = cultivationConfig();
  let multiplier = 1 + (Math.max(0, Math.min(1, hpRatio)) - 0.5) * config.performance_weight;
  multiplier -= failures * config.failure_penalty;
  multiplier += config.luck_min + Math.random() * (config.luck_max - config.luck_min);
  multiplier = Math.max(config.reward_multiplier_min, Math.min(config.reward_multiplier_max, multiplier));
  const gains = {};
  const affinities = profile.element_affinities || {};
  CULTIVATION_ELEMENTS.forEach((id) => {
    let base = config.reward_base;
    if (id === profile.main_element) {
      base += config.reward_main_bonus + Math.max(0, waves - 5);
      base += -config.reward_main_variance + Math.random() * (config.reward_main_variance * 2);
    } else {
      base += -config.reward_secondary_variance + Math.random() * (config.reward_secondary_variance * 2);
    }
    const requested = cultivationRound1(base * multiplier);
    const before = Math.max(0, Number(affinities[id] || 0));
    const after = before + Math.max(0, Math.min(config.element_cap - before, requested));
    affinities[id] = cultivationRound1(after);
    gains[id] = cultivationRound1(after - before);
    profile.element_sources.tribulation[id] = cultivationRound1(Number(profile.element_sources.tribulation[id] || 0) + gains[id]);
  });
  profile.element_affinities = affinities;
  return { multiplier: Math.round(multiplier * 100) / 100, gains };
}
function progressionObject(value) {
  const parsed = parseJsonb(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}
function progressionNextHeroExp(nk, level) {
  if (level >= PROGRESSION_MAX_LEVEL) return 0;
  const configured = getRemoteConfigValue(nk, "game_play", "exp_to_level", []);
  if (Array.isArray(configured) && configured.length > level) {
    const currentTotal = Number(configured[level - 1]);
    const nextTotal = Number(configured[level]);
    if (Number.isFinite(currentTotal) && Number.isFinite(nextTotal) && nextTotal > currentTotal) {
      return Math.max(1, Math.floor(nextTotal - currentTotal));
    }
  }
  let required = PROGRESSION_HERO_BASE_EXP;
  for (let current = 1; current < level; current++) required = Math.max(1, Math.round(required * PROGRESSION_GROWTH));
  return required;
}
function progressionNextUserExp(nk, level) {
  return progressionNextHeroExp(nk, level) * PROGRESSION_USER_RATIO;
}
function progressionApplyUser(nk, profile, awarded) {
  cultivationEnsureSources(profile);
  let level = Math.max(1, Math.min(PROGRESSION_MAX_LEVEL, Number(profile.level || 1)));
  let exp = Math.max(0, Number(profile.exp || 0)) + awarded;
  let next = progressionNextUserExp(nk, level);
  let gained = 0;
  while (level < PROGRESSION_MAX_LEVEL && next > 0 && exp >= next) {
    if (isBreakthroughMilestone(level)) {
      exp = next;
      break;
    }
    exp -= next;
    level++;
    gained++;
    next = progressionNextUserExp(nk, level);
  }
  if (level >= PROGRESSION_MAX_LEVEL) {
    exp = 0;
    next = 0;
  }
  profile.level = level;
  profile.element_sources.growth_levels = level;
  cultivationRebuildSources(profile);
  profile.exp = exp;
  profile.next_level_exp = next;
  profile.progression_version = PROGRESSION_VERSION;
  return { level, exp, next_level_exp: next, levels_gained: gained };
}
function progressionReconcileLevelUnlocks(nk, profile) {
  const level = Number(profile.level || 1);
  const arcs = nk.sqlQuery("SELECT id FROM game_arcs WHERE level_min <= $1 ORDER BY sort_order", [level]);
  const unlockedArcs = Array.isArray(profile.unlocked_arcs) ? profile.unlocked_arcs : [];
  const unlockedStages = Array.isArray(profile.unlocked_stages) ? profile.unlocked_stages : [];
  for (let i = 0; i < arcs.length; i++) {
    const arcId = String(arcs[i].id || "");
    if (arcId && unlockedArcs.indexOf(arcId) === -1) unlockedArcs.push(arcId);
    const stages = nk.sqlQuery("SELECT id FROM game_stages WHERE arc_id = $1 ORDER BY sort_order LIMIT 1", [arcId]);
    const stageId = stages.length > 0 ? String(stages[0].id || "") : "";
    if (stageId && !unlockedStages.some((entry) => entry && String(entry.stage_id || entry) === stageId)) {
      unlockedStages.push({ stage_id: stageId, unlocked_levels: ["normal"] });
    }
  }
  profile.unlocked_arcs = unlockedArcs;
  profile.unlocked_stages = unlockedStages;
}
function progressionCompleteStage(nk, profile, stageId, levelId) {
  const completed = Array.isArray(profile.completed_stage_levels) ? profile.completed_stage_levels : [];
  if (!completed.some((entry) => entry && String(entry.stage_id) === stageId && String(entry.level_id) === levelId)) {
    completed.push({ stage_id: stageId, level_id: levelId });
  }
  profile.completed_stage_levels = completed;
  const unlockedStages = Array.isArray(profile.unlocked_stages) ? profile.unlocked_stages : [];
  let current = unlockedStages.find((entry) => entry && String(entry.stage_id || entry) === stageId);
  if (!current || typeof current !== "object") {
    current = { stage_id: stageId, unlocked_levels: ["normal"] };
    unlockedStages.push(current);
  }
  if (!Array.isArray(current.unlocked_levels)) current.unlocked_levels = ["normal"];
  const levels = nk.sqlQuery("SELECT level_id FROM game_stage_levels WHERE stage_id = $1 ORDER BY sort_order", [stageId]);
  const index = levels.findIndex((entry) => String(entry.level_id) === levelId);
  if (index >= 0 && index + 1 < levels.length) {
    const nextLevel = String(levels[index + 1].level_id || "");
    if (nextLevel && current.unlocked_levels.indexOf(nextLevel) === -1) current.unlocked_levels.push(nextLevel);
  }
  if (levelId === "normal") {
    const stageRows = nk.sqlQuery("SELECT arc_id, sort_order FROM game_stages WHERE id = $1", [stageId]);
    if (stageRows.length > 0) {
      const nextRows = nk.sqlQuery(
        "SELECT id FROM game_stages WHERE arc_id = $1 AND sort_order > $2 ORDER BY sort_order LIMIT 1",
        [stageRows[0].arc_id, stageRows[0].sort_order]
      );
      if (nextRows.length > 0) {
        const nextStage = String(nextRows[0].id || "");
        if (nextStage && !unlockedStages.some((entry) => entry && String(entry.stage_id || entry) === nextStage)) {
          unlockedStages.push({ stage_id: nextStage, unlocked_levels: ["normal"] });
        }
      } else {
        const arcRows = nk.sqlQuery("SELECT sort_order FROM game_arcs WHERE id = $1", [stageRows[0].arc_id]);
        if (arcRows.length > 0) {
          const nextArcRows = nk.sqlQuery("SELECT id FROM game_arcs WHERE sort_order > $1 ORDER BY sort_order LIMIT 1", [arcRows[0].sort_order]);
          if (nextArcRows.length > 0) {
            const nextArcId = String(nextArcRows[0].id || "");
            const unlockedArcs = Array.isArray(profile.unlocked_arcs) ? profile.unlocked_arcs : [];
            if (nextArcId && unlockedArcs.indexOf(nextArcId) === -1) unlockedArcs.push(nextArcId);
            profile.unlocked_arcs = unlockedArcs;
            const firstStageRows = nk.sqlQuery("SELECT id FROM game_stages WHERE arc_id = $1 ORDER BY sort_order LIMIT 1", [nextArcId]);
            const firstStageId = firstStageRows.length > 0 ? String(firstStageRows[0].id || "") : "";
            if (firstStageId && !unlockedStages.some((entry) => entry && String(entry.stage_id || entry) === firstStageId)) {
              unlockedStages.push({ stage_id: firstStageId, unlocked_levels: ["normal"] });
            }
          }
        }
      }
    }
  }
  profile.unlocked_stages = unlockedStages;
}
function progressionReconcileCampaignUnlocks(nk, profile) {
  const completed = Array.isArray(profile.completed_stage_levels) ? profile.completed_stage_levels : [];
  const unlockedStages = Array.isArray(profile.unlocked_stages) ? profile.unlocked_stages : [];
  const unlockedArcs = Array.isArray(profile.unlocked_arcs) ? profile.unlocked_arcs : [];
  let changed = false;
  for (const entry of completed) {
    if (!entry || String(entry.level_id || "") !== "normal") continue;
    const stageId = String(entry.stage_id || "");
    const stageRows = nk.sqlQuery("SELECT arc_id, sort_order FROM game_stages WHERE id = $1", [stageId]);
    if (stageRows.length === 0) continue;
    const nextRows = nk.sqlQuery("SELECT id FROM game_stages WHERE arc_id = $1 AND sort_order > $2 ORDER BY sort_order LIMIT 1", [stageRows[0].arc_id, stageRows[0].sort_order]);
    if (nextRows.length > 0) continue;
    const arcRows = nk.sqlQuery("SELECT sort_order FROM game_arcs WHERE id = $1", [stageRows[0].arc_id]);
    if (arcRows.length === 0) continue;
    const nextArcRows = nk.sqlQuery("SELECT id FROM game_arcs WHERE sort_order > $1 ORDER BY sort_order LIMIT 1", [arcRows[0].sort_order]);
    if (nextArcRows.length === 0) continue;
    const nextArcId = String(nextArcRows[0].id || "");
    if (nextArcId && unlockedArcs.indexOf(nextArcId) === -1) {
      unlockedArcs.push(nextArcId);
      changed = true;
    }
    const firstStageRows = nk.sqlQuery("SELECT id FROM game_stages WHERE arc_id = $1 ORDER BY sort_order LIMIT 1", [nextArcId]);
    const firstStageId = firstStageRows.length > 0 ? String(firstStageRows[0].id || "") : "";
    if (firstStageId && !unlockedStages.some((value) => value && String(value.stage_id || value) === firstStageId)) {
      unlockedStages.push({ stage_id: firstStageId, unlocked_levels: ["normal"] });
      changed = true;
    }
  }
  profile.unlocked_arcs = unlockedArcs;
  profile.unlocked_stages = unlockedStages;
  return changed;
}
function progressionMigrate(nk, profile, heroes) {
  if (Number(profile.progression_version || 1) >= PROGRESSION_VERSION) return;
  let highest = Math.max(1, Math.min(PROGRESSION_MAX_LEVEL, Number(profile.level || 1)));
  for (let i = 0; i < heroes.length; i++) {
    const hero = heroes[i] || {};
    hero.level = Math.max(1, Math.min(PROGRESSION_MAX_LEVEL, Number(hero.level || 1)));
    hero.exp = Math.max(0, Number(hero.exp || 0)) * 10;
    hero.next_level_exp = progressionNextHeroExp(nk, hero.level);
    highest = Math.max(highest, hero.level);
  }
  profile.level = highest;
  profile.exp = 0;
  profile.next_level_exp = progressionNextUserExp(nk, highest);
  profile.progression_version = PROGRESSION_VERSION;
}
function progressionMaxStageBaseExp(nk, stageId) {
  const waves = nk.sqlQuery("SELECT entries FROM game_stage_waves WHERE stage_id = $1", [stageId]);
  let total = 0;
  for (let i = 0; i < waves.length; i++) {
    const entries = parseJsonb(waves[i].entries);
    if (!Array.isArray(entries)) continue;
    for (let j = 0; j < entries.length; j++) {
      const entry = entries[j] || {};
      const enemyId = String(entry.enemy_id || "");
      const enemyRows = nk.sqlQuery("SELECT exp FROM game_enemies WHERE id = $1", [enemyId]);
      if (enemyRows.length === 0) continue;
      const modifiers = progressionObject(entry.modifiers);
      const exp = Math.max(0, Number(modifiers.exp !== void 0 ? modifiers.exp : enemyRows[0].exp || 0));
      total += Math.max(0, Number(entry.count || 0)) * exp;
    }
  }
  return Math.floor(total);
}
function progressionHeroAttributes(nk, heroId, level) {
  const rows = nk.sqlQuery("SELECT attributes, level_up_stats FROM game_heroes WHERE id = $1", [heroId]);
  if (rows.length === 0) return {};
  const attributes = progressionObject(rows[0].attributes);
  const levelUp = progressionObject(rows[0].level_up_stats);
  const multiplicative = { hp: true, atk: true, def: true, move_speed: true, attack_speed: true, attack_range: true };
  for (let i = 1; i < level; i++) {
    Object.keys(levelUp).forEach((key) => {
      const value = Number(levelUp[key] || 0);
      attributes[key] = multiplicative[key] ? Number(attributes[key] || 0) * value : Number(attributes[key] || 0) + value;
    });
    attributes.crit_rate = Math.max(0, Math.min(1, Number(attributes.crit_rate || 0)));
    attributes.crit_damage = Math.max(1, Math.min(10, Number(attributes.crit_damage || 1)));
    attributes.regen_percent_per_10s = Math.max(0, Math.min(0.1, Number(attributes.regen_percent_per_10s || 0)));
    attributes.def = Math.max(0, Number(attributes.def || 0));
  }
  return attributes;
}
const awardStageProgression = (ctx, _logger, nk, payload) => {
  let req = {};
  try {
    req = JSON.parse(payload || "{}");
  } catch (_) {
    return JSON.stringify({ success: false, message: "Invalid JSON" });
  }
  const stageId = String(req.stage_id || "");
  const difficultyId = String(req.difficulty_id || "");
  const heroId = String(req.hero_id || "");
  const runId = String(req.run_id || "").slice(0, 128);
  const won = req.won === true;
  if (won && (!Number.isFinite(req.objective_hp_ratio) || req.objective_hp_ratio < 0 || req.objective_hp_ratio > 1)) return JSON.stringify({ success: false, code: "INVALID_OBJECTIVE_HP", message: "Invalid objective HP report" });
  const killedEnemies = Math.max(0, Math.floor(Number(req.killed_enemies || 0)));
  const requestedBaseExp = Number(req.base_exp || 0);
  if (!stageId || !difficultyId || !heroId || !runId || !Number.isSafeInteger(requestedBaseExp) || requestedBaseExp < 0 || !Number.isSafeInteger(killedEnemies) || killedEnemies > 1e4) {
    return JSON.stringify({ success: false, message: "Invalid stage progression request" });
  }
  const stored = nk.storageRead([
    { collection: "player_profiles", key: "main", userId: ctx.userId },
    { collection: "player_heroes", key: "states", userId: ctx.userId },
    { collection: "player_inventory", key: "items", userId: ctx.userId },
    { collection: "player_stage_runs", key: "active", userId: ctx.userId }
  ]);
  let profileObject = null;
  let heroesObject = null;
  let inventoryObject = null;
  let runObject = null;
  for (let i = 0; i < stored.length; i++) {
    if (stored[i].collection === "player_profiles") profileObject = stored[i];
    if (stored[i].collection === "player_heroes") heroesObject = stored[i];
    if (stored[i].collection === "player_inventory") inventoryObject = stored[i];
    if (stored[i].collection === "player_stage_runs") runObject = stored[i];
  }
  if (!profileObject || !heroesObject || !inventoryObject || !runObject) {
    return JSON.stringify({ success: false, message: "Player run state is incomplete" });
  }
  const run = progressionObject(runObject.value);
  if (String(run.run_id || "") !== runId || String(run.status || "") !== "active" || String(run.stage_id || "") !== stageId || String(run.difficulty_id || "") !== difficultyId || Date.now() > Number(run.expires_at_ms || 0)) {
    return JSON.stringify({ success: false, message: "Run validation failed" });
  }
  if (won && Date.now() - Number(run.started_at_ms || 0) < Math.max(0, Number(run.min_win_duration_ms || 0))) {
    return JSON.stringify({ success: false, message: "Victory reported before the server minimum run duration" });
  }
  const stageRows = nk.sqlQuery("SELECT exp_weight, is_boss, arc_id FROM game_stages WHERE id = $1", [stageId]);
  const difficultyRows = nk.sqlQuery("SELECT exp_multiplier, gold_reward, loot_table, boss_loot_table FROM game_stage_levels WHERE stage_id = $1 AND level_id = $2", [stageId, difficultyId]);
  if (stageRows.length === 0 || difficultyRows.length === 0) return JSON.stringify({ success: false, message: "Unknown stage or difficulty" });
  const maxBaseExp = progressionMaxStageBaseExp(nk, stageId);
  if (requestedBaseExp > maxBaseExp) return JSON.stringify({ success: false, message: "Invalid stage EXP" });
  const profile = progressionObject(profileObject.value);
  const grade = sweepGrade(nk, Number(req.objective_hp_ratio), won);
  if (won) sweepSetBest(profile, stageId, difficultyId, grade);
  delete profile.activity;
  const heroesData = progressionObject(heroesObject.value);
  const heroes = Array.isArray(heroesData.heroes) ? heroesData.heroes : [];
  const inventoryValue = progressionObject(inventoryObject.value);
  const inventoryItems = Array.isArray(inventoryValue.items) ? inventoryValue.items : [];
  progressionMigrate(nk, profile, heroes);
  cultivationEnsureProfile(nk, profile, false);
  const awardedRuns = Array.isArray(profile._progression_run_ids) ? profile._progression_run_ids : [];
  if (awardedRuns.indexOf(runId) !== -1) return JSON.stringify({ success: false, message: "Run already rewarded" });
  let hero = null;
  for (let i = 0; i < heroes.length; i++) if (heroes[i] && String(heroes[i].hero_id || "") === heroId) hero = heroes[i];
  if (!hero || hero.owned !== true) return JSON.stringify({ success: false, message: "Hero is not owned" });
  const multiplier = Math.max(0, Number(stageRows[0].exp_weight || 1)) * Math.max(0, Number(difficultyRows[0].exp_multiplier || 1));
  const completed = Array.isArray(profile.completed_stage_levels) ? profile.completed_stage_levels : [];
  const firstClear = won && !completed.some((entry) => entry && String(entry.stage_id) === stageId && String(entry.level_id) === difficultyId);
  const isTrainingStage = stageId === "stage_0_1" || String(stageRows[0].arc_id || "") === "arc_0";
  const ordinaryExp = isTrainingStage ? 0 : Math.max(0, Math.round(requestedBaseExp * multiplier));
  const firstClearBonusExp = firstClear ? ordinaryExp : 0;
  const awardedExp = ordinaryExp + firstClearBonusExp;
  const userResult = progressionApplyUser(nk, profile, awardedExp);
  cultivationEnsurePreview(nk, profile);
  [
    "talent_tier",
    "talent_score",
    "main_element",
    "element_affinities",
    "affinity_flags",
    "comprehension_points",
    "unlocked_laws",
    "breakthrough"
  ].forEach((key) => {
    userResult[key] = profile[key];
  });
  progressionReconcileLevelUnlocks(nk, profile);
  if (won) progressionCompleteStage(nk, profile, stageId, difficultyId);
  let heroLevel = Math.max(1, Math.min(PROGRESSION_MAX_LEVEL, Number(hero.level || 1)));
  let heroExp = Math.max(0, Number(hero.exp || 0)) + awardedExp;
  let heroNext = progressionNextHeroExp(nk, heroLevel);
  let heroLevelsGained = 0;
  const heroCap = Math.min(PROGRESSION_MAX_LEVEL, userResult.level);
  while (heroLevel < heroCap && heroNext > 0 && heroExp >= heroNext) {
    heroExp -= heroNext;
    heroLevel++;
    heroLevelsGained++;
    heroNext = progressionNextHeroExp(nk, heroLevel);
  }
  if (heroLevel >= PROGRESSION_MAX_LEVEL) {
    heroExp = 0;
    heroNext = 0;
  }
  hero.level = heroLevel;
  hero.exp = heroExp;
  hero.next_level_exp = heroNext;
  if (heroLevelsGained > 0) hero.current_attribute = progressionHeroAttributes(nk, heroId, heroLevel);
  awardedRuns.push(runId);
  profile._progression_run_ids = awardedRuns.slice(-100);
  let talismanDurability = 0;
  const snapshot = run.talisman && typeof run.talisman === "object" ? run.talisman : null;
  if (snapshot) {
    const equipped = inventoryItems.find((entry) => entry && String(entry.instance_id || "") === String(snapshot.instance_id || "") && String(entry.item_id || "") === String(snapshot.item_id || ""));
    if (equipped) {
      const config = talismanConfig(nk);
      const custom = Math.max(0, Math.floor(Number(snapshot.durability_cost_per_battle || 0)));
      const fallback = won ? Number(config.default_durability_loss_win || 3) : Number(config.default_durability_loss_loss || 6);
      const durabilityLoss = custom > 0 ? won ? custom : custom * 2 : Math.max(0, Math.floor(fallback));
      equipped.durability = Math.max(0, Number(equipped.durability === void 0 ? 100 : equipped.durability) - durabilityLoss);
      talismanDurability = Number(equipped.durability || 0);
    }
  }
  const loot = [];
  if (won) {
    const rewards = sweepRoll(sweepRewardTable(nk, stageId, difficultyId, stageRows[0], difficultyRows[0], grade));
    for (const reward of rewards) {
      if (reward.item_id) {
        if (!serverGrantInventoryItem(nk, inventoryItems, reward.item_id, reward.quantity)) throw new Error("REWARD_ITEM_INVALID");
      } else if (reward.resource_id) {
        profile.resources = progressionObject(profile.resources);
        profile.resources[reward.resource_id] = Number(profile.resources[reward.resource_id] || 0) + reward.quantity;
      }
      loot.push({ item_id: reward.item_id, resource_id: reward.resource_id, quantity: reward.quantity });
    }
  }
  inventoryValue.items = inventoryItems;
  run.status = "settled";
  run.settled_at_ms = Date.now();
  run.won = won;
  run.stage_reward = {
    eligible: won && !isTrainingStage && (awardedExp > 0 || loot.length > 0),
    hero_id: heroId,
    base_exp: awardedExp,
    first_clear_bonus_exp: firstClearBonusExp,
    base_loot: loot.slice(),
    claimed: false
  };
  if (won && !isTrainingStage) {
    const quantity = stageTicketQuantity(nk);
    if (quantity > 0) {
      if (!serverGrantInventoryItem(nk, inventoryItems, SWEEP_TICKET, quantity)) throw new Error("SWEEP_TICKET_CONFIG_MISSING");
      loot.push({ item_id: SWEEP_TICKET, quantity });
    }
  }
  nk.storageWrite([
    { collection: "player_profiles", key: "main", userId: ctx.userId, value: profile, permissionRead: 1, permissionWrite: 0, version: profileObject.version },
    { collection: "player_heroes", key: "states", userId: ctx.userId, value: { heroes }, permissionRead: 1, permissionWrite: 0, version: heroesObject.version },
    { collection: "player_inventory", key: "items", userId: ctx.userId, value: inventoryValue, permissionRead: 1, permissionWrite: 0, version: inventoryObject.version },
    { collection: "player_stage_runs", key: "active", userId: ctx.userId, value: run, permissionRead: 1, permissionWrite: 0, version: runObject.version }
  ]);
  if (won) {
    eventRecord(nk, ctx.userId, "stage_clear", 1, { stage_id: stageId, difficulty_id: difficultyId }, runId);
    eventRecord(nk, ctx.userId, "specific_stage_clear", 1, { stage_id: stageId, difficulty_id: difficultyId }, runId);
  }
  if (killedEnemies > 0) eventRecord(nk, ctx.userId, "enemy_kill", killedEnemies, { stage_id: stageId }, runId);
  eventRecord(nk, ctx.userId, "user_level_reached", Math.max(1, Number(profile.level || 1)), {}, runId);
  for (const reward of loot) {
    if (reward.item_id && Number(reward.quantity || 0) > 0) {
      eventRecord(nk, ctx.userId, "item_earned", Number(reward.quantity), { item_id: String(reward.item_id) }, `${runId}:${reward.item_id}`);
    }
  }
  if (typeof writePlayerLeaderboardRecords === "function") {
    try {
      writePlayerLeaderboardRecords(nk, ctx.userId, profile, profile.display_name);
    } catch (_lbErr) {
    }
  }
  userResult.unlocked_arcs = profile.unlocked_arcs;
  userResult.unlocked_stages = profile.unlocked_stages;
  userResult.completed_stage_levels = profile.completed_stage_levels;
  userResult.stage_grades = profile.stage_grades;
  return JSON.stringify({
    success: true,
    grade,
    best_grade: (profile.stage_grades || {})[stageId + ":" + difficultyId] || "",
    stage_reward: stageRewardSummary(run),
    exp_awarded: awardedExp,
    first_clear: firstClear,
    first_clear_bonus_exp: firstClearBonusExp,
    profile: userResult,
    inventory: inventoryValue,
    resources: profile.resources,
    loot,
    talisman_durability: talismanDurability,
    hero: {
      hero_id: heroId,
      level: heroLevel,
      exp: heroExp,
      next_level_exp: heroNext,
      levels_gained: heroLevelsGained,
      current_attribute: hero.current_attribute || {}
    }
  });
};
function stageRewardSummary(run) {
  const snapshot = run.stage_reward || {};
  const factor = snapshot.claimed === true ? Number(snapshot.multiplier || 1) : 1;
  return {
    run_id: String(run.run_id || ""),
    eligible: snapshot.eligible === true,
    claimed: snapshot.claimed === true,
    multiplier: factor,
    total_exp: Math.max(0, Number(snapshot.base_exp || 0)) * factor,
    first_clear_bonus_exp: Math.max(0, Number(snapshot.first_clear_bonus_exp || 0)) * factor,
    total_loot: (Array.isArray(snapshot.base_loot) ? snapshot.base_loot : []).map((r) => Object.assign({}, r, { quantity: Number(r.quantity) * factor }))
  };
}
function readSettledRewardRun(nk, userId, runId) {
  const rows = nk.storageRead([{ collection: "player_stage_runs", key: "active", userId }]);
  if (!rows.length) return null;
  const run = rows[0].value;
  if (String(run.run_id || "") !== runId || run.status !== "settled" || run.won !== true || !run.stage_reward || run.stage_reward.eligible !== true) return null;
  return { object: rows[0], run };
}
function grantStageRewardMultiplier(nk, userId, adSessionId, multiplier, limit) {
  const sessions = nk.sqlQuery("SELECT context FROM monetization_ad_rewards WHERE ad_session_id=$1 AND user_id=$2", [adSessionId, userId]);
  const context = sessions.length ? objectValue(parseJsonb(sessions[0].context)) : {};
  const stored = readSettledRewardRun(nk, userId, String(context.run_id || ""));
  if (!stored) return { granted: false, message: "Winning result is no longer available" };
  const run = stored.run, snapshot = run.stage_reward;
  if (snapshot.claimed) {
    if (snapshot.ad_session_id === adSessionId) return { granted: true, reward_type: "stage_reward_x2", stage_reward: stageRewardSummary(run) };
    nk.sqlExec("DELETE FROM monetization_daily_reward_claims WHERE ad_session_id=$1 AND user_id=$2", [adSessionId, userId]);
    nk.sqlExec("UPDATE monetization_ad_rewards SET status='rejected' WHERE ad_session_id=$1 AND status='verified'", [adSessionId]);
    return { granted: false, message: "This victory already received its multiplier" };
  }
  if (!Number.isSafeInteger(multiplier) || multiplier < 2 || multiplier > 10 || limit <= 0) return { granted: false, message: "Reward multiplier config is disabled" };
  const rows = nk.storageRead([
    { collection: "player_profiles", key: "main", userId },
    { collection: "player_heroes", key: "states", userId },
    { collection: "player_inventory", key: "items", userId }
  ]);
  const p = rows.find((r) => r.collection === "player_profiles"), h = rows.find((r) => r.collection === "player_heroes"), inv = rows.find((r) => r.collection === "player_inventory");
  if (!p || !h || !inv) return { granted: false, message: "Player reward state missing" };
  const hero = (h.value.heroes || []).find((r) => String(r.hero_id) === snapshot.hero_id && r.owned === true);
  if (!hero) return { granted: false, message: "Reward hero is not owned" };
  const claim = reserveDailyRewardClaim(nk, userId, "stage_reward_x2_ad", adSessionId, limit);
  if (!claim) return { granted: false, message: "Daily victory reward quota reached" };
  const extraExp = Number(snapshot.base_exp) * (multiplier - 1);
  const profile = p.value;
  const userResult = progressionApplyUser(nk, profile, extraExp);
  cultivationEnsurePreview(nk, profile);
  progressionReconcileLevelUnlocks(nk, profile);
  let level = Math.max(1, Math.min(PROGRESSION_MAX_LEVEL, Number(hero.level || 1)));
  let exp = Math.max(0, Number(hero.exp || 0)) + extraExp;
  let next = progressionNextHeroExp(nk, level);
  const beforeLevel = level;
  while (level < Math.min(PROGRESSION_MAX_LEVEL, userResult.level) && next > 0 && exp >= next) {
    exp -= next;
    level++;
    next = progressionNextHeroExp(nk, level);
  }
  if (level >= PROGRESSION_MAX_LEVEL) {
    exp = 0;
    next = 0;
  }
  hero.level = level;
  hero.exp = exp;
  hero.next_level_exp = next;
  if (level > beforeLevel) hero.current_attribute = progressionHeroAttributes(nk, snapshot.hero_id, level);
  inv.value.items = Array.isArray(inv.value.items) ? inv.value.items : [];
  profile.resources = profile.resources || {};
  for (const reward of snapshot.base_loot) {
    const quantity = Number(reward.quantity) * (multiplier - 1);
    if (!Number.isSafeInteger(quantity) || quantity <= 0) throw Error("Invalid settled reward quantity");
    if (reward.item_id) addStoreInventoryItem(nk, inv.value.items, String(reward.item_id), quantity);
    else if (["gold", "gems"].indexOf(String(reward.resource_id)) >= 0) profile.resources[reward.resource_id] = Math.max(0, Number(profile.resources[reward.resource_id] || 0)) + quantity;
    else throw Error("Unknown settled reward");
  }
  snapshot.claimed = true;
  snapshot.multiplier = multiplier;
  snapshot.ad_session_id = adSessionId;
  nk.storageWrite([
    { collection: "player_profiles", key: "main", userId, value: profile, version: p.version, permissionRead: 1, permissionWrite: 0 },
    { collection: "player_heroes", key: "states", userId, value: h.value, version: h.version, permissionRead: 1, permissionWrite: 0 },
    { collection: "player_inventory", key: "items", userId, value: inv.value, version: inv.version, permissionRead: 1, permissionWrite: 0 },
    { collection: "player_stage_runs", key: "active", userId, value: run, version: stored.object.version, permissionRead: 1, permissionWrite: 0 }
  ]);
  return { granted: true, reward_type: "stage_reward_x2", reward_amount: multiplier, stage_reward: stageRewardSummary(run) };
}
const tribulationAction = (ctx, _logger, nk, payload) => {
  let request = {};
  try {
    request = JSON.parse(payload || "{}");
  } catch (_) {
    return JSON.stringify({ ok: false, message: "Invalid JSON" });
  }
  const action = String(request.action || "");
  if (["start", "success", "fail"].indexOf(action) === -1) return JSON.stringify({ ok: false, message: "Invalid action" });
  const hpRatio = Number(request.hp_ratio || 0);
  if (!Number.isFinite(hpRatio) || hpRatio < 0 || hpRatio > 1) return JSON.stringify({ ok: false, message: "Invalid hp_ratio" });
  const encounterId = String(request.encounter_id || "");
  const durationMs = Math.floor(Number(request.duration_ms || 0));
  const wavesCleared = Math.floor(Number(request.waves_cleared || 0));
  const objects = nk.storageRead([{ collection: "player_profiles", key: "main", userId: ctx.userId }]);
  if (objects.length === 0) return JSON.stringify({ ok: false, message: "Player profile is missing" });
  const object = objects[0];
  const profile = progressionObject(object.value);
  cultivationEnsureProfile(nk, profile, false);
  const level = Math.max(1, Math.min(PROGRESSION_MAX_LEVEL, Number(profile.level || 1)));
  const threshold = progressionNextUserExp(nk, level);
  const ready = isBreakthroughMilestone(level) && threshold > 0 && Number(profile.exp || 0) >= threshold;
  let state = profile.breakthrough;
  if (action === "start") {
    const block = sweepCombatError(profile);
    if (block) return JSON.stringify(block);
    const runs = nk.storageRead([{ collection: "player_stage_runs", key: "active", userId: ctx.userId }]);
    if (runs.length && runs[0].value.status === "active" && Number(runs[0].value.expires_at_ms) > Date.now()) return JSON.stringify({ ok: false, success: false, code: "COMBAT_ACTIVE", message: "Combat is active" });
    if (!ready) return JSON.stringify({ ok: false, message: "Breakthrough is not ready" });
    if (state.in_tribulation === true) return JSON.stringify({ ok: false, message: "Tribulation is already in progress" });
    if (Number(state.milestone_level || 0) !== level) state = cultivationDefaultBreakthrough(state.history);
    state.milestone_level = level;
    if (state.count_rolled !== true) {
      state.tribulation_count = cultivationRollWaves(profile);
      state.count_rolled = true;
    }
    if (Number(state.attempts_left || 0) <= 0) return JSON.stringify({ ok: false, message: "No attempts remaining" });
    cultivationPhase2Encounter(state);
    state.in_tribulation = true;
    state.penalty_applied = false;
    profile.breakthrough = state;
    profile.activity = { type: "combat", activity_id: state.encounter_id };
    nk.storageWrite([{
      collection: "player_profiles",
      key: "main",
      userId: ctx.userId,
      value: profile,
      permissionRead: 1,
      permissionWrite: 0,
      version: object.version
    }]);
    return JSON.stringify({
      ok: true,
      outcome_success: false,
      attempts_left: state.attempts_left,
      tribulation_count: state.tribulation_count,
      encounter: { id: state.encounter_id, seed: state.encounter_seed, ruleset_version: state.ruleset_version, skill_set: state.skill_set, server_started_at: state.started_at },
      profile
    });
  }
  if (state.in_tribulation !== true || Number(state.milestone_level || 0) !== level || !ready) {
    return JSON.stringify({ ok: false, message: "No active tribulation" });
  }
  if (encounterId === "" || encounterId !== String(state.encounter_id || "")) return JSON.stringify({ ok: false, message: "Invalid encounter" });
  if (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > 36e5) return JSON.stringify({ ok: false, message: "Invalid encounter duration" });
  if (action === "success" && (wavesCleared < Number(state.tribulation_count || 1) || wavesCleared > Number(state.tribulation_count || 1))) return JSON.stringify({ ok: false, message: "Invalid waves cleared" });
  state.in_tribulation = false;
  delete profile.activity;
  if (action === "fail") {
    state.failures = Math.max(0, Number(state.failures || 0)) + 1;
    state.attempts_left = Math.max(0, Number(state.attempts_left || CULTIVATION_MAX_ATTEMPTS) - 1);
    let penaltyApplied = false;
    if (state.attempts_left <= 0) {
      profile.exp = Math.max(0, Number(profile.exp || 0) - Math.round(threshold * 0.3));
      state.attempts_left = CULTIVATION_MAX_ATTEMPTS;
      state.penalty_applied = true;
      penaltyApplied = true;
    }
    nk.storageWrite([{
      collection: "player_profiles",
      key: "main",
      userId: ctx.userId,
      value: profile,
      permissionRead: 1,
      permissionWrite: 0,
      version: object.version
    }]);
    return JSON.stringify({
      ok: true,
      outcome_success: false,
      old_level: level,
      new_level: level,
      attempts_left: state.attempts_left,
      penalty_applied: penaltyApplied,
      profile
    });
  }
  const waves = Math.max(1, Math.min(9, Number(state.tribulation_count || 1)));
  const failures = Math.max(0, Number(state.failures || 0));
  cultivationEnsureSources(profile);
  profile.level = Math.min(PROGRESSION_MAX_LEVEL, level + 1);
  profile.element_sources.growth_levels = profile.level;
  cultivationRebuildSources(profile);
  profile.exp = Math.max(0, Number(profile.exp || 0) - threshold);
  profile.next_level_exp = progressionNextUserExp(nk, profile.level);
  profile.progression_version = PROGRESSION_VERSION;
  const reward = cultivationReward(profile, waves, failures, hpRatio);
  const history = Array.isArray(state.history) ? state.history : [];
  history.push({ level: profile.level, waves, failures, gains: reward.gains });
  profile.breakthrough = cultivationDefaultBreakthrough(history);
  progressionReconcileLevelUnlocks(nk, profile);
  nk.storageWrite([{
    collection: "player_profiles",
    key: "main",
    userId: ctx.userId,
    value: profile,
    permissionRead: 1,
    permissionWrite: 0,
    version: object.version
  }]);
  if (typeof writePlayerLeaderboardRecords === "function") {
    try {
      writePlayerLeaderboardRecords(nk, ctx.userId, profile, profile.display_name);
    } catch (_lbErr) {
    }
  }
  return JSON.stringify({
    ok: true,
    outcome_success: true,
    old_level: level,
    new_level: profile.level,
    attempts_left: CULTIVATION_MAX_ATTEMPTS,
    penalty_applied: false,
    reward,
    profile
  });
};

const MONETIZATION_PRODUCTS = {
  remove_ads_1d: 24 * 60 * 60,
  remove_ads_3d: 3 * 24 * 60 * 60,
  remove_ads_7d: 7 * 24 * 60 * 60,
  remove_ads_30d: 30 * 24 * 60 * 60,
  remove_ads_permanent: 100 * 365 * 24 * 60 * 60
};
function validRewardedAdsConfig(config) {
  if (!config || config.schema_version !== 2) return false;
  const placements = objectValue(config.placements);
  if (!Object.keys(placements).length) return false;
  const expectedTypes = { stamina_dialog_ad: "stamina", daily_mission_talisman_fragment_ad: "daily_fragment", card_reroll_ad: "card_reroll", combat_revive_ad: "combat_revive", stage_reward_x2_ad: "stage_reward_x2", talisman_enhance_charm_ad: "item", element_enlightenment_charm_ad: "item" };
  for (const id of Object.keys(placements)) {
    const entry = placements[id];
    if (!entry || !Number.isSafeInteger(entry.amount) || entry.amount <= 0 || expectedTypes[id] && entry.type !== expectedTypes[id] || ["stamina", "item", "daily_fragment", "card_reroll", "combat_revive", "stage_reward_x2"].indexOf(entry.type) < 0 || entry.daily_limit !== void 0 && (!Number.isSafeInteger(entry.daily_limit) || entry.daily_limit < 0 || entry.daily_limit > 1e3) || entry.run_limit !== void 0 && (!Number.isSafeInteger(entry.run_limit) || entry.run_limit < 0 || entry.run_limit > 100) || entry.enabled !== void 0 && typeof entry.enabled !== "boolean" || entry.type === "item" && !entry.item_id || ["stamina", "item", "daily_fragment", "stage_reward_x2"].indexOf(entry.type) >= 0 && entry.daily_limit === void 0 || ["card_reroll", "combat_revive"].indexOf(entry.type) >= 0 && (entry.amount !== 1 || entry.run_limit === void 0) || entry.type === "stage_reward_x2" && (entry.amount < 2 || entry.amount > 10 || entry.daily_limit === void 0)) return false;
  }
  const mission = placements.daily_mission_talisman_fragment_ad;
  if (mission && (!config.daily_mission || !Number.isSafeInteger(config.daily_mission.completion_count) || config.daily_mission.completion_count <= 0 || mission.daily_limit > 0 && config.daily_mission.completion_count > mission.daily_limit)) return false;
  return true;
}
function rewardedAdsConfig(nk) {
  const config = getRemoteConfigValue(nk, "system", "rewarded_ads", null);
  return validRewardedAdsConfig(config) ? config : {};
}
function rewardedRunLimit(nk, placement) {
  const definition = objectValue(rewardedAdsConfig(nk).placements)[placement];
  return definition && definition.enabled !== false ? Math.max(0, Number(definition.run_limit || 0)) : 0;
}
function canonicalRewardPlacement(id) {
  return id === "main_menu_stamina" ? "stamina_dialog_ad" : id;
}
let vipRuntimeMode = "production";
function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function readActiveRun(nk, userId, runId) {
  const objects = nk.storageRead([{ collection: "player_stage_runs", key: "active", userId }]);
  if (objects.length === 0) return null;
  const object = objects[0];
  const run = objectValue(object.value);
  if (String(run.run_id || "") !== runId || String(run.status || "") !== "active" || Date.now() > Number(run.expires_at_ms || 0)) {
    return null;
  }
  return { object, run };
}
function reserveDailyRewardClaim(nk, userId, placementId, adSessionId, limit) {
  placementId = canonicalRewardPlacement(placementId);
  const scope = nk.__characterContext;
  if (scope) {
    for (let attempt = 0; attempt < limit; attempt++) {
      const existing2 = nk.sqlQuery("SELECT claim_slot,reward_date::TEXT AS reward_date FROM monetization_daily_reward_claims WHERE ad_session_id=$1 AND user_id=$2 AND target_server_id=$3 AND target_generation=$4", [adSessionId, userId, scope.serverId, scope.generation]);
      if (existing2.length) return existing2[0];
      const rows = nk.sqlQuery(`INSERT INTO monetization_daily_reward_claims(user_id,placement_id,ad_session_id,reward_date,claim_slot,target_server_id,target_generation)
              SELECT $1,$2,$3,(NOW() AT TIME ZONE 'UTC')::DATE,slot,$5,$6 FROM generate_series(1,$4::INT) slot
              WHERE NOT EXISTS(SELECT 1 FROM monetization_daily_reward_claims c WHERE c.user_id=$1 AND c.placement_id=$2
                AND c.target_server_id=$5 AND c.target_generation=$6 AND c.reward_date=(NOW() AT TIME ZONE 'UTC')::DATE AND c.claim_slot=slot)
              ORDER BY slot LIMIT 1 ON CONFLICT DO NOTHING RETURNING claim_slot,reward_date::TEXT AS reward_date`, [userId, placementId, adSessionId, limit, scope.serverId, scope.generation]);
      if (rows.length) return rows[0];
    }
    return null;
  }
  const existing = nk.sqlQuery("SELECT claim_slot, reward_date::TEXT AS reward_date FROM monetization_daily_reward_claims WHERE ad_session_id=$1 AND user_id=$2", [adSessionId, userId]);
  if (existing.length) return existing[0];
  for (let attempt = 0; attempt < limit; attempt++) {
    const rows = nk.sqlQuery(`INSERT INTO monetization_daily_reward_claims
            (user_id, placement_id, ad_session_id, reward_date, claim_slot)
            SELECT $1,$2,$3,(NOW() AT TIME ZONE 'UTC')::DATE, slot
            FROM generate_series(1,$4::INT) slot
            WHERE NOT EXISTS (SELECT 1 FROM monetization_daily_reward_claims c
                WHERE c.user_id=$1 AND c.placement_id=$2 AND c.reward_date=(NOW() AT TIME ZONE 'UTC')::DATE AND c.claim_slot=slot)
            ORDER BY slot LIMIT 1 ON CONFLICT DO NOTHING
            RETURNING claim_slot, reward_date::TEXT AS reward_date`, [userId, placementId, adSessionId, limit]);
    if (rows.length) return rows[0];
    const raced = nk.sqlQuery("SELECT claim_slot, reward_date::TEXT AS reward_date FROM monetization_daily_reward_claims WHERE ad_session_id=$1 AND user_id=$2", [adSessionId, userId]);
    if (raced.length) return raced[0];
  }
  return null;
}
function monetizationMode(ctx) {
  const environment = String(ctx.env.APP_ENVIRONMENT || ctx.env.MONETIZATION_MODE || "develop").toLowerCase();
  if (environment === "production") return "production";
  if (environment === "mock") return "mock";
  return "sandbox";
}
function isProductionTestPurchaseAllowed(ctx, nk, purchase) {
  if (monetizationMode(ctx) !== "production" || String(purchase.environment).toLowerCase() === "production") return true;
  const allowedEmails = String(ctx.env.GOOGLE_PLAY_TESTER_EMAILS || "").split(",").map((value) => value.trim().toLowerCase()).filter((value) => value.length > 0);
  if (allowedEmails.length === 0) return false;
  try {
    return allowedEmails.indexOf(String(nk.accountGetId(ctx.userId).email || "").trim().toLowerCase()) >= 0;
  } catch (_e) {
    return false;
  }
}
function environmentValue(ctx, baseName) {
  const suffix = monetizationMode(ctx) === "production" ? "PRODUCTION" : "DEVELOP";
  return String(ctx.env[`${baseName}_${suffix}`] || "");
}
function monetizationError(code, message) {
  return JSON.stringify({ status: "error", code, message });
}
function readEntitlementRow(nk, userId) {
  const rows = nk.sqlQuery(
    `SELECT user_id,
                COALESCE(EXTRACT(EPOCH FROM no_ads_expires_at)::BIGINT, 0) AS no_ads_expires_at,
                source, last_product_id,
                (EXTRACT(EPOCH FROM updated_at) * 1000000)::BIGINT AS revision,
                EXTRACT(EPOCH FROM NOW())::BIGINT AS server_time
         FROM player_monetization_entitlements
         WHERE user_id = $1`,
    [userId]
  );
  if (rows.length > 0) return rows[0];
  const nowRows = nk.sqlQuery("SELECT EXTRACT(EPOCH FROM NOW())::BIGINT AS server_time", []);
  return {
    user_id: userId,
    no_ads_expires_at: 0,
    revision: 0,
    source: "",
    last_product_id: "",
    server_time: nowRows.length > 0 ? Number(nowRows[0].server_time || 0) : Math.floor(Date.now() / 1e3)
  };
}
function buildDailyRewardStatus(nk, userId) {
  const scope = nk.__characterContext;
  if (scope) {
    const interrupted2 = nk.sqlQuery(`SELECT ad_session_id FROM monetization_ad_rewards WHERE user_id=$1 AND target_server_id=$2
          AND target_generation=$3 AND status='verified' ORDER BY created_at LIMIT 32`, [userId, scope.serverId, scope.generation]);
    for (const session of interrupted2) {
      try {
        grantPreparedReward(nk, userId, String(session.ad_session_id), "");
      } catch (_e) {
      }
    }
    const claims2 = nk.sqlQuery(`SELECT placement_id FROM monetization_daily_reward_claims
          WHERE user_id=$1 AND target_server_id=$2 AND target_generation=$3 AND reward_date=(NOW() AT TIME ZONE 'UTC')::DATE`, [userId, scope.serverId, scope.generation]);
    const daily = {};
    const definitions2 = objectValue(rewardedAdsConfig(nk).placements);
    for (const id in definitions2) {
      const limit = Math.max(0, Number(definitions2[id].daily_limit || 0));
      if (limit > 0) {
        const used = claims2.filter((row) => canonicalRewardPlacement(String(row.placement_id)) === id).length;
        daily[id] = { limit, claimed: Math.min(limit, used), remaining: Math.max(0, limit - used) };
      }
    }
    const mission2 = nk.sqlQuery(`SELECT item_id,granted_at IS NOT NULL AS completed FROM monetization_daily_fragment_rewards
          WHERE user_id=$1 AND target_server_id=$2 AND target_generation=$3 AND reward_date=(NOW() AT TIME ZONE 'UTC')::DATE`, [userId, scope.serverId, scope.generation]);
    if (daily.daily_mission_talisman_fragment_ad) Object.assign(daily.daily_mission_talisman_fragment_ad, { completed: mission2.length > 0 && mission2[0].completed === true, item_id: mission2.length ? String(mission2[0].item_id) : "" });
    return daily;
  }
  const interrupted = nk.sqlQuery(`SELECT ad_session_id FROM monetization_ad_rewards
        WHERE user_id=$1 AND status='verified' AND reward_type IN ('stamina','item','daily_fragment','stage_reward_x2')
        ORDER BY created_at LIMIT 32`, [userId]);
  for (const session of interrupted) {
    try {
      grantPreparedReward(nk, userId, String(session.ad_session_id), "");
    } catch (_e) {
    }
  }
  const claims = nk.sqlQuery(
    `SELECT placement_id, ad_session_id FROM monetization_daily_reward_claims
         WHERE user_id = $1 AND reward_date = (NOW() AT TIME ZONE 'UTC')::DATE`,
    [userId]
  );
  const claimed = {};
  for (const claim of claims) {
    const id = canonicalRewardPlacement(String(claim.placement_id || ""));
    claimed[id] = (claimed[id] || 0) + 1;
  }
  const dailyRewards = {};
  const definitions = objectValue(rewardedAdsConfig(nk).placements);
  for (const placementId in definitions) {
    const limit = Math.max(0, Number(definitions[placementId].daily_limit || 0));
    if (limit <= 0) continue;
    const used = Math.min(limit, claimed[placementId] || 0);
    dailyRewards[placementId] = { limit, claimed: used, remaining: Math.max(0, limit - used) };
    if (claims.some((c) => canonicalRewardPlacement(String(c.placement_id)) === placementId && String(c.ad_session_id || "").indexOf("merge:") === 0)) {
      dailyRewards[placementId].blocked_by_account_link = true;
    }
  }
  const mission = nk.sqlQuery("SELECT item_id, granted_at IS NOT NULL AS completed FROM monetization_daily_fragment_rewards WHERE user_id=$1 AND reward_date=(NOW() AT TIME ZONE 'UTC')::DATE", [userId]);
  if (dailyRewards.daily_mission_talisman_fragment_ad) Object.assign(
    dailyRewards.daily_mission_talisman_fragment_ad,
    { completed: mission.length > 0 && mission[0].completed === true, item_id: mission.length ? String(mission[0].item_id) : "" }
  );
  return dailyRewards;
}
function vipConfig(nk) {
  const rows = nk.sqlQuery("SELECT payload FROM game_content_configs WHERE id='vip' AND active=TRUE", []);
  if (rows.length === 0) return null;
  const config = objectValue(parseJsonb(rows[0].payload));
  const levels = Array.isArray(config.levels) ? config.levels : [];
  let previous = 0;
  if (levels.length !== Number(config.max_level) || levels.length === 0) return null;
  for (let i = 0; i < levels.length; i++) {
    const threshold = Number(levels[i].min_exp);
    if (Number(levels[i].level) !== i + 1 || !Number.isSafeInteger(threshold) || threshold <= previous) return null;
    previous = threshold;
  }
  const products = objectValue(config.product_exp);
  for (const id of Object.keys(products)) {
    if (!Number.isSafeInteger(Number(products[id])) || Number(products[id]) <= 0) return null;
  }
  return config;
}
function vipProgress(exp, config, environment) {
  exp = Math.max(0, Math.floor(exp));
  let level = 0, minimum = 0, next = 0;
  const levels = config && Array.isArray(config.levels) ? config.levels : [];
  for (const entry of levels) {
    if (exp >= Number(entry.min_exp)) {
      level = Number(entry.level);
      minimum = Number(entry.min_exp);
    } else {
      next = Number(entry.min_exp);
      break;
    }
  }
  const maxed = levels.length > 0 && level === levels.length;
  return {
    level,
    exp,
    level_min_exp: minimum,
    next_level_exp: next,
    remaining_exp: maxed ? 0 : Math.max(0, next - exp),
    maxed,
    environment,
    configured: !!config
  };
}
function readVipProgress(nk, userId, mode) {
  const config = vipConfig(nk);
  if (!config) return vipProgress(0, null, mode);
  const scope = nk.__characterContext;
  if (scope) {
    nk.sqlExec(`INSERT INTO player_vip_credits(purchase_id,user_id,environment,exp)
          SELECT p.id,p.user_id,o.vip_environment,COALESCE(o.vip_exp,0) FROM monetization_purchases p
          JOIN monetization_purchase_orders o ON o.id=COALESCE(NULLIF(p.purchase_order_id,''),p.request_id)
          WHERE p.user_id=$1 AND p.target_server_id=$2 AND p.target_generation=$3
            AND p.status IN ('verified','consumed') AND o.status='fulfilled' AND o.vip_environment<>''
          ON CONFLICT(purchase_id) DO NOTHING`, [userId, scope.serverId, scope.generation]);
    const rows2 = nk.sqlQuery(`SELECT COALESCE(SUM(CASE WHEN p.status IN ('verified','consumed') THEN c.exp ELSE 0 END),0)::BIGINT AS exp,
          (COUNT(*)*2+COUNT(*) FILTER(WHERE p.status='voided'))::BIGINT AS revision
          FROM player_vip_credits c JOIN monetization_purchases p ON p.id=c.purchase_id
          WHERE c.user_id=$1 AND c.environment=$2 AND p.target_server_id=$3 AND p.target_generation=$4`, [userId, mode, scope.serverId, scope.generation]);
    return Object.assign(vipProgress(Number(rows2.length ? rows2[0].exp : 0), config, mode), { user_id: userId, revision: Number(rows2.length ? rows2[0].revision : 0) });
  }
  nk.sqlExec(`INSERT INTO player_vip_credits (purchase_id, user_id, environment, exp)
        SELECT p.id, p.user_id,
            CASE WHEN COALESCE(o.vip_environment,'') <> '' THEN o.vip_environment
                 WHEN p.purchase_token_hash LIKE 'mock:%' THEN 'mock' ELSE 'legacy' END,
            COALESCE(o.vip_exp, ($2::jsonb ->> p.product_id)::BIGINT, 0)
        FROM monetization_purchases p
        LEFT JOIN monetization_purchase_orders o ON o.id = COALESCE(NULLIF(p.purchase_order_id,''), p.request_id)
        WHERE p.user_id=$1 AND p.verified_at IS NOT NULL AND p.status IN ('verified','consumed')
          AND (o.id IS NULL OR o.status='fulfilled')
        ON CONFLICT (purchase_id) DO NOTHING`, [userId, JSON.stringify(config.product_exp || {})]);
  const rows = nk.sqlQuery(`SELECT COALESCE(SUM(CASE WHEN p.status IN ('verified','consumed') THEN c.exp ELSE 0 END),0)::BIGINT AS exp,
        (COUNT(*) * 2 + COUNT(*) FILTER (WHERE p.status='voided'))::BIGINT AS revision
        FROM player_vip_credits c JOIN monetization_purchases p ON p.id=c.purchase_id
        WHERE c.user_id=$1 AND c.environment=$2`, [userId, mode]);
  return Object.assign(vipProgress(Number(rows.length ? rows[0].exp : 0), config, mode), { user_id: userId, revision: Number(rows.length ? rows[0].revision : 0) });
}
function auditLegacyVipOrder(ctx, nk, order, receipt) {
  if (order.vip_environment || !receipt) return;
  const mode = monetizationMode(ctx);
  if (mode === "mock") return;
  const validation = nk.purchaseValidateGoogle(ctx.userId, receipt, true);
  const purchase = (validation.validatedPurchases || []).find((p) => p.productId === order.product_id && isLinkedReceiptOwner(nk, p.userId, ctx.userId));
  if (!purchase || !purchase.transactionId || Number(purchase.refundTime || 0) > 0) throw new Error("Legacy purchase could not be verified");
  if (!isProductionTestPurchaseAllowed(ctx, nk, purchase)) throw new Error("Test purchase is not authorized for this account");
  const wire = JSON.parse(receipt);
  const token = String(wire.purchaseToken || wire.purchase_token || "");
  if (!token) throw new Error("Legacy receipt has no purchase token");
  const hashes = nk.sqlQuery("SELECT encode(sha256(convert_to($1, 'UTF8')), 'hex') AS token_hash", [token]);
  if (!hashes.length || String(hashes[0].token_hash) !== String(order.purchase_token_hash)) throw new Error("Legacy receipt does not match order");
  const config = vipConfig(nk);
  const exp = Number(config && config.product_exp ? config.product_exp[order.product_id] : NaN);
  if (!Number.isSafeInteger(exp) || exp <= 0) throw new Error("Legacy VIP product mapping is missing");
  nk.sqlExec("UPDATE monetization_purchase_orders SET vip_exp=COALESCE(vip_exp,$2), vip_environment=$3 WHERE id=$1 AND vip_environment='' AND status='fulfilled'", [order.id, exp, mode]);
  nk.sqlExec(`UPDATE player_vip_credits c SET environment=$2
        FROM monetization_purchases p WHERE p.id=c.purchase_id AND p.user_id=$1
          AND p.purchase_token_hash=$3 AND c.environment='legacy'`, [ctx.userId, mode, String(hashes[0].token_hash)]);
}
function buildMonetizationResponse(nk, userId, mode) {
  const row = readEntitlementRow(nk, userId);
  const serverTime = Number(row.server_time || Math.floor(Date.now() / 1e3));
  const expiresAt = Number(row.no_ads_expires_at || 0);
  return {
    mode,
    user_id: userId,
    vip: readVipProgress(nk, userId, mode),
    server_time: serverTime,
    no_ads: {
      active: expiresAt > serverTime,
      expires_at: expiresAt,
      remaining_seconds: Math.max(0, expiresAt - serverTime),
      source: String(row.source || ""),
      last_product_id: String(row.last_product_id || ""),
      revision: Number(row.revision || 0)
    },
    ads: {
      rewarded_enabled: true,
      interstitial_enabled: true,
      interstitial_min_interval_seconds: 120
    },
    daily_rewards: buildDailyRewardStatus(nk, userId),
    daily_rewards_date: new Date(serverTime * 1e3).toISOString().slice(0, 10)
  };
}
function mirrorEntitlementStorage(nk, userId, value) {
  const existing = nk.storageRead([{ collection: "player_entitlements", key: "ads", userId }]);
  const write = {
    collection: "player_entitlements",
    key: "ads",
    userId,
    value,
    permissionRead: 1,
    permissionWrite: 0
  };
  if (existing.length > 0) write.version = existing[0].version;
  nk.storageWrite([write]);
}
function applyNoAdsGrant(nk, userId, requestId, platform, productId, tokenHash, orderId, grantedSeconds, source, purchaseOrderId) {
  if (tokenHash) {
    const duplicateToken = nk.sqlQuery(
      "SELECT user_id FROM monetization_purchases WHERE purchase_token_hash = $1",
      [tokenHash]
    );
    if (duplicateToken.length > 0) {
      if (String(duplicateToken[0].user_id) !== userId) throw new Error("Purchase token belongs to another account");
      return { applied: false, monetization: buildMonetizationResponse(nk, userId, source === "debug" ? "mock" : "production") };
    }
  }
  const rows = nk.sqlQuery(
    `WITH inserted AS (
            INSERT INTO monetization_purchases
                (request_id, user_id, platform, product_id, purchase_token_hash, order_id,
                 status, granted_seconds, purchased_at, verified_at, consumed_at, purchase_order_id)
            VALUES ($1, $2, $3, $4, $5, $6, 'consumed', $7, NOW(), NOW(), NOW(), $9)
            ON CONFLICT (request_id) DO NOTHING
            RETURNING granted_seconds
        ), entitlement AS (
            INSERT INTO player_monetization_entitlements
                (user_id, no_ads_expires_at, source, last_product_id, updated_at)
            SELECT $2, NOW() + make_interval(secs => granted_seconds), $8, $4, NOW()
            FROM inserted
            ON CONFLICT (user_id) DO UPDATE SET
                no_ads_expires_at = GREATEST(
                    NOW(),
                    COALESCE(player_monetization_entitlements.no_ads_expires_at, NOW())
                ) + ($7 * INTERVAL '1 second'),
                source = EXCLUDED.source,
                last_product_id = EXCLUDED.last_product_id,
                updated_at = NOW()
            RETURNING EXTRACT(EPOCH FROM no_ads_expires_at)::BIGINT AS expires_at
        )
        SELECT expires_at FROM entitlement`,
    [requestId, userId, platform, productId, tokenHash, orderId, grantedSeconds, source, purchaseOrderId]
  );
  const response = buildMonetizationResponse(nk, userId, source === "debug" ? "mock" : "production");
  mirrorEntitlementStorage(nk, userId, {
    no_ads_expires_at: response.no_ads.expires_at,
    source: response.no_ads.source,
    last_product_id: response.no_ads.last_product_id,
    updated_at: response.server_time
  });
  return { applied: rows.length > 0, monetization: response };
}
const getMonetizationStatus = (ctx, _logger, nk, _payload) => {
  if (!ctx.userId) return monetizationError(401, "Authentication required");
  return JSON.stringify({ status: "success", data: buildMonetizationResponse(nk, ctx.userId, monetizationMode(ctx)) });
};
function addStoreInventoryItem(nk, inventory, itemId, quantity) {
  const definitions = nk.sqlQuery("SELECT stackable, max_stack FROM game_items WHERE id = $1", [itemId]);
  if (definitions.length === 0) throw new Error(`Unknown catalog item: ${itemId}`);
  const definition = definitions[0];
  if (definition.stackable === false) {
    for (let i = 0; i < quantity; i++) inventory.push({ item_id: itemId, quantity: 1, acquired_at: (/* @__PURE__ */ new Date()).toISOString() });
    return;
  }
  let remaining = quantity;
  const maxStack = Math.max(1, Number(definition.max_stack || 999));
  for (const entry of inventory) {
    if (remaining <= 0) break;
    if (!entry || String(entry.item_id || "") !== itemId) continue;
    const added = Math.min(Math.max(0, maxStack - Number(entry.quantity || 0)), remaining);
    entry.quantity = Number(entry.quantity || 0) + added;
    remaining -= added;
  }
  while (remaining > 0) {
    const amount = Math.min(maxStack, remaining);
    inventory.push({ item_id: itemId, quantity: amount, acquired_at: (/* @__PURE__ */ new Date()).toISOString() });
    remaining -= amount;
  }
}
const DAILY_PACK_DAY_MS = 864e5;
const DAILY_PACK_IDS = ["daily_deal", "flash_sale"];
function dailyPackState(profile, now) {
  const result = {};
  for (const id of DAILY_PACK_IDS) {
    const pack = (profile.daily_packs || {})[id];
    const active = !!pack && now >= Number(pack.started_at_ms) && now < Number(pack.expires_at_ms);
    const day = active ? Math.floor((now - Number(pack.started_at_ms)) / DAILY_PACK_DAY_MS) : -1;
    result[id] = {
      active,
      claimable: active && day > Number(pack.last_claim_day),
      day: day + 1,
      days_remaining: active ? 30 - day : 0,
      expires_at: pack ? Math.floor(Number(pack.expires_at_ms) / 1e3) : 0,
      next_claim_at: active ? Math.floor((Number(pack.started_at_ms) + (day + 1) * DAILY_PACK_DAY_MS) / 1e3) : 0
    };
  }
  return result;
}
function dailyPackResponse(userId, profile, now) {
  return { user_id: userId, server_time: Math.floor(now / 1e3), packs: dailyPackState(profile, now) };
}
const getDailyPackStatus = (ctx, _logger, nk, _payload) => {
  if (!ctx.userId) return monetizationError(401, "Authentication required");
  const rows = nk.storageRead([{ collection: "player_profiles", key: "main", userId: ctx.userId }]);
  if (!rows.length) return monetizationError(404, "Player profile missing");
  return JSON.stringify({ status: "success", data: dailyPackResponse(ctx.userId, rows[0].value, Date.now()) });
};
const claimDailyPack = (ctx, _logger, nk, payload) => {
  if (!ctx.userId) return monetizationError(401, "Authentication required");
  let req;
  try {
    req = JSON.parse(payload || "{}");
  } catch (_) {
    return monetizationError(400, "Invalid JSON");
  }
  if (!req || typeof req !== "object" || Array.isArray(req)) return monetizationError(400, "Invalid JSON object");
  const id = String(req.product_id || "");
  if (DAILY_PACK_IDS.indexOf(id) < 0) return monetizationError(400, "Unknown daily pack");
  const rows = nk.storageRead([
    { collection: "player_profiles", key: "main", userId: ctx.userId },
    { collection: "player_inventory", key: "items", userId: ctx.userId },
    { collection: "player_stage_runs", key: "active", userId: ctx.userId }
  ]);
  const profileRow = rows.find((r) => r.collection === "player_profiles");
  const inventoryRow = rows.find((r) => r.collection === "player_inventory");
  const run = rows.find((r) => r.collection === "player_stage_runs");
  if (!profileRow || !inventoryRow) return monetizationError(404, "Player state missing");
  const now = Date.now();
  if (run && run.value.status === "active" && Number(run.value.expires_at_ms) > now) return monetizationError(409, "Finish combat before claiming pack rewards");
  const profile = profileRow.value;
  if (profile.breakthrough && profile.breakthrough.in_tribulation === true) return monetizationError(409, "Finish tribulation before claiming pack rewards");
  const status = dailyPackState(profile, now)[id];
  if (!status.active) return monetizationError(409, "Pack is not active");
  if (!status.claimable) return JSON.stringify({ status: "success", idempotent: true, data: dailyPackResponse(ctx.userId, profile, now) });
  const pack = profile.daily_packs[id];
  if (!Array.isArray(pack.rewards) || !pack.rewards.length) return monetizationError(409, "Pack rewards missing");
  const inventory = inventoryRow.value;
  inventory.items = Array.isArray(inventory.items) ? inventory.items : [];
  profile.resources = profile.resources || {};
  try {
    for (const reward of pack.rewards) {
      if (!Number.isSafeInteger(reward.quantity) || reward.quantity <= 0) throw Error("Invalid reward quantity");
      if (reward.reward_type === "currency" && ["gold", "gems"].indexOf(reward.reward_id) >= 0) {
        profile.resources[reward.reward_id] = Math.max(0, Number(profile.resources[reward.reward_id] || 0)) + reward.quantity;
      } else if (reward.reward_type === "stamina" && reward.reward_id === "stamina") {
        profile.stamina = Math.max(0, Number(profile.stamina || 0)) + reward.quantity;
        profile.last_stamina_update = Math.floor(now / 1e3);
      } else if (reward.reward_type === "item") {
        addStoreInventoryItem(nk, inventory.items, String(reward.reward_id), reward.quantity);
      } else throw Error("Unsupported pack reward");
    }
    pack.last_claim_day = status.day - 1;
    nk.storageWrite([
      { collection: "player_profiles", key: "main", userId: ctx.userId, value: profile, version: profileRow.version, permissionRead: 1, permissionWrite: 0 },
      { collection: "player_inventory", key: "items", userId: ctx.userId, value: inventory, version: inventoryRow.version, permissionRead: 1, permissionWrite: 0 }
    ]);
    return JSON.stringify({ status: "success", data: Object.assign(dailyPackResponse(ctx.userId, profile, now), { profile, inventory, rewards: pack.rewards }) });
  } catch (_) {
    return monetizationError(409, "Pack reward claim failed; refresh and retry");
  }
};
function applyPurchaseStorageRewards(nk, userId, grantId, productId, fulfillmentType, rewards) {
  if (nk.__characterContext && !nk.__purchaseBatch) {
    const marker = { collection: "player_purchase_grants", key: grantId, userId };
    if (nk.storageRead([marker]).length) return { idempotent: true };
    const writes = [];
    const batch = Object.create(nk);
    batch.__purchaseBatch = true;
    batch.storageWrite = (changes) => {
      for (const change of changes) writes.push(change);
      return [];
    };
    const result = applyPurchaseStorageRewards(batch, userId, grantId, productId, fulfillmentType, rewards);
    writes.push(Object.assign({}, marker, { value: { product_id: productId, granted_at_ms: Date.now() }, version: "*", permissionRead: 0, permissionWrite: 0 }));
    nk.storageWrite(writes);
    return result;
  }
  const profileObjects = nk.storageRead([{ collection: "player_profiles", key: "main", userId }]);
  if (profileObjects.length === 0) throw new Error("Player profile does not exist");
  const profile = profileObjects[0].value || {};
  const recurring = DAILY_PACK_IDS.indexOf(productId) >= 0 && rewards.length > 0 && rewards.every((line) => line.metadata && Number(line.metadata.daily_pack_days) === 30);
  if (recurring) {
    profile.daily_packs = profile.daily_packs || {};
    const existing = profile.daily_packs[productId];
    if (existing && existing.grant_id === grantId) return { daily_pack: existing };
    const now = Date.now();
    if (dailyPackState(profile, now)[productId].active) throw Error("Daily pack already active");
    const pack = {
      grant_id: grantId,
      started_at_ms: now,
      expires_at_ms: now + 30 * DAILY_PACK_DAY_MS,
      last_claim_day: -1,
      rewards: rewards.map((line) => ({ reward_type: line.reward_type, reward_id: line.reward_id, quantity: line.quantity }))
    };
    profile.daily_packs[productId] = pack;
    nk.storageWrite([{
      collection: "player_profiles",
      key: "main",
      userId,
      value: profile,
      permissionRead: 1,
      permissionWrite: 0,
      version: profileObjects[0].version
    }]);
    return { daily_pack: pack };
  }
  const profileGrants = Array.isArray(profile._iap_reward_ids) ? profile._iap_reward_ids.map((value) => String(value)) : [];
  if (profileGrants.indexOf(grantId) < 0) {
    const resources = profile.resources || {};
    rewards.filter((line) => line.reward_type === "currency").forEach((line) => {
      resources[line.reward_id] = Math.max(0, Number(resources[line.reward_id] || 0)) + Number(line.quantity);
    });
    profile.resources = resources;
    rewards.filter((line) => line.reward_type === "stamina").forEach((line) => {
      profile.stamina = Math.max(Number(profile.stamina || 0), Math.min(30, Math.max(0, Number(profile.stamina || 0)) + Number(line.quantity)));
    });
    const entitlements = profile.iap_entitlements || {};
    rewards.filter((line) => line.reward_type === "entitlement" && line.reward_id !== "no_ads_seconds").forEach((line) => {
      entitlements[line.reward_id] = Math.max(0, Number(entitlements[line.reward_id] || 0)) + Number(line.quantity);
    });
    profile.iap_entitlements = entitlements;
    if (fulfillmentType === "non_consumable") {
      const owned = Array.isArray(profile.owned_iap_products) ? profile.owned_iap_products.map((value) => String(value)) : [];
      if (owned.indexOf(productId) < 0) owned.push(productId);
      profile.owned_iap_products = owned;
    }
    profileGrants.push(grantId);
    profile._iap_reward_ids = profileGrants.slice(-200);
    nk.storageWrite([{
      collection: "player_profiles",
      key: "main",
      userId,
      value: profile,
      permissionRead: 1,
      permissionWrite: 0,
      version: profileObjects[0].version
    }]);
  }
  const heroRewards = rewards.filter((line) => line.reward_type === "hero");
  if (heroRewards.length > 0) {
    const heroObjects = nk.storageRead([{ collection: "player_heroes", key: "states", userId }]);
    if (heroObjects.length === 0) throw new Error("Player heroes do not exist");
    const heroValue = heroObjects[0].value || {};
    const heroGrants = Array.isArray(heroValue._iap_reward_ids) ? heroValue._iap_reward_ids.map((value) => String(value)) : [];
    if (heroGrants.indexOf(grantId) < 0) {
      const heroes = Array.isArray(heroValue.heroes) ? heroValue.heroes : [];
      heroRewards.forEach((line) => {
        const hero = heroes.find((value) => value && String(value.hero_id || "") === line.reward_id);
        if (hero) hero.owned = true;
        else heroes.push({ hero_id: line.reward_id, level: 1, exp: 0, next_level_exp: 1e3, owned: true, current_attribute: {} });
      });
      heroValue.heroes = heroes;
      heroGrants.push(grantId);
      heroValue._iap_reward_ids = heroGrants.slice(-200);
      nk.storageWrite([{
        collection: "player_heroes",
        key: "states",
        userId,
        value: heroValue,
        permissionRead: 1,
        permissionWrite: 0,
        version: heroObjects[0].version
      }]);
    }
  }
  const itemRewards = rewards.filter((line) => line.reward_type === "item");
  if (itemRewards.length > 0) {
    const objects = nk.storageRead([{ collection: "player_inventory", key: "items", userId }]);
    if (objects.length === 0) throw new Error("Player inventory does not exist");
    const value = objects[0].value || {};
    const grants = Array.isArray(value._iap_reward_ids) ? value._iap_reward_ids.map((v) => String(v)) : [];
    if (grants.indexOf(grantId) < 0) {
      const inventory = Array.isArray(value.items) ? value.items : [];
      itemRewards.forEach((line) => addStoreInventoryItem(nk, inventory, line.reward_id, Number(line.quantity)));
      value.items = inventory;
      grants.push(grantId);
      value._iap_reward_ids = grants.slice(-200);
      nk.storageWrite([{
        collection: "player_inventory",
        key: "items",
        userId,
        value,
        permissionRead: 1,
        permissionWrite: 0,
        version: objects[0].version
      }]);
    }
  }
  return { resources: profile.resources || {}, stamina: Number(profile.stamina || 0), rewards };
}
const createPurchaseOrder = (ctx, _logger, nk, payload) => {
  if (!ctx.userId) return monetizationError(401, "Authentication required");
  if (!isRemoteFlagEnabled(nk, "payment_enabled")) return monetizationError(403, "Payments are disabled");
  let req;
  try {
    req = JSON.parse(payload || "{}");
  } catch (_e) {
    return monetizationError(400, "Invalid JSON");
  }
  const orderPlatform = String(req.platform || "android");
  const target = nk.__characterContext;
  if (["android", "ios"].indexOf(orderPlatform) < 0) return monetizationError(400, "Unsupported purchase platform");
  if (orderPlatform === "ios") return monetizationError(501, "App Store payment provider is not configured");
  const productId = String(req.product_id || "");
  const products = nk.sqlQuery("SELECT * FROM game_store_products WHERE product_id = $1 AND active = TRUE", [productId]);
  if (products.length === 0) return monetizationError(404, "Product is unavailable");
  const product = products[0];
  const platformProducts = nk.sqlQuery("SELECT store_product_id,active FROM game_store_platform_products WHERE platform=$1 AND product_id=$2", [orderPlatform, productId]);
  if (platformProducts.length && platformProducts[0].active !== true) return monetizationError(404, "Product is unavailable on this platform");
  const storeProductId = platformProducts.length ? String(platformProducts[0].store_product_id) : productId;
  if (DAILY_PACK_IDS.indexOf(productId) >= 0) {
    const profiles = nk.storageRead([{ collection: "player_profiles", key: "main", userId: ctx.userId }]);
    if (profiles.length && dailyPackState(profiles[0].value, Date.now())[productId].active) return monetizationError(409, "Daily pack already active; claim its daily reward instead");
  }
  const previous = nk.sqlQuery(
    "SELECT id, status, fulfillment_type, reward_snapshot, platform, store_product_id FROM monetization_purchase_orders WHERE user_id = $1 AND product_id = $2 AND target_server_id=$3 AND target_generation=$4 AND status IN ('pending','fulfilled') ORDER BY created_at DESC",
    [ctx.userId, productId, target ? target.serverId : "", target ? target.generation : 0]
  );
  const fulfilled = previous.filter((row) => String(row.status) === "fulfilled");
  if (product.unique_purchase === true && fulfilled.length > 0) {
    return JSON.stringify({ status: "success", data: {
      purchase_order_id: String(fulfilled[0].id),
      product_id: productId,
      fulfillment_type: String(product.fulfillment_type),
      already_fulfilled: true
    }, idempotent: true });
  }
  if (product.unique_purchase === true) {
    const legacy = nk.sqlQuery(
      "SELECT id FROM monetization_purchases WHERE user_id = $1 AND product_id = $2 AND target_server_id=$3 AND target_generation=$4 AND status <> 'voided' LIMIT 1",
      [ctx.userId, productId, target ? target.serverId : "", target ? target.generation : 0]
    );
    if (legacy.length > 0) return JSON.stringify({ status: "success", data: {
      purchase_order_id: "",
      product_id: productId,
      fulfillment_type: String(product.fulfillment_type),
      already_fulfilled: true
    }, idempotent: true });
  }
  const monthlyCatalog = DAILY_PACK_IDS.indexOf(productId) >= 0 && Number((parseJsonb(product.ui) || {}).duration_days) === 30;
  const pending = previous.find((row) => String(row.status) === "pending" && (!monthlyCatalog || Array.isArray(parseJsonb(row.reward_snapshot)) && parseJsonb(row.reward_snapshot).length > 0 && parseJsonb(row.reward_snapshot).every((line) => Number((line.metadata || {}).daily_pack_days) === 30)));
  if (pending) {
    return JSON.stringify({ status: "success", data: {
      purchase_order_id: String(pending.id),
      product_id: productId,
      platform: String(pending.platform || "android"),
      store_product_id: String(pending.store_product_id || productId),
      fulfillment_type: String(product.fulfillment_type)
    }, idempotent: true });
  }
  if (Number(product.purchase_limit || 0) > 0 && String(product.purchase_limit_period) === "day") {
    const today = nk.sqlQuery(`SELECT COUNT(*)::INT AS count FROM monetization_purchase_orders
            WHERE user_id = $1 AND product_id = $2 AND status = 'fulfilled'
              AND target_server_id=$3 AND target_generation=$4
              AND fulfilled_at >= DATE_TRUNC('day', NOW())`, [ctx.userId, productId, target ? target.serverId : "", target ? target.generation : 0]);
    if (Number(today[0].count || 0) >= Number(product.purchase_limit)) return monetizationError(409, "Daily purchase limit reached");
  }
  const rewardRows = nk.sqlQuery(
    "SELECT reward_type, reward_id, quantity, metadata FROM game_store_product_rewards WHERE product_id = $1 ORDER BY line_no",
    [productId]
  );
  const rewards = rewardRows.map((row) => ({
    reward_type: String(row.reward_type),
    reward_id: String(row.reward_id),
    quantity: Number(row.quantity),
    metadata: parseJsonb(row.metadata) || {}
  })).filter((line) => !line.metadata || line.metadata.condition !== "first_purchase" || fulfilled.length === 0);
  if (rewards.length === 0) return monetizationError(409, "Product has no fulfillment lines");
  const vip = vipConfig(nk);
  const vipExp = Number(vip && vip.product_exp ? vip.product_exp[productId] : NaN);
  if (!Number.isSafeInteger(vipExp) || vipExp <= 0) return monetizationError(409, "VIP product config is missing; seed vip config before selling this pack");
  const orderId = nk.uuidv4();
  nk.sqlExec(
    `INSERT INTO monetization_purchase_orders
        (id, user_id, product_id, status, reward_snapshot, fulfillment_type, vip_exp, vip_environment,
         platform,store_product_id,target_server_id,target_generation)
        VALUES ($1,$2,$3,'pending',$4::jsonb,$5,$6,$7,$8,$9,$10,$11)`,
    [
      orderId,
      ctx.userId,
      productId,
      JSON.stringify(rewards),
      String(product.fulfillment_type),
      vipExp,
      monetizationMode(ctx),
      orderPlatform,
      storeProductId,
      target ? target.serverId : "",
      target ? target.generation : 0
    ]
  );
  return JSON.stringify({ status: "success", data: {
    purchase_order_id: orderId,
    product_id: productId,
    platform: orderPlatform,
    store_product_id: storeProductId,
    fulfillment_type: String(product.fulfillment_type),
    rewards
  } });
};
const iapGoogleClaim = (ctx, logger, nk, payload) => {
  if (!ctx.userId) return monetizationError(401, "Authentication required");
  if (!isRemoteFlagEnabled(nk, "payment_enabled")) return monetizationError(403, "Payments are disabled");
  let req;
  try {
    req = JSON.parse(payload || "{}");
  } catch (_e) {
    return monetizationError(400, "Invalid JSON");
  }
  const purchaseOrderId = String(req.purchase_order_id || "");
  const receipt = String(req.receipt || "");
  if (!purchaseOrderId) return monetizationError(400, "purchase_order_id is required");
  const orders = nk.sqlQuery("SELECT * FROM monetization_purchase_orders WHERE id = $1 AND user_id = $2", [purchaseOrderId, ctx.userId]);
  if (orders.length === 0) return monetizationError(404, "Purchase order not found");
  const order = orders[0];
  const target = nk.__characterContext;
  if (target && (String(order.target_server_id) !== target.serverId || Number(order.target_generation) !== target.generation))
    return serverFailure("ORDER_TARGET_MISMATCH", 409, "Select the original order server and generation; rewards were not redirected");
  if (String(order.platform || "android") !== "android") return monetizationError(409, "Purchase order belongs to another store platform");
  const productId = String(order.product_id);
  const fulfillmentType = String(order.fulfillment_type);
  const rewardSnapshot = parseJsonb(order.reward_snapshot) || [];
  if (String(order.status) === "fulfilled") {
    if (target && nk.sqlQuery("SELECT 1 FROM monetization_purchases WHERE purchase_order_id=$1 AND status='voided'", [purchaseOrderId]).length) return monetizationError(409, "Purchase was voided");
    try {
      auditLegacyVipOrder(ctx, nk, order, receipt);
    } catch (e) {
      return monetizationError(409, "Legacy VIP receipt audit failed: " + String(e));
    }
    const data = buildMonetizationResponse(nk, ctx.userId, monetizationMode(ctx));
    data.reward = { product_id: productId, purchase_order_id: purchaseOrderId, fulfillment_type: fulfillmentType };
    return JSON.stringify({ status: "success", data, idempotent: true });
  }
  if (String(order.status) !== "pending") return monetizationError(409, "Purchase order is not claimable");
  const mode = monetizationMode(ctx);
  let transactionId = "";
  let purchaseTokenHash = "";
  let seenBefore = false;
  let receiptOwner = ctx.userId;
  if (order.vip_environment && String(order.vip_environment) !== mode) return monetizationError(409, "Purchase order environment does not match server");
  if (order.vip_exp === null || order.vip_exp === void 0 || !order.vip_environment) {
    const config = vipConfig(nk);
    const exp = Number(config && config.product_exp ? config.product_exp[productId] : NaN);
    if (!Number.isSafeInteger(exp) || exp <= 0) return monetizationError(409, "VIP config is missing");
    nk.sqlExec("UPDATE monetization_purchase_orders SET vip_exp=$2, vip_environment=$3 WHERE id=$1 AND status='pending' AND vip_exp IS NULL", [purchaseOrderId, exp, mode]);
  }
  if (mode === "mock") {
    transactionId = purchaseOrderId;
  } else {
    if (!receipt) return monetizationError(400, "receipt is required");
    let validation;
    try {
      validation = nk.purchaseValidateGoogle(ctx.userId, receipt, true);
    } catch (e) {
      logger.warn("Google purchase validation failed user=%s product=%s error=%s", ctx.userId, productId, String(e));
      return monetizationError(409, "Purchase is not valid");
    }
    const purchases = validation.validatedPurchases || [];
    const purchase = purchases.find((value) => value && value.productId === String(order.store_product_id || productId) && isLinkedReceiptOwner(nk, value.userId, ctx.userId));
    if (!purchase || !purchase.transactionId || Number(purchase.refundTime || 0) > 0) return monetizationError(409, "Validated product does not match claim");
    receiptOwner = String(purchase.userId);
    if (!isProductionTestPurchaseAllowed(ctx, nk, purchase)) return monetizationError(409, "Test purchase is not authorized for this account");
    transactionId = String(purchase.transactionId);
    seenBefore = Boolean(purchase.seenBefore);
    let receiptData;
    try {
      receiptData = JSON.parse(receipt);
    } catch (_e) {
      return monetizationError(400, "Invalid Google receipt JSON");
    }
    const validatedToken = String(receiptData.purchaseToken || receiptData.purchase_token || "");
    if (!validatedToken) return monetizationError(409, "Validated receipt has no purchase token");
    const hashRows = nk.sqlQuery(
      "SELECT encode(sha256(convert_to($1, 'UTF8')), 'hex') AS token_hash",
      [validatedToken]
    );
    purchaseTokenHash = hashRows.length > 0 ? String(hashRows[0].token_hash || "") : "";
    if (!purchaseTokenHash) return monetizationError(500, "Could not fingerprint purchase");
    if (target) {
      try {
        const secret = String(ctx.env.MONETIZATION_VERIFIER_SECRET || "");
        if (!secret) throw new Error("Verifier is not configured");
        const result = nk.httpRequest(
          String(ctx.env.MONETIZATION_VERIFIER_URL || "http://monetization-verifier:8080/google-play/verify"),
          "post",
          { "Authorization": "Bearer " + secret, "Content-Type": "application/json" },
          JSON.stringify({
            user_id: receiptOwner,
            product_id: String(order.store_product_id || productId),
            purchase_token: validatedToken,
            package_name: String(receiptData.packageName || ""),
            purchase_order_id: purchaseOrderId,
            verification_only: true
          }),
          1e4
        );
        if (result.code !== 200 || JSON.parse(result.body).verified !== true) throw new Error("Order binding rejected");
      } catch (_e) {
        return monetizationError(409, "Google receipt does not verify against the original order");
      }
    }
  }
  return fulfillVerifiedStoreOrder(ctx, logger, nk, order, { platform: "android", productId, storeProductId: String(order.store_product_id || productId), transactionId, tokenHash: purchaseTokenHash, seenBefore, receiptOwner, mode });
};
function fulfillVerifiedStoreOrder(ctx, logger, nk, order, verified) {
  const productId = String(order.product_id), purchaseOrderId = String(order.id), fulfillmentType = String(order.fulfillment_type);
  const rewardSnapshot = parseJsonb(order.reward_snapshot) || [];
  const { transactionId, seenBefore, receiptOwner, mode } = verified;
  if (!transactionId || mode !== "mock" && !verified.tokenHash || String(order.platform || "android") !== verified.platform || verified.productId !== productId || verified.storeProductId !== String(order.store_product_id || productId) || order.vip_environment && String(order.vip_environment) !== mode)
    return monetizationError(409, "Invalid verified purchase envelope");
  try {
    const grantId = mode === "mock" ? `mock:${transactionId}` : verified.platform === "android" ? verified.tokenHash : "ios:" + verified.tokenHash;
    const target = nk.__characterContext;
    if (target) {
      if (nk.sqlQuery("SELECT 1 FROM store_purchase_voids WHERE token_hash=$1", [grantId]).length) return monetizationError(409, "Purchase was voided; reconciliation required");
      const reservation = nk.sqlQuery(`INSERT INTO store_receipt_reservations(token_hash,order_id,user_id,target_server_id,target_generation)
              VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING order_id`, [grantId, purchaseOrderId, ctx.userId, target.serverId, target.generation]);
      if (!reservation.length) {
        const owned = nk.sqlQuery("SELECT order_id,user_id,target_server_id,target_generation FROM store_receipt_reservations WHERE token_hash=$1", [grantId]);
        if (!owned.length || owned[0].order_id !== purchaseOrderId || owned[0].user_id !== ctx.userId || owned[0].target_server_id !== target.serverId || Number(owned[0].target_generation) !== target.generation)
          return monetizationError(409, "Receipt already reserved for a different original order");
      }
    }
    const existing = nk.sqlQuery(
      "SELECT user_id, product_id, status, COALESCE(NULLIF(purchase_order_id,''),request_id) AS original_order_id FROM monetization_purchases WHERE purchase_token_hash = $1 OR request_id = $2",
      [grantId, purchaseOrderId]
    );
    if (existing.length > 0) {
      if (existing[0].status === "voided") return monetizationError(409, "Purchase was voided");
      if (String(existing[0].user_id) !== ctx.userId || String(existing[0].product_id) !== productId) {
        return monetizationError(409, "Purchase belongs to another claim");
      }
      const originalOrderId = String(existing[0].original_order_id || purchaseOrderId);
      if (originalOrderId !== purchaseOrderId) {
        nk.sqlExec("UPDATE monetization_purchase_orders SET status='superseded',updated_at=NOW() WHERE id=$1 AND user_id=$2 AND status='pending'", [purchaseOrderId, ctx.userId]);
        const data3 = buildMonetizationResponse(nk, ctx.userId, mode);
        data3.reward = { product_id: productId, purchase_order_id: originalOrderId, fulfillment_type: fulfillmentType };
        return JSON.stringify({ status: "success", data: data3, idempotent: true });
      }
      nk.sqlExec(
        `UPDATE monetization_purchase_orders SET status='fulfilled', transaction_id=$2,
                purchase_token_hash=$3, validated_at=COALESCE(validated_at, NOW()),
                fulfilled_at=COALESCE(fulfilled_at, NOW()), updated_at=NOW() WHERE id=$1`,
        [purchaseOrderId, transactionId, grantId]
      );
      if (target) nk.sqlExec(`UPDATE monetization_purchases SET target_server_id=$2,target_generation=$3
              WHERE request_id=$1 AND purchase_order_id=$1`, [purchaseOrderId, target.serverId, target.generation]);
      const data2 = buildMonetizationResponse(nk, ctx.userId, mode);
      data2.reward = {
        product_id: productId,
        purchase_order_id: purchaseOrderId,
        fulfillment_type: fulfillmentType,
        lines: rewardSnapshot
      };
      return JSON.stringify({ status: "success", data: data2, idempotent: true });
    }
    if (receiptOwner !== ctx.userId) return monetizationError(409, "Historical linked-account receipt requires support audit; rewards were not replayed");
    const granted = applyPurchaseMailRewards(nk, ctx.userId, grantId, productId, fulfillmentType, rewardSnapshot);
    const noAdsSeconds = rewardSnapshot.filter((line) => line.reward_type === "entitlement" && line.reward_id === "no_ads_seconds").reduce((total, line) => total + Number(line.quantity), 0);
    if (noAdsSeconds > 0) {
      applyNoAdsGrant(
        nk,
        ctx.userId,
        purchaseOrderId,
        verified.platform,
        productId,
        grantId,
        transactionId,
        noAdsSeconds,
        mode === "mock" ? "debug" : verified.platform === "android" ? "google_play" : "app_store",
        purchaseOrderId
      );
    } else {
      nk.sqlExec(
        `INSERT INTO monetization_purchases
                    (request_id, user_id, platform, product_id, purchase_token_hash, order_id,
                     status, granted_seconds, purchased_at, verified_at, purchase_order_id,target_server_id,target_generation)
                 VALUES ($1, $2, $6, $3, $4, $5, 'verified', 0, NOW(), NOW(), $1,$7,$8)
                 ON CONFLICT DO NOTHING`,
        [purchaseOrderId, ctx.userId, productId, grantId, transactionId, verified.platform, target ? target.serverId : "", target ? target.generation : 0]
      );
    }
    if (target && nk.sqlQuery(`SELECT void_store_purchase($1) AS revoked WHERE EXISTS(SELECT 1 FROM store_purchase_voids WHERE token_hash=$1)`, [grantId]).length)
      return monetizationError(409, "Purchase refund arrived during delivery; reconciliation queued");
    nk.sqlExec(`UPDATE monetization_purchase_orders SET status='fulfilled', transaction_id=$2,
            purchase_token_hash=$3, validated_at=NOW(), fulfilled_at=NOW(), updated_at=NOW()
            WHERE id=$1 AND status='pending'`, [purchaseOrderId, transactionId, grantId]);
    if (target) nk.sqlExec(`UPDATE monetization_purchases SET target_server_id=$2,target_generation=$3
          WHERE request_id=$1 AND purchase_order_id=$1`, [purchaseOrderId, target.serverId, target.generation]);
    const data = buildMonetizationResponse(nk, ctx.userId, mode);
    data.reward = {
      product_id: productId,
      purchase_order_id: purchaseOrderId,
      fulfillment_type: fulfillmentType,
      profile: granted,
      lines: rewardSnapshot
    };
    return JSON.stringify({ status: "success", data, idempotent: seenBefore });
  } catch (e) {
    logger.error("Store fulfillment failed user=%s product=%s: %s", ctx.userId, productId, String(e));
    return monetizationError(500, "Could not grant purchase");
  }
}
;
const syncPlayPurchase = iapGoogleClaim;
const resolvePurchaseOrder = (ctx, _logger, nk, payload) => {
  if (!ctx.userId) return monetizationError(401, "Authentication required");
  let req;
  try {
    req = JSON.parse(payload || "{}");
  } catch (_e) {
    return monetizationError(400, "Invalid JSON");
  }
  if (!req || req.platform !== "android") return monetizationError(501, "Store restore provider is not configured");
  if (monetizationMode(ctx) === "mock") return monetizationError(409, "Mock purchases require their original order");
  const receipt = String(req.receipt || "");
  if (!receipt || receipt.length > 65536) return monetizationError(400, "Invalid receipt");
  let validation, token;
  try {
    validation = nk.purchaseValidateGoogle(ctx.userId, receipt, true);
    const wire = JSON.parse(receipt);
    token = String(wire.purchaseToken || wire.purchase_token || "");
  } catch (_e) {
    return monetizationError(409, "Purchase is not valid");
  }
  const purchase = (validation.validatedPurchases || []).find((p) => p && isLinkedReceiptOwner(nk, p.userId, ctx.userId) && isProductionTestPurchaseAllowed(ctx, nk, p) && Number(p.refundTime || 0) <= 0);
  if (!purchase || !token) return monetizationError(409, "Validated purchase does not belong to this account");
  const hashes = nk.sqlQuery("SELECT encode(sha256(convert_to($1,'UTF8')),'hex') AS token_hash", [token]);
  if (!hashes.length || !hashes[0].token_hash) return monetizationError(500, "Could not fingerprint purchase");
  const orders = nk.sqlQuery(`SELECT o.id AS purchase_order_id,o.product_id,o.platform,o.store_product_id,o.fulfillment_type,
      o.target_server_id,o.target_generation FROM monetization_purchases p JOIN monetization_purchase_orders o
      ON o.id=COALESCE(NULLIF(p.purchase_order_id,''),p.request_id)
      WHERE p.purchase_token_hash=$1 AND p.user_id=$2 AND o.user_id=$2 AND o.platform='android'`, [String(hashes[0].token_hash), ctx.userId]);
  if (!orders.length && ctx.env && ctx.env.MULTI_SERVER_ENABLED === "true") {
    try {
      const secret = String(ctx.env.MONETIZATION_VERIFIER_SECRET || "");
      if (!secret) throw new Error("Verifier unavailable");
      const wire = JSON.parse(receipt);
      const response = nk.httpRequest(
        String(ctx.env.MONETIZATION_VERIFIER_URL || "http://monetization-verifier:8080/google-play/verify"),
        "post",
        { "Authorization": "Bearer " + secret, "Content-Type": "application/json" },
        JSON.stringify({
          user_id: String(purchase.userId),
          product_id: String(purchase.productId),
          purchase_token: token,
          package_name: String(wire.packageName || ""),
          verification_only: true
        }),
        1e4
      );
      const verified = JSON.parse(response.body);
      if (response.code !== 200 || verified.verified !== true || verified.token_hash !== String(hashes[0].token_hash) || !verified.purchase_order_id) throw new Error("Original order not verified");
      const pending = nk.sqlQuery(`SELECT id AS purchase_order_id,product_id,platform,store_product_id,fulfillment_type,target_server_id,target_generation
              FROM monetization_purchase_orders WHERE id=$1 AND user_id=$2 AND platform='android' AND status IN ('pending','fulfilled')`, [String(verified.purchase_order_id), ctx.userId]);
      if (!pending.length || String(pending[0].store_product_id || pending[0].product_id) !== String(purchase.productId)) throw new Error("Original order not found");
      return JSON.stringify({ status: "success", data: pending[0] });
    } catch (_e) {
      return monetizationError(409, "Original purchase destination requires reconciliation; no new order was created");
    }
  }
  if (!orders.length) return monetizationError(409, "Original purchase destination requires reconciliation; no new order was created");
  const order = orders[0];
  if (String(order.store_product_id || order.product_id) !== String(purchase.productId)) return monetizationError(409, "Product does not match original order");
  return JSON.stringify({ status: "success", data: order });
};
const iapClaim = (ctx, logger, nk, payload) => {
  if (!ctx.userId) return monetizationError(401, "Authentication required");
  let req;
  try {
    req = JSON.parse(payload || "{}");
  } catch (_e) {
    return monetizationError(400, "Invalid JSON");
  }
  if (!req || typeof req !== "object" || Array.isArray(req)) return monetizationError(400, "Invalid request");
  const platform = String(req.platform || "");
  if (platform !== "android" && platform !== "ios") return monetizationError(400, "Unsupported purchase platform");
  const rows = nk.sqlQuery("SELECT platform FROM monetization_purchase_orders WHERE id=$1 AND user_id=$2", [String(req.purchase_order_id || ""), ctx.userId]);
  if (!rows.length) return monetizationError(404, "Purchase order not found");
  if (String(rows[0].platform || "android") !== platform) return monetizationError(409, "Purchase platform does not match order");
  if (platform === "ios") return monetizationError(501, "App Store payment provider is not configured");
  return iapGoogleClaim(ctx, logger, nk, payload);
};
const prepareRewardedAd = (ctx, _logger, nk, payload) => {
  if (!ctx.userId) return monetizationError(401, "Authentication required");
  let req;
  try {
    req = JSON.parse(payload || "{}");
  } catch (_e) {
    return monetizationError(400, "Invalid JSON");
  }
  const placementId = canonicalRewardPlacement(String(req.placement_id || ""));
  const reward = objectValue(rewardedAdsConfig(nk).placements)[placementId];
  if (!reward) return monetizationError(400, "Unknown rewarded placement or missing rewarded_ads config");
  if (reward.enabled === false || reward.daily_limit === 0 || reward.run_limit === 0) return monetizationError(403, "Rewarded placement is disabled");
  const requestId = String(req.request_id || nk.uuidv4());
  if (requestId.length > 128) return monetizationError(400, "Invalid reward request ID");
  const target = nk.__characterContext;
  const sessionSql = "SELECT * FROM monetization_ad_rewards WHERE user_id=$1 AND client_request_id=$2 AND target_server_id=$3 AND target_generation=$4";
  let sessions = nk.sqlQuery(sessionSql, [ctx.userId, requestId, target ? target.serverId : "", target ? target.generation : 0]);
  if (sessions.length && canonicalRewardPlacement(String(sessions[0].placement_id)) !== placementId) return monetizationError(409, "Reward request already belongs to another placement");
  const entitlement = readEntitlementRow(nk, ctx.userId);
  const noAds = Number(entitlement.no_ads_expires_at || 0) > Number(entitlement.server_time || 0);
  if (!noAds && !isRemoteFlagEnabled(nk, "ads_enabled") && monetizationMode(ctx) === "production") return monetizationError(403, "Ads are disabled");
  const dailyLimit = Math.max(0, Number(reward.daily_limit || 0));
  if (dailyLimit > 0 && !sessions.length) {
    const dailyStatus = buildDailyRewardStatus(nk, ctx.userId)[placementId] || {};
    if (Number(dailyStatus.remaining || 0) <= 0) {
      return monetizationError(409, "Daily reward quota reached");
    }
  }
  let rewardContext = {};
  if (placementId === "stage_reward_x2_ad") {
    const runId = String(objectValue(req.context).run_id || "");
    const settled = readSettledRewardRun(nk, ctx.userId, runId);
    if (!settled) return monetizationError(409, "A settled winning result is required");
    if (settled.run.stage_reward.claimed && (!sessions.length || settled.run.stage_reward.ad_session_id !== String(sessions[0].ad_session_id))) return monetizationError(409, "Victory multiplier already claimed");
    rewardContext = { run_id: runId };
  }
  if (placementId === "card_reroll_ad") {
    rewardContext = objectValue(req.context);
    const runId = String(rewardContext.run_id || "");
    const offerSeq = Math.floor(Number(rewardContext.offer_seq || 0));
    if (!runId || !Number.isSafeInteger(offerSeq) || offerSeq <= 0) {
      return monetizationError(400, "Card reroll requires an active run and offer sequence");
    }
    const activeRun = readActiveRun(nk, ctx.userId, runId);
    if (!activeRun) return monetizationError(409, "Run is not active");
    if (Math.max(0, Number(activeRun.run.ad_card_rerolls_used || 0)) >= rewardedRunLimit(nk, placementId)) {
      return monetizationError(409, "Card reroll quota reached");
    }
    rewardContext = { run_id: runId, offer_seq: offerSeq };
  }
  if (placementId === "combat_revive_ad") {
    rewardContext = objectValue(req.context);
    const runId = String(rewardContext.run_id || "");
    if (!runId) return monetizationError(400, "Combat revive requires an active run");
    const activeRun = readActiveRun(nk, ctx.userId, runId);
    if (!activeRun) return monetizationError(409, "Run is not active");
    if (Math.max(0, Number(activeRun.run.item_revives || 0)) >= rewardedRunLimit(nk, placementId)) {
      return monetizationError(409, "Revive already used for this run");
    }
    rewardContext = { run_id: runId };
  }
  if (sessions.length && placementId === "card_reroll_ad") {
    const oldContext = objectValue(parseJsonb(sessions[0].context));
    if (oldContext.run_id !== rewardContext.run_id || Number(oldContext.offer_seq) !== Number(rewardContext.offer_seq)) return monetizationError(409, "Reward request belongs to another card offer");
  }
  if (sessions.length && ["combat_revive_ad", "stage_reward_x2_ad"].indexOf(placementId) >= 0) {
    const oldContext = objectValue(parseJsonb(sessions[0].context));
    if (oldContext.run_id !== rewardContext.run_id) return monetizationError(409, "Reward request belongs to another run");
  }
  let adSessionId = sessions.length ? String(sessions[0].ad_session_id) : nk.uuidv4();
  const customData = JSON.stringify({ ad_session_id: adSessionId, user_id: ctx.userId });
  if (!sessions.length) {
    nk.sqlExec(
      `INSERT INTO monetization_ad_rewards
            (ad_session_id, user_id, placement_id, reward_type, reward_amount, custom_data, context, delivery_source, client_request_id,target_server_id,target_generation)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9,$10,$11) ON CONFLICT DO NOTHING`,
      [adSessionId, ctx.userId, placementId, reward.type, reward.amount, customData, JSON.stringify(rewardContext), noAds ? "no_ads" : "ad", requestId, target ? target.serverId : "", target ? target.generation : 0]
    );
    sessions = nk.sqlQuery(sessionSql, [ctx.userId, requestId, target ? target.serverId : "", target ? target.generation : 0]);
    if (!sessions.length) return monetizationError(409, "Could not reserve reward session");
    adSessionId = String(sessions[0].ad_session_id);
    if (String(sessions[0].placement_id) !== placementId) return monetizationError(409, "Reward request collision");
  }
  if (noAds && String(sessions[0].status) === "prepared") {
    nk.sqlExec("UPDATE monetization_ad_rewards SET delivery_source='no_ads' WHERE ad_session_id=$1 AND user_id=$2 AND status='prepared'", [adSessionId, ctx.userId]);
    sessions[0].delivery_source = "no_ads";
  }
  if (placementId === "card_reroll_ad") {
    const saved = objectValue(parseJsonb(sessions[0].context));
    if (saved.run_id !== rewardContext.run_id || Number(saved.offer_seq) !== Number(rewardContext.offer_seq)) return monetizationError(409, "Reward request belongs to another card offer");
  }
  if (["combat_revive_ad", "stage_reward_x2_ad"].indexOf(placementId) >= 0) {
    const saved = objectValue(parseJsonb(sessions[0].context));
    if (saved.run_id !== rewardContext.run_id) return monetizationError(409, "Reward request belongs to another run");
  }
  const skipAd = String(sessions[0].delivery_source) === "no_ads" || String(sessions[0].status) === "verified" || String(sessions[0].status) === "granted";
  const granted = skipAd ? grantPreparedReward(nk, ctx.userId, adSessionId, "") : {};
  if (skipAd && !granted.granted) return monetizationError(409, String(granted.message || "Reward is not available"));
  return JSON.stringify({
    status: "success",
    data: Object.assign({
      ad_session_id: adSessionId,
      custom_data: String(sessions[0].custom_data || customData),
      placement_id: placementId,
      reward_type: reward.type,
      reward_amount: reward.amount,
      context: rewardContext,
      skip_ad: skipAd,
      monetization: buildMonetizationResponse(nk, ctx.userId, monetizationMode(ctx))
    }, granted)
  });
};
function grantDailyMissionFragment(nk, userId, adSessionId, claim) {
  var _a;
  const scope = nk.__characterContext;
  const sid = scope ? scope.serverId : "", gen = scope ? scope.generation : 0;
  const config = rewardedAdsConfig(nk);
  const mission = objectValue(config.daily_mission);
  const quantity = Number(((_a = objectValue(config.placements).daily_mission_talisman_fragment_ad) == null ? void 0 : _a.amount) || 0);
  const completionCount = Number(mission.completion_count || 0);
  if (!claim || completionCount <= 0 || !Number.isSafeInteger(quantity) || quantity <= 0) return { granted: false, message: "Missing daily mission configuration" };
  let itemId = "";
  let inventory;
  if (Number(claim.claim_slot) >= completionCount) {
    nk.sqlExec(`INSERT INTO monetization_daily_fragment_rewards (user_id,reward_date,item_id,target_server_id,target_generation)
            SELECT $1,$2::DATE,id,$4,$5 FROM game_items WHERE category='talisman_fragment'
                AND attributes->>'quality'=$3 ORDER BY RANDOM() LIMIT 1
            ON CONFLICT (user_id,target_server_id,target_generation,reward_date) DO NOTHING`, [userId, String(claim.reward_date), String(mission.fragment_quality || ""), sid, gen]);
    const selected = nk.sqlQuery("SELECT item_id,granted_at FROM monetization_daily_fragment_rewards WHERE user_id=$1 AND reward_date=$2::DATE AND target_server_id=$3 AND target_generation=$4", [userId, String(claim.reward_date), sid, gen]);
    if (!selected.length) return { granted: false, message: "Daily fragment catalog is missing" };
    itemId = String(selected[0].item_id);
    if (!selected[0].granted_at) {
      const objects = nk.storageRead([{ collection: "player_inventory", key: "items", userId }]);
      if (!objects.length) return { granted: false, message: "Player inventory does not exist" };
      const value = objects[0].value || {};
      const markers = Array.isArray(value._monetization_reward_ids) ? value._monetization_reward_ids : [];
      const marker = `daily-fragment:${String(claim.reward_date)}`;
      inventory = Array.isArray(value.items) ? value.items : [];
      if (markers.indexOf(marker) < 0) {
        addStoreInventoryItem(nk, inventory, itemId, quantity);
        markers.push(marker);
        value.items = inventory;
        value._monetization_reward_ids = markers.slice(-200);
        nk.storageWrite([{ collection: "player_inventory", key: "items", userId, value, permissionRead: 1, permissionWrite: 0, version: objects[0].version }]);
      }
      nk.sqlExec("UPDATE monetization_daily_fragment_rewards SET granted_at=COALESCE(granted_at,NOW()) WHERE user_id=$1 AND reward_date=$2::DATE AND target_server_id=$3 AND target_generation=$4", [userId, String(claim.reward_date), sid, gen]);
    }
  }
  nk.sqlExec("UPDATE monetization_ad_rewards SET status='granted', granted_at=NOW() WHERE ad_session_id=$1 AND status='verified'", [adSessionId]);
  return {
    granted: true,
    reward_type: "daily_fragment",
    reward_amount: itemId ? quantity : 0,
    reward_id: itemId,
    daily_progress: Number(claim.claim_slot),
    daily_target: completionCount,
    inventory
  };
}
function grantPreparedReward(nk, userId, adSessionId, transactionId) {
  const scope = nk.__characterContext;
  if (scope) {
    const rows2 = nk.sqlQuery("SELECT target_server_id,target_generation FROM monetization_ad_rewards WHERE ad_session_id=$1 AND user_id=$2", [adSessionId, userId]);
    if (!rows2.length || rows2[0].target_server_id !== scope.serverId || Number(rows2[0].target_generation) !== scope.generation) return { granted: false, message: "Ad session target does not match character" };
  }
  const rows = nk.sqlQuery(
    `UPDATE monetization_ad_rewards SET
            status = 'verified', admob_transaction_id = NULLIF($3, ''), verified_at = NOW()
         WHERE ad_session_id = $1 AND user_id = $2
           AND status = 'prepared' AND expires_at > NOW()
         RETURNING placement_id, reward_type, reward_amount`,
    [adSessionId, userId, transactionId]
  );
  if (rows.length === 0) {
    const existing = nk.sqlQuery(
      "SELECT status, placement_id, reward_type, reward_amount FROM monetization_ad_rewards WHERE ad_session_id = $1 AND user_id = $2",
      [adSessionId, userId]
    );
    if (existing.length === 0) return { granted: false };
    if (existing[0].status === "granted") {
      if (String(existing[0].reward_type) === "stage_reward_x2") return grantStageRewardMultiplier(nk, userId, adSessionId, Number(existing[0].reward_amount), 0);
      return {
        granted: true,
        reward_type: String(existing[0].reward_type),
        reward_amount: Number(existing[0].reward_amount)
      };
    }
    if (existing[0].status !== "verified") return { granted: false };
    rows.push(existing[0]);
  }
  const reward = rows[0];
  const placementId = String(reward.placement_id || "");
  const rewardDefinition = objectValue(rewardedAdsConfig(nk).placements)[canonicalRewardPlacement(placementId)];
  if (!rewardDefinition) return { granted: false, message: "Unknown rewarded placement" };
  if (rewardDefinition.enabled === false || rewardDefinition.daily_limit === 0 || rewardDefinition.run_limit === 0) return { granted: false, message: "Rewarded placement disabled" };
  const limit = Number(rewardDefinition.daily_limit || 0);
  if (String(reward.reward_type) === "stage_reward_x2") {
    const granted = grantStageRewardMultiplier(nk, userId, adSessionId, Number(reward.reward_amount), limit);
    if (granted.granted) nk.sqlExec("UPDATE monetization_ad_rewards SET status='granted', granted_at=NOW() WHERE ad_session_id=$1 AND status='verified'", [adSessionId]);
    return granted;
  }
  const dailyClaim = limit > 0 ? reserveDailyRewardClaim(nk, userId, placementId, adSessionId, limit) : null;
  if (limit > 0 && !dailyClaim) {
    nk.sqlExec("UPDATE monetization_ad_rewards SET status='rejected' WHERE ad_session_id=$1 AND status='verified'", [adSessionId]);
    return { granted: false, message: "Daily reward quota reached" };
  }
  if (String(reward.reward_type) === "daily_fragment") return grantDailyMissionFragment(nk, userId, adSessionId, dailyClaim);
  if (String(reward.reward_type) === "card_reroll" || String(reward.reward_type) === "combat_revive") {
    nk.sqlExec(
      "UPDATE monetization_ad_rewards SET status = 'granted', granted_at = NOW() WHERE ad_session_id = $1 AND status = 'verified'",
      [adSessionId]
    );
    return { granted: true, reward_type: String(reward.reward_type), reward_amount: 1 };
  }
  if (String(reward.reward_type) === "item") {
    const itemId = String(rewardDefinition.item_id || "");
    if (!itemId) return { granted: false, message: "Reward item is missing" };
    const inventoryObjects = nk.storageRead([{ collection: "player_inventory", key: "items", userId }]);
    if (inventoryObjects.length === 0) return { granted: false, message: "Player inventory does not exist" };
    const inventoryValue = inventoryObjects[0].value || {};
    const grantIds = Array.isArray(inventoryValue._monetization_reward_ids) ? inventoryValue._monetization_reward_ids.map((value) => String(value)) : [];
    const inventory = Array.isArray(inventoryValue.items) ? inventoryValue.items : [];
    if (grantIds.indexOf(adSessionId) < 0) {
      addStoreInventoryItem(nk, inventory, itemId, Number(reward.reward_amount || 0));
      inventoryValue.items = inventory;
      grantIds.push(adSessionId);
      inventoryValue._monetization_reward_ids = grantIds.slice(-200);
      nk.storageWrite([{
        collection: "player_inventory",
        key: "items",
        userId,
        value: inventoryValue,
        permissionRead: 1,
        permissionWrite: 0,
        version: inventoryObjects[0].version
      }]);
    }
    nk.sqlExec(
      "UPDATE monetization_ad_rewards SET status = 'granted', granted_at = NOW() WHERE ad_session_id = $1 AND status = 'verified'",
      [adSessionId]
    );
    return {
      granted: true,
      reward_type: "item",
      reward_id: itemId,
      reward_amount: Number(reward.reward_amount || 0),
      inventory
    };
  }
  const profiles = nk.storageRead([{ collection: "player_profiles", key: "main", userId }]);
  if (profiles.length === 0) return { granted: false };
  const profile = profiles[0].value || {};
  const rewardIds = Array.isArray(profile._monetization_reward_ids) ? profile._monetization_reward_ids.map((value) => String(value)) : [];
  if (rewardIds.indexOf(adSessionId) < 0) {
    if (String(reward.reward_type) === "stamina") {
      profile.stamina = Math.max(Number(profile.stamina || 0), Math.min(30, Math.max(0, Number(profile.stamina || 0)) + Number(reward.reward_amount || 0)));
    } else {
      const resources = profile.resources || {};
      resources[String(reward.reward_type)] = Math.max(0, Number(resources[String(reward.reward_type)] || 0)) + Number(reward.reward_amount || 0);
      profile.resources = resources;
    }
    rewardIds.push(adSessionId);
    profile._monetization_reward_ids = rewardIds.slice(-100);
    nk.storageWrite([{
      collection: "player_profiles",
      key: "main",
      userId,
      value: profile,
      permissionRead: 1,
      permissionWrite: 0,
      version: profiles[0].version
    }]);
  }
  nk.sqlExec(
    "UPDATE monetization_ad_rewards SET status = 'granted', granted_at = NOW() WHERE ad_session_id = $1 AND status = 'verified'",
    [adSessionId]
  );
  return {
    granted: true,
    reward_type: String(reward.reward_type),
    reward_amount: Number(reward.reward_amount),
    stamina: Number(profile.stamina || 0),
    resources: profile.resources || {}
  };
}
const confirmRewardedAd = (ctx, _logger, nk, payload) => {
  if (!ctx.userId) return monetizationError(401, "Authentication required");
  let req;
  try {
    req = JSON.parse(payload || "{}");
  } catch (_e) {
    return monetizationError(400, "Invalid JSON");
  }
  const adSessionId = String(req.ad_session_id || "");
  if (!adSessionId) return monetizationError(400, "ad_session_id is required");
  const mode = monetizationMode(ctx);
  const delivery = nk.sqlQuery("SELECT delivery_source FROM monetization_ad_rewards WHERE ad_session_id=$1 AND user_id=$2", [adSessionId, ctx.userId]);
  const noAdsDelivery = delivery.length && String(delivery[0].delivery_source) === "no_ads";
  if (noAdsDelivery || mode === "mock" || mode === "sandbox") {
    const reward = grantPreparedReward(nk, ctx.userId, adSessionId, noAdsDelivery ? "" : `${mode}:${adSessionId}`);
    return JSON.stringify({ status: reward.granted ? "success" : "error", data: reward, code: reward.granted ? void 0 : 409 });
  }
  const rows = nk.sqlQuery(
    `SELECT status, reward_type, reward_amount, EXTRACT(EPOCH FROM created_at)::BIGINT AS created_at
         FROM monetization_ad_rewards WHERE ad_session_id = $1 AND user_id = $2`,
    [adSessionId, ctx.userId]
  );
  if (rows.length === 0) return monetizationError(404, "Reward session not found");
  if (String(rows[0].reward_type) === "stage_reward_x2" && ["verified", "granted"].indexOf(String(rows[0].status)) >= 0) {
    const reward = grantPreparedReward(nk, ctx.userId, adSessionId, "");
    return JSON.stringify({ status: reward.granted ? "success" : "error", data: reward, code: reward.granted ? void 0 : 409 });
  }
  return JSON.stringify({ status: "success", data: rows[0] });
};
const consumeAdGameplayReward = (ctx, _logger, nk, payload) => {
  if (!ctx.userId) return monetizationError(401, "Authentication required");
  let req;
  try {
    req = JSON.parse(payload || "{}");
  } catch (_e) {
    return monetizationError(400, "Invalid JSON");
  }
  const adSessionId = String(req.ad_session_id || "");
  const runId = String(req.run_id || "");
  const rewardType = String(req.reward_type || "");
  if (!adSessionId || !runId || rewardType !== "card_reroll" && rewardType !== "combat_revive") {
    return monetizationError(400, "Invalid gameplay reward request");
  }
  const rows = nk.sqlQuery(
    `SELECT placement_id, reward_type, status, consumed_at, context
         FROM monetization_ad_rewards WHERE ad_session_id = $1 AND user_id = $2`,
    [adSessionId, ctx.userId]
  );
  if (rows.length === 0) return monetizationError(404, "Reward session not found");
  const ledger = rows[0];
  const storedContext = objectValue(parseJsonb(ledger.context));
  if (rewardType === "combat_revive") {
    if (String(ledger.placement_id) !== "combat_revive_ad" || String(ledger.reward_type) !== "combat_revive" || String(ledger.status) !== "granted" || ledger.consumed_at || String(storedContext.run_id || "") !== runId) {
      return monetizationError(409, "Combat revive credit is invalid or already used");
    }
    const activeRun2 = readActiveRun(nk, ctx.userId, runId);
    if (!activeRun2) return monetizationError(409, "Run is not active");
    if (Math.max(0, Math.floor(Number(activeRun2.run.item_revives || 0))) >= rewardedRunLimit(nk, "combat_revive_ad")) {
      return monetizationError(409, "Revive already used for this run");
    }
    const definitions = nk.sqlQuery("SELECT attributes FROM game_items WHERE id='revive_talisman'", []);
    const effect = definitions.length ? objectValue(objectValue(parseJsonb(definitions[0].attributes)).effect) : {};
    if (String(effect.kind || "") !== "revive" || !Number.isFinite(Number(effect.value)) || Number(effect.value) <= 0) {
      return monetizationError(409, "Revive effect configuration is unavailable");
    }
    activeRun2.run.item_revives = Math.max(0, Math.floor(Number(activeRun2.run.item_revives || 0))) + 1;
    nk.storageWrite([{
      collection: "player_stage_runs",
      key: "active",
      userId: ctx.userId,
      value: activeRun2.run,
      permissionRead: 1,
      permissionWrite: 0,
      version: activeRun2.object.version
    }]);
    const consumed2 = nk.sqlQuery(
      `UPDATE monetization_ad_rewards SET consumed_at = NOW()
             WHERE ad_session_id = $1 AND user_id = $2 AND status = 'granted' AND consumed_at IS NULL
             RETURNING ad_session_id`,
      [adSessionId, ctx.userId]
    );
    if (consumed2.length === 0) return monetizationError(409, "Combat revive credit is already used");
    return JSON.stringify({ status: "success", data: {
      consumed: true,
      run_id: runId,
      reward_type: "combat_revive",
      effect
    } });
  }
  const offerSeq = Math.floor(Number(req.offer_seq || 0));
  if (String(ledger.placement_id) !== "card_reroll_ad" || String(ledger.reward_type) !== "card_reroll" || String(ledger.status) !== "granted" || ledger.consumed_at || String(storedContext.run_id || "") !== runId || Number(storedContext.offer_seq || 0) !== offerSeq) {
    return monetizationError(409, "Card reroll credit is invalid or already used");
  }
  const activeRun = readActiveRun(nk, ctx.userId, runId);
  if (!activeRun) return monetizationError(409, "Run is not active");
  const used = Math.max(0, Math.floor(Number(activeRun.run.ad_card_rerolls_used || 0)));
  const maxRerolls = rewardedRunLimit(nk, "card_reroll_ad");
  if (used >= maxRerolls) return monetizationError(409, "Card reroll quota reached");
  activeRun.run.ad_card_rerolls_used = used + 1;
  nk.storageWrite([{
    collection: "player_stage_runs",
    key: "active",
    userId: ctx.userId,
    value: activeRun.run,
    permissionRead: 1,
    permissionWrite: 0,
    version: activeRun.object.version
  }]);
  const consumed = nk.sqlQuery(
    `UPDATE monetization_ad_rewards SET consumed_at = NOW()
         WHERE ad_session_id = $1 AND user_id = $2 AND status = 'granted' AND consumed_at IS NULL
         RETURNING ad_session_id`,
    [adSessionId, ctx.userId]
  );
  if (consumed.length === 0) return monetizationError(409, "Card reroll credit is already used");
  return JSON.stringify({ status: "success", data: {
    consumed: true,
    run_id: runId,
    offer_seq: offerSeq,
    rerolls_used: used + 1,
    rerolls_remaining: maxRerolls - used - 1
  } });
};
const admobSsvConfirm = (ctx, _logger, nk, payload) => {
  let req;
  try {
    req = JSON.parse(payload || "{}");
  } catch (_e) {
    return monetizationError(400, "Invalid JSON");
  }
  const expectedSecret = String(ctx.env.MONETIZATION_VERIFIER_SECRET || "");
  if (!expectedSecret || String(req.verifier_secret || "") !== expectedSecret) return monetizationError(403, "Verifier authorization failed");
  const adSessionId = String(req.ad_session_id || "");
  const userId = String(req.user_id || "");
  const transactionId = String(req.transaction_id || "");
  const adUnit = String(req.ad_unit || "");
  const expectedAdUnit = environmentValue(ctx, "ADMOB_REWARDED_UNIT_ID");
  const expectedAdUnitNumericId = expectedAdUnit.indexOf("/") >= 0 ? expectedAdUnit.substring(expectedAdUnit.lastIndexOf("/") + 1) : expectedAdUnit;
  if (!adSessionId || !userId || !transactionId || !adUnit) return monetizationError(400, "Missing SSV fields");
  if (!expectedAdUnit || adUnit !== expectedAdUnit && adUnit !== expectedAdUnitNumericId) {
    return monetizationError(403, "Unexpected AdMob ad unit");
  }
  let reward;
  if (ctx.env.MULTI_SERVER_ENABLED === "true") {
    const sessions = nk.sqlQuery("SELECT target_server_id,target_generation,status,expires_at<=NOW() AS expired FROM monetization_ad_rewards WHERE ad_session_id=$1 AND user_id=$2", [adSessionId, userId]);
    if (!sessions.length) return monetizationError(404, "Ad session not found");
    if (sessions[0].status === "granted") return JSON.stringify({ status: "success", data: { granted: true, idempotent: true } });
    if (sessions[0].status === "rejected") return JSON.stringify({ status: "success", data: { granted: false, rejected: true } });
    const scope = { accountId: userId, serverId: String(sessions[0].target_server_id), generation: Number(sessions[0].target_generation) };
    const server = validatedServer(nk, { server_id: scope.serverId, generation: scope.generation });
    if (server.error || sessions[0].status === "expired" || sessions[0].status === "prepared" && sessions[0].expired) {
      nk.sqlExec(`INSERT INTO server_financial_inbox(event_id,event_type,user_id,target_server_id,target_generation,payload,reason)
              VALUES($1,'admob_ssv',$2,$3,$4,$5::JSONB,$6) ON CONFLICT DO NOTHING`, [
        "admob:" + transactionId,
        userId,
        scope.serverId,
        scope.generation,
        JSON.stringify({ ad_session_id: adSessionId, user_id: userId, transaction_id: transactionId, ad_unit: adUnit }),
        server.error ? JSON.parse(server.error).reason : "DELIVERY_EXPIRED"
      ]);
      return JSON.stringify({ status: "success", data: { queued: true, granted: false, reconciliation_required: true } });
    }
    try {
      reward = withServerRequest(nk, scope, () => grantPreparedReward(characterRuntime(nk, scope), userId, adSessionId, transactionId));
    } catch (_e) {
      return monetizationError(503, "Server fenced; retry callback");
    }
  } else reward = grantPreparedReward(nk, userId, adSessionId, transactionId);
  return JSON.stringify({ status: reward.granted ? "success" : "error", data: reward });
};
const googlePlayRtdnConfirm = (ctx, _logger, nk, payload) => {
  let req;
  try {
    req = JSON.parse(payload || "{}");
  } catch (_e) {
    return monetizationError(400, "Invalid JSON");
  }
  const expectedSecret = String(ctx.env.MONETIZATION_VERIFIER_SECRET || "");
  if (!expectedSecret || String(req.verifier_secret || "") !== expectedSecret) return monetizationError(403, "Verifier authorization failed");
  const tokenHash = String(req.purchase_token_hash || "");
  if (!tokenHash) return monetizationError(400, "purchase_token_hash is required");
  const revoked = nk.sqlQuery("SELECT void_store_purchase($1) AS purchase", [tokenHash]);
  const row = revoked.length ? parseJsonb(revoked[0].purchase) : null;
  if (!row) return JSON.stringify({ status: "success", data: { changed: false, recorded: true } });
  if (ctx.env.MULTI_SERVER_ENABLED === "true") {
    const entitlement = readEntitlementRow(nk, String(row.user_id));
    mirrorEntitlementStorage(nk, String(row.user_id), { no_ads_expires_at: Number(entitlement.no_ads_expires_at || 0), source: entitlement.source, last_product_id: entitlement.last_product_id, updated_at: Number(entitlement.server_time || 0) });
    return JSON.stringify({ status: "success", data: { changed: true } });
  }
  const response = buildMonetizationResponse(nk, String(row.user_id), "production");
  mirrorEntitlementStorage(nk, String(row.user_id), {
    no_ads_expires_at: response.no_ads.expires_at,
    source: response.no_ads.source,
    last_product_id: response.no_ads.last_product_id,
    updated_at: response.server_time
  });
  return JSON.stringify({ status: "success", data: { changed: true, monetization: response } });
};

function checkinConfig(nk) {
  const config = readContentConfig(nk, "daily_checkin");
  return config && typeof config === "object" ? config : {};
}
function checkinLocalDay(ms) {
  return Math.floor((ms + 7 * 60 * 60 * 1e3) / 864e5);
}
function checkinDayText(day) {
  return new Date(day * 864e5).toISOString().slice(0, 10);
}
function checkinAccountCreatedAtMs(nk, userId, fallback) {
  const scope = nk.__characterContext;
  if (scope) {
    const characters = nk.sqlQuery("SELECT EXTRACT(EPOCH FROM created_at)*1000 AS created_at_ms FROM player_characters WHERE account_id=$1::UUID AND server_id=$2 AND generation=$3", [userId, scope.serverId, scope.generation]);
    return characters.length ? Math.max(0, Number(characters[0].created_at_ms || fallback)) : fallback;
  }
  const rows = nk.sqlQuery("SELECT EXTRACT(EPOCH FROM create_time) * 1000 AS created_at_ms FROM users WHERE id = $1::UUID", [userId]);
  return rows.length > 0 ? Math.max(0, Number(rows[0].created_at_ms || fallback)) : fallback;
}
function checkinCampaigns(config) {
  const definitions = Array.isArray(config.campaigns) && config.campaigns.length > 0 ? config.campaigns : [config];
  return definitions.map((raw) => {
    const campaign = raw && typeof raw === "object" ? raw : {};
    return {
      campaign_id: String(campaign.campaign_id || config.campaign_id || "daily_checkin"),
      title: String(campaign.title || config.title || "\u0110I\u1EC2M DANH"),
      subtitle: String(campaign.subtitle || config.subtitle || ""),
      start_mode: String(campaign.start_mode || config.start_mode || "account_created"),
      starts_at: String(campaign.starts_at || ""),
      ends_at: String(campaign.ends_at || ""),
      duration_days: Math.max(1, Math.floor(Number(campaign.duration_days || config.duration_days || 28))),
      catchup_gem_cost: Math.max(0, Math.floor(Number(campaign.catchup_gem_cost || config.catchup_gem_cost || 50))),
      priority: Math.floor(Number(campaign.priority || 0)),
      days: Array.isArray(campaign.days) && campaign.days.length > 0 ? campaign.days : config.days
    };
  }).filter((campaign) => campaign.campaign_id.length > 0 && Array.isArray(campaign.days) && campaign.days.length > 0);
}
function checkinCampaignStartMs(campaign, accountCreatedAtMs) {
  if (campaign.start_mode === "fixed") {
    const parsed = Date.parse(String(campaign.starts_at || ""));
    return isNaN(parsed) ? 0 : parsed;
  }
  return accountCreatedAtMs;
}
function checkinCampaignWindow(campaign, now, accountCreatedAtMs) {
  const startMs = checkinCampaignStartMs(campaign, accountCreatedAtMs);
  if (startMs <= 0) return { active: false, start_ms: 0, end_ms: 0, open_day: 0 };
  const startDay = checkinLocalDay(startMs);
  const duration = Math.max(1, Number(campaign.duration_days || 28));
  let endMs = (startDay + duration) * 864e5 - 7 * 60 * 60 * 1e3;
  if (campaign.ends_at) {
    const configuredEnd = Date.parse(String(campaign.ends_at));
    if (!isNaN(configuredEnd)) endMs = configuredEnd;
  }
  const openDay = checkinLocalDay(now) - startDay + 1;
  return {
    active: now >= startMs && now < endMs && openDay >= 1 && openDay <= duration,
    start_ms: startMs,
    end_ms: endMs,
    open_day: openDay
  };
}
function checkinSelectCampaign(config, now, accountCreatedAtMs) {
  const active = checkinCampaigns(config).map((campaign) => {
    return { campaign, window: checkinCampaignWindow(campaign, now, accountCreatedAtMs) };
  }).filter((entry) => entry.window.active);
  active.sort((a, b) => Number(b.campaign.priority) - Number(a.campaign.priority) || Number(b.window.start_ms) - Number(a.window.start_ms));
  return active.length > 0 ? active[0] : null;
}
function checkinStorageKey(campaignId) {
  return ("campaign_" + campaignId.replace(/[^A-Za-z0-9_.-]/g, "_")).slice(0, 120);
}
function checkinState(source, campaignId, startMs) {
  const raw = source && typeof source === "object" ? source : {};
  const claimed = Array.isArray(raw.claimed_days) ? raw.claimed_days : [];
  return {
    campaign_id: campaignId,
    started_at_ms: startMs,
    claimed_days: claimed.map((d) => Math.floor(Number(d))).filter((d, index, all) => d > 0 && all.indexOf(d) === index),
    last_claim_date: String(raw.last_claim_date || ""),
    last_free_claim_date: String(raw.last_free_claim_date || "")
  };
}
function checkinStatusFor(state, campaign, window) {
  const duration = Math.max(1, Math.floor(Number(campaign.duration_days || campaign.days.length || 28)));
  const openDay = Number(window.open_day || 0);
  const claimed = state.claimed_days.slice().sort((a, b) => a - b);
  let earliestMissedDay = 0;
  for (let day = 1; day < openDay && day <= duration; day++) {
    if (claimed.indexOf(day) < 0) {
      earliestMissedDay = day;
      break;
    }
  }
  const todayClaimed = openDay >= 1 && openDay <= duration && claimed.indexOf(openDay) >= 0;
  return {
    active: Boolean(window.active),
    campaign_id: campaign.campaign_id,
    campaign_title: campaign.title,
    campaign_subtitle: campaign.subtitle,
    duration_days: duration,
    started_at_ms: Number(window.start_ms),
    ends_at_ms: Number(window.end_ms),
    today_day: Math.max(0, Math.min(openDay, duration)),
    claimed_days: claimed,
    earliest_missed_day: earliestMissedDay,
    can_claim_today: Boolean(window.active) && !todayClaimed,
    can_catchup: Boolean(window.active) && earliestMissedDay > 0,
    catchup_gem_cost: campaign.catchup_gem_cost,
    last_claim_date: String(state.last_claim_date || ""),
    last_free_claim_date: String(state.last_free_claim_date || ""),
    days: campaign.days
  };
}
function checkinGrantItem(items, itemId, amount) {
  if (!itemId || amount <= 0) return false;
  const existing = items.find((entry) => entry && String(entry.item_id || "") === itemId && entry.unique !== true);
  if (existing) existing.quantity = Math.max(0, Number(existing.quantity || 0)) + amount;
  else items.push({ item_id: itemId, quantity: amount, acquired_at: (/* @__PURE__ */ new Date()).toISOString() });
  return true;
}
function checkinApplyGrants(nk, profile, items, grants) {
  const issued = [];
  for (const raw of grants) {
    if (!raw || typeof raw !== "object") return null;
    const type = String(raw.type || "");
    const amount = Math.max(0, Math.floor(Number(raw.amount || 0)));
    if (amount <= 0) return null;
    if (type === "resource") {
      const id = String(raw.id || "");
      if (id !== "gold" && id !== "gems") return null;
      profile.resources = profile.resources || {};
      profile.resources[id] = Math.max(0, Number(profile.resources[id] || 0)) + amount;
      issued.push({ type, id, amount });
    } else if (type === "stamina") {
      profile.stamina = Math.max(Number(profile.stamina || 0), Math.min(30, Math.max(0, Number(profile.stamina || 0)) + amount));
      issued.push({ type, amount });
    } else if (type === "item" || type === "random_item") {
      let itemId = String(raw.id || "");
      if (type === "random_item") {
        const pool = Array.isArray(raw.pool) ? raw.pool : [];
        if (pool.length === 0) return null;
        itemId = String(pool[Math.floor(Math.random() * pool.length)] || "");
      }
      if (!itemId || nk.sqlQuery("SELECT id FROM game_items WHERE id = $1", [itemId]).length === 0) return null;
      if (!checkinGrantItem(items, itemId, amount)) return null;
      issued.push({ type: "item", id: itemId, amount });
    } else return null;
  }
  return issued;
}
function checkinReadState(nk, userId, campaign, window) {
  const key = checkinStorageKey(campaign.campaign_id);
  const requests = [{ collection: "player_daily_checkin", key, userId }];
  if (campaign.start_mode === "account_created") requests.push({ collection: "player_daily_checkin", key: "campaign", userId });
  const objects = nk.storageRead(requests);
  const current = objects.find((entry) => entry.key === key);
  const legacy = objects.find((entry) => entry.key === "campaign");
  const source = current ? current.value : legacy ? legacy.value : {};
  return { key, object: current, state: checkinState(source, campaign.campaign_id, window.start_ms) };
}
const dailyCheckinStatus = (ctx, _logger, nk, _payload) => {
  const config = checkinConfig(nk);
  const now = Date.now();
  const accountCreatedAtMs = checkinAccountCreatedAtMs(nk, ctx.userId, now);
  const selected = checkinSelectCampaign(config, now, accountCreatedAtMs);
  if (!selected) return JSON.stringify({ success: true, active: false, campaign_id: "", claimed_days: [], days: [] });
  const stored = checkinReadState(nk, ctx.userId, selected.campaign, selected.window);
  if (!stored.object) {
    const created = nk.storageWrite([{
      collection: "player_daily_checkin",
      key: stored.key,
      userId: ctx.userId,
      value: stored.state,
      permissionRead: 1,
      permissionWrite: 0,
      version: "*"
    }]);
    if (created.length !== 1) return JSON.stringify({ success: false, active: false, message: "Could not initialize check-in campaign" });
  }
  return JSON.stringify(Object.assign({ success: true }, checkinStatusFor(stored.state, selected.campaign, selected.window)));
};
const dailyCheckinClaim = (ctx, _logger, nk, payload) => {
  let req = {};
  try {
    req = JSON.parse(payload || "{}");
  } catch (_e) {
    return JSON.stringify({ success: false, message: "Invalid request" });
  }
  const config = checkinConfig(nk);
  const now = Date.now();
  const accountCreatedAtMs = checkinAccountCreatedAtMs(nk, ctx.userId, now);
  const selected = checkinSelectCampaign(config, now, accountCreatedAtMs);
  if (!selected) return JSON.stringify({ success: false, message: "No check-in campaign is active", active: false });
  if (req.campaign_id && String(req.campaign_id) !== selected.campaign.campaign_id) {
    return JSON.stringify({ success: false, message: "Check-in campaign has changed; refresh and try again" });
  }
  const objects = nk.storageRead([
    { collection: "player_profiles", key: "main", userId: ctx.userId },
    { collection: "player_inventory", key: "items", userId: ctx.userId }
  ]);
  const profileObject = objects.find((o) => o.collection === "player_profiles");
  const inventoryObject = objects.find((o) => o.collection === "player_inventory");
  if (!profileObject || !inventoryObject) return JSON.stringify({ success: false, message: "Player data is incomplete" });
  const stored = checkinReadState(nk, ctx.userId, selected.campaign, selected.window);
  const state = stored.state;
  const status = checkinStatusFor(state, selected.campaign, selected.window);
  const requestedDay = Math.floor(Number(req.day || 0));
  if (requestedDay <= 0 || requestedDay > status.today_day) return JSON.stringify({ success: false, message: "Reward is not available yet", state: status });
  if (status.claimed_days.indexOf(requestedDay) >= 0) return JSON.stringify({ success: false, message: "Reward was already claimed", state: status });
  let claimMode = "";
  if (requestedDay === status.today_day && status.can_claim_today) claimMode = "free";
  else if (requestedDay === status.earliest_missed_day && status.can_catchup) claimMode = "catchup";
  else return JSON.stringify({ success: false, message: "Earlier missed rewards must be claimed first", state: status });
  const day = selected.campaign.days.find((entry) => Math.floor(Number(entry.day)) === requestedDay);
  if (!day || !Array.isArray(day.grants)) return JSON.stringify({ success: false, message: "Invalid reward configuration" });
  const profile = profileObject.value || {};
  const inventoryValue = inventoryObject.value || { items: [] };
  const items = Array.isArray(inventoryValue.items) ? inventoryValue.items : [];
  const cost = claimMode === "catchup" ? status.catchup_gem_cost : 0;
  profile.resources = profile.resources || {};
  if (Number(profile.resources.gems || 0) < cost) return JSON.stringify({ success: false, message: "Not enough gems for catch-up", gem_cost: cost, state: status });
  profile.resources.gems = Math.max(0, Number(profile.resources.gems || 0) - cost);
  const grants = checkinApplyGrants(nk, profile, items, day.grants);
  if (!grants) return JSON.stringify({ success: false, message: "Invalid reward configuration" });
  const claimDate = checkinDayText(checkinLocalDay(now));
  const nextState = {
    campaign_id: selected.campaign.campaign_id,
    started_at_ms: selected.window.start_ms,
    claimed_days: status.claimed_days.concat([requestedDay]),
    last_claim_date: claimDate,
    last_free_claim_date: cost === 0 ? claimDate : state.last_free_claim_date
  };
  inventoryValue.items = items;
  const writes = nk.storageWrite([
    { collection: "player_profiles", key: "main", userId: ctx.userId, value: profile, permissionRead: 1, permissionWrite: 0, version: profileObject.version },
    { collection: "player_inventory", key: "items", userId: ctx.userId, value: inventoryValue, permissionRead: 1, permissionWrite: 0, version: inventoryObject.version },
    { collection: "player_daily_checkin", key: stored.key, userId: ctx.userId, value: nextState, permissionRead: 1, permissionWrite: 0, version: stored.object ? stored.object.version : "*" }
  ]);
  if (writes.length !== 3) return JSON.stringify({ success: false, message: "Could not persist check-in reward" });
  const persisted = nk.storageRead([{ collection: "player_daily_checkin", key: stored.key, userId: ctx.userId }]);
  if (persisted.length !== 1 || !Array.isArray(persisted[0].value.claimed_days) || persisted[0].value.claimed_days.indexOf(requestedDay) < 0) {
    return JSON.stringify({ success: false, message: "Check-in reward was not persisted" });
  }
  return JSON.stringify({
    success: true,
    day: requestedDay,
    campaign_id: selected.campaign.campaign_id,
    claim_mode: claimMode,
    gem_cost: cost,
    grants,
    profile,
    inventory: items,
    state: checkinStatusFor(nextState, selected.campaign, selected.window)
  });
};

function cpObject(value) {
  if (typeof parseJsonb === "function") value = parseJsonb(value);
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch (_) {
      return {};
    }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function cpArray(value) {
  if (typeof parseJsonb === "function") value = parseJsonb(value);
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch (_) {
      return [];
    }
  }
  return Array.isArray(value) ? value : [];
}
function cpNumber(value, fallback = 0) {
  const number = Number(value);
  return value === void 0 || value === null || !isFinite(number) ? fallback : number;
}
function cpClamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}
function cpRound(value) {
  return Math.floor(value + 0.5);
}
function cpHeroAttributes(hero, level, progression) {
  const result = JSON.parse(JSON.stringify(cpObject(hero.attributes)));
  const growth = cpObject(hero.level_up_stats);
  const cap = cpNumber(cpObject(progression.persistent_leveling).max_hero_level, 1);
  const multiplicative = ["hp", "atk", "def", "move_speed", "attack_speed", "attack_range"];
  for (let i = 1; i < cpClamp(Math.floor(level), 1, cap); i++) {
    for (const key of Object.keys(growth)) result[key] = multiplicative.indexOf(key) >= 0 ? cpNumber(result[key]) * cpNumber(growth[key]) : cpNumber(result[key]) + cpNumber(growth[key]);
  }
  return result;
}
function cpAmplification(level, progression) {
  level = cpClamp(Math.floor(level), 0, cpNumber(cpObject(progression.element_upgrade).max_level));
  for (const tier of cpArray(cpObject(progression.element_combat).level_amplification_tiers)) {
    if (level >= tier.level_min && level <= tier.level_max) return cpNumber(tier.base_pct) + (level - cpNumber(tier.base_level)) * cpNumber(tier.per_level_pct);
  }
  return 0;
}
function cpDurability(item, cfg) {
  const durability = cpClamp(cpNumber(item.durability, 100), 0, 100);
  for (const tier of cpArray(cfg.durability_tiers)) if (durability <= tier.max) return cpNumber(tier.factor);
  return 1;
}
function cpEquipped(inventory, items) {
  const result = [], seen = {};
  for (const item of inventory) {
    if (!item || item.is_equipped !== true || cpNumber(item.quantity, 1) <= 0) continue;
    const definition = items.find((def) => def.id === item.item_id && def.category === "talisman");
    if (!definition) continue;
    const key = String(item.instance_id || item.item_id);
    if (seen[key]) continue;
    seen[key] = true;
    const attrs = cpObject(definition.attributes), stats = {};
    const source = cpObject(item.current_stats);
    if (Object.keys(source).length) Object.assign(stats, source);
    else {
      const rolled = cpObject(item.base_rolled_stats), base = Object.keys(rolled).length ? rolled : cpObject(attrs.base_stats);
      Object.assign(stats, base);
      const growth = cpObject(attrs.stat_growth);
      const level = cpClamp(Math.floor(cpNumber(item.level, 1)), 1, cpNumber(attrs.max_level, 30));
      for (const stat of Object.keys(growth)) stats[stat] = cpNumber(stats[stat]) + (level - 1) * cpNumber(growth[stat]);
    }
    result.push(Object.assign({}, attrs, item, { stats, skill_id: String(attrs.skill_id || ""), element: String(attrs.element || "") }));
  }
  return result;
}
function cpApplyEquipment(attributes, equipped, cfg, elementCfg) {
  const result = Object.assign({}, attributes);
  for (const item of equipped) {
    const factor = cpDurability(item, cfg), s = item.stats;
    for (const stat of ["hp", "atk", "def", "spirit"]) result[stat] = cpNumber(result[stat]) + cpNumber(s[stat]) * factor;
    result.attack_speed = (cpNumber(result.attack_speed) + (cpNumber(s.attack_speed) + cpNumber(s.spd)) * factor) * (1 + cpNumber(s.speed_pct) * factor * 0.01);
    result.skill_cooldown_mul = Math.max(cpNumber(cfg.cooldown_multiplier_floor), cpNumber(result.skill_cooldown_mul, 1) * (1 - Math.max(0, cpNumber(s.cooldown_reduction_pct)) * factor * 0.01));
    result.dodge_rate = cpClamp(cpNumber(result.dodge_rate) + Math.max(0, cpNumber(s.dodge_rate)) * factor, 0, cpNumber(cfg.dodge_cap));
    result.element_resist_pct = cpClamp(cpNumber(result.element_resist_pct) + Math.max(0, cpNumber(s.element_resist_pct)) * factor, 0, cpNumber(elementCfg.talisman_resistance_cap_pct));
    result.attack_range = cpNumber(result.attack_range) * (1 + Math.max(0, cpNumber(s.skill_range_bonus_pct)) * factor * 0.01);
  }
  return result;
}
function cpSkillData(id, level, skills) {
  const skill = skills.find((s) => s.id === id);
  if (!skill) return {};
  const levels = cpArray(skill.levels);
  if (!levels.length) return {};
  const entry = levels[cpClamp(Math.floor(level) - 1, 0, levels.length - 1)];
  return Object.assign({}, cpObject(entry.stats), cpObject(skill.cast_config), cpObject(entry.cast_config), { passive: skill.skill_class === "passive" });
}
function cpSkillCasts(stats, cooldownMul, cfg, item = null) {
  const horizon = cpNumber(cfg.horizon_seconds);
  if (item && cpNumber(item.durability, 100) <= 0) return 0;
  if (stats.passive) return horizon / Math.max(cpNumber(cfg.minimum_cooldown), cpNumber(stats.contact_cooldown), cpNumber(stats.revolution_duration, 1) / Math.max(1, cpNumber(stats.orb_count, 1)));
  let casts = horizon / Math.max(cpNumber(cfg.minimum_cooldown), cpNumber(stats.cooldown, 1) * cooldownMul);
  if (item) {
    casts = Math.min(casts, Math.max(0, cpNumber(item.max_battle_uses)));
    const cost = cpNumber(item.durability_cost_per_cast);
    if (cost > 0) casts = Math.min(casts, Math.ceil(cpNumber(item.durability, 100) / cost));
  }
  return casts;
}
function cpSkillDps(id, level, atk, crit, cooldownMul, skills, cfg, item = null) {
  const stats = cpSkillData(id, level, skills);
  if (!Object.keys(stats).length) return 0;
  const override = cpObject(cpObject(cfg.skill_overrides)[id]);
  let damage = 0;
  for (const key of Object.keys(cpObject(cfg.skill_hit_weights))) damage += Math.max(0, cpNumber(stats[key])) * cpNumber(cfg.skill_hit_weights[key]);
  if (stats.center_damage_pct !== void 0) damage = cpNumber(stats.center_damage_pct) * cpNumber(override.center_hit_weight, 0.5) + cpNumber(stats.damage_per_slash_pct) * (1 - cpNumber(override.center_hit_weight, 0.5));
  if (stats.damage_min_pct !== void 0) damage = (cpNumber(stats.damage_min_pct) + cpNumber(stats.damage_max_pct)) * 0.5;
  if (Array.isArray(stats.damage_pct_by_shot)) damage = stats.damage_pct_by_shot.reduce((sum, v) => sum + cpNumber(v), 0);
  damage *= Math.max(1, cpNumber(stats.strike_count, 1));
  damage *= cpNumber(override.damage_multiplier, 1);
  const projectiles = override.projectile_base !== void 0 ? cpNumber(override.projectile_base) + Math.floor((Math.max(1, level) - 1) / Math.max(1, cpNumber(override.projectile_level_interval))) : Math.max(1, cpNumber(stats.projectile_count, 1));
  damage *= 1 + (projectiles - 1) * cpNumber(override.projectile_factor, 1);
  return atk * crit * damage * 0.01 * cpSkillCasts(stats, cooldownMul, cfg, item) / cpNumber(cfg.horizon_seconds);
}
function cpEvaluate(hero, level, affinities, roots, equipped, skills, progression) {
  const cfg = progression.combat_power, ec = progression.element_combat;
  const a = cpApplyEquipment(cpHeroAttributes(hero, level, progression), equipped, cfg, ec);
  const crit = 1 + cpClamp(cpNumber(a.crit_rate), 0, 1) * (cpClamp(cpNumber(a.crit_damage, 1), 1, cpNumber(cfg.crit_damage_cap)) - 1);
  const element = String(hero.element || ""), amp = cpAmplification(cpNumber(roots[element]), progression);
  const attackMultiplier = 1 + Math.max(0, cpNumber(affinities[element])) * amp * 1e-4;
  const atk = Math.max(0, cpNumber(a.atk));
  let dps = hero.auto_basic_attack === false ? 0 : atk * Math.max(0, cpNumber(a.attack_speed)) * cpNumber(cfg.basic_damage_multiplier) * crit;
  for (const id of cpArray(hero.starting_skills)) dps += cpSkillDps(String(id), 1, atk, crit, cpNumber(a.skill_cooldown_mul, 1), skills, cfg);
  dps *= attackMultiplier;
  if (equipped.length) {
    const item = equipped[0];
    dps += cpSkillDps(item.skill_id, cpNumber(item.level, 1), atk, crit, cpNumber(a.skill_cooldown_mul, 1), skills, cfg, item) * attackMultiplier;
  }
  let incoming = 0;
  const elements = cpArray(ec.supported_elements);
  for (const incomingElement of elements) {
    const resist = cpNumber(ec.affinity_resistance_ratio) * Math.max(0, cpNumber(affinities[incomingElement])) * (1 + cpAmplification(cpNumber(roots[incomingElement]), progression) * 0.01);
    const counter = cpNumber(cpObject(cpObject(ec.matchup_modifier_pct)[incomingElement])[element]);
    incoming += 1 + Math.max(cpNumber(ec.modifier_floor_pct), counter - resist - cpNumber(a.element_resist_pct)) * 0.01;
  }
  incoming /= Math.max(1, elements.length);
  let defenseValue = Math.max(0, cpNumber(a.def)), healing = 0;
  if (equipped.length) {
    const item = equipped[0], stats = cpSkillData(item.skill_id, cpNumber(item.level, 1), skills);
    const casts = cpSkillCasts(stats, cpNumber(a.skill_cooldown_mul, 1), cfg, item);
    const uptime = Math.min(1, casts * cpNumber(stats.duration) / cpNumber(cfg.horizon_seconds));
    healing = casts * atk * cpNumber(stats.heal_atk_pct) * 0.01;
    for (const effect of cpArray(stats.effects)) {
      defenseValue += (cpNumber(a.def) * cpNumber(effect.defense_percent) + cpNumber(effect.defense_flat)) * uptime;
      healing += cpNumber(a.hp) * cpNumber(effect.hp_percent_per_sec) * cpNumber(stats.duration) * casts;
    }
  }
  const defense = Math.max(cpNumber(cfg.min_defense_multiplier), 1 - defenseValue / Math.max(1, cpNumber(ec.defense_divisor)));
  const regen = cpClamp(cpNumber(a.regen_percent_per_10s), 0, cpNumber(cfg.regen_cap));
  const hp = Math.max(0, cpNumber(a.hp)) * (1 + regen * cpNumber(cfg.horizon_seconds) / 10) + healing;
  const ehp = hp / (Math.max(cpNumber(cfg.min_defense_multiplier), incoming) * defense * (1 - cpClamp(cpNumber(a.dodge_rate), 0, cpNumber(cfg.dodge_cap))));
  const offense = dps * cpNumber(cfg.offense_weight), survival = ehp * cpNumber(cfg.survival_weight);
  const utility = Math.max(0, cpNumber(a.move_speed)) * cpNumber(cfg.movement_weight) + Math.max(0, cpNumber(a.attack_range)) * cpNumber(cfg.range_weight);
  return { score: cpRound(offense + survival + utility), offense, survival, utility };
}
function calculateCombatPower(profile, states, inventory, heroes, skills, progression, items) {
  const cfg = cpObject(progression.combat_power);
  const result = { version: cpNumber(cfg.version), configured: false, score: 0, hero_id: "", heroes: [] };
  if (cfg.version !== 2 || !(cfg.horizon_seconds > 0) || !(cfg.offense_weight > 0) || !(cfg.survival_weight > 0) || !(cfg.min_defense_multiplier > 0 && cfg.min_defense_multiplier <= 1) || !(cfg.minimum_cooldown > 0) || !(cfg.dodge_cap >= 0 && cfg.dodge_cap < 1) || !cpArray(cpObject(progression.element_combat).supported_elements).length) return result;
  result.configured = true;
  const equipped = cpEquipped(inventory, items), affinities = cpObject(profile.element_affinities), roots = cpObject(profile.elements);
  for (const hero of heroes) {
    const state = states.find((s) => s && s.hero_id === hero.id);
    const price = cpObject(hero.price), owned = state ? state.owned === true : cpNumber(price.gold) <= 0 && cpNumber(price.gems) <= 0;
    if (!owned) continue;
    const level = cpNumber(state && state.level, 1);
    const base = cpEvaluate(hero, level, {}, {}, [], skills, progression);
    const innate = cpEvaluate(hero, level, affinities, {}, [], skills, progression);
    const root = cpEvaluate(hero, level, affinities, roots, [], skills, progression);
    const full = cpEvaluate(hero, level, affinities, roots, equipped, skills, progression);
    full.hero_id = hero.id;
    full.breakdown = { hero: base.score, talent: innate.score - base.score, roots: root.score - innate.score, talisman: full.score - root.score };
    result.heroes.push(full);
    if (!result.hero_id || full.score > result.score) {
      result.score = full.score;
      result.hero_id = hero.id;
    }
  }
  return result;
}
function readCombatPowerCatalog(nk) {
  const config = nk.sqlQuery("SELECT value FROM game_config WHERE key='progression'", []);
  return {
    progression: config.length ? cpObject(config[0].value) : {},
    heroes: nk.sqlQuery("SELECT id, element, auto_basic_attack, price, attributes, level_up_stats, starting_skills FROM game_heroes ORDER BY id", []),
    skills: nk.sqlQuery("SELECT id, levels, cast_config, skill_class FROM game_skills ORDER BY id", []),
    items: nk.sqlQuery("SELECT id, category, attributes FROM game_items WHERE category='talisman' ORDER BY id", [])
  };
}
function readPlayerCombatPower(nk, userId, profile, catalog) {
  const stored = nk.storageRead([{ collection: "player_heroes", key: "states", userId }, { collection: "player_inventory", key: "items", userId }]);
  const hero = stored.find((s) => s.collection === "player_heroes"), inventory = stored.find((s) => s.collection === "player_inventory");
  const result = calculateCombatPower(profile, cpArray(hero && hero.value && hero.value.heroes), cpArray(inventory && inventory.value && inventory.value.items), catalog.heroes, catalog.skills, catalog.progression, catalog.items);
  if (!result.configured) throw Error("C118 combat power config missing; deploy progression.combat_power before syncing");
  return result;
}

var __defProp = Object.defineProperty;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
function getLeaderboardRealmTitle(level) {
  const safeLvl = Math.max(1, Math.min(50, Math.floor(level)));
  const tier = Math.max(1, Math.min(10, (safeLvl - 1) % 10 + 1));
  if (safeLvl >= 41) return `H\xF3a Th\u1EA7n T\u1EA7ng ${tier}`;
  if (safeLvl >= 31) return `Nguy\xEAn Anh T\u1EA7ng ${tier}`;
  if (safeLvl >= 21) return `K\u1EBFt \u0110an T\u1EA7ng ${tier}`;
  if (safeLvl >= 11) return `Tr\xFAc C\u01A1 T\u1EA7ng ${tier}`;
  return `Luy\u1EC7n Kh\xED T\u1EA7ng ${tier}`;
}
function formatThousandsNumber(num) {
  return Math.floor(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
function formatLeaderboardScore(boardId, score, meta) {
  if (boardId === "cultivation_realm") {
    return meta && meta.realm ? String(meta.realm) : getLeaderboardRealmTitle(score);
  } else if (boardId === "campaign_stage") {
    return `\u1EA2i ${score}`;
  } else {
    return formatThousandsNumber(score);
  }
}
function combatPowerBoard(id) {
  return id === "combat_power" ? "combat_power_v2" : id;
}
function syncAllStoredProfilesToLeaderboards(nk, logger) {
  if (nk.__characterContext) throw new Error("Use a server-scoped rebuild job instead of scanning every profile");
  try {
    const rows = nk.sqlQuery(
      "SELECT s.user_id, COALESCE(NULLIF(u.display_name, ''), u.username, '\u0110\u1EA1o H\u1EEFu') as username FROM storage s LEFT JOIN users u ON s.user_id = u.id WHERE s.collection = 'player_profiles' AND s.key = 'main' AND NOT EXISTS (SELECT 1 FROM account_link_state als WHERE als.user_id=s.user_id AND als.status='archived')",
      []
    );
    if (!rows || rows.length === 0) return 0;
    const reads = [];
    const usernameMap = {};
    for (const r of rows) {
      const uid = String(r.user_id || "");
      if (!uid || uid.startsWith("00000000")) continue;
      reads.push({ collection: "player_profiles", key: "main", userId: uid });
      usernameMap[uid] = String(r.username || "\u0110\u1EA1o H\u1EEFu");
    }
    const objects = nk.storageRead(reads);
    let count = 0;
    for (const obj of objects) {
      const userId = obj.userId;
      const profile = obj.value || {};
      const displayName = String(profile.display_name || usernameMap[userId] || "\u0110\u1EA1o H\u1EEFu");
      writePlayerLeaderboardRecords(nk, userId, profile, displayName, false);
      count++;
    }
    logger.info(`Synced ${count} real player profiles from DB to leaderboards.`);
    return count;
  } catch (err) {
    logger.warn("syncAllStoredProfilesToLeaderboards error: " + String(err.message || err));
    return -1;
  }
}
function writePlayerLeaderboardRecords(nk, userId, profile, displayName, weeklyActive = true) {
  const level = Math.max(1, Math.min(50, Number(profile.level || 1)));
  const vip = Number(profile.vip || (profile.vip_progress ? profile.vip_progress.level : 0) || 0);
  const heroId = String(profile.avatar_url || "hero_1");
  let name = String(displayName || profile.display_name || "").trim();
  if (!name) {
    try {
      const acc = nk.accountGetId(userId);
      name = acc && acc.user && (acc.user.displayName || acc.user.username) ? acc.user.displayName || acc.user.username : "\u0110\u1EA1o H\u1EEFu";
    } catch (_e) {
      name = "\u0110\u1EA1o H\u1EEFu";
    }
  }
  let highestStage = 1;
  if (Array.isArray(profile.unlocked_stages)) {
    highestStage = Math.max(1, profile.unlocked_stages.length);
  }
  let power = { score: 0, version: 2, hero_id: heroId };
  const catalog = readCombatPowerCatalog(nk);
  power = readPlayerCombatPower(nk, userId, profile, catalog);
  if (!power || power.configured !== true || !Number.isSafeInteger(power.score) || power.score < 0) {
    throw new Error("Combat power configuration unavailable");
  }
  const combatPower = Number(power.score || 0);
  const realmTitle = getLeaderboardRealmTitle(level);
  const metadata = {
    display_name: name,
    avatar_url: heroId,
    hero_id: heroId,
    vip,
    level,
    realm: realmTitle,
    stage: highestStage,
    combat_power: combatPower,
    power_version: power.version,
    power_hero_id: power.hero_id
  };
  nk.leaderboardRecordWrite("cultivation_realm", userId, name, level, 0, metadata);
  nk.leaderboardRecordWrite("campaign_stage", userId, name, highestStage, 0, metadata);
  nk.leaderboardRecordWrite("combat_power_v2", userId, name, combatPower, 0, metadata);
  if (weeklyActive && typeof recordWeeklyLeaderboardScores === "function") {
    recordWeeklyLeaderboardScores(nk, userId, name, { cultivation_realm: level, campaign_stage: highestStage, combat_power: combatPower });
  }
  return { metadata, power, level, highestStage, combatPower, name };
}
const syncPlayerLeaderboards = (ctx, logger, nk, _payload) => {
  if (!ctx.userId) return JSON.stringify({ success: false, code: 401, message: "Unauthorized" });
  const stored = nk.storageRead([{ collection: "player_profiles", key: "main", userId: ctx.userId }]);
  if (!stored || stored.length === 0) {
    return JSON.stringify({ success: false, code: 404, message: "Profile not found" });
  }
  const profile = stored[0].value || {};
  const displayName = String(profile.display_name || ctx.username || "\u0110\u1EA1o H\u1EEFu");
  let result;
  try {
    result = writePlayerLeaderboardRecords(nk, ctx.userId, profile, displayName);
  } catch (e) {
    if (logger && logger.error) logger.error("Failed to write leaderboard records: " + String(e.message || e));
    return JSON.stringify({ success: false, code: 503, message: "Leaderboard sync unavailable; please retry" });
  }
  return JSON.stringify({
    success: true,
    scores: {
      cultivation_realm: result.level,
      campaign_stage: result.highestStage,
      combat_power: result.combatPower
    },
    metadata: result.metadata,
    combat_power_detail: result.power
  });
};
const getLeaderboardRecords = (ctx, logger, nk, payload) => {
  let req = {};
  try {
    req = JSON.parse(payload || "{}");
  } catch (_e) {
  }
  const boardId = String(req.board_id || "cultivation_realm");
  const limit = Math.min(50, Math.max(1, Number(req.limit || 20)));
  let topList;
  try {
    topList = nk.leaderboardRecordsList(combatPowerBoard(boardId), [], limit, "", 0);
  } catch (e) {
    logger.warn(`Failed to list leaderboard ${boardId}: ` + String(e.message || e));
    return JSON.stringify({ success: false, code: 500, message: "Cannot load leaderboard" });
  }
  const records = [];
  if (topList && Array.isArray(topList.records)) {
    for (const r of topList.records) {
      const meta = r.metadata || {};
      const displayName = meta && meta.display_name ? String(meta.display_name) : r.username || "\u0110\u1EA1o H\u1EEFu";
      records.push({
        rank: r.rank,
        user_id: r.ownerId,
        username: displayName,
        hero_id: meta.hero_id || meta.avatar_url || "hero_1",
        avatar_url: meta.avatar_url || meta.hero_id || "hero_1",
        vip: Number(meta.vip || 0),
        level: Number(meta.level || r.score),
        score: r.score,
        display_score: formatLeaderboardScore(boardId, r.score, meta)
      });
    }
  }
  let myRecord = null;
  if (ctx.userId) {
    try {
      const topMatch = records.find((r) => r.user_id === ctx.userId);
      if (topMatch && Number(topMatch.rank || 0) > 0) {
        myRecord = __spreadValues({}, topMatch);
      } else {
        let rawRec = null;
        try {
          const haystack = nk.leaderboardRecordsHaystack ? nk.leaderboardRecordsHaystack(combatPowerBoard(boardId), ctx.userId, 1, 0) : null;
          if (haystack && haystack.length > 0) {
            rawRec = haystack.find((h) => h.ownerId === ctx.userId) || null;
          }
        } catch (_hErr) {
        }
        if (!rawRec) {
          const userList = nk.leaderboardRecordsList(combatPowerBoard(boardId), [ctx.userId], 1, "", 0);
          rawRec = cpArray(userList.ownerRecords).concat(cpArray(userList.records)).find((r) => r.ownerId === ctx.userId) || null;
        }
        if (rawRec) {
          const meta = rawRec.metadata || {};
          const myDisplayName = meta && meta.display_name ? String(meta.display_name) : rawRec.username || "\u0110\u1EA1o H\u1EEFu";
          let computedRank = Number(rawRec.rank || 0);
          if (computedRank <= 0) {
            const nameMatch = records.find((r) => r.user_id === ctx.userId);
            if (nameMatch && Number(nameMatch.rank || 0) > 0) {
              computedRank = nameMatch.rank;
            }
          }
          myRecord = {
            rank: computedRank,
            user_id: rawRec.ownerId,
            username: myDisplayName,
            hero_id: meta.hero_id || meta.avatar_url || "hero_1",
            avatar_url: meta.avatar_url || meta.hero_id || "hero_1",
            vip: Number(meta.vip || 0),
            level: Number(meta.level || rawRec.score),
            score: rawRec.score,
            display_score: formatLeaderboardScore(boardId, rawRec.score, meta)
          };
        }
      }
    } catch (_err) {
    }
  }
  return JSON.stringify({
    success: true,
    board_id: boardId,
    power_version: combatPowerBoard(boardId) === "combat_power_v2" ? 2 : void 0,
    records,
    my_record: myRecord
  });
};
const gatedSyncPlayerLeaderboards = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, syncPlayerLeaderboards);
const gatedGetLeaderboardRecords = (ctx, logger, nk, payload) => invokeWithVersionGate(ctx, logger, nk, payload, getLeaderboardRecords);
const rpcSyncAllLeaderboards = (_ctx, logger, nk, _payload) => {
  const count = syncAllStoredProfilesToLeaderboards(nk, logger);
  return count < 0 ? JSON.stringify({ success: false, code: 503, message: "Leaderboard backfill incomplete; inspect server config/logs" }) : JSON.stringify({ success: true, synced: count, message: "All profiles synced to leaderboards" });
};

function createLeaderboards(nk, logger) {
  try {
    nk.leaderboardCreate("best_wave", false, "desc", "best", "", {});
    nk.leaderboardCreate("most_kills", false, "desc", "best", "", {});
    nk.leaderboardCreate("total_wins", false, "desc", "incr", "", {});
    nk.leaderboardCreate("cultivation_realm", false, "desc", "best", "", {});
    nk.leaderboardCreate("campaign_stage", false, "desc", "best", "", {});
    nk.leaderboardCreate("combat_power_v2", true, "desc", "set", "0 0 * * 1", { power_version: 2 });
    if (typeof syncAllStoredProfilesToLeaderboards === "function") {
      syncAllStoredProfilesToLeaderboards(nk, logger);
    }
    logger.info("Leaderboards created and initialized with real database users.");
  } catch (e) {
    logger.info("Leaderboards already exist or failed: " + String(e.message || e));
  }
}

var __defProp = Object.defineProperty;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
const WEEKLY_BOARDS = ["cultivation_realm", "campaign_stage", "combat_power"];
function validWeeklyLeaderboardConfig(cfg) {
  if (!cfg || cfg.schema_version !== 1 || typeof cfg.enabled !== "boolean" || !Number.isSafeInteger(cfg.claim_days) || cfg.claim_days < 1 || cfg.claim_days > 90 || !cfg.boards || typeof cfg.boards !== "object" || Array.isArray(cfg.boards) || Object.keys(cfg.boards).some((id) => WEEKLY_BOARDS.indexOf(id) < 0)) return false;
  for (const id of WEEKLY_BOARDS) {
    const board = cfg.boards[id];
    if (!board || typeof board.enabled !== "boolean" || !Array.isArray(board.tiers) || board.tiers.length !== 13) return false;
    let next = 1;
    for (let i = 0; i < board.tiers.length; i++) {
      const tier = board.tiers[i], end = i < 10 ? i + 1 : [50, 200, 500][i - 10];
      if (!tier || tier.from !== next || tier.to !== end || !Array.isArray(tier.rewards) || !tier.rewards.length || tier.rewards.length > 8) return false;
      next = end + 1;
      for (const reward of tier.rewards) {
        if (!reward || !Number.isSafeInteger(reward.amount) || reward.amount <= 0 || reward.amount > 1e7) return false;
        if (reward.type === "resource") {
          if (["gold", "gems"].indexOf(reward.id) < 0) return false;
        } else if (reward.type === "item") {
          if (typeof reward.id !== "string" || !/^[a-z0-9_]{1,100}$/.test(reward.id) || reward.amount > 1e3) return false;
        } else if (reward.type === "random_item") {
          if (!Array.isArray(reward.pool) || !reward.pool.length || reward.pool.length > 128 || reward.amount > 1e3 || reward.pool.some((item) => typeof item !== "string" || !/^[a-z0-9_]{1,100}$/.test(item))) return false;
        } else return false;
      }
    }
  }
  return true;
}
function weeklyConfigItemsExist(nk, config) {
  const ids = [];
  for (const id of WEEKLY_BOARDS) for (const tier of config.boards[id].tiers) for (const reward of tier.rewards) {
    for (const item of reward.type === "item" ? [reward.id] : reward.type === "random_item" ? reward.pool : []) {
      if (ids.indexOf(item) < 0) ids.push(item);
    }
  }
  if (!ids.length) return true;
  const found = nk.sqlQuery("SELECT id FROM game_items WHERE id IN (SELECT jsonb_array_elements_text($1::JSONB))", [JSON.stringify(ids)]);
  return found.length === ids.length;
}
function createWeeklyLeaderboardTables(nk) {
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
function weeklyPublishedConfig(nk) {
  const release = getActiveRemoteConfig(nk);
  const cfg = release.config && release.config.system && release.config.system.leaderboard_rewards;
  return { config: validWeeklyLeaderboardConfig(cfg) ? cfg : null, version: release.version };
}
function recordWeeklyLeaderboardScores(nk, userId, name, scores) {
  for (const board of WEEKLY_BOARDS) if (!Number.isSafeInteger(scores[board]) || scores[board] < 0) throw new Error("Invalid weekly score");
  if (nk.__characterContext) {
    recordServerWeekly(nk, nk.__characterContext, userId, name, scores);
    return;
  }
  const settings = weeklyPublishedConfig(nk);
  nk.sqlQuery(
    "SELECT weekly_leaderboard_record($1::UUID,$2::JSONB,$3,$4::JSONB,$5::BIGINT) AS period_id",
    [userId, JSON.stringify(scores), name, settings.config ? JSON.stringify(settings.config) : null, settings.version]
  );
}
function tickWeeklyLeaderboards(nk) {
  const settings = weeklyPublishedConfig(nk);
  return nk.sqlQuery(
    "SELECT weekly_leaderboard_tick($1::JSONB,$2::BIGINT) AS period_id, EXTRACT(EPOCH FROM clock_timestamp())*1000 AS server_time_ms",
    [settings.config ? JSON.stringify(settings.config) : null, settings.version]
  )[0];
}
function weeklyClaimKey(period, board) {
  return String(period) + "_" + board;
}
const readWeeklyLeaderboardRewards = (ctx, _logger, nk, payload) => {
  if (!ctx.userId) return JSON.stringify({ success: false, code: 401, message: "Authentication required" });
  let req;
  try {
    req = JSON.parse(payload || "{}");
  } catch (_) {
    return JSON.stringify({ success: false, code: 400, message: "Invalid JSON" });
  }
  const board = String(req.board_id || "");
  if (WEEKLY_BOARDS.indexOf(board) < 0) return JSON.stringify({ success: false, code: 400, message: "Unknown category" });
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
        ) ranked WHERE rank<=50 OR user_id=$3 ORDER BY rank`, [period.period_id, board, ctx.userId]) : [];
  const awards = nk.sqlQuery(`SELECT period_id,board_id,rank,score,rewards,EXTRACT(EPOCH FROM expires_at)*1000 AS expires_at_ms,
        expires_at<=clock_timestamp() AS expired FROM weekly_leaderboard_awards WHERE user_id=$1::UUID AND board_id=$2 ORDER BY period_id DESC LIMIT 14`, [ctx.userId, board]);
  const markers = awards.length ? nk.storageRead(awards.map((a) => ({ collection: "weekly_leaderboard_claims", key: weeklyClaimKey(a.period_id, board), userId: ctx.userId }))) : [];
  for (const award of awards) {
    award.rewards = parseJsonb(award.rewards);
    award.claimed = markers.some((o) => o.key === weeklyClaimKey(award.period_id, board));
  }
  return JSON.stringify({
    success: true,
    server_time_ms: Number(tick.server_time_ms),
    enabled: !!(boardConfig && boardConfig.enabled),
    period: period ? { period_id: period.period_id, starts_at_ms: Number(period.starts_at_ms), closes_at_ms: Number(period.closes_at_ms), config_version: period.config_version } : null,
    claim_days: period ? period.config.claim_days : null,
    tiers: boardConfig ? boardConfig.tiers : [],
    records: ranks.filter((r) => Number(r.rank) <= 50),
    my_record: ranks.find((r) => r.user_id === ctx.userId) || null,
    awards
  });
};
const getWeeklyLeaderboardRewards = (ctx, logger, nk, payload) => {
  try {
    return nk.__characterContext ? readServerWeekly(ctx, logger, nk, payload) : readWeeklyLeaderboardRewards(ctx, logger, nk, payload);
  } catch (error) {
    if (logger && logger.error) logger.error("Weekly standings unavailable: " + String(error));
    return JSON.stringify({ success: false, code: 503, message: "Ch\u01B0a t\u1EA3i \u0111\u01B0\u1EE3c th\u01B0\u1EDFng tu\u1EA7n. Vui l\xF2ng th\u1EED l\u1EA1i." });
  }
};
const claimWeeklyLeaderboardRewardInternal = (ctx, _logger, nk, payload) => {
  const fail = (code, message) => JSON.stringify({ success: false, code, message });
  if (!ctx.userId) return fail(401, "Authentication required");
  let req;
  try {
    req = JSON.parse(payload || "{}");
  } catch (_) {
    return fail(400, "Invalid JSON");
  }
  const board = String(req.board_id || ""), period = String(req.period_id || "");
  if (WEEKLY_BOARDS.indexOf(board) < 0 || !/^[0-9]{1,12}$/.test(period)) return fail(400, "Invalid weekly reward");
  const awards = nk.sqlQuery(`SELECT rewards,expires_at>clock_timestamp() AS available FROM weekly_leaderboard_awards
        WHERE period_id=$1::BIGINT AND board_id=$2 AND user_id=$3::UUID`, [period, board, ctx.userId]);
  if (!awards.length) return fail(404, "Kh\xF4ng c\xF3 ph\u1EA7n th\u01B0\u1EDFng tu\u1EA7n n\xE0y.");
  awards[0].rewards = parseJsonb(awards[0].rewards);
  const key = weeklyClaimKey(period, board);
  const reads = nk.storageRead([
    { collection: "weekly_leaderboard_claims", key, userId: ctx.userId },
    { collection: "player_profiles", key: "main", userId: ctx.userId },
    { collection: "player_inventory", key: "items", userId: ctx.userId }
  ]);
  const claimed = reads.find((o) => o.collection === "weekly_leaderboard_claims");
  const profileObject = reads.find((o) => o.collection === "player_profiles"), inventoryObject = reads.find((o) => o.collection === "player_inventory");
  if (!profileObject || !inventoryObject) return fail(409, "Player data is incomplete");
  if (claimed) return JSON.stringify({ success: true, already_claimed: true, rewards: awards[0].rewards, profile: profileObject.value, inventory: inventoryObject.value.items });
  if (!awards[0].available) return fail(410, "Ph\u1EA7n th\u01B0\u1EDFng \u0111\xE3 h\u1EBFt h\u1EA1n nh\u1EADn.");
  const profile = profileObject.value, inventory = inventoryObject.value;
  if (!Array.isArray(inventory.items)) return fail(409, "Invalid inventory");
  profile.resources = profile.resources || {};
  for (const reward of awards[0].rewards) {
    if (reward.type === "resource" && ["gold", "gems"].indexOf(reward.id) >= 0) {
      const total = Number(profile.resources[reward.id] || 0) + Number(reward.amount);
      if (!Number.isSafeInteger(total)) return fail(409, "Resource limit reached");
      profile.resources[reward.id] = total;
    } else if (reward.type === "item") addStoreInventoryItem(nk, inventory.items, reward.id, reward.amount);
    else return fail(409, "Invalid stored reward");
  }
  try {
    nk.storageWrite([
      { collection: "player_profiles", key: "main", userId: ctx.userId, value: profile, version: profileObject.version, permissionRead: 1, permissionWrite: 0 },
      { collection: "player_inventory", key: "items", userId: ctx.userId, value: inventory, version: inventoryObject.version, permissionRead: 1, permissionWrite: 0 },
      { collection: "weekly_leaderboard_claims", key, userId: ctx.userId, value: { period_id: period, board_id: board, rewards: awards[0].rewards }, version: "*", permissionRead: 1, permissionWrite: 0 }
    ]);
  } catch (_) {
    return fail(409, "D\u1EEF li\u1EC7u v\u1EEBa thay \u0111\u1ED5i. Vui l\xF2ng t\u1EA3i l\u1EA1i v\xE0 th\u1EED nh\u1EADn th\u01B0\u1EDFng.");
  }
  return JSON.stringify({ success: true, already_claimed: false, rewards: awards[0].rewards, profile, inventory: inventory.items });
};
const claimWeeklyLeaderboardReward = (ctx, logger, nk, payload) => {
  try {
    return nk.__characterContext ? claimServerWeekly(ctx, logger, nk, payload) : claimWeeklyLeaderboardRewardInternal(ctx, logger, nk, payload);
  } catch (error) {
    if (logger && logger.error) logger.error("Weekly reward claim unavailable: " + String(error));
    return JSON.stringify({ success: false, code: 503, message: "Ch\u01B0a th\u1EC3 nh\u1EADn th\u01B0\u1EDFng tu\u1EA7n. Vui l\xF2ng t\u1EA3i l\u1EA1i v\xE0 th\u1EED l\u1EA1i." });
  }
};
const weeklyLeaderboardTickRpc = (ctx, _logger, nk, _payload) => {
  if (ctx.userId && ctx.userId !== String(ctx.env.CONFIG_ADMIN_USER_ID || "")) return JSON.stringify({ success: false, code: 403, message: "Forbidden" });
  if (ctx.env && ctx.env.MULTI_SERVER_ENABLED === "true") {
    const servers = nk.sqlQuery("SELECT server_id,generation FROM game_servers WHERE status='open' ORDER BY server_id", []);
    const results = [];
    for (const server of servers) {
      const scope = { accountId: ctx.userId || "scheduler", serverId: server.server_id, generation: Number(server.generation) };
      try {
        results.push(withServerRequest(nk, scope, () => Object.assign({ server_id: scope.serverId, generation: scope.generation }, tickServerWeekly(nk, scope))));
      } catch (error) {
        results.push({ server_id: scope.serverId, error: String(error) });
      }
    }
    return JSON.stringify({ success: !results.some((r) => r.error), servers: results });
  }
  const result = tickWeeklyLeaderboards(nk);
  return JSON.stringify(__spreadValues({ success: true }, result));
};

const SWEEP_TICKET = "campaign_sweep_ticket";
const SWEEP_DEFAULTS = {
  version: 1,
  enabled: true,
  round_duration_ms: 9e4,
  max_rounds: 100,
  ticket_cost: 1,
  stamina_cost: 1,
  grades: [{ grade: "S", above: 0.9, multiplier: 1 }, { grade: "A", above: 0.8, multiplier: 0.9 }, { grade: "B", above: 0.7, multiplier: 0.8 }, { grade: "C", above: 0.6, multiplier: 0.7 }, { grade: "D", above: -1, multiplier: 0.6 }],
  ticket_probabilities: [0.25, 0.6, 0.15]
};
function sweepConfig(nk) {
  const c = getRemoteConfigValue(nk, "system", "stage_sweep", null);
  return sweepValidateConfig(c);
}
function sweepValidateConfig(c) {
  if (!c || !Array.isArray(c.grades) || c.grades.length !== 5 || !Number.isSafeInteger(c.round_duration_ms) || c.round_duration_ms < 1e3 || !Number.isSafeInteger(c.max_rounds) || c.max_rounds < 1 || c.max_rounds > 100 || c.ticket_cost !== 1 || c.stamina_cost !== 1) throw new Error("SWEEP_CONFIG_INVALID");
  if (c.version !== 1 || typeof c.enabled !== "boolean" || c.grades.some((r) => !r || typeof r !== "object") || c.grades.map((r) => r.grade).join(",") !== "S,A,B,C,D" || c.grades.some((r, index) => !Number.isFinite(r.above) || !Number.isFinite(r.multiplier) || r.multiplier <= 0 || r.multiplier > 1 || index < 4 && (r.above < 0 || r.above >= 1) || index > 0 && (r.above >= c.grades[index - 1].above || r.multiplier > c.grades[index - 1].multiplier)) || c.grades[4].above >= 0 || !Array.isArray(c.ticket_probabilities) || c.ticket_probabilities.length !== 3 || c.ticket_probabilities.some((p) => !Number.isFinite(p) || p < 0 || p > 1) || Math.abs(c.ticket_probabilities.reduce((a, b) => a + b, 0) - 1) > 1e-6) throw new Error("SWEEP_CONFIG_INVALID");
  return c;
}
function sweepGrade(nk, ratio, won = true) {
  if (!won) return "";
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) throw new Error("INVALID_OBJECTIVE_HP");
  return sweepConfig(nk).grades.find((r) => ratio > r.above).grade;
}
function sweepQuantity(nk, row, grade, rules = null) {
  const base = Math.max(0, Math.floor(Number(row.base_quantity === void 0 ? row.max_qty === void 0 ? row.quantity === void 0 ? row.min_qty : row.quantity : row.max_qty : row.base_quantity) || 0));
  const rule = (rules || sweepConfig(nk)).grades.find((r) => r.grade === grade);
  return base > 0 && rule ? Math.max(1, Math.floor(base * rule.multiplier)) : 0;
}
function sweepActive(profile) {
  return !!profile.sweep && ["running", "cancelling", "blocked"].indexOf(profile.sweep.status) >= 0;
}
function sweepResourceRuntime(base, userId) {
  if (!userId) return base;
  const runtime = Object.create(base);
  const observed = {};
  const identity = (r) => (r.userId || userId) + "/" + r.collection + "/" + r.key;
  runtime.storageRead = (refs) => {
    const rows = base.storageRead(refs);
    for (const ref of refs) observed[identity(ref)] = "*";
    for (const row of rows) observed[identity(row)] = row.version;
    return rows;
  };
  runtime.storageWrite = (input) => {
    let writes = input.map((w) => {
      if ((w.collection === "player_profiles" || w.collection === "player_inventory") && w.userId === userId && !w.version) {
        const version = observed[identity(w)];
        if (!version) throw new Error("RESOURCE_WRITE_REQUIRES_READ");
        return Object.assign({}, w, { version });
      }
      return w;
    });
    const profileWrite = writes.find((w) => w.collection === "player_profiles" && w.key === "main" && w.userId === userId);
    const inventoryWrite = writes.find((w) => w.collection === "player_inventory" && w.key === "items" && w.userId === userId);
    if (profileWrite || inventoryWrite) {
      const rows = base.storageRead([{ collection: "player_profiles", key: "main", userId }]);
      if (rows.length) {
        const old = parseJsonObject(rows[0].value), next = profileWrite ? parseJsonObject(profileWrite.value) : old;
        if (sweepActive(old) || sweepActive(next)) {
          if (profileWrite && !profileWrite.version) profileWrite.version = rows[0].version;
          if (!profileWrite) writes.push({ collection: "player_profiles", key: "main", userId, value: old, version: rows[0].version, permissionRead: 1, permissionWrite: 0 });
          const held = sweepActive(next) ? next.sweep : null;
          if (held && Number(next.stamina || 0) < Number(held.reserved_stamina || 0)) throw new Error("STAMINA_RESERVED");
          if (held && inventoryWrite && sweepCount(parseJsonObject(inventoryWrite.value).items || []) < Number(held.reserved_tickets || 0)) throw new Error("TICKETS_RESERVED");
        } else if (inventoryWrite && !profileWrite) {
          writes.push({ collection: "player_profiles", key: "main", userId, value: old, version: rows[0].version, permissionRead: 1, permissionWrite: 0 });
        }
      }
    }
    const acks = base.storageWrite(writes);
    for (const ack of acks) observed[identity(ack)] = ack.version;
    return acks;
  };
  return runtime;
}
function sweepCombatError(profile) {
  return sweepActive(profile) ? { success: false, ok: false, code: "SWEEP_ACTIVE", message: "\u0110ang c\xE0n qu\xE9t. H\xE3y k\u1EBFt th\xFAc ho\u1EB7c h\u1EE7y c\xE0n qu\xE9t \u0111\u1EC3 tham chi\u1EBFn." } : null;
}
function sweepSetBest(profile, stage, mode, grade) {
  if (!grade) return;
  const order = ["D", "C", "B", "A", "S"];
  profile.stage_grades = profile.stage_grades || {};
  const key = stage + ":" + mode;
  if (order.indexOf(grade) > order.indexOf(profile.stage_grades[key])) profile.stage_grades[key] = grade;
}
function sweepCount(items) {
  return items.reduce((n, r) => n + (r.item_id === SWEEP_TICKET ? Math.max(0, Number(r.quantity) || 0) : 0), 0);
}
function sweepStaminaTime(p, nowMs) {
  const session = p.sweep;
  if (!session || ["running", "cancelling"].indexOf(session.status) < 0) return nowMs;
  return Math.min(nowMs, Number(session.next_due_at_ms), session.cancel_at_ms === void 0 ? nowMs : Number(session.cancel_at_ms));
}
function sweepRefreshStamina(nk, p, now) {
  const sec = Math.max(Number(p.last_stamina_update || 0), Math.floor(sweepStaminaTime(p, now) / 1e3)), interval = Number(getRemoteConfigValue(nk, "system", "stamina_regen_interval_sec", 300)), amount = Number(getRemoteConfigValue(nk, "system", "stamina_regen_amount", 1));
  if (!Number.isFinite(interval) || interval <= 0 || !Number.isFinite(amount) || amount < 0) throw new Error("STAMINA_CONFIG_INVALID");
  const last = Number(p.last_stamina_update || sec), current = Number(p.stamina || 0), ticks = Math.max(0, Math.floor((sec - last) / interval));
  if (current < 30 && ticks > 0) {
    p.stamina = Math.min(30, current + ticks * amount);
    p.last_stamina_update = p.stamina >= 30 ? sec : last + ticks * interval;
  } else if (current >= 30 || !p.last_stamina_update) p.last_stamina_update = sec;
}
function sweepRead(nk, userId, nowMs = Date.now()) {
  const rows = nk.storageRead(["player_profiles", "player_inventory", "player_heroes", "player_stage_runs"].map((collection) => ({ collection, key: collection === "player_profiles" ? "main" : collection === "player_inventory" ? "items" : collection === "player_heroes" ? "states" : "active", userId })));
  const get = (c) => rows.find((r2) => r2.collection === c);
  const p = get("player_profiles"), i = get("player_inventory"), h = get("player_heroes"), r = get("player_stage_runs");
  if (!p || !i || !h) throw new Error("PLAYER_INCOMPLETE");
  const profile = parseJsonObject(p.value);
  sweepRefreshStamina(nk, profile, nowMs);
  return { p, i, h, r, profile, inventory: parseJsonObject(i.value), heroes: parseJsonObject(h.value) };
}
function sweepWrite(nk, userId, s, full) {
  const writes = [{ collection: "player_profiles", key: "main", userId, value: s.profile, version: s.p.version, permissionRead: 1, permissionWrite: 0 }];
  if (full) writes.push({ collection: "player_inventory", key: "items", userId, value: s.inventory, version: s.i.version, permissionRead: 1, permissionWrite: 0 }, { collection: "player_heroes", key: "states", userId, value: s.heroes, version: s.h.version, permissionRead: 1, permissionWrite: 0 });
  if (s.extraWrites) writes.push.apply(writes, s.extraWrites);
  nk.storageWrite(writes);
}
function sweepRewardTable(nk, stage, mode, stageRow, level, grade, rules = null) {
  const boss = parseJsonb(level.boss_loot_table) || [], normal = parseJsonb(level.loot_table) || [];
  const table = (stageRow.is_boss && boss.length ? boss : normal).filter((r) => r.item_id !== SWEEP_TICKET && r.resource_id !== "gold");
  const items = table.map((r) => Object.assign({}, r, { quantity: sweepQuantity(nk, r, grade, rules) })).filter((r) => r.quantity > 0);
  if (mode === "legend" && stageRow.is_boss === true && ["stage_1_10", "stage_2_10", "stage_3_10", "stage_4_10", "stage_5_10"].indexOf(stage) >= 0) {
    const arcs = nk.sqlQuery("SELECT element FROM game_arcs WHERE id = $1", [stageRow.arc_id]);
    const element = arcs.length ? String(arcs[0].element || "") : "";
    for (const tier of [{ name: "H\u1EA1 ph\u1EA9m", weight: 0.85 }, { name: "Trung ph\u1EA9m", weight: 0.15 }]) {
      const candidates = nk.sqlQuery("SELECT id, element FROM game_talismans WHERE tier = $1 ORDER BY id", [tier.name]);
      const match = candidates.filter((r) => String(r.element || "") === element), other = candidates.filter((r) => String(r.element || "") !== element);
      for (const row of candidates) {
        const same = String(row.element || "") === element, weight = tier.weight * (same ? other.length ? 0.75 : 1 : match.length ? 0.25 : 1) / (same ? match.length : other.length);
        items.push({ item_id: "talisman_fragment_" + Number(row.id), quantity: sweepQuantity(nk, { base_quantity: 3 }, grade, rules), group: "fragment", group_drop_rate: 0.7, weight, drop_rate: weight });
      }
    }
  }
  const gold = sweepQuantity(nk, { base_quantity: Number(level.gold_reward || 0) }, grade, rules);
  if (gold) items.push({ resource_id: "gold", quantity: gold, drop_rate: 1 });
  return items;
}
function stageCompletionLoot(nk, stage, level, ticketProbabilities, rules = null) {
  if (stage.arc_id === "arc_0" || stage.id === "stage_0_admin_test") return [];
  const items = sweepRewardTable(nk, stage.id, level.level_id, stage, level, "S", rules);
  for (const line of items) {
    if (line.group === "fragment") {
      const total = items.filter((r) => r.group === "fragment").reduce((sum, r) => sum + Number(r.weight || 0), 0);
      line.drop_rate = Number(line.group_drop_rate) * Number(line.weight) / total;
    }
  }
  const probabilities = ticketProbabilities || sweepConfig(nk).ticket_probabilities;
  items.unshift({
    item_id: SWEEP_TICKET,
    min_qty: 0,
    max_qty: 2,
    drop_rate: probabilities[1] + probabilities[2],
    ordinary_combat_only: true,
    quantity_outcomes: probabilities.map((probability, quantity) => ({ quantity, probability }))
  });
  return items;
}
function stageTicketQuantity(nk, roll = Math.random()) {
  const probabilities = sweepConfig(nk).ticket_probabilities;
  return roll < probabilities[0] ? 0 : roll < probabilities[0] + probabilities[1] ? 1 : 2;
}
function sweepPreviewData(nk, s, req) {
  const c = sweepConfig(nk), stage = String(req.stage_id || ""), mode = String(req.level_id || "");
  if (!c.enabled) throw new Error("SWEEP_DISABLED");
  if (!s.profile.stage_grades || s.profile.stage_grades[stage + ":" + mode] !== "S") throw new Error("STAGE_S_REQUIRED");
  const heroes = s.heroes.heroes || [];
  if (!heroes.some((h) => h.hero_id === req.hero_id && h.owned === true)) throw new Error("HERO_NOT_OWNED");
  const stages = nk.sqlQuery("SELECT exp_weight, is_boss, arc_id FROM game_stages WHERE id = $1", [stage]);
  const levels = nk.sqlQuery("SELECT exp_multiplier, gold_reward, loot_table, boss_loot_table FROM game_stage_levels WHERE stage_id = $1 AND level_id = $2", [stage, mode]);
  if (!stages.length || !levels.length || stages[0].arc_id === "arc_0" || stage === "stage_0_admin_test" || ["normal", "epic", "legend"].indexOf(mode) < 0) throw new Error("INVALID_STAGE");
  const level = levels[0], items = sweepRewardTable(nk, stage, mode, stages[0], level, "S");
  const exp = Math.max(0, Math.round(progressionMaxStageBaseExp(nk, stage) * Number(stages[0].exp_weight || 1) * Number(level.exp_multiplier || 1)));
  const held = sweepActive(s.profile) ? Number(s.profile.sweep.reserved_tickets || 0) : 0;
  const staminaHeld = sweepActive(s.profile) ? Number(s.profile.sweep.reserved_stamina || 0) : 0;
  return { items, exp, modifiers: { exp: 1, gold: 1 }, round_duration_ms: c.round_duration_ms, max_rounds: Math.max(0, Math.min(c.max_rounds, sweepCount(s.inventory.items || []) - held, Math.floor(Number(s.profile.stamina || 0)) - staminaHeld)), arc_id: stages[0].arc_id, is_boss: stages[0].is_boss, config: c };
}
function sweepRoll(items) {
  const rune = (r) => r.group === "rune" || String(r.item_id || "").indexOf("stone_") === 0 || String(r.item_id || "").indexOf("rune_") === 0;
  const out = items.filter((r) => !rune(r) && r.group !== "fragment" && Math.random() < Math.max(0, Math.min(1, Number(r.drop_rate || 0)))).map((r) => Object.assign({}, r));
  for (const group of [items.filter(rune), items.filter((r) => r.group === "fragment")]) {
    if (group.length && group[0].group_drop_rate !== void 0 && Math.random() >= Number(group[0].group_drop_rate)) continue;
    const total = group.reduce((n, r) => n + Math.max(0, Number(r.weight || r.drop_rate || 0)), 0);
    let roll = Math.random() * total;
    if (total > 0) for (const r of group) {
      roll -= Math.max(0, Number(r.weight || r.drop_rate || 0));
      if (roll <= 0) {
        out.push(Object.assign({}, r));
        break;
      }
    }
  }
  return out;
}
function sweepProcess(nk, userId, logger, nowMs = Date.now(), limit = 4, atomicState = null) {
  for (let index = 0; index < (atomicState ? 100 : Math.min(8, Math.max(1, limit))); index++) {
    const s = atomicState || sweepRead(nk, userId, nowMs), session = s.profile.sweep;
    if (!sweepActive(s.profile) || session.status === "blocked") return session || null;
    const cutoff = atomicState ? Infinity : session.cancel_at_ms === void 0 ? nowMs : Math.min(nowMs, session.cancel_at_ms);
    if (session.next_due_at_ms > cutoff || session.completed_rounds >= session.total_rounds) {
      if (session.cancel_at_ms !== void 0 || session.completed_rounds >= session.total_rounds) {
        session.status = session.cancel_at_ms !== void 0 ? "cancelled" : "completed";
        session.reserved_tickets = 0;
        session.reserved_stamina = 0;
        session.state_version++;
        delete s.profile.activity;
        sweepRefreshStamina(nk, s.profile, nowMs);
        sweepWrite(nk, userId, s, false);
      }
      return session;
    }
    const items = s.inventory.items || [], held = sweepCount(items);
    if (held < 1 || Number(s.profile.stamina || 0) < 1) throw new Error("RESERVATION_CORRUPTED");
    let debit = 1;
    for (let k = items.length - 1; k >= 0 && debit; k--) {
      if (items[k].item_id !== SWEEP_TICKET) continue;
      const n = Math.min(debit, Number(items[k].quantity));
      items[k].quantity -= n;
      debit -= n;
      if (items[k].quantity <= 0) items.splice(k, 1);
    }
    s.profile.stamina -= 1;
    const modifiers = session.config_snapshot.modifiers || { exp: 1, gold: 1 };
    const rewards = sweepRoll(session.config_snapshot.items).map((r) => r.resource_id === "gold" ? Object.assign({}, r, { quantity: Math.floor(r.quantity * modifiers.gold) }) : r);
    for (const reward of rewards) {
      if (reward.item_id) {
        if (!serverGrantInventoryItem(nk, items, reward.item_id, reward.quantity)) throw new Error("REWARD_ITEM_INVALID");
      } else if (reward.resource_id) {
        s.profile.resources = s.profile.resources || {};
        s.profile.resources[reward.resource_id] = Number(s.profile.resources[reward.resource_id] || 0) + reward.quantity;
      }
    }
    const heroes = s.heroes.heroes || [], hero = heroes.find((h) => h.hero_id === session.hero_id && h.owned === true);
    if (!hero) throw new Error("HERO_NOT_OWNED");
    progressionMigrate(nk, s.profile, heroes);
    const exp = Math.floor(session.config_snapshot.exp * modifiers.exp);
    progressionApplyUser(nk, s.profile, exp);
    progressionReconcileLevelUnlocks(nk, s.profile);
    let level = Number(hero.level || 1), xp = Number(hero.exp || 0) + exp, next = progressionNextHeroExp(nk, level);
    while (level < Math.min(PROGRESSION_MAX_LEVEL, s.profile.level) && next > 0 && xp >= next) {
      xp -= next;
      level++;
      next = progressionNextHeroExp(nk, level);
    }
    hero.level = level;
    hero.exp = level >= PROGRESSION_MAX_LEVEL ? 0 : xp;
    hero.next_level_exp = level >= PROGRESSION_MAX_LEVEL ? 0 : next;
    hero.current_attribute = progressionHeroAttributes(nk, session.hero_id, level);
    session.completed_rounds++;
    session.reserved_tickets--;
    session.reserved_stamina--;
    session.state_version++;
    session.receipts.push({ round_index: session.completed_rounds, receipt_id: session.session_id + ":" + session.completed_rounds, completed_at_ms: atomicState ? nowMs : session.next_due_at_ms, loot: rewards, exp });
    session.next_due_at_ms = session.started_at_ms + (session.completed_rounds + 1) * session.config_snapshot.round_duration_ms;
    if (session.completed_rounds === session.total_rounds || session.cancel_at_ms !== void 0 && session.next_due_at_ms > session.cancel_at_ms) {
      session.status = session.cancel_at_ms !== void 0 ? "cancelled" : "completed";
      session.reserved_tickets = 0;
      session.reserved_stamina = 0;
      delete s.profile.activity;
    }
    if (!sweepActive(s.profile)) sweepRefreshStamina(nk, s.profile, nowMs);
    s.inventory.items = items;
    if (!atomicState) sweepWrite(nk, userId, s, true);
    try {
      nk.notificationSend(userId, "C\xE0n qu\xE9t", { session_id: session.session_id, state_version: session.state_version, status: session.status }, 144, null, false);
    } catch (e) {
      if (logger) logger.warn("Sweep notification deferred: %s", String(e));
    }
    if (!sweepActive(s.profile)) return session;
  }
  return sweepRead(nk, userId, nowMs).profile.sweep;
}
function sweepInstantQuote(session, now = Date.now()) {
  const remaining = session && session.status === "running" ? Math.max(0, session.total_rounds - Math.max(session.completed_rounds, Math.floor((now - session.started_at_ms) / session.config_snapshot.round_duration_ms))) : 0;
  return { unit_cost_gems: 5, remaining_rounds: remaining, cost_gems: remaining * 5 };
}
function sweepResponse(s, extra = {}) {
  return JSON.stringify(Object.assign({ success: true, instant_finish: sweepInstantQuote(s.profile.sweep), session: s.profile.sweep || null, server_time_ms: Date.now(), profile: s.profile, inventory: s.inventory, heroes: s.heroes.heroes || [] }, extra));
}
function sweepRpc(handler) {
  return (ctx, logger, nk, payload) => {
    try {
      return handler(ctx, logger, nk, JSON.parse(payload || "{}"));
    } catch (e) {
      return JSON.stringify({ success: false, code: String(e).replace(/^Error: /, ""), message: String(e), server_time_ms: Date.now() });
    }
  };
}
const getSweepOptions = sweepRpc((ctx, _logger, nk) => {
  const s = sweepRead(nk, ctx.userId), c = sweepConfig(nk), options = [];
  for (const key of Object.keys(s.profile.stage_grades || {})) {
    if (s.profile.stage_grades[key] !== "S") continue;
    const split = key.lastIndexOf(":"), stage = key.slice(0, split), mode = key.slice(split + 1);
    const rows = nk.sqlQuery("SELECT id, arc_id, is_boss FROM game_stages WHERE id = $1", [stage]);
    if (rows.length && rows[0].arc_id !== "arc_0" && stage !== "stage_0_admin_test" && ["normal", "epic", "legend"].indexOf(mode) >= 0) options.push({ stage_id: stage, level_id: mode, arc_id: rows[0].arc_id, is_boss: rows[0].is_boss });
  }
  const held = sweepActive(s.profile) ? s.profile.sweep.reserved_tickets : 0;
  return sweepResponse(s, { options, available_tickets: Math.max(0, sweepCount(s.inventory.items || []) - held), available_stamina: Math.max(0, Number(s.profile.stamina || 0) - (sweepActive(s.profile) ? s.profile.sweep.reserved_stamina : 0)), max_rounds: c.max_rounds });
});
const previewSweep = sweepRpc((ctx, _logger, nk, req) => {
  const s = sweepRead(nk, ctx.userId);
  return sweepResponse(s, { preview: sweepPreviewData(nk, s, req) });
});
const startSweep = sweepRpc((ctx, _logger, nk, req) => {
  const s = sweepRead(nk, ctx.userId), old = s.profile.sweep;
  if (typeof req.request_id !== "string" || !/^[a-zA-Z0-9_-]{8,60}$/.test(req.request_id)) throw new Error("INVALID_REQUEST_ID");
  const fingerprint = JSON.stringify([req.stage_id, req.level_id, req.hero_id, req.rounds]), requestKey = "sweep_" + req.request_id;
  const requestRows = nk.storageRead([{ collection: "player_item_requests", key: requestKey, userId: ctx.userId }]);
  if (requestRows.length) {
    if (requestRows[0].value.fingerprint !== fingerprint) throw new Error("REQUEST_CONFLICT");
    return sweepResponse(s, { duplicate: true, request_session_id: requestRows[0].value.session_id });
  }
  if (old && old.request_id === req.request_id) return sweepResponse(s);
  if ((s.profile.sweep_request_ids || []).indexOf(req.request_id) >= 0) throw new Error("REQUEST_ALREADY_COMPLETED");
  if (sweepActive(s.profile)) throw new Error("SWEEP_ACTIVE");
  const run = s.r ? parseJsonObject(s.r.value) : {};
  if (run.status === "active" && Number(run.expires_at_ms) > Date.now() || (s.profile.breakthrough || {}).in_tribulation === true) throw new Error("COMBAT_ACTIVE");
  const preview = sweepPreviewData(nk, s, req), rounds = Number(req.rounds);
  if (!Number.isSafeInteger(rounds) || rounds < 1 || rounds > preview.max_rounds) throw new Error("INSUFFICIENT_TICKETS_OR_STAMINA");
  const now = Date.now();
  s.profile.sweep = { session_id: nk.uuidv4(), request_id: req.request_id, stage_id: req.stage_id, level_id: req.level_id, hero_id: req.hero_id, arc_id: preview.arc_id, is_boss: preview.is_boss, total_rounds: rounds, completed_rounds: 0, started_at_ms: now, next_due_at_ms: now + preview.round_duration_ms, status: "running", reserved_tickets: rounds, reserved_stamina: rounds, config_snapshot: preview, state_version: 1, receipts: [] };
  s.profile.activity = { type: "sweeping", activity_id: s.profile.sweep.session_id };
  s.profile.sweep_request_ids = (s.profile.sweep_request_ids || []).concat([req.request_id]).slice(-100);
  s.extraWrites = [{ collection: "player_item_requests", key: requestKey, userId: ctx.userId, value: { fingerprint, session_id: s.profile.sweep.session_id, created_at: now }, version: "*", permissionRead: 0, permissionWrite: 0 }];
  sweepWrite(nk, ctx.userId, s, false);
  return sweepResponse(s);
});
const getSweepStatus = sweepRpc((ctx, logger, nk) => {
  sweepProcess(nk, ctx.userId, logger);
  return sweepResponse(sweepRead(nk, ctx.userId));
});
const cancelSweep = sweepRpc((ctx, logger, nk, req) => {
  const s = sweepRead(nk, ctx.userId), session = s.profile.sweep;
  if (!session || session.session_id !== req.session_id) throw new Error("SESSION_NOT_FOUND");
  if (session.status === "blocked") {
    session.cancel_at_ms = Date.now();
    session.status = "cancelled";
    session.reserved_tickets = 0;
    session.reserved_stamina = 0;
    session.state_version++;
    delete s.profile.activity;
    sweepWrite(nk, ctx.userId, s, false);
    return sweepResponse(s);
  }
  if (sweepActive(s.profile) && session.cancel_at_ms === void 0) {
    session.cancel_at_ms = Date.now();
    session.status = "cancelling";
    session.state_version++;
    sweepWrite(nk, ctx.userId, s, false);
  }
  sweepProcess(nk, ctx.userId, logger);
  return sweepResponse(sweepRead(nk, ctx.userId));
});
const finishSweep = sweepRpc((ctx, logger, nk, req) => {
  const now = Date.now(), s = sweepRead(nk, ctx.userId, now), session = s.profile.sweep;
  if (!session || session.session_id !== req.session_id) throw new Error("SESSION_NOT_FOUND");
  if (session.status === "completed") return sweepResponse(s, { duplicate: true });
  if (session.status !== "running" || session.cancel_at_ms !== void 0) throw new Error("SWEEP_NOT_RUNNING");
  const quote = sweepInstantQuote(session, now);
  if (!Number.isSafeInteger(req.max_cost_gems) || req.max_cost_gems < quote.cost_gems) throw new Error("PRICE_CHANGED");
  const gems = Number((s.profile.resources || {}).gems || 0);
  if (gems < quote.cost_gems) throw new Error("INSUFFICIENT_GEMS");
  s.profile.resources = s.profile.resources || {};
  s.profile.resources.gems = gems - quote.cost_gems;
  sweepProcess(nk, ctx.userId, logger, now, 100, s);
  if (session.status !== "completed") throw new Error("SWEEP_FINISH_FAILED");
  session.instant_finish = { cost_gems: quote.cost_gems, paid_rounds: quote.remaining_rounds, finished_at_ms: now };
  sweepWrite(nk, ctx.userId, s, true);
  return sweepResponse(s);
});

function sweepCreateWorkerIndex(nk) {
  nk.sqlExec(`CREATE INDEX IF NOT EXISTS storage_sweep_due_idx ON storage
      ((LEAST((value->'sweep'->>'next_due_at_ms')::BIGINT, (value->'sweep'->>'cancel_at_ms')::BIGINT)),user_id,key)
      WHERE collection='player_profiles' AND value->'sweep'->>'status' IN ('running','cancelling');
    CREATE TABLE IF NOT EXISTS sweep_worker_claims (
      user_id UUID NOT NULL, storage_key TEXT NOT NULL, lease_id TEXT NOT NULL,
      lease_until TIMESTAMPTZ NOT NULL, retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      attempts INT NOT NULL DEFAULT 0, PRIMARY KEY(user_id,storage_key));
    CREATE INDEX IF NOT EXISTS sweep_worker_claim_expiry_idx ON sweep_worker_claims(lease_until);`, []);
}
const rpcSweepTick = (ctx, logger, nk, _payload) => {
  if (ctx.userId && ctx.userId !== String((ctx.env || {}).CONFIG_ADMIN_USER_ID || ""))
    return JSON.stringify({ success: false, code: "FORBIDDEN" });
  const multi = !!ctx.env && ctx.env.MULTI_SERVER_ENABLED === "true";
  const now = Date.now(), deadline = now + 750;
  const jobs = nk.sqlQuery(`SELECT p.user_id::TEXT AS user_id,p.key AS storage_key,p.value->'sweep'->>'session_id' AS session_id
      FROM storage p JOIN users u ON u.id=p.user_id
      LEFT JOIN sweep_worker_claims c ON c.user_id=p.user_id AND c.storage_key=p.key
      WHERE p.collection='player_profiles' AND p.value->'sweep'->>'status' IN ('running','cancelling')
        AND LEAST((p.value->'sweep'->>'next_due_at_ms')::BIGINT, (p.value->'sweep'->>'cancel_at_ms')::BIGINT) <= $1::BIGINT
        AND COALESCE(u.disable_time,to_timestamp(0))<=to_timestamp(0)
        AND NOT EXISTS(SELECT 1 FROM account_link_state a WHERE a.user_id=p.user_id AND a.status='archived')
        AND (c.user_id IS NULL OR (c.lease_until<=NOW() AND c.retry_at<=NOW()))
        AND (($2::BOOLEAN AND EXISTS(SELECT 1 FROM game_servers g JOIN player_characters pc
              ON pc.server_id=g.server_id AND pc.generation=g.generation AND pc.account_id=p.user_id AND pc.status='ready'
              WHERE p.key=g.server_id||':g'||g.generation||':main' AND g.status='open' AND g.opens_at<=NOW()))
          OR (NOT $2::BOOLEAN AND p.key='main'))
      ORDER BY LEAST((p.value->'sweep'->>'next_due_at_ms')::BIGINT, (p.value->'sweep'->>'cancel_at_ms')::BIGINT),p.user_id,p.key LIMIT 32`, [now, multi]);
  let processed = 0, failed = 0, claimedCount = 0;
  for (const job of jobs) {
    if (Date.now() >= deadline) break;
    const lease = nk.uuidv4();
    const claimed = nk.sqlQuery(`INSERT INTO sweep_worker_claims(user_id,storage_key,lease_id,lease_until)
          VALUES($1::UUID,$2,$3,NOW()+INTERVAL '15 seconds')
          ON CONFLICT(user_id,storage_key) DO UPDATE SET lease_id=EXCLUDED.lease_id,lease_until=EXCLUDED.lease_until
          WHERE sweep_worker_claims.lease_until<=NOW() AND sweep_worker_claims.retry_at<=NOW()
          RETURNING attempts`, [job.user_id, job.storage_key, lease]);
    if (!claimed.length) continue;
    claimedCount++;
    let runtime = nk, scope = null;
    try {
      let session;
      if (multi) {
        const match = /^([a-z][a-z0-9_]{0,31}):g([1-9][0-9]*):main$/.exec(job.storage_key);
        if (!match) throw new Error("Invalid sweep character key");
        scope = { accountId: job.user_id, serverId: match[1], generation: Number(match[2]) };
        runtime = mailCombatRuntime(characterRuntime(nk, scope), job.user_id);
        session = withServerRequest(nk, scope, () => sweepProcess(runtime, job.user_id, logger, Date.now(), 4));
      } else session = sweepProcess(mailCombatRuntime(nk, job.user_id), job.user_id, logger, Date.now(), 4);
      nk.sqlExec(`DELETE FROM sweep_worker_claims WHERE user_id=$1::UUID AND storage_key=$2 AND lease_id=$3`, [job.user_id, job.storage_key, lease]);
      processed++;
      if (session) {
        try {
          nk.notificationSend(job.user_id, "C\xE0n qu\xE9t", {
            type: "sweep_updated",
            session_id: session.session_id,
            state_version: session.state_version,
            status: session.status,
            server_time_ms: Date.now(),
            storage_key: job.storage_key
          }, 144, null, false);
        } catch (error) {
          logger.warn("Sweep notification failed: %s", String(error));
        }
      }
    } catch (error) {
      failed++;
      const message = String(error);
      const permanent = /RESERVATION_CORRUPTED|HERO_NOT_OWNED|REWARD_ITEM_INVALID|SWEEP_CONFIG_INVALID/.test(message);
      const exhausted = Number(claimed[0].attempts) >= 11 && !/CAS|version|conflict|SERVER_REQUEST_FENCED/i.test(message);
      if (permanent || exhausted) {
        const block = () => {
          const rows = runtime.storageRead([{ collection: "player_profiles", key: "main", userId: job.user_id }]);
          if (!rows.length) return;
          const profile = parseJsonObject(rows[0].value), session = profile.sweep;
          if (!session || session.session_id !== job.session_id || !sweepActive(profile)) return;
          session.status = "blocked";
          session.last_error = message.slice(0, 240);
          session.state_version++;
          runtime.storageWrite([{
            collection: "player_profiles",
            key: "main",
            userId: job.user_id,
            value: profile,
            version: rows[0].version,
            permissionRead: 1,
            permissionWrite: 0
          }]);
        };
        try {
          if (scope) withServerRequest(nk, scope, block);
          else block();
        } catch (blockError) {
          logger.warn("Sweep error state retry: %s", String(blockError));
        }
      }
      nk.sqlExec(`UPDATE sweep_worker_claims SET lease_until=NOW(),
              retry_at=NOW()+make_interval(secs=>LEAST(60,5*(attempts+1))),attempts=LEAST(12,attempts+1)
              WHERE user_id=$1::UUID AND storage_key=$2 AND lease_id=$3`, [job.user_id, job.storage_key, lease]);
      logger.warn("Sweep retry user=%s key=%s: %s", job.user_id, job.storage_key, String(error));
    }
  }
  nk.sqlExec(`DELETE FROM sweep_worker_claims WHERE (user_id,storage_key) IN
      (SELECT c.user_id,c.storage_key FROM sweep_worker_claims c WHERE c.lease_until<NOW()-INTERVAL '1 day'
       AND NOT EXISTS(SELECT 1 FROM storage p WHERE p.user_id=c.user_id AND p.key=c.storage_key
         AND p.collection='player_profiles' AND p.value->'sweep'->>'status' IN ('running','cancelling')) LIMIT 32)`, []);
  return JSON.stringify({
    success: true,
    scanned: jobs.length,
    claimed: claimedCount,
    processed,
    failed,
    elapsed_ms: Date.now() - now,
    server_time_ms: Date.now()
  });
};

const SWEEP_TICKET_DEFINITION = { id: "campaign_sweep_ticket", display_name: "V\xE9 c\xE0n qu\xE9t chi\u1EBFn d\u1ECBch", description: "C\xE0n qu\xE9t m\u1ED9t \u1EA3i chi\u1EBFn d\u1ECBch \u0111\xE3 \u0111\u1EA1t S.", category: "consumable", rarity: "rare", icon_id: "consumable_0", stackable: true, max_stack: 99999, order: 49, expires_after_hours: 0, tags: ["sweep", "ticket", "consumable"], attributes: { sweep_type: "campaign", atlas_index: 0 } };
function sweepMigrationSql() {
  return `
CREATE OR REPLACE FUNCTION c144_migrate_stage_sweep(p_rules JSONB,p_ticket JSONB)
RETURNS INT LANGUAGE plpgsql AS $c144$
DECLARE published remote_config_releases%ROWTYPE; new_snapshot JSONB; minimum TEXT; latest TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(144,20261020);
  LOCK TABLE remote_config_releases IN EXCLUSIVE MODE;
  SELECT * INTO published FROM remote_config_releases ORDER BY config_version DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'C144 requires an existing published config release'; END IF;
  IF jsonb_typeof(p_rules) IS DISTINCT FROM 'object' OR p_rules->>'version' IS DISTINCT FROM '1'
    OR p_ticket->>'id' IS DISTINCT FROM 'campaign_sweep_ticket' THEN RAISE EXCEPTION 'Invalid C144 migration inputs'; END IF;
  INSERT INTO game_items(id,display_name,description,category,rarity,icon_id,stackable,max_stack,sort_order,expires_after_hours,tags,attributes)
  VALUES(p_ticket->>'id',p_ticket->>'display_name',p_ticket->>'description',p_ticket->>'category',p_ticket->>'rarity',p_ticket->>'icon_id',
    (p_ticket->>'stackable')::BOOLEAN,(p_ticket->>'max_stack')::INT,(p_ticket->>'order')::INT,(p_ticket->>'expires_after_hours')::INT,p_ticket->'tags',p_ticket->'attributes')
  ON CONFLICT(id) DO NOTHING;
  -- Existing published rules, including deliberately disabled/custom rules, win.
  IF (published.snapshot->'system') ? 'stage_sweep' THEN RETURN published.config_version; END IF;
  IF jsonb_typeof(published.snapshot) IS DISTINCT FROM 'object'
    OR jsonb_typeof(COALESCE(published.snapshot->'system','{}'::JSONB)) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid published config snapshot'; END IF;
  minimum:='1.1.0'; latest:='1.1.0';
  IF published.min_app_version ~ '^[0-9]+[.][0-9]+[.][0-9]+$' THEN
    IF string_to_array(published.min_app_version,'.')::INT[]>=ARRAY[1,1,0] THEN minimum:=published.min_app_version; END IF;
  END IF;
  IF published.latest_app_version ~ '^[0-9]+[.][0-9]+[.][0-9]+$' THEN
    IF string_to_array(published.latest_app_version,'.')::INT[]>=ARRAY[1,1,0] THEN latest:=published.latest_app_version; END IF;
  END IF;
  IF string_to_array(latest,'.')::INT[]<string_to_array(minimum,'.')::INT[] THEN latest:=minimum; END IF;
  new_snapshot:=published.snapshot||jsonb_build_object('system',COALESCE(published.snapshot->'system','{}'::JSONB)
    ||jsonb_build_object('stage_sweep',p_rules,'min_app_version',minimum,'latest_app_version',latest));
  INSERT INTO remote_config_releases(config_version,snapshot,min_app_version,latest_app_version,store_url,published_by)
  VALUES(published.config_version+1,new_snapshot,minimum,latest,published.store_url,'migration:C144:v1');
  RETURN published.config_version+1;
END $c144$;`;
}
function sweepMigratePublishedConfig(nk, logger) {
  const rules = sweepValidateConfig(SWEEP_DEFAULTS);
  nk.sqlExec(sweepMigrationSql(), []);
  const rows = nk.sqlQuery("SELECT c144_migrate_stage_sweep($1::JSONB,$2::JSONB) AS config_version", [JSON.stringify(rules), JSON.stringify(SWEEP_TICKET_DEFINITION)]);
  logger.info("C144 startup migration verified config release %s", String(rows.length ? rows[0].config_version : ""));
}

const MAIL_COLLECTION = "player_mail";
const MAIL_DAY = 864e5;
const MAIL_FILTERS = ["all", "unread", "read", "reward", "expiring", "system", "battle_report"];
function mailSettings(nk) {
  const c = getRemoteConfigValue(nk, "system", "mailbox", { warning_hours: 24, retention_days: 7 });
  if (!c || !Number.isSafeInteger(c.warning_hours) || c.warning_hours < 1 || c.warning_hours > 720 || !Number.isSafeInteger(c.retention_days) || c.retention_days < 1 || c.retention_days > 365) throw new Error("MAIL_CONFIG_INVALID");
  return c;
}
function mailPrefix(nk) {
  const scope = characterContext(nk);
  return scope ? characterStorageKey(scope, "_").slice(0, -1) : "";
}
function mailId(nk, source) {
  return "m_" + String(nk.sqlQuery("SELECT encode(sha256(convert_to($1,'UTF8')),'hex') AS hash", [source])[0].hash).slice(0, 48);
}
function mailError(code, message) {
  return { success: false, code, message };
}
function mailValidateAttachments(nk, input) {
  if (!Array.isArray(input) || input.length > 32) throw new Error("INVALID_ATTACHMENTS");
  return input.map((r) => {
    if (!r || !Number.isSafeInteger(r.amount) || r.amount < 1 || r.amount > 1e9) throw new Error("INVALID_REWARD_AMOUNT");
    if (r.type === "resource" && ["gold", "gems"].indexOf(r.id) >= 0) return { type: r.type, id: r.id, amount: r.amount };
    if (r.type === "exp" && r.id === "user") return { type: r.type, id: r.id, amount: r.amount };
    if (r.type === "item" && typeof r.id === "string" && /^[a-z0-9_]{1,100}$/.test(r.id)) {
      if (r.amount > 1e3 || !nk.sqlQuery("SELECT id FROM game_items WHERE id=$1", [r.id]).length) throw new Error("INVALID_ITEM");
      return { type: r.type, id: r.id, amount: r.amount };
    }
    throw new Error("INVALID_REWARD");
  });
}
function mailDefinition(nk, input) {
  if (!input || typeof input.source_id !== "string" || !input.source_id.length || input.source_id.length > 240 || typeof input.title !== "string" || !input.title.trim() || input.title.length > 160 || typeof input.body !== "string" || input.body.length > 12e3) throw new Error("INVALID_MAIL");
  const category = input.category || "system";
  if (["system", "event", "battle_report"].indexOf(category) < 0) throw new Error("INVALID_CATEGORY");
  const expiry = input.expires_at_ms === void 0 ? null : input.expires_at_ms;
  if (expiry !== null && (!Number.isSafeInteger(expiry) || expiry < 0 || expiry > Number.MAX_SAFE_INTEGER - 366 * MAIL_DAY)) throw new Error("INVALID_EXPIRY");
  const sender = input.sender_name || "H\u1EC7 th\u1ED1ng";
  if (typeof sender !== "string" || sender.length > 80) throw new Error("INVALID_SENDER");
  const source = String(input.source_type || "system");
  if (source.length > 40) throw new Error("INVALID_SOURCE");
  return {
    id: mailId(nk, input.source_id),
    category,
    source_type: source,
    source_id: input.source_id,
    title: input.title.trim(),
    sender_name: sender,
    body: input.body,
    attachments: mailValidateAttachments(nk, input.attachments || []),
    created_at_ms: Date.now(),
    expires_at_ms: expiry,
    purge_at_ms: expiry === null ? null : expiry + mailSettings(nk).retention_days * MAIL_DAY,
    read_at_ms: null,
    claimed_at_ms: null,
    deleted_at_ms: null,
    version: 1,
    weekly: input.weekly || null
  };
}
function mailWrite(row, userId) {
  return { collection: MAIL_COLLECTION, key: row.id, userId, value: row, permissionRead: 0, permissionWrite: 0 };
}
function mailPush(nk, userId, id) {
  const scope = characterContext(nk);
  try {
    nk.notificationSend(userId, "H\u1ED9p th\u01B0", { type: "mail_changed", mail_id: id, server_id: scope ? scope.serverId : "", generation: scope ? scope.generation : 0 }, 147, void 0, false);
  } catch (_e) {
  }
}
function deliverMail(nk, userId, input) {
  const row = mailDefinition(nk, input), marker = { collection: "player_mail_deliveries", key: row.id, userId };
  if (nk.storageRead([marker]).length) return { id: row.id, idempotent: true };
  nk.storageWrite([Object.assign(mailWrite(row, userId), { version: "*" }), Object.assign({}, marker, { value: { source_id: row.source_id, created_at_ms: row.created_at_ms }, version: "*", permissionRead: 0, permissionWrite: 0 })]);
  if (!nk.__mailBatch) mailPush(nk, userId, row.id);
  return { id: row.id, idempotent: false };
}
function mailVisibleSql() {
  return "COALESCE((value->>'deleted_at_ms')::BIGINT,0)=0 AND (value->>'purge_at_ms' IS NULL OR (value->>'purge_at_ms')::BIGINT>$3)";
}
function mailSummary(nk, userId, now) {
  const rows = nk.sqlQuery(`SELECT COUNT(*) FILTER(WHERE value->>'read_at_ms' IS NULL)::INT AS unread_count,
      COUNT(*) FILTER(WHERE jsonb_array_length(value->'attachments')>0 AND value->>'claimed_at_ms' IS NULL
        AND (value->>'expires_at_ms' IS NULL OR (value->>'expires_at_ms')::BIGINT>$3))::INT AS claimable_count
      FROM storage WHERE collection='player_mail' AND user_id=$1::UUID AND left(key,length($2))=$2 AND ($2<>'' OR left(key,2)='m_') AND ${mailVisibleSql()}`, [userId, mailPrefix(nk), now]);
  return rows[0] || { unread_count: 0, claimable_count: 0 };
}
function mailPresent(nk, row, now) {
  const expired = row.expires_at_ms !== null && now >= row.expires_at_ms;
  return Object.assign({}, row, {
    expired,
    expiring: row.expires_at_ms !== null && !expired && row.expires_at_ms - now <= mailSettings(nk).warning_hours * 36e5,
    can_claim: row.attachments.length > 0 && !row.claimed_at_ms && !expired && !row.deleted_at_ms,
    can_delete: row.attachments.length === 0 || !!row.claimed_at_ms
  });
}
function mailResponse(nk, userId, data) {
  const now = Date.now();
  return JSON.stringify(Object.assign({ success: true, server_time_ms: now, summary: mailSummary(nk, userId, now) }, data));
}
function mailRead(nk, userId, id) {
  if (typeof id !== "string" || !/^m_[a-f0-9]{48}$/.test(id)) throw new Error("INVALID_MAIL_ID");
  const row = nk.storageRead([{ collection: MAIL_COLLECTION, key: id, userId }])[0];
  if (!row || row.value.deleted_at_ms || row.value.purge_at_ms !== null && Date.now() >= row.value.purge_at_ms) return null;
  return row;
}
function mailClaimOne(nk, userId, id) {
  const stored = mailRead(nk, userId, id);
  if (!stored) return mailError("MAIL_NOT_FOUND", "Th\u01B0 kh\xF4ng c\xF2n t\u1ED3n t\u1EA1i.");
  const mail = stored.value, now = Date.now();
  const reads = nk.storageRead([{ collection: "player_profiles", key: "main", userId }, { collection: "player_inventory", key: "items", userId }].concat(mail.weekly ? [{ collection: "weekly_leaderboard_claims", key: weeklyClaimKey(mail.weekly.period_id, mail.weekly.board_id), userId }] : []));
  const p = reads.find((r) => r.collection === "player_profiles"), i = reads.find((r) => r.collection === "player_inventory");
  if (!p || !i || !Array.isArray(i.value.items)) return mailError("CHARACTER_INCOMPLETE", "D\u1EEF li\u1EC7u nh\xE2n v\u1EADt ch\u01B0a s\u1EB5n s\xE0ng.");
  if (mail.claimed_at_ms) return { success: true, already_claimed: true, mail: mailPresent(nk, mail, now), profile: p.value, inventory: i.value.items };
  if (!mailPresent(nk, mail, now).can_claim) return mailError(mail.attachments.length ? "MAIL_EXPIRED" : "NO_REWARD", mail.attachments.length ? "Th\u01B0 \u0111\xE3 h\u1EBFt h\u1EA1n nh\u1EADn th\u01B0\u1EDFng." : "Th\u01B0 kh\xF4ng c\xF3 ph\u1EA7n th\u01B0\u1EDFng.");
  const oldWeekly = reads.find((r) => r.collection === "weekly_leaderboard_claims");
  const writes = [];
  if (!oldWeekly) {
    p.value.resources = p.value.resources || {};
    for (const reward of mail.attachments) {
      if (reward.type === "resource") {
        const total = Number(p.value.resources[reward.id] || 0) + reward.amount;
        if (!Number.isSafeInteger(total)) return mailError("RESOURCE_LIMIT", "T\xE0i nguy\xEAn v\u01B0\u1EE3t gi\u1EDBi h\u1EA1n.");
        p.value.resources[reward.id] = total;
      } else if (reward.type === "item") {
        addStoreInventoryItem(nk, i.value.items, reward.id, reward.amount);
        if (i.value.items.length > 2e3) return mailError("INVENTORY_FULL", "T\xFAi \u0111\u1ED3 \u0111\u1EA7y. H\xE3y d\u1ECDn t\xFAi r\u1ED3i nh\u1EADn l\u1EA1i.");
      } else if (reward.type === "exp") {
        progressionApplyUser(nk, p.value, reward.amount);
        progressionReconcileLevelUnlocks(nk, p.value);
      } else throw new Error("INVALID_STORED_REWARD");
    }
    writes.push(
      { collection: "player_profiles", key: "main", userId, value: p.value, version: p.version, permissionRead: 1, permissionWrite: 0 },
      { collection: "player_inventory", key: "items", userId, value: i.value, version: i.version, permissionRead: 1, permissionWrite: 0 }
    );
    if (mail.weekly) writes.push({
      collection: "weekly_leaderboard_claims",
      key: weeklyClaimKey(mail.weekly.period_id, mail.weekly.board_id),
      userId,
      value: { period_id: mail.weekly.period_id, board_id: mail.weekly.board_id, rewards: mail.attachments },
      version: "*",
      permissionRead: 0,
      permissionWrite: 0
    });
  }
  if (mail.expires_at_ms !== null && Date.now() >= mail.expires_at_ms) return mailError("MAIL_EXPIRED", "Th\u01B0 \u0111\xE3 h\u1EBFt h\u1EA1n nh\u1EADn th\u01B0\u1EDFng.");
  mail.claimed_at_ms = Date.now();
  mail.version++;
  writes.push(Object.assign(mailWrite(mail, userId), { version: stored.version }));
  try {
    mailCombatRuntime(nk, userId).storageWrite(writes);
  } catch (_e) {
    return mailError("DATA_CHANGED", "D\u1EEF li\u1EC7u v\u1EEBa thay \u0111\u1ED5i. Vui l\xF2ng th\u1EED l\u1EA1i.");
  }
  mailPush(nk, userId, id);
  return { success: true, already_claimed: !!oldWeekly, mail: mailPresent(nk, mail, Date.now()), profile: p.value, inventory: i.value.items };
}
function mailMutateOne(nk, userId, id, action) {
  if (action === "claim") return mailClaimOne(nk, userId, id);
  const stored = mailRead(nk, userId, id);
  if (!stored) return mailError("MAIL_NOT_FOUND", "Th\u01B0 kh\xF4ng c\xF2n t\u1ED3n t\u1EA1i.");
  const row = stored.value, now = Date.now();
  if (action === "delete" && !mailPresent(nk, row, now).can_delete) return mailError("UNCLAIMED_REWARD", "H\xE3y nh\u1EADn ph\u1EA7n th\u01B0\u1EDFng tr\u01B0\u1EDBc khi x\xF3a th\u01B0.");
  if (action === "open" && !row.read_at_ms) row.read_at_ms = now;
  if (action === "delete") row.deleted_at_ms = now;
  row.version++;
  try {
    nk.storageWrite([Object.assign(mailWrite(row, userId), { version: stored.version })]);
  } catch (_e) {
    return mailError("DATA_CHANGED", "D\u1EEF li\u1EC7u v\u1EEBa thay \u0111\u1ED5i. Vui l\xF2ng th\u1EED l\u1EA1i.");
  }
  mailPush(nk, userId, id);
  return { success: true, mail: mailPresent(nk, row, now) };
}
function mailList(nk, userId, req) {
  const now = Date.now(), filter = req.filter || "all";
  if (MAIL_FILTERS.indexOf(filter) < 0) throw new Error("INVALID_FILTER");
  const limit = Number.isSafeInteger(req.limit) ? Math.min(50, Math.max(1, req.limit)) : 20;
  let cursor = [Number.MAX_SAFE_INTEGER, "~"];
  if (req.cursor) {
    cursor = JSON.parse(req.cursor);
    if (!Array.isArray(cursor) || cursor.length !== 2 || !Number.isSafeInteger(cursor[0]) || typeof cursor[1] !== "string" || cursor[1].length > 150) throw new Error("INVALID_CURSOR");
  }
  const clauses = {
    all: "TRUE",
    unread: "value->>'read_at_ms' IS NULL",
    read: "value->>'read_at_ms' IS NOT NULL",
    reward: "jsonb_array_length(value->'attachments')>0",
    expiring: "value->>'expires_at_ms' IS NOT NULL AND (value->>'expires_at_ms')::BIGINT>$3 AND (value->>'expires_at_ms')::BIGINT<=$7",
    system: "value->>'category'='system'",
    battle_report: "value->>'category'='battle_report'"
  };
  const rows = nk.sqlQuery(`SELECT key,value FROM storage WHERE collection='player_mail' AND user_id=$1::UUID AND left(key,length($2))=$2 AND ($2<>'' OR left(key,2)='m_')
        AND ${mailVisibleSql()} AND ${clauses[filter]} AND ((value->>'created_at_ms')::BIGINT,key)<($4::BIGINT,$5)
        ORDER BY (value->>'created_at_ms')::BIGINT DESC,key DESC LIMIT $6`, [userId, mailPrefix(nk), now, cursor[0], cursor[1], limit + 1].concat(filter === "expiring" ? [now + mailSettings(nk).warning_hours * 36e5] : []));
  const more = rows.length > limit;
  if (more) rows.pop();
  const last = rows[rows.length - 1];
  return { mails: rows.map((r) => mailPresent(nk, parseJsonObject(r.value), now)), next_cursor: more ? JSON.stringify([Number(parseJsonObject(last.value).created_at_ms), last.key]) : "", has_more: more };
}
function mailBulk(nk, userId, req, action) {
  const cursor = req.cursor || "";
  if (typeof cursor !== "string" || cursor.length > 150) throw new Error("INVALID_CURSOR");
  const rows = nk.sqlQuery(`SELECT key,value FROM storage WHERE collection='player_mail' AND user_id=$1::UUID AND left(key,length($2))=$2 AND ($2<>'' OR left(key,2)='m_') AND key>$4
        AND ${mailVisibleSql()} ORDER BY key LIMIT 26`, [userId, mailPrefix(nk), Date.now(), cursor]);
  const more = rows.length > 25;
  if (more) rows.pop();
  const results = [];
  let latest = {};
  for (const stored of rows) {
    const row = parseJsonObject(stored.value), eligible = action === "claim" ? mailPresent(nk, row, Date.now()).can_claim : !!row.read_at_ms && mailPresent(nk, row, Date.now()).can_delete;
    if (!eligible) {
      results.push({ id: row.id, success: false, code: "INELIGIBLE" });
      continue;
    }
    const result = mailMutateOne(nk, userId, row.id, action);
    results.push({ id: row.id, success: result.success, code: result.code || "" });
    if (result.profile) latest = { profile: result.profile, inventory: result.inventory };
  }
  return Object.assign(latest, { results, has_more: more, next_cursor: more ? rows[rows.length - 1].key : "" });
}
function mailRecoverWeekly(nk, userId) {
  const scope = characterContext(nk), table = scope ? "server_weekly_awards" : "weekly_leaderboard_awards";
  const args = [userId, mailPrefix(nk)];
  if (scope) args.push(scope.serverId, scope.generation);
  const awards = nk.sqlQuery(`SELECT a.period_id,a.board_id,a.rank,a.rewards,EXTRACT(EPOCH FROM a.expires_at)*1000 AS expires_at_ms FROM ${table} a
      WHERE a.user_id=$1::UUID AND a.expires_at>clock_timestamp() ${scope ? "AND a.server_id=$3 AND a.generation=$4" : ""}
      AND NOT EXISTS(SELECT 1 FROM storage s WHERE s.collection='player_mail_deliveries' AND s.user_id=a.user_id
        AND s.key=$2||'m_'||substring(encode(sha256(convert_to('weekly:'||a.period_id||':'||a.board_id,'UTF8')),'hex'),1,48))
      ORDER BY a.period_id,a.board_id LIMIT 25`, args);
  for (const a of awards) {
    const source = "weekly:" + a.period_id + ":" + a.board_id;
    const marker = nk.storageRead([{ collection: "weekly_leaderboard_claims", key: weeklyClaimKey(a.period_id, a.board_id), userId }])[0];
    const input = {
      source_id: source,
      source_type: "weekly",
      category: "system",
      title: "Ph\u1EA7n th\u01B0\u1EDFng x\u1EBFp h\u1EA1ng tu\u1EA7n",
      body: "B\u1EA3ng " + a.board_id + " \u2014 H\u1EA1ng " + a.rank + ".",
      attachments: parseJsonb(a.rewards),
      expires_at_ms: Math.floor(Number(a.expires_at_ms)),
      weekly: { period_id: String(a.period_id), board_id: a.board_id }
    };
    if (marker) {
      const id = mailId(nk, source);
      try {
        nk.storageWrite([{ collection: "player_mail_deliveries", key: id, userId, value: { source_id: source, already_claimed: true }, version: "*", permissionRead: 0, permissionWrite: 0 }]);
      } catch (_e) {
      }
    } else {
      try {
        deliverMail(nk, userId, input);
      } catch (error) {
        if (String(error).indexOf("version") < 0) throw error;
      }
    }
  }
}
function mailPlayerHandler(action) {
  return (ctx, _logger, nk, payload) => {
    if (!ctx.userId) return JSON.stringify(mailError("AUTH_REQUIRED", "C\u1EA7n \u0111\u0103ng nh\u1EADp."));
    try {
      const req = serverRequest(payload);
      let result = {};
      if (action === "summary" || action === "list") mailRecoverWeekly(nk, ctx.userId);
      if (action === "list") result = mailList(nk, ctx.userId, req);
      else if (action === "claim_all" || action === "delete_read") result = mailBulk(nk, ctx.userId, req, action === "claim_all" ? "claim" : "delete");
      else if (action !== "summary") result = mailMutateOne(nk, ctx.userId, req.id, action);
      return mailResponse(nk, ctx.userId, result);
    } catch (error) {
      _logger.error("Mailbox: " + String(error));
      return JSON.stringify(mailError("MAIL_UNAVAILABLE", "Kh\xF4ng th\u1EC3 x\u1EED l\xFD h\u1ED9p th\u01B0. Vui l\xF2ng t\u1EA3i l\u1EA1i v\xE0 th\u1EED l\u1EA1i."));
    }
  };
}
function createMailboxTables(nk) {
  nk.sqlExec(`CREATE INDEX IF NOT EXISTS player_mail_owner_idx ON storage(user_id,key) WHERE collection='player_mail';
      CREATE INDEX IF NOT EXISTS player_mail_order_idx ON storage(user_id,((value->>'created_at_ms')::BIGINT) DESC,key DESC) WHERE collection='player_mail';
      CREATE INDEX IF NOT EXISTS player_mail_purge_idx ON storage(((value->>'purge_at_ms')::BIGINT)) WHERE collection='player_mail';
      CREATE TABLE IF NOT EXISTS mail_campaigns(id TEXT PRIMARY KEY,server_id TEXT NOT NULL,generation INT NOT NULL,definition JSONB NOT NULL,
      cutoff TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),cursor TEXT NOT NULL DEFAULT '',done BOOLEAN NOT NULL DEFAULT FALSE);`, []);
}
function mailAdminRuntime(nk, userId, req) {
  if (!req.server_id) return nk;
  if (typeof req.server_id !== "string" || !/^[a-z][a-z0-9_]{0,31}$/.test(req.server_id) || !Number.isSafeInteger(req.generation) || req.generation < 1) throw new Error("INVALID_CONTEXT");
  const rows = nk.sqlQuery(`SELECT 1 FROM player_characters c JOIN game_servers s ON s.server_id=c.server_id AND s.generation=c.generation
        WHERE c.account_id=$1::UUID AND c.server_id=$2 AND c.generation=$3 AND c.status='ready' AND s.status='open'`, [userId, req.server_id, req.generation]);
  if (!rows.length) throw new Error("CHARACTER_NOT_READY");
  return characterRuntime(nk, { accountId: userId, serverId: req.server_id, generation: req.generation });
}
const rpcMailAdminSend = (ctx, _logger, nk, payload) => {
  const denied = requireServerAdmin(ctx);
  if (denied) return denied;
  try {
    const req = serverRequest(payload);
    if (!/^[a-f0-9-]{36}$/.test(req.target_user_id || "")) throw new Error("INVALID_USER");
    if (ctx.env.MULTI_SERVER_ENABLED === "true" && !req.server_id) throw new Error("CONTEXT_REQUIRED");
    return JSON.stringify({ success: true, delivery: deliverMail(mailAdminRuntime(nk, req.target_user_id, req), req.target_user_id, req) });
  } catch (error) {
    return JSON.stringify(mailError("INVALID_MAIL", String(error)));
  }
};
const rpcMailAdminCampaign = (ctx, _logger, nk, payload) => {
  const denied = requireServerAdmin(ctx);
  if (denied) return denied;
  try {
    const req = serverRequest(payload);
    if (typeof req.campaign_id !== "string" || !/^[a-zA-Z0-9_:.-]{1,100}$/.test(req.campaign_id)) throw new Error("INVALID_CAMPAIGN");
    if (ctx.env.MULTI_SERVER_ENABLED === "true" && !req.server_id) throw new Error("CONTEXT_REQUIRED");
    if (req.server_id && !nk.sqlQuery("SELECT 1 FROM game_servers WHERE server_id=$1 AND generation=$2 AND status='open'", [req.server_id, req.generation]).length) throw new Error("INVALID_CONTEXT");
    req.source_id = "campaign:" + req.campaign_id;
    req.source_type = "campaign";
    mailDefinition(nk, req);
    nk.sqlExec(
      `INSERT INTO mail_campaigns(id,server_id,generation,definition) VALUES($1,$2,$3,$4::JSONB) ON CONFLICT DO NOTHING`,
      [req.campaign_id, req.server_id || "", req.generation || 0, JSON.stringify(req)]
    );
    return JSON.stringify({ success: true, campaign_id: req.campaign_id });
  } catch (error) {
    return JSON.stringify(mailError("INVALID_CAMPAIGN", String(error)));
  }
};
const rpcMailTick = (ctx, logger, nk, _payload) => {
  if (ctx.userId && requireServerAdmin(ctx)) return JSON.stringify(mailError("FORBIDDEN", "Forbidden"));
  let purged = 0, delivered = 0;
  const failures = [];
  const deadline = Date.now() + 2e3;
  const expired = nk.sqlQuery(`SELECT user_id::TEXT AS user_id,key,version FROM storage WHERE collection='player_mail'
        AND (value->>'deleted_at_ms' IS NOT NULL OR (value->>'purge_at_ms')::BIGINT<= $1) ORDER BY update_time LIMIT 100`, [Date.now()]);
  for (const row of expired) {
    try {
      nk.storageDelete([{ collection: MAIL_COLLECTION, key: row.key, userId: row.user_id, version: row.version }]);
      purged++;
    } catch (_e) {
    }
  }
  const campaigns = nk.sqlQuery("SELECT * FROM mail_campaigns c WHERE NOT done AND (c.server_id='' OR EXISTS(SELECT 1 FROM game_servers s WHERE s.server_id=c.server_id AND s.generation=c.generation AND s.status='open')) ORDER BY cutoff,id LIMIT 5", []);
  for (const campaign of campaigns) {
    if (Date.now() >= deadline) break;
    try {
      const users = campaign.server_id ? nk.sqlQuery(`SELECT c.account_id::TEXT AS user_id FROM player_characters c JOIN users u ON u.id=c.account_id WHERE c.server_id=$1 AND c.generation=$2 AND c.status='ready' AND c.created_at<=$3 AND c.account_id::TEXT>$4 AND COALESCE(u.disable_time,to_timestamp(0))<=to_timestamp(0) AND NOT EXISTS(SELECT 1 FROM account_link_state a WHERE a.user_id=u.id AND a.status='archived') ORDER BY c.account_id::TEXT LIMIT 26`, [campaign.server_id, campaign.generation, campaign.cutoff, campaign.cursor]) : nk.sqlQuery(`SELECT u.id::TEXT AS user_id FROM users u WHERE u.create_time<=$1 AND u.id::TEXT>$2 AND u.id<>'00000000-0000-0000-0000-000000000000' AND COALESCE(u.disable_time,to_timestamp(0))<=to_timestamp(0) AND NOT EXISTS(SELECT 1 FROM account_link_state a WHERE a.user_id=u.id AND a.status='archived') ORDER BY u.id::TEXT LIMIT 26`, [campaign.cutoff, campaign.cursor]);
      const more = users.length > 25;
      if (more) users.pop();
      let last = campaign.cursor, processed = 0;
      for (const user of users) {
        if (Date.now() >= deadline) break;
        deliverMail(mailAdminRuntime(nk, user.user_id, campaign), user.user_id, parseJsonObject(campaign.definition));
        delivered++;
        processed++;
        last = user.user_id;
      }
      nk.sqlExec("UPDATE mail_campaigns SET cursor=$2,done=$3 WHERE id=$1 AND cursor=$4", [campaign.id, last, !more && processed === users.length, campaign.cursor]);
    } catch (error) {
      failures.push({ id: campaign.id, error: String(error) });
    }
  }
  const multi = ctx.env && ctx.env.MULTI_SERVER_ENABLED === "true", table = multi ? "server_weekly_awards" : "weekly_leaderboard_awards";
  const targets = nk.sqlQuery(`SELECT DISTINCT a.user_id::TEXT AS user_id ${multi ? ",a.server_id,a.generation" : ""} FROM ${table} a
        WHERE expires_at>clock_timestamp() AND EXISTS(SELECT 1 FROM users u WHERE u.id=a.user_id AND COALESCE(u.disable_time,to_timestamp(0))<=to_timestamp(0))
        AND NOT EXISTS(SELECT 1 FROM account_link_state l WHERE l.user_id=a.user_id AND l.status='archived')
        ${multi ? "AND EXISTS(SELECT 1 FROM game_servers g JOIN player_characters p ON p.server_id=g.server_id AND p.generation=g.generation WHERE g.server_id=a.server_id AND g.generation=a.generation AND g.status='open' AND p.account_id=a.user_id AND p.status='ready')" : ""}
        AND NOT EXISTS(SELECT 1 FROM storage s WHERE s.collection='player_mail_deliveries' AND s.user_id=a.user_id
        AND s.key=${multi ? "a.server_id||':g'||a.generation||':'||" : ""}'m_'||substring(encode(sha256(convert_to('weekly:'||a.period_id||':'||a.board_id,'UTF8')),'hex'),1,48)) LIMIT 25`, []);
  for (const target of targets) {
    if (Date.now() >= deadline) break;
    try {
      mailRecoverWeekly(mailAdminRuntime(nk, target.user_id, target), target.user_id);
    } catch (error) {
      logger.error("Mail weekly recovery: " + String(error));
      failures.push({ user: target.user_id });
    }
  }
  return JSON.stringify({ success: failures.length === 0, purged, delivered, failures });
};
function applyPurchaseMailRewards(nk, userId, grantId, productId, fulfillmentType, rewards) {
  const marker = { collection: "player_purchase_grants", key: grantId, userId };
  const p = nk.storageRead([{ collection: "player_profiles", key: "main", userId }])[0];
  if (nk.storageRead([marker]).length || p && Array.isArray(p.value._iap_reward_ids) && p.value._iap_reward_ids.indexOf(grantId) >= 0) return { idempotent: true };
  const recurring = DAILY_PACK_IDS.indexOf(productId) >= 0 && rewards.length > 0 && rewards.every((r) => r.metadata && Number(r.metadata.daily_pack_days) === 30);
  const mailed = recurring ? [] : rewards.filter((r) => r.reward_type === "currency" || r.reward_type === "item");
  const immediate = recurring ? rewards : rewards.filter((r) => r.reward_type !== "currency" && r.reward_type !== "item");
  const writes = [], batch = Object.create(nk);
  batch.__purchaseBatch = true;
  batch.__mailBatch = true;
  batch.storageWrite = (changes) => {
    for (const w of changes) writes.push(w);
    return [];
  };
  const result = applyPurchaseStorageRewards(batch, userId, grantId, productId, fulfillmentType, immediate);
  if (mailed.length) result.mail = deliverMail(batch, userId, {
    source_id: "purchase:" + grantId,
    source_type: "purchase",
    title: "Ph\u1EA7n th\u01B0\u1EDFng g\xF3i " + productId,
    body: "Thanh to\xE1n \u0111\xE3 \u0111\u01B0\u1EE3c x\xE1c nh\u1EADn. H\xE3y nh\u1EADn v\u1EADt ph\u1EA9m c\u1EE7a g\xF3i t\u1EA1i \u0111\xE2y.",
    attachments: mailed.map((r) => ({ type: r.reward_type === "currency" ? "resource" : "item", id: r.reward_id, amount: Number(r.quantity) }))
  });
  writes.push(Object.assign({}, marker, { value: { product_id: productId, granted_at_ms: Date.now(), delivery: mailed.length ? "mail" : "direct" }, version: "*", permissionRead: 0, permissionWrite: 0 }));
  nk.storageWrite(writes);
  if (result.mail) mailPush(nk, userId, result.mail.id);
  return result;
}
function mailCombatRuntime(base, userId) {
  const runtime = Object.create(base);
  runtime.storageWrite = (changes) => {
    const writes = changes.slice(), reports = [];
    const profile = changes.find((w) => w.collection === "player_profiles" && w.key === "main" && w.userId === userId);
    if (profile) {
      const previous = base.storageRead([{ collection: "player_profiles", key: "main", userId }])[0];
      const oldArcs = previous && Array.isArray(previous.value.unlocked_arcs) ? previous.value.unlocked_arcs : [];
      const nextArcs = Array.isArray(profile.value.unlocked_arcs) ? profile.value.unlocked_arcs : [];
      const batch = Object.create(base);
      batch.__mailBatch = true;
      batch.storageWrite = (extra) => {
        for (const w of extra) writes.push(w);
        return [];
      };
      for (const arcId of nextArcs.filter((id, index, list) => typeof id === "string" && id !== "arc_0" && oldArcs.indexOf(id) < 0 && list.indexOf(id) === index)) {
        const arc = base.sqlQuery("SELECT display_name FROM game_arcs WHERE id=$1", [arcId])[0];
        if (!arc) throw new Error("UNKNOWN_UNLOCKED_ARC");
        const name = String(arc.display_name || arcId);
        reports.push(deliverMail(batch, userId, {
          source_id: "arc_opened:" + arcId,
          source_type: "arc_opened",
          category: "system",
          title: "Khai m\u1EDF " + name,
          body: "Ch\xFAc m\u1EEBng tu gi\u1EA3 \u0111\xE3 khai m\u1EDF " + name + "!\n\nM\u1ED9t h\xE0nh tr\xECnh m\u1EDBi \u0111ang ch\u1EDD \u0111\xF3n b\u1EA1n. H\xE3y \u0111\u1EBFn Chi\u1EBFn d\u1ECBch \u0111\u1EC3 kh\xE1m ph\xE1 c\xE1c \u1EA3i v\xE0 th\u1EED th\xE1ch c\u1EE7a khu v\u1EF1c n\xE0y.",
          expires_at_ms: null
        }));
      }
    }
    const ack = base.storageWrite(writes);
    for (const report of reports) if (!report.idempotent) mailPush(base, userId, report.id);
    return ack;
  };
  return runtime;
}
function mailSyncWeeklyClaim(nk, userId, payload) {
  const req = serverRequest(payload), id = mailId(nk, "weekly:" + req.period_id + ":" + req.board_id);
  const stored = mailRead(nk, userId, id);
  if (!stored || stored.value.claimed_at_ms) return;
  stored.value.claimed_at_ms = Date.now();
  stored.value.version++;
  try {
    nk.storageWrite([Object.assign(mailWrite(stored.value, userId), { version: stored.version })]);
    mailPush(nk, userId, id);
  } catch (_e) {
  }
}

function linkedRpc_rename_player(ctx, logger, nk, payload) {
  return accountGuardedRpc("rename_player", renamePlayer)(ctx, logger, nk, payload);
}
function linkedRpc_admin_test_access(ctx, logger, nk, payload) {
  return accountGuardedRpc("admin_test_access", adminTestAccess)(ctx, logger, nk, payload);
}
function linkedRpc_account_password_status(ctx, logger, nk, payload) {
  return accountGuardedRpc("account_password_status", accountPasswordStatus)(ctx, logger, nk, payload);
}
function linkedRpc_setup_account_password(ctx, logger, nk, payload) {
  return accountGuardedRpc("setup_account_password", setupAccountPassword)(ctx, logger, nk, payload);
}
function linkedRpc_google_link_status(ctx, logger, nk, payload) {
  return accountGuardedRpc("google_link_status", googleLinkStatus)(ctx, logger, nk, payload);
}
function linkedRpc_prepare_google_link(ctx, logger, nk, payload) {
  return accountGuardedRpc("prepare_google_link", prepareGoogleLink)(ctx, logger, nk, payload);
}
function linkedRpc_confirm_google_link(ctx, logger, nk, payload) {
  return accountGuardedRpc("confirm_google_link", confirmGoogleLink)(ctx, logger, nk, payload);
}
function linkedRpc_seed_game_data(ctx, logger, nk, payload) {
  return accountGuardedRpc("seed_game_data", seedGameData)(ctx, logger, nk, payload);
}
function linkedRpc_get_game_config(ctx, logger, nk, payload) {
  return accountGuardedRpc("get_game_config", gatedGetGameConfig)(ctx, logger, nk, payload);
}
function linkedRpc_get_config_bootstrap(ctx, logger, nk, payload) {
  return accountGuardedRpc("get_config_bootstrap", getConfigBootstrap)(ctx, logger, nk, payload);
}
function linkedRpc_publish_config_release(ctx, logger, nk, payload) {
  return accountGuardedRpc("publish_config_release", gatedPublishConfigRelease)(ctx, logger, nk, payload);
}
function linkedRpc_save_player_profile(ctx, logger, nk, payload) {
  return accountGuardedRpc("save_player_profile", gatedSavePlayerProfile)(ctx, logger, nk, payload);
}
function linkedRpc_load_player_profile(ctx, logger, nk, payload) {
  return accountGuardedRpc("load_player_profile", gatedLoadPlayerProfile)(ctx, logger, nk, payload);
}
function linkedRpc_abandon_run(ctx, logger, nk, payload) {
  return accountGuardedRpc("abandon_run", gatedAbandonRun)(ctx, logger, nk, payload);
}
function linkedRpc_set_player_avatar(ctx, logger, nk, payload) {
  return accountGuardedRpc("set_player_avatar", setPlayerAvatar)(ctx, logger, nk, payload);
}
function linkedRpc_get_player_avatars(ctx, logger, nk, payload) {
  return accountGuardedRpc("get_player_avatars", getPlayerAvatars)(ctx, logger, nk, payload);
}
function linkedRpc_save_compliance_profile(ctx, logger, nk, payload) {
  return accountGuardedRpc("save_compliance_profile", gatedSaveComplianceProfile)(ctx, logger, nk, payload);
}
function linkedRpc_get_compliance_profile(ctx, logger, nk, payload) {
  return accountGuardedRpc("get_compliance_profile", gatedGetComplianceProfile)(ctx, logger, nk, payload);
}
function linkedRpc_update_inventory(ctx, logger, nk, payload) {
  return accountGuardedRpc("update_inventory", gatedUpdateInventory)(ctx, logger, nk, payload);
}
function linkedRpc_talisman_action(ctx, logger, nk, payload) {
  return accountGuardedRpc("talisman_action", gatedTalismanAction)(ctx, logger, nk, payload);
}
function linkedRpc_store_purchase(ctx, logger, nk, payload) {
  return accountGuardedRpc("store_purchase", gatedStorePurchase)(ctx, logger, nk, payload);
}
function linkedRpc_use_consumable(ctx, logger, nk, payload) {
  return accountGuardedRpc("use_consumable", gatedUseConsumable)(ctx, logger, nk, payload);
}
function linkedRpc_talisman_cast(ctx, logger, nk, payload) {
  return accountGuardedRpc("talisman_cast", gatedTalismanCast)(ctx, logger, nk, payload);
}
function linkedRpc_spend_resource(ctx, logger, nk, payload) {
  return accountGuardedRpc("spend_resource", gatedSpendResource)(ctx, logger, nk, payload);
}
function linkedRpc_purchase_stamina(ctx, logger, nk, payload) {
  return accountGuardedRpc("purchase_stamina", gatedPurchaseStamina)(ctx, logger, nk, payload);
}
function linkedRpc_purchase_hero(ctx, logger, nk, payload) {
  return accountGuardedRpc("purchase_hero", gatedPurchaseHero)(ctx, logger, nk, payload);
}
function linkedRpc_daily_checkin_status(ctx, logger, nk, payload) {
  return accountGuardedRpc("daily_checkin_status", gatedDailyCheckinStatus)(ctx, logger, nk, payload);
}
function linkedRpc_daily_checkin_claim(ctx, logger, nk, payload) {
  return accountGuardedRpc("daily_checkin_claim", gatedDailyCheckinClaim)(ctx, logger, nk, payload);
}
function linkedRpc_event_list(ctx, logger, nk, payload) {
  return accountGuardedRpc("event_list", gatedEventList)(ctx, logger, nk, payload);
}
function linkedRpc_event_claim(ctx, logger, nk, payload) {
  return accountGuardedRpc("event_claim", gatedEventClaim)(ctx, logger, nk, payload);
}
function linkedRpc_start_stage(ctx, logger, nk, payload) {
  return accountGuardedRpc("start_stage", gatedStartStage)(ctx, logger, nk, payload);
}
function linkedRpc_upgrade_element(ctx, logger, nk, payload) {
  return accountGuardedRpc("upgrade_element", gatedUpgradeElement)(ctx, logger, nk, payload);
}
function linkedRpc_award_stage_progression(ctx, logger, nk, payload) {
  return accountGuardedRpc("award_stage_progression", (c, l, n, p) => gatedAwardStageProgression(c, l, mailCombatRuntime(n, c.userId), p))(ctx, logger, nk, payload);
}
function linkedRpc_tribulation_action(ctx, logger, nk, payload) {
  return accountGuardedRpc("tribulation_action", (c, l, n, p) => gatedTribulationAction(c, l, mailCombatRuntime(n, c.userId), p))(ctx, logger, nk, payload);
}
function linkedRpc_get_monetization_status(ctx, logger, nk, payload) {
  return accountGuardedRpc("get_monetization_status", gatedGetMonetizationStatus)(ctx, logger, nk, payload);
}
function linkedRpc_get_daily_pack_status(ctx, logger, nk, payload) {
  return accountGuardedRpc("get_daily_pack_status", gatedGetDailyPackStatus)(ctx, logger, nk, payload);
}
function linkedRpc_claim_daily_pack(ctx, logger, nk, payload) {
  return accountGuardedRpc("claim_daily_pack", gatedClaimDailyPack)(ctx, logger, nk, payload);
}
function linkedRpc_create_purchase_order(ctx, logger, nk, payload) {
  return accountGuardedRpc("create_purchase_order", gatedCreatePurchaseOrder)(ctx, logger, nk, payload);
}
function linkedRpc_sync_play_purchase(ctx, logger, nk, payload) {
  return accountGuardedRpc("sync_play_purchase", gatedSyncPlayPurchase)(ctx, logger, nk, payload);
}
function linkedRpc_iap_google_claim(ctx, logger, nk, payload) {
  return accountGuardedRpc("iap_google_claim", gatedIapGoogleClaim)(ctx, logger, nk, payload);
}
function linkedRpc_prepare_rewarded_ad(ctx, logger, nk, payload) {
  return accountGuardedRpc("prepare_rewarded_ad", gatedPrepareRewardedAd)(ctx, logger, nk, payload);
}
function linkedRpc_confirm_rewarded_ad(ctx, logger, nk, payload) {
  return accountGuardedRpc("confirm_rewarded_ad", gatedConfirmRewardedAd)(ctx, logger, nk, payload);
}
function linkedRpc_consume_ad_gameplay_reward(ctx, logger, nk, payload) {
  return accountGuardedRpc("consume_ad_gameplay_reward", gatedConsumeAdGameplayReward)(ctx, logger, nk, payload);
}
function linkedRpc_admob_ssv_confirm(ctx, logger, nk, payload) {
  return accountGuardedRpc("admob_ssv_confirm", admobSsvConfirm)(ctx, logger, nk, payload);
}
function linkedRpc_google_play_rtdn_confirm(ctx, logger, nk, payload) {
  return accountGuardedRpc("google_play_rtdn_confirm", googlePlayRtdnConfirm)(ctx, logger, nk, payload);
}
function linkedRpc_weekly_leaderboard_tick(ctx, logger, nk, payload) {
  return weeklyLeaderboardTickRpc(ctx, logger, nk, payload);
}
function linkedRpc_get_weekly_leaderboard_rewards(ctx, logger, nk, payload) {
  return accountGuardedRpc("get_weekly_leaderboard_rewards", (c, l, n, p) => invokeWithVersionGate(c, l, n, p, getWeeklyLeaderboardRewards))(ctx, logger, nk, payload);
}
function linkedRpc_claim_weekly_leaderboard_reward(ctx, logger, nk, payload) {
  return accountGuardedRpc("claim_weekly_leaderboard_reward", (c, l, n, p) => invokeWithVersionGate(c, l, n, p, (cc, ll, nn, pp) => {
    const result = claimWeeklyLeaderboardReward(cc, ll, nn, pp);
    if (JSON.parse(result).success) mailSyncWeeklyClaim(nn, cc.userId, pp);
    return result;
  }))(ctx, logger, nk, payload);
}
function linkedRpc_sync_player_leaderboards(ctx, logger, nk, payload) {
  return accountGuardedRpc("sync_player_leaderboards", gatedSyncPlayerLeaderboards)(ctx, logger, nk, payload);
}
function linkedRpc_get_leaderboard_records(ctx, logger, nk, payload) {
  return accountGuardedRpc("get_leaderboard_records", gatedGetLeaderboardRecords)(ctx, logger, nk, payload);
}
function linkedRpc_sync_all_leaderboards(ctx, logger, nk, payload) {
  return accountGuardedRpc("sync_all_leaderboards", rpcSyncAllLeaderboards)(ctx, logger, nk, payload);
}
function linkedRpc_session_status(ctx, logger, nk, payload) {
  return accountGuardedRpc("session_status", sessionStatus)(ctx, logger, nk, payload);
}
function linkedRpc_list_servers(c, l, n, p) {
  return accountGuardedRpc("list_servers", listGameServers)(c, l, n, p);
}
function linkedRpc_list_my_characters(c, l, n, p) {
  return accountGuardedRpc("list_my_characters", listMyCharacters)(c, l, n, p);
}
function linkedRpc_enter_server(c, l, n, p) {
  return accountGuardedRpc("enter_server", enterGameServer)(c, l, n, p);
}
function linkedRpc_create_character(c, l, n, p) {
  return accountGuardedRpc("create_character", createServerCharacter)(c, l, n, p);
}
function linkedRpc_iap_claim(c, l, n, p) {
  return accountGuardedRpc("iap_claim", (cc, ll, nn, pp) => invokeWithVersionGate(cc, ll, nn, pp, iapClaim))(c, l, n, p);
}
function linkedRpc_resolve_purchase_order(c, l, n, p) {
  return accountGuardedRpc("resolve_purchase_order", (cc, ll, nn, pp) => invokeWithVersionGate(cc, ll, nn, pp, resolvePurchaseOrder))(c, l, n, p);
}
function InitModule(ctx, logger, nk, initializer) {
  createServerRegistryTables(nk);
  createMailboxTables(nk);
  initializer.registerRpc("mail_summary", linkedRpc_mail_summary);
  initializer.registerRpc("mail_list", linkedRpc_mail_list);
  initializer.registerRpc("mail_open", linkedRpc_mail_open);
  initializer.registerRpc("mail_claim", linkedRpc_mail_claim);
  initializer.registerRpc("mail_claim_all", linkedRpc_mail_claim_all);
  initializer.registerRpc("mail_delete", linkedRpc_mail_delete);
  initializer.registerRpc("mail_delete_read", linkedRpc_mail_delete_read);
  initializer.registerRpc("mail_admin_send", linkedRpc_mail_admin_send);
  initializer.registerRpc("mail_admin_campaign", linkedRpc_mail_admin_campaign);
  initializer.registerRpc("mail_tick", rpcMailTick);
  sweepCreateWorkerIndex(nk);
  initializer.registerRpc("get_sweep_options", linkedRpc_get_sweep_options);
  initializer.registerRpc("preview_sweep", linkedRpc_preview_sweep);
  initializer.registerRpc("start_sweep", linkedRpc_start_sweep);
  initializer.registerRpc("get_sweep_status", linkedRpc_get_sweep_status);
  initializer.registerRpc("cancel_sweep", linkedRpc_cancel_sweep);
  initializer.registerRpc("finish_sweep", linkedRpc_finish_sweep);
  initializer.registerRpc("sweep_tick", rpcSweepTick);
  initializer.registerRpc("admin_server_list", rpcAdminServerList);
  initializer.registerRpc("admin_server_inspect", rpcAdminServerInspect);
  initializer.registerRpc("admin_server_create", rpcAdminServerCreate);
  initializer.registerRpc("admin_server_disable", rpcAdminServerDisable);
  initializer.registerRpc("admin_server_enable", rpcAdminServerEnable);
  initializer.registerRpc("admin_server_update", rpcAdminServerUpdate);
  initializer.registerRpc("admin_server_expire_pending", rpcAdminServerExpirePending);
  initializer.registerRpc("admin_server_plan", rpcAdminServerPlan);
  initializer.registerRpc("admin_server_execute", rpcAdminServerExecute);
  initializer.registerRpc("admin_server_job", rpcAdminServerJob);
  initializer.registerRpc("admin_server_job_step", rpcAdminServerJobStep);
  initializer.registerRpc("admin_server_financial_list", rpcAdminServerFinancialList);
  initializer.registerRpc("admin_server_financial_retry", rpcAdminServerFinancialRetry);
  initializer.registerRpc("list_servers", linkedRpc_list_servers);
  initializer.registerRpc("list_my_characters", linkedRpc_list_my_characters);
  initializer.registerRpc("enter_server", linkedRpc_enter_server);
  initializer.registerRpc("create_character", linkedRpc_create_character);
  createGameConfigTables(nk, logger);
  sweepMigratePublishedConfig(nk, logger);
  createMonetizationTables(nk, logger);
  initializer.registerRpc("iap_claim", linkedRpc_iap_claim);
  initializer.registerRpc("resolve_purchase_order", linkedRpc_resolve_purchase_order);
  createAccountLinkTables(nk);
  createSingleLoginTable(nk);
  initializer.registerBeforeAuthenticateEmail(beforeSingleLoginEmail);
  initializer.registerAfterAuthenticateEmail(afterSingleLogin);
  initializer.registerBeforeAuthenticateGoogle(beforeSingleLogin);
  initializer.registerAfterAuthenticateGoogle(afterSingleLogin);
  initializer.registerBeforeAuthenticateDevice(beforeSingleLogin);
  initializer.registerAfterAuthenticateDevice(afterSingleLogin);
  initializer.registerBeforeAuthenticateCustom(beforeSingleLogin);
  initializer.registerAfterAuthenticateCustom(afterSingleLogin);
  initializer.registerRpc("session_status", linkedRpc_session_status);
  initializer.registerRpc("admin_test_access", linkedRpc_admin_test_access);
  initializer.registerRpc("rename_player", linkedRpc_rename_player);
  initializer.registerRpc("account_password_status", linkedRpc_account_password_status);
  initializer.registerRpc("setup_account_password", linkedRpc_setup_account_password);
  initializer.registerRpc("google_link_status", linkedRpc_google_link_status);
  initializer.registerRpc("prepare_google_link", linkedRpc_prepare_google_link);
  initializer.registerRpc("confirm_google_link", linkedRpc_confirm_google_link);
  vipRuntimeMode = monetizationMode(ctx);
  initializer.registerRpc("seed_game_data", linkedRpc_seed_game_data);
  initializer.registerRpc("get_game_config", linkedRpc_get_game_config);
  initializer.registerRpc("get_config_bootstrap", linkedRpc_get_config_bootstrap);
  initializer.registerRpc("publish_config_release", linkedRpc_publish_config_release);
  initializer.registerRpc("save_player_profile", linkedRpc_save_player_profile);
  initializer.registerRpc("load_player_profile", linkedRpc_load_player_profile);
  initializer.registerRpc("abandon_run", linkedRpc_abandon_run);
  initializer.registerRpc("set_player_avatar", linkedRpc_set_player_avatar);
  initializer.registerRpc("get_player_avatars", linkedRpc_get_player_avatars);
  initializer.registerRpc("save_compliance_profile", linkedRpc_save_compliance_profile);
  initializer.registerRpc("get_compliance_profile", linkedRpc_get_compliance_profile);
  initializer.registerRpc("update_inventory", linkedRpc_update_inventory);
  initializer.registerRpc("talisman_action", linkedRpc_talisman_action);
  initializer.registerRpc("store_purchase", linkedRpc_store_purchase);
  logger.info("Store purchase protocol v2 loaded: store_purchase requires explicit gold/gems");
  initializer.registerRpc("use_consumable", linkedRpc_use_consumable);
  initializer.registerRpc("talisman_cast", linkedRpc_talisman_cast);
  initializer.registerRpc("spend_resource", linkedRpc_spend_resource);
  initializer.registerRpc("purchase_stamina", linkedRpc_purchase_stamina);
  initializer.registerRpc("purchase_hero", linkedRpc_purchase_hero);
  initializer.registerRpc("daily_checkin_status", linkedRpc_daily_checkin_status);
  initializer.registerRpc("daily_checkin_claim", linkedRpc_daily_checkin_claim);
  initializer.registerRpc("event_list", linkedRpc_event_list);
  initializer.registerRpc("event_claim", linkedRpc_event_claim);
  initializer.registerRpc("start_stage", linkedRpc_start_stage);
  initializer.registerRpc("upgrade_element", linkedRpc_upgrade_element);
  initializer.registerRpc("award_stage_progression", linkedRpc_award_stage_progression);
  initializer.registerRpc("tribulation_action", linkedRpc_tribulation_action);
  initializer.registerRpc("get_monetization_status", linkedRpc_get_monetization_status);
  initializer.registerRpc("get_daily_pack_status", linkedRpc_get_daily_pack_status);
  initializer.registerRpc("claim_daily_pack", linkedRpc_claim_daily_pack);
  initializer.registerRpc("create_purchase_order", linkedRpc_create_purchase_order);
  initializer.registerRpc("sync_play_purchase", linkedRpc_sync_play_purchase);
  initializer.registerRpc("iap_google_claim", linkedRpc_iap_google_claim);
  initializer.registerRpc("prepare_rewarded_ad", linkedRpc_prepare_rewarded_ad);
  initializer.registerRpc("confirm_rewarded_ad", linkedRpc_confirm_rewarded_ad);
  initializer.registerRpc("consume_ad_gameplay_reward", linkedRpc_consume_ad_gameplay_reward);
  initializer.registerRpc("admob_ssv_confirm", linkedRpc_admob_ssv_confirm);
  initializer.registerRpc("google_play_rtdn_confirm", linkedRpc_google_play_rtdn_confirm);
  createWeeklyLeaderboardTables(nk);
  createServerWeeklyTables(nk);
  createMultiAccountLinkFunctions(nk);
  if (!ctx.env || ctx.env.MULTI_SERVER_ENABLED !== "true") {
    tickWeeklyLeaderboards(nk);
    createLeaderboards(nk, logger);
  }
  initializer.registerRpc("get_weekly_leaderboard_rewards", linkedRpc_get_weekly_leaderboard_rewards);
  initializer.registerRpc("claim_weekly_leaderboard_reward", linkedRpc_claim_weekly_leaderboard_reward);
  initializer.registerRpc("weekly_leaderboard_tick", linkedRpc_weekly_leaderboard_tick);
  initializer.registerRpc("sync_player_leaderboards", linkedRpc_sync_player_leaderboards);
  initializer.registerRpc("get_leaderboard_records", linkedRpc_get_leaderboard_records);
  initializer.registerRpc("sync_all_leaderboards", linkedRpc_sync_all_leaderboards);
  logger.info("Survival TD \u2014 Server modules initialized.");
}
function linkedRpc_get_sweep_options(c, l, n, p) {
  return accountGuardedRpc("get_sweep_options", (cc, ll, nn, pp) => invokeWithVersionGate(cc, ll, nn, pp, getSweepOptions))(c, l, n, p);
}
function linkedRpc_preview_sweep(c, l, n, p) {
  return accountGuardedRpc("preview_sweep", (cc, ll, nn, pp) => invokeWithVersionGate(cc, ll, nn, pp, previewSweep))(c, l, n, p);
}
function linkedRpc_start_sweep(c, l, n, p) {
  return accountGuardedRpc("start_sweep", (cc, ll, nn, pp) => invokeWithVersionGate(cc, ll, nn, pp, startSweep))(c, l, n, p);
}
function linkedRpc_get_sweep_status(c, l, n, p) {
  return accountGuardedRpc("get_sweep_status", (cc, ll, nn, pp) => invokeWithVersionGate(cc, ll, nn, pp, getSweepStatus))(c, l, n, p);
}
function linkedRpc_cancel_sweep(c, l, n, p) {
  return accountGuardedRpc("cancel_sweep", (cc, ll, nn, pp) => invokeWithVersionGate(cc, ll, nn, pp, cancelSweep))(c, l, n, p);
}
function linkedRpc_mail_summary(c, l, n, p) {
  return accountGuardedRpc("mail_summary", (cc, ll, nn, pp) => invokeWithVersionGate(cc, ll, nn, pp, mailPlayerHandler("summary")))(c, l, n, p);
}
function linkedRpc_mail_list(c, l, n, p) {
  return accountGuardedRpc("mail_list", (cc, ll, nn, pp) => invokeWithVersionGate(cc, ll, nn, pp, mailPlayerHandler("list")))(c, l, n, p);
}
function linkedRpc_mail_open(c, l, n, p) {
  return accountGuardedRpc("mail_open", (cc, ll, nn, pp) => invokeWithVersionGate(cc, ll, nn, pp, mailPlayerHandler("open")))(c, l, n, p);
}
function linkedRpc_mail_claim(c, l, n, p) {
  return accountGuardedRpc("mail_claim", (cc, ll, nn, pp) => invokeWithVersionGate(cc, ll, nn, pp, mailPlayerHandler("claim")))(c, l, n, p);
}
function linkedRpc_mail_claim_all(c, l, n, p) {
  return accountGuardedRpc("mail_claim_all", (cc, ll, nn, pp) => invokeWithVersionGate(cc, ll, nn, pp, mailPlayerHandler("claim_all")))(c, l, n, p);
}
function linkedRpc_mail_delete(c, l, n, p) {
  return accountGuardedRpc("mail_delete", (cc, ll, nn, pp) => invokeWithVersionGate(cc, ll, nn, pp, mailPlayerHandler("delete")))(c, l, n, p);
}
function linkedRpc_mail_delete_read(c, l, n, p) {
  return accountGuardedRpc("mail_delete_read", (cc, ll, nn, pp) => invokeWithVersionGate(cc, ll, nn, pp, mailPlayerHandler("delete_read")))(c, l, n, p);
}
function linkedRpc_mail_admin_send(c, l, n, p) {
  return accountGuardedRpc("mail_admin_send", rpcMailAdminSend)(c, l, n, p);
}
function linkedRpc_mail_admin_campaign(c, l, n, p) {
  return accountGuardedRpc("mail_admin_campaign", rpcMailAdminCampaign)(c, l, n, p);
}
function linkedRpc_finish_sweep(c, l, n, p) {
  return accountGuardedRpc("finish_sweep", (cc, ll, nn, pp) => invokeWithVersionGate(cc, ll, mailCombatRuntime(nn, cc.userId), pp, finishSweep))(c, l, n, p);
}
