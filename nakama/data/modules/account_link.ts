// C131: signed per-login generation, never accepted from an RPC payload.
const LOGIN_REPLACED_MESSAGE = "Tài khoản đã được đăng nhập ở thiết bị khác";

function createSingleLoginTable(nk: nkruntime.Nakama): void {
    nk.sqlExec(`CREATE TABLE IF NOT EXISTS player_login_sessions (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        generation TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`, []);
}

function beforeSingleLogin(_ctx: nkruntime.Context, _logger: nkruntime.Logger, nk: nkruntime.Nakama, request: any): any {
    if (request && request.account) {
        request.account.vars = Object.assign({}, request.account.vars || {}, {login_generation:nk.uuidv4()});
    }
    return request;
}

function beforeSingleLoginEmail(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, request: any): any {
    return beforeSingleLogin(ctx, logger, nk, beforeEmailPasswordSetup(ctx, logger, nk, request));
}

function afterSingleLogin(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, _session: any, request: any): void {
    const generation = String((ctx.vars || {}).login_generation || ((request.account || {}).vars || {}).login_generation || "");
    if (!ctx.userId || !generation) throw Error("Missing server login generation");
    nk.sqlExec(`INSERT INTO player_login_sessions(user_id,generation) VALUES($1::UUID,$2)
        ON CONFLICT(user_id) DO UPDATE SET generation=EXCLUDED.generation,updated_at=NOW()`, [ctx.userId,generation]);
    // Broadcast an invalidation hint, not the secret generation. Receivers check
    // ownership once; self/reordered notifications cannot evict the new owner.
    try {
        nk.notificationSend(ctx.userId, "Session changed", {type:"session_changed"}, 131, undefined, false);
    } catch (error) {
        logger.warn("Login change push failed; reconnect/RPC guards remain authoritative: %s", String(error));
    }
}

function requireCurrentLogin(ctx: nkruntime.Context, nk: nkruntime.Nakama): string | null {
    if (!ctx.userId) return null; // Internal HTTP-key callbacks retain existing guards.
    const generation = String((ctx.vars || {}).login_generation || "");
    const rows = generation ? nk.sqlQuery("SELECT generation FROM player_login_sessions WHERE user_id=$1::UUID", [ctx.userId]) : [];
    if (!generation || !rows.length || String(rows[0].generation) !== generation) {
        return JSON.stringify({success:false,status:"error",code:401,reason:"SESSION_REPLACED",message:LOGIN_REPLACED_MESSAGE});
    }
    return null;
}

const sessionStatus: nkruntime.RpcFunction = (_ctx, _logger, _nk) => JSON.stringify({success:true});

// C117: Google proof stays in memory; account conflict commit is one SQL transaction.
function createAccountLinkTables(nk: nkruntime.Nakama): void {
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
            CASE WHEN COALESCE(w.google_id,'')<>'' THEN 'Tu Giả '||UPPER(LEFT(REPLACE(w.id::TEXT,'-',''),6)) ELSE w.username END)));
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

function withActiveAccount<T>(nk: nkruntime.Nakama, userId: string, action: () => T): T {
    const lease = nk.sqlQuery(`INSERT INTO account_link_state(user_id,active_requests) VALUES($1::UUID,1)
        ON CONFLICT(user_id) DO UPDATE SET active_requests=account_link_state.active_requests+1
        WHERE account_link_state.status='active' RETURNING user_id`, [userId]);
    if (!lease.length) throw new Error("Account archived after linking; sign in again");
    try { return action(); }
    finally { nk.sqlExec("UPDATE account_link_state SET active_requests=GREATEST(0,active_requests-1) WHERE user_id=$1::UUID", [userId]); }
}

