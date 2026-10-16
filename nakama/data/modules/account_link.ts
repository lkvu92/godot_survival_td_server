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
            AND COALESCE((SELECT (payload->'placements'->(CASE WHEN c.placement_id='main_menu_stamina' THEN 'stamina_dialog_ad' ELSE c.placement_id END)->>'daily_limit')::INT
                FROM game_content_configs WHERE id='rewarded_ads'),0)<=0) THEN RAISE EXCEPTION 'Reward quota config unavailable; retry after server config update'; END IF;
        -- Conservative spent quota is reserved under fresh marker sessions; do not grant any reward.
        INSERT INTO monetization_daily_reward_claims(user_id,placement_id,reward_date,claim_slot,ad_session_id)
        SELECT w.id::TEXT,p.placement_id,(NOW() AT TIME ZONE 'UTC')::DATE,s.slot,'merge:'||t.id::TEXT||':'||p.placement_id||':'||s.slot
        FROM (SELECT DISTINCT CASE WHEN placement_id='main_menu_stamina' THEN 'stamina_dialog_ad' ELSE placement_id END AS placement_id FROM monetization_daily_reward_claims WHERE user_id IN(a.id::TEXT,b.id::TEXT) AND reward_date=(NOW() AT TIME ZONE 'UTC')::DATE) p
        CROSS JOIN LATERAL generate_series(1,COALESCE((SELECT (payload->'placements'->p.placement_id->>'daily_limit')::INT FROM game_content_configs WHERE id='rewarded_ads'),1)) s(slot)
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
    return (ctx, logger, nk, payload) => {
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
            if (String(error).indexOf("Account archived") >= 0) return JSON.stringify({success:false,status:"error",code:401,message:"Account archived after linking; sign in again"});
            throw error;
        }
    };
}

function isLinkedReceiptOwner(nk: nkruntime.Nakama, receiptOwner: string, userId: string): boolean {
    if (receiptOwner === userId) return true;
    return nk.sqlQuery("SELECT 1 FROM account_link_archives WHERE loser_id=$1::UUID AND winner_id=$2::UUID", [receiptOwner,userId]).length > 0;
}

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
        const a=nk.accountGetId(ctx.userId),b=nk.accountGetId(google.userId);
        if (a.disableTime||b.disableTime) throw new Error("Account is disabled");
        if (a.email&&b.email&&a.email.toLowerCase()!==b.email.toLowerCase()) throw new Error("Different email credentials require support");
        if (a.user.googleId&&a.user.googleId!==b.user.googleId) throw new Error("Different Google identities require support");
        // Reconcile legacy VIP credits before capturing the review snapshot.
        readVipProgress(nk,ctx.userId,vipRuntimeMode);readVipProgress(nk,google.userId,vipRuntimeMode);
        const snapshot=readAccountLinkSnapshot(nk,ctx.userId,google.userId);
        const accounts=[accountLinkSummary(nk,ctx.userId),accountLinkSummary(nk,google.userId)];
        if(canonicalLinkSnapshot(snapshot)!==canonicalLinkSnapshot(readAccountLinkSnapshot(nk,ctx.userId,google.userId)))throw new Error("Progress changed; refresh preview");
        const ticket=nk.uuidv4();
        const rows=nk.sqlQuery(`INSERT INTO account_link_intents(id,initiator,other_id,google_id,identity_snapshot,versions,finance_snapshot)
            VALUES($1::UUID,$2::UUID,$3::UUID,$4,$5::JSONB,$6::JSONB,$7::JSONB)
            RETURNING EXTRACT(EPOCH FROM expires_at)::BIGINT AS expires_at`,[ticket,ctx.userId,google.userId,b.user.googleId,
                JSON.stringify(snapshot.identities),JSON.stringify(snapshot.versions),JSON.stringify(snapshot.finance)]);
        return JSON.stringify({success:true,conflict:true,ticket,accounts,expires_at:Number(rows[0].expires_at)});
    } catch(error){return JSON.stringify({success:false,code:409,message:String(error)});}
};

const confirmGoogleLink: nkruntime.RpcFunction = (ctx, logger, nk, payload) => {
    if (!ctx.userId) return JSON.stringify({success:false,code:401});
    let req: any;try{req=JSON.parse(payload||"{}");}catch(_e){return JSON.stringify({success:false,code:400});}
    if (!req||req.confirmed!==true||!req.ticket||!req.keep_user_id) return JSON.stringify({success:false,code:400,message:"Explicit confirmation required"});
    try {
        const rows=nk.sqlQuery("SELECT commit_google_account_link($1::UUID,$2::UUID,$3::UUID) AS result",[String(req.ticket),ctx.userId,String(req.keep_user_id)]);
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
        return JSON.stringify({success:true,winner_id:String(result.winner_id),reauthenticate:true});
    }catch(error){logger.warn("Account link confirmation did not complete: %s",String(error));return JSON.stringify({success:false,code:409,message:String(error)});}
};