function accountGuardedRpc(id: string, handler: nkruntime.RpcFunction): nkruntime.RpcFunction {
    handler = serverAdmissionRpc(id, handler);
    return (ctx, logger, nk, payload) => {
        const rejected = requireCurrentLogin(ctx, nk);
        if (rejected) return rejected;
        if (id === "confirm_google_link") return handler(ctx, logger, nk, payload);
        let owner = ctx.userId;
        if (!owner && (id === "admob_ssv_confirm" || id === "google_play_rtdn_confirm")) {
            let req: any; try {req=JSON.parse(payload || "{}");} catch(_e){return JSON.stringify({success:false,code:400});}
            if (!req || typeof req!=="object") return JSON.stringify({success:false,code:400});
            if (String(req.verifier_secret || "") !== String(ctx.env.MONETIZATION_VERIFIER_SECRET || "") || !ctx.env.MONETIZATION_VERIFIER_SECRET) return JSON.stringify({success:false,code:403});
            if (id === "admob_ssv_confirm") owner = String(req.user_id || "");
            else {
                const rows = nk.sqlQuery("SELECT user_id FROM monetization_purchases WHERE purchase_token_hash=$1 LIMIT 1", [String(req.purchase_token_hash || "")]);
                owner = rows.length ? String(rows[0].user_id) : "";
            }
        }
        if (!owner) return handler(ctx, logger, nk, payload);
        try { return withActiveAccount(nk, owner, () => handler(ctx, logger, nk, payload)); }
        catch (error) {
            if (String(error).indexOf("Account archived") >= 0) {
                if(id==='admob_ssv_confirm') {
                    const req=serverRequest(payload);
                    const rows=nk.sqlQuery("SELECT 1 FROM monetization_ad_rewards WHERE ad_session_id=$1 AND user_id=$2 AND status='granted'",[String(req.ad_session_id||''),owner]);
                    if(rows.length)return JSON.stringify({status:'success',data:{granted:true,idempotent:true}});
                }
                return JSON.stringify({success:false,status:"error",code:401,message:"Account archived after linking; sign in again"});
            }
            throw error;
        }
    };
}

function isLinkedReceiptOwner(nk: nkruntime.Nakama, receiptOwner: string, userId: string): boolean {
    if (receiptOwner === userId) return true;
    return nk.sqlQuery("SELECT 1 FROM account_link_archives WHERE loser_id=$1::UUID AND winner_id=$2::UUID", [receiptOwner,userId]).length > 0;
}

function beforeEmailPasswordSetup(_ctx: nkruntime.Context, _logger: nkruntime.Logger, nk: nkruntime.Nakama, request: any): any {
    const email=request && request.account && request.account.email;
    const password=request && request.account && request.account.password;
    // Preserve Nakama validation and username authentication for all other requests.
    if (typeof email!=="string" || typeof password!=="string" || password.length<8 || email.length>255) return request;
    const rows=nk.sqlQuery(`SELECT 1 FROM users WHERE email=$1
        AND COALESCE(google_id,'')<>'' AND COALESCE(octet_length(password),0)=0
        AND COALESCE(EXTRACT(EPOCH FROM disable_time),0)=0 LIMIT 1`,[email.toLowerCase()]);
    if (rows.length) throw {code:9,message:"PASSWORD_SETUP_REQUIRED: Tài khoản này đã đăng nhập bằng Google nhưng chưa cài đặt mật khẩu email. Hãy xác nhận Google để cài đặt mật khẩu."};
    return request;
}

const accountPasswordStatus: nkruntime.RpcFunction = (ctx, _logger, nk) => {
    if (!ctx.userId) return JSON.stringify({success:false,code:401,message:"Cần đăng nhập lại."});
    const rows = nk.sqlQuery(`SELECT email, COALESCE(octet_length(password),0)>0 AS has_password,
        COALESCE(google_id,'')<>'' AS google_linked FROM users
        WHERE id=$1::UUID AND COALESCE(EXTRACT(EPOCH FROM disable_time),0)=0`, [ctx.userId]);
    if (!rows.length) return JSON.stringify({success:false,code:403,message:"Tài khoản không khả dụng."});
    const row=rows[0];
    return JSON.stringify({success:true,email:String(row.email||""),has_password:!!row.has_password,
        can_setup:!!row.google_linked && !!row.email && !row.has_password});
};

const setupAccountPassword: nkruntime.RpcFunction = (ctx, _logger, nk, payload) => {
    const fail=(code:number,message:string)=>JSON.stringify({success:false,code,message});
    if (!ctx.userId) return fail(401,"Cần đăng nhập lại.");
    if (!payload || payload.length>20000) return fail(400,"Thông tin cài đặt không hợp lệ.");
    let req:any;
    try { req=JSON.parse(payload); } catch (_e) { return fail(400,"Thông tin cài đặt không hợp lệ."); }
    if (!req || typeof req!=="object" || Array.isArray(req) || typeof req.password!=="string"
        || typeof req.id_token!=="string") return fail(400,"Thông tin cài đặt không hợp lệ.");
    const password=req.password,token=req.id_token;
    // bcrypt accepts at most 72 UTF-8 bytes. Reject invalid surrogate sequences too.
    let bytes=0;
    try { bytes=encodeURIComponent(password).replace(/%[0-9A-F]{2}|./g,"x").length; }
    catch (_e) { return fail(400,"Mật khẩu chứa ký tự không hợp lệ."); }
    if (Array.from(password).length<8 || bytes>72) return fail(400,"Mật khẩu cần ít nhất 8 ký tự và tối đa 72 byte UTF-8.");
    if (!token || token.length>16384) return fail(400,"Hãy xác nhận lại tài khoản Google.");
    const rows=nk.sqlQuery(`SELECT email,google_id,COALESCE(octet_length(password),0)>0 AS has_password
        FROM users WHERE id=$1::UUID AND COALESCE(EXTRACT(EPOCH FROM disable_time),0)=0`,[ctx.userId]);
    if (!rows.length) return fail(403,"Tài khoản không khả dụng.");
    const row=rows[0];
    if (row.has_password) return fail(409,"Tài khoản đã có mật khẩu. Hãy đăng nhập bằng mật khẩu đã tạo.");
    if (!row.email || !row.google_id) return fail(409,"Tài khoản cần có email và liên kết Google trước khi cài đặt mật khẩu.");
    let google:any;
    try { google=nk.authenticateGoogle(token,"",false); }
    catch (_e) { return fail(403,"Không thể xác thực Google. Hãy chọn lại tài khoản Google."); }
    if (google.userId!==ctx.userId) return fail(403,"Hãy chọn đúng Google đã liên kết với tài khoản hiện tại.");
    try {
        const hash=nk.bcryptHash(password);
        const updated=nk.sqlQuery(`UPDATE users SET password=convert_to($4,'UTF8'),update_time=NOW()
            WHERE id=$1::UUID AND email=$2 AND google_id=$3 AND COALESCE(octet_length(password),0)=0
            AND COALESCE(EXTRACT(EPOCH FROM disable_time),0)=0 RETURNING id`,[ctx.userId,row.email,row.google_id,hash]);
        if (!updated.length) return fail(409,"Thông tin tài khoản đã thay đổi. Hãy mở lại cài đặt mật khẩu.");
    } catch (_e) { return fail(500,"Chưa thể lưu mật khẩu. Hãy kiểm tra trạng thái tài khoản rồi thử lại."); }
    return JSON.stringify({success:true,message:"Đã cài đặt mật khẩu. Bạn có thể đăng nhập bằng email hoặc Google vào cùng tài khoản."});
};

const googleLinkStatus: nkruntime.RpcFunction = (ctx, _logger, nk) => {
    if (!ctx.userId) return JSON.stringify({success:false,code:401});
    return JSON.stringify({success:true,linked:!!nk.accountGetId(ctx.userId).user.googleId});
};

function accountLinkSummary(nk: nkruntime.Nakama, userId: string): any {
    const objects = nk.storageRead([
        {collection:"player_profiles",key:"main",userId}, {collection:"player_heroes",key:"states",userId},
        {collection:"player_inventory",key:"items",userId}
    ]);
    const profile = objects.find(o=>o.collection==="player_profiles");
    if (!profile) throw new Error("Account profile unavailable; sign in to both accounts once");
    const p = profile.value || {};
    const heroes = objects.find(o=>o.collection==="player_heroes");
    const inventory = objects.find(o=>o.collection==="player_inventory");
    const entitlement = readEntitlementRow(nk,userId);
    return {user_id:userId,name:String(p.display_name || nk.accountGetId(userId).user.username),avatar_url:String(p.avatar_url||"hero_1"),
        level:Number(p.level||1),vip:readVipProgress(nk,userId,vipRuntimeMode),resources:p.resources||{},
        heroes:canonicalHeroStates(nk,heroes?heroes.value:null).filter(h=>h.owned).map(h=>({hero_id:h.hero_id,level:h.level})),
        completed_stages:Array.isArray(p.completed_stage_levels)?p.completed_stage_levels.length:0,
        inventory_count:inventory&&Array.isArray(inventory.value.items)?inventory.value.items.length:0,
        no_ads_expires_at:Number(entitlement.no_ads_expires_at||0),server_time:Number(entitlement.server_time||0)};
}

function multiAccountLinkSummary(nk:nkruntime.Nakama,userId:string):any {
    const characters=nk.sqlQuery(`SELECT c.server_id,c.generation,c.status,s.display_name,
      COALESCE(p.value->>'display_name','') AS name,COALESCE((p.value->>'level')::INT,1) AS level
      FROM player_characters c JOIN game_servers s ON s.server_id=c.server_id
      LEFT JOIN storage p ON p.user_id=c.account_id AND p.collection='player_profiles' AND p.key=c.server_id||':g'||c.generation||':main'
      WHERE c.account_id=$1::UUID ORDER BY c.server_id`,[userId]);
    const entitlement=readEntitlementRow(nk,userId);
    return {user_id:userId,name:nk.accountGetId(userId).user.username,level:1,heroes:[],resources:{},characters,
      no_ads_expires_at:Number(entitlement.no_ads_expires_at||0),server_time:Number(entitlement.server_time||0)};
}

function multiLinkSnapshot(nk:nkruntime.Nakama,a:string,b:string):any {
    return parseJsonb(nk.sqlQuery('SELECT multi_account_link_snapshot($1::UUID,$2::UUID) AS value',[a,b])[0].value);
}

function createMultiAccountLinkFunctions(nk:nkruntime.Nakama):void {
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
    END $merge$;`,[]);
}

function repairMultiLinkBoards(nk:nkruntime.Nakama,winner:string,server:string,generation:number):void {
    const tasks=nk.sqlQuery('SELECT * FROM account_link_server_tasks WHERE winner_id=$1::UUID AND server_id=$2 AND generation=$3 AND done=FALSE ORDER BY intent_id',[winner,server,generation]);
    if(!tasks.length)return;
    withServerRequest(nk,{accountId:winner,serverId:server,generation},()=>{
        for(const task of tasks) {
            for(const board of ['best_wave','most_kills','total_wins','cultivation_realm','campaign_stage','combat_power_v2']) {
                const id=server+':g'+generation+':'+board;
                let records:any;
                try{records=nk.leaderboardRecordsList(id,[String(task.loser_id)],1,'',0);}
                catch(error){if(/not found|not exist/i.test(String(error)))continue;throw error;}
                const record=(records.ownerRecords||[]).find((r:any)=>r.ownerId===String(task.loser_id));
                if(!record)continue;
                if(task.copy_records)nk.leaderboardRecordWrite(id,winner,record.username,record.score,record.subscore,record.metadata,'best' as any);
                nk.leaderboardRecordDelete(id,String(task.loser_id));
            }
            nk.sqlExec('UPDATE account_link_server_tasks SET done=TRUE WHERE intent_id=$1::UUID AND server_id=$2 AND generation=$3',[task.intent_id,server,generation]);
        }
    });
}

function readAccountLinkSnapshot(nk: nkruntime.Nakama, a: string, b: string): any {
    const rows=nk.sqlQuery(`SELECT
        (SELECT jsonb_object_agg(id::TEXT,jsonb_build_object('email',email,'google',google_id,'password',password,'custom',custom_id,'disabled',disable_time)) FROM users WHERE id IN($1::UUID,$2::UUID)) AS identities,
        (SELECT COALESCE(jsonb_object_agg(user_id::TEXT||'/'||collection||'/'||key,version),'{}'::JSONB) FROM storage WHERE user_id IN($1::UUID,$2::UUID)) AS versions,
        account_link_finance_snapshot($1::UUID,$2::UUID) AS finance`,[a,b]);
    if (!rows.length) throw new Error("Account snapshot unavailable");
    return {identities:parseJsonb(rows[0].identities),versions:parseJsonb(rows[0].versions),finance:parseJsonb(rows[0].finance)};
}

function canonicalLinkSnapshot(value: any): string {
    function sorted(v: any): any {
        if (Array.isArray(v)) return v.map(sorted);
        if (!v||typeof v!=="object") return v;
        const result: any={};for(const key of Object.keys(v).sort())result[key]=sorted(v[key]);return result;
    }
    return JSON.stringify(sorted(value));
}

const prepareGoogleLink: nkruntime.RpcFunction = (ctx, _logger, nk, payload) => {
    if (!ctx.userId) return JSON.stringify({success:false,code:401});
    let req: any; try {req=JSON.parse(payload||"{}");} catch(_e){return JSON.stringify({success:false,code:400});}
    const token=String(req&&req.id_token||"");
    if (!token || token.length>16384) return JSON.stringify({success:false,code:400,message:"Missing Google ID token"});
    let google: any;
    try {google=nk.authenticateGoogle(token,"",false);}
    catch(error) {
        if (String(error).toLowerCase().indexOf("user account not found")<0) return JSON.stringify({success:false,code:401,message:"Google verification failed"});
        try { nk.linkGoogle(ctx.userId,token); return JSON.stringify({success:true,linked:true}); }
        catch(_e){return JSON.stringify({success:false,code:409,message:"Google identity changed; retry sign-in"});}
    }
    if (google.userId===ctx.userId) return JSON.stringify({success:true,linked:true,already_linked:true});
    try {
        const multi=!!(ctx.env && ctx.env.MULTI_SERVER_ENABLED==='true');
        const a=nk.accountGetId(ctx.userId),b=nk.accountGetId(google.userId);
        if (a.disableTime||b.disableTime) throw new Error("Account is disabled");
        if (a.email&&b.email&&a.email.toLowerCase()!==b.email.toLowerCase()) throw new Error("Different email credentials require support");
        if (a.user.googleId&&a.user.googleId!==b.user.googleId) throw new Error("Different Google identities require support");
        // Reconcile legacy VIP credits before capturing the review snapshot.
        if(!multi){readVipProgress(nk,ctx.userId,vipRuntimeMode);readVipProgress(nk,google.userId,vipRuntimeMode);}
        const snapshot=readAccountLinkSnapshot(nk,ctx.userId,google.userId);
        const accounts=multi?[multiAccountLinkSummary(nk,ctx.userId),multiAccountLinkSummary(nk,google.userId)]:[accountLinkSummary(nk,ctx.userId),accountLinkSummary(nk,google.userId)];
        const multiSnapshot=multi?multiLinkSnapshot(nk,ctx.userId,google.userId):null;
        if(canonicalLinkSnapshot(snapshot)!==canonicalLinkSnapshot(readAccountLinkSnapshot(nk,ctx.userId,google.userId)))throw new Error("Progress changed; refresh preview");
        const ticket=nk.uuidv4();
        const rows=nk.sqlQuery(`INSERT INTO account_link_intents(id,initiator,other_id,google_id,identity_snapshot,versions,finance_snapshot,multi_snapshot)
            VALUES($1::UUID,$2::UUID,$3::UUID,$4,$5::JSONB,$6::JSONB,$7::JSONB,$8::JSONB)
            RETURNING EXTRACT(EPOCH FROM expires_at)::BIGINT AS expires_at`,[ticket,ctx.userId,google.userId,b.user.googleId,
                JSON.stringify(snapshot.identities),JSON.stringify(snapshot.versions),JSON.stringify(snapshot.finance),multiSnapshot?JSON.stringify(multiSnapshot):null]);
        return JSON.stringify({success:true,conflict:true,ticket,accounts,server_mode:multi?'multi':'legacy',expires_at:Number(rows[0].expires_at)});
    } catch(error){return JSON.stringify({success:false,code:409,message:String(error)});}
};

const confirmGoogleLink: nkruntime.RpcFunction = (ctx, logger, nk, payload) => {
    if (!ctx.userId) return JSON.stringify({success:false,code:401});
    let req: any;try{req=JSON.parse(payload||"{}");}catch(_e){return JSON.stringify({success:false,code:400});}
    if (!req||req.confirmed!==true||!req.ticket||!req.keep_user_id) return JSON.stringify({success:false,code:400,message:"Explicit confirmation required"});
    try {
        const multi=!!(ctx.env&&ctx.env.MULTI_SERVER_ENABLED==='true');
        const rows=nk.sqlQuery('SELECT '+(multi?'commit_multi_google_account_link':'commit_google_account_link')+'($1::UUID,$2::UUID,$3::UUID) AS result',[String(req.ticket),ctx.userId,String(req.keep_user_id)]);
        const result=parseJsonb(rows[0].result);
        // Cleanup is repeatable, including after a network drop following commit.
        const archives=nk.sqlQuery("SELECT loser_id::TEXT FROM account_link_archives WHERE intent_id=$1::UUID",[String(req.ticket)]);
        for(const archive of archives){
            const loser=String(archive.loser_id);
            nk.usersBanId([loser]); nk.sessionLogout(loser);
            for(const board of ["cultivation_realm","campaign_stage","combat_power","combat_power_v2","best_wave","most_kills","total_wins"]){
                try{nk.leaderboardRecordDelete(board,loser);}catch(_e){/* Missing legacy board is harmless. */}
            }
        }
        if(multi) {
            const tasks=nk.sqlQuery('SELECT DISTINCT server_id,generation FROM account_link_server_tasks WHERE winner_id=$1::UUID AND done=FALSE ORDER BY server_id',[String(result.winner_id)]);
            for(const task of tasks){try{withActiveAccount(nk,String(result.winner_id),()=>repairMultiLinkBoards(nk,String(result.winner_id),String(task.server_id),Number(task.generation)));}catch(error){logger.warn('Link board repair remains queued: %s',String(error));}}
        }
        return JSON.stringify({success:true,winner_id:String(result.winner_id),reauthenticate:true});
    }catch(error){logger.warn("Account link confirmation did not complete: %s",String(error));return JSON.stringify({success:false,code:409,message:String(error)});}
};
