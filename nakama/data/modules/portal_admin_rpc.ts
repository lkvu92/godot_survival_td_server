// C270: Admin-only read models; no filesystem, direct SQL proxy or payment mutations.
function portalError(code:number,message:string):string { return JSON.stringify({success:false,code,message}); }
function portalText(value:any):string { if(value===undefined||value===null)return ''; if(typeof value!=='string'||value.length>160)throw Error('Invalid text filter');return value; }
function portalInt(value:any,fallback:number,min:number,max:number):number { const n=value===undefined?fallback:Number(value);if(!Number.isInteger(n)||n<min||n>max)throw Error('Invalid pagination');return n; }
function portalChoice(value:any,choices:string[],fallback:string):string { if(value===undefined||value==='')return fallback;if(typeof value!=='string'||choices.indexOf(value)<0)throw Error('Invalid filter');return value; }
function portalUserList(nk:nkruntime.Nakama,req:any):any {
 const search=portalText(req.search),server_id=portalText(req.server_id),email=portalText(req.email),phone=portalText(req.phone),guardian_phone=portalText(req.guardian_phone),name=portalText(req.name),id=portalText(req.id);
 const status=portalChoice(req.status,['all','active','deactivated','soft_deleted','pending_restore','archived'],'all'),profile_status=portalChoice(req.profile_status,['all','has_profile','no_profile'],'all'),verify_status=portalChoice(req.verify_status,['all','verified','unverified'],'all');
 const page=portalInt(req.page,1,1,100000),limit=portalInt(req.limit,20,5,100),sort_by=portalChoice(req.sort_by,['create_time','level','username','email'],'create_time'),sort_order=portalChoice(req.sort_order,['asc','desc'],'desc');
 const queryDb=(sql:string,params:any[]=[])=>({rows:nk.sqlQuery(sql,params)});
    const serversRes = queryDb(
      "SELECT server_id, display_name FROM game_servers ORDER BY server_id ASC",
    );
    const servers: any = serversRes.rows.map((r) => ({
      server_id: r.server_id,
      display_name: r.display_name,
    }));

    // 2. Xây dựng điều kiện WHERE động
    const conditions: string[] = ["1=1"];
    const params: any[] = [];
    let paramIndex = 1;

    // Search tổng quát: tìm trên username, display_name, email, id, phone, guardian_phone, guardian_name
    if (search.trim()) {
      const term = `%${search.trim().toLowerCase()}%`;
      conditions.push(`(
        LOWER(u.username) LIKE $${paramIndex} OR
        LOWER(COALESCE(u.display_name, '')) LIKE $${paramIndex} OR
        LOWER(COALESCE(u.email, '')) LIKE $${paramIndex} OR
        u.id::text LIKE $${paramIndex} OR
        LOWER(COALESCE(comp.value->>'phone_number', '')) LIKE $${paramIndex} OR
        LOWER(COALESCE(comp.value->>'guardian_phone', '')) LIKE $${paramIndex} OR
        LOWER(COALESCE(comp.value->>'guardian_name', '')) LIKE $${paramIndex} OR
        LOWER(COALESCE(comp.value->>'full_name', '')) LIKE $${paramIndex}
      )`);
      params.push(term);
      paramIndex++;
    }

    // Lọc theo Server
    if (server_id && server_id !== "all") {
      conditions.push(`COALESCE(pref.last_server_id, c.server_id) = $${paramIndex}`);
      params.push(server_id);
      paramIndex++;
    }

    // Lọc theo Email
    if (email.trim()) {
      conditions.push(`LOWER(COALESCE(u.email, '')) LIKE $${paramIndex}`);
      params.push(`%${email.trim().toLowerCase()}%`);
      paramIndex++;
    }

    // Lọc theo Phone
    if (phone.trim()) {
      conditions.push(`COALESCE(comp.value->>'phone_number', '') LIKE $${paramIndex}`);
      params.push(`%${phone.trim()}%`);
      paramIndex++;
    }

    // Lọc theo SĐT Người bảo hộ
    if (guardian_phone.trim()) {
      conditions.push(`COALESCE(comp.value->>'guardian_phone', '') LIKE $${paramIndex}`);
      params.push(`%${guardian_phone.trim()}%`);
      paramIndex++;
    }

    // Lọc theo Name (username hoặc display_name)
    if (name.trim()) {
      conditions.push(`(
        LOWER(u.username) LIKE $${paramIndex} OR
        LOWER(COALESCE(u.display_name, '')) LIKE $${paramIndex}
      )`);
      params.push(`%${name.trim().toLowerCase()}%`);
      paramIndex++;
    }

    // Lọc theo ID
    if (id.trim()) {
      conditions.push(`u.id::text LIKE $${paramIndex}`);
      params.push(`%${id.trim().toLowerCase()}%`);
      paramIndex++;
    }

    // Lọc theo Trạng thái tài khoản (C232 Archive Lifecycle)
    if (status === "active") {
      conditions.push(`u.disable_time <= '1970-01-01 00:00:00+00'::timestamptz AND (del.status IS NULL OR del.status = 'cancelled')`);
    } else if (status === "deactivated") {
      conditions.push(`u.disable_time > '1970-01-01 00:00:00+00'::timestamptz AND (del.status IS NULL OR del.status <> 'soft_deleted')`);
    } else if (status === "soft_deleted") {
      conditions.push(`del.status = 'soft_deleted'`);
    } else if (status === "pending_restore") {
      conditions.push(`req.id IS NOT NULL`);
    } else if (status === "archived") {
      conditions.push(`del.status = 'archived'`);
    }

    // Lọc theo Trạng thái Hồ sơ
    if (profile_status === "has_profile") {
      conditions.push(`prof.value IS NOT NULL`);
    } else if (profile_status === "no_profile") {
      conditions.push(`prof.value IS NULL`);
    }

    // Lọc theo Trạng thái Xác thực
    if (verify_status === "verified") {
      conditions.push(`((comp.value->>'is_phone_verified')::boolean = true OR u.verify_time > '1970-01-01 00:00:00+00'::timestamptz)`);
    } else if (verify_status === "unverified") {
      conditions.push(`((comp.value->>'is_phone_verified') IS NULL OR (comp.value->>'is_phone_verified')::boolean = false) AND u.verify_time <= '1970-01-01 00:00:00+00'::timestamptz`);
    }

    // Sắp xếp
    let orderSql = "u.create_time DESC";
    if (sort_by === "level") {
      orderSql = `COALESCE((prof.value->>'level')::int, 0) ${sort_order.toUpperCase()}, u.create_time DESC`;
    } else if (sort_by === "username") {
      orderSql = `u.username ${sort_order.toUpperCase()}`;
    } else if (sort_by === "email") {
      orderSql = `u.email ${sort_order.toUpperCase()} NULLS LAST`;
    } else {
      orderSql = `u.create_time ${sort_order.toUpperCase()}`;
    }

    const offset = (page - 1) * limit;

    const baseSql = `
      SELECT
        u.id,
        u.username,
        u.display_name,
        u.avatar_url,
        u.email,
        u.lang_tag,
        u.location,
        u.timezone,
        u.create_time::text,
        u.update_time::text,
        u.verify_time::text,
        u.disable_time::text,
        u.custom_id,
        COALESCE(pref.last_server_id, c.server_id) AS server_id,
        s.display_name AS server_name,
        prof.value::text AS profile_raw,
        comp.value::text AS compliance_raw,
        del.status AS deletion_status,
        del.soft_deleted_at::text,
        del.restore_until::text,
        req.id::text AS restore_request_id,
        req.status AS restore_request_status,
        COUNT(*) OVER() AS total_count
      FROM users u
      LEFT JOIN player_server_preferences pref ON pref.account_id = u.id
      LEFT JOIN LATERAL (
        SELECT pc.server_id FROM player_characters pc
        WHERE pc.account_id = u.id
        ORDER BY pc.last_entered_at DESC NULLS LAST, pc.created_at DESC
        LIMIT 1
      ) c ON true
      LEFT JOIN game_servers s ON s.server_id = COALESCE(pref.last_server_id, c.server_id)
      LEFT JOIN LATERAL (
        SELECT value FROM storage
        WHERE user_id = u.id AND collection = 'player_profiles'
        ORDER BY (key LIKE '%s001%') DESC, create_time DESC
        LIMIT 1
      ) prof ON true
      LEFT JOIN LATERAL (
        SELECT value FROM storage
        WHERE user_id = u.id AND collection = 'compliance_activation' AND key = 'profile'
        LIMIT 1
      ) comp ON true
      LEFT JOIN LATERAL (
        SELECT status, soft_deleted_at, restore_until FROM account_identity_deletions
        WHERE user_id = u.id AND status <> 'cancelled'
        ORDER BY created_at DESC
        LIMIT 1
      ) del ON true
      LEFT JOIN LATERAL (
        SELECT id, status FROM account_restoration_requests
        WHERE user_id = u.id AND status = 'pending'
        ORDER BY created_at DESC
        LIMIT 1
      ) req ON true
      WHERE ${conditions.join(" AND ")}
      ORDER BY ${orderSql}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const queryResult = queryDb(baseSql, params);

    const totalCount = queryResult.rows.length > 0 ? parseInt(queryResult.rows[0].total_count, 10) : Number(queryDb("SELECT COUNT(*) AS total_count " + baseSql.slice(baseSql.indexOf("      FROM users u"), baseSql.lastIndexOf("      ORDER BY")), params.slice(0, -2)).rows[0].total_count);
    const totalPages = Math.ceil(totalCount / limit) || 1;

    const users: any = queryResult.rows.map((row) => {
      let profile = null;
      if (row.profile_raw) {
        try {
          profile = JSON.parse(row.profile_raw);
        } catch {
          profile = null;
        }
      }

      let compliance = null;
      if (row.compliance_raw) {
        try {
          compliance = JSON.parse(row.compliance_raw);
        } catch {
          compliance = null;
        }
      }

      const isDisableTimeSet = row.disable_time && !row.disable_time.startsWith("1970");
      const isVerifyTimeSet = row.verify_time && !row.verify_time.startsWith("1970");
      const isPhoneVerified = Boolean(compliance?.is_phone_verified);

      let userStatus: any = "active";
      if (row.restore_request_status === "pending") {
        userStatus = "pending_restore";
      } else if (row.deletion_status === "soft_deleted") {
        userStatus = "soft_deleted";
      } else if (row.deletion_status === "archived") {
        userStatus = "archived";
      } else if (isDisableTimeSet) {
        userStatus = "deactivated";
      }

      return {
        id: row.id,
        username: row.username,
        display_name: row.display_name || "",
        avatar_url: row.avatar_url || "",
        email: row.email,
        lang_tag: row.lang_tag || "vi",
        location: row.location || "",
        timezone: row.timezone || "",
        online: false,
        create_time: row.create_time,
        update_time: row.update_time,
        verify_time: isVerifyTimeSet ? row.verify_time : null,
        disable_time: isDisableTimeSet ? row.disable_time : null,
        server_id: row.server_id,
        server_name: row.server_name,
        has_profile: Boolean(profile),
        profile,
        compliance,
        status: userStatus,
        deletion_status: row.deletion_status,
        soft_deleted_at: row.soft_deleted_at,
        restore_until: row.restore_until,
        is_verified: isVerifyTimeSet || isPhoneVerified,
        custom_id: row.custom_id || undefined,
        has_restore_request: Boolean(row.restore_request_id),
        restore_request_id: row.restore_request_id,
        restore_request_status: row.restore_request_status,
      };
    });

    const responseData: any = {
      users,
      pagination: {
        page,
        limit,
        total_count: totalCount,
        total_pages: totalPages,
      },
      servers,
    };


 return responseData;
}

function portalValidatePolicy(p){
  if(!p||p.schema_version!==1||!Number.isSafeInteger(p.revision)||p.revision<1)throw Error('CONFIG_REQUIRED');
  for(const [key,min,max] of [['lookback_days',1,365],['pending_grace_seconds',60,604800],['delivery_grace_seconds',60,604800]])if(!Number.isSafeInteger(p[key])||p[key]<min||p[key]>max)throw Error('CONFIG_REQUIRED');
  return p;
}
function portalReportSql(policy){
 const p=portalValidatePolicy(policy);
 return `WITH orders AS (SELECT * FROM monetization_purchase_orders WHERE created_at>=NOW()-INTERVAL '${p.lookback_days} days'),
 purchases AS (SELECT * FROM monetization_purchases WHERE created_at>=NOW()-INTERVAL '${p.lookback_days} days')
 SELECT json_build_object(
 'config_version',(SELECT config_version FROM remote_config_releases ORDER BY config_version DESC LIMIT 1),
 'counts',json_build_object(
 'orders_in_window',(SELECT COUNT(*) FROM orders),
 'purchases_in_window',(SELECT COUNT(*) FROM purchases)),
 'financial_totals_by_currency',(SELECT COALESCE(json_agg(t),'[]'::json) FROM (
 SELECT f.currency,SUM(f.original_amount)::text AS original_amount,SUM(COALESCE(s.refunded_amount,0))::text AS refunded_amount
 FROM orders o JOIN payment_financial_records f ON f.purchase_order_id=o.id
 LEFT JOIN LATERAL (SELECT refunded_amount FROM payment_financial_snapshots WHERE purchase_order_id=o.id ORDER BY provider_event_at DESC,synced_at DESC LIMIT 1) s ON TRUE
 GROUP BY f.currency ORDER BY f.currency) t),
 'anomalies',json_build_object(
 'pending_overdue',(SELECT COUNT(*) FROM orders WHERE status='pending' AND created_at<NOW()-INTERVAL '${p.pending_grace_seconds} seconds'),
 'validated_delivery_overdue',(SELECT COUNT(*) FROM orders WHERE status='validated' AND COALESCE(validated_at,updated_at)<NOW()-INTERVAL '${p.delivery_grace_seconds} seconds'),
 'fulfilled_without_purchase',(SELECT COUNT(*) FROM orders o WHERE o.status='fulfilled' AND NOT EXISTS(SELECT 1 FROM monetization_purchases p WHERE COALESCE(NULLIF(p.purchase_order_id,''),p.request_id)=o.id)),
 'purchase_without_order',(SELECT COUNT(*) FROM purchases p WHERE NOT EXISTS(SELECT 1 FROM monetization_purchase_orders o WHERE o.id=COALESCE(NULLIF(p.purchase_order_id,''),p.request_id))),
 'duplicate_purchase_token_groups',(SELECT COUNT(*) FROM (SELECT purchase_token_hash FROM purchases WHERE purchase_token_hash<>'' GROUP BY purchase_token_hash HAVING COUNT(*)>1) d),
 'void_not_applied',(SELECT COUNT(*) FROM purchases p JOIN store_purchase_voids v ON v.token_hash=p.purchase_token_hash WHERE p.status<>'voided'),
 'financial_metadata_missing',(SELECT COUNT(*) FROM orders o WHERE o.platform='android' AND o.status='fulfilled' AND COALESCE(o.vip_environment,'')<>'mock' AND o.transaction_id<>'' AND NOT EXISTS(SELECT 1 FROM payment_financial_records f WHERE f.purchase_order_id=o.id))));`;
}
function portalMakeReport(data,policy,configVersion){
 portalValidatePolicy(policy);
 if(!data||data.config_version!==configVersion)throw Error('CONFIG_CHANGED_RETRY');
 return {schema_version:1,generated_at:new Date().toISOString(),scope:'local PostgreSQL ledger; not external provider settlement',config_version:configVersion,policy_revision:policy.revision,status:Object.values(data.anomalies).some(n=>Number(n)>0)?'REVIEW_REQUIRED':'CLEAN',counts:data.counts,anomalies:data.anomalies,financial_totals_by_currency:data.financial_totals_by_currency||[]};
}

const PORTAL_ORDER_SELECT = `SELECT o.id,o.user_id,o.product_id,o.status,o.platform,o.store_product_id,o.transaction_id,
 o.purchase_token_hash,o.failure_reason,o.target_server_id,o.target_generation,o.reward_snapshot,o.vip_exp,o.vip_environment,
 o.created_at::text,o.validated_at::text,o.fulfilled_at::text,
 COALESCE(p.display_name,o.product_id) AS product_name,f.currency,f.original_amount::text,f.tax_amount::text,
 f.google_order_id,f.last_synced_at::text,COALESCE(refund.refunded_amount,0)::text AS refunded_amount
 FROM monetization_purchase_orders o LEFT JOIN game_store_products p ON p.product_id=o.product_id
 LEFT JOIN payment_financial_records f ON f.purchase_order_id=o.id
 LEFT JOIN LATERAL (SELECT refunded_amount FROM payment_financial_snapshots WHERE purchase_order_id=o.id ORDER BY provider_event_at DESC,synced_at DESC LIMIT 1) refund ON TRUE`;
function portalOrder(row:any):any {
 const currency=row.currency||'',amount=row.original_amount||'';
 return {id:String(row.id),user_id:String(row.user_id),product_id:String(row.product_id),product_name:row.product_name,status:row.status,
 platform:row.platform,store_product_id:row.store_product_id,transaction_id:row.transaction_id,purchase_token_hash:row.purchase_token_hash,
 failure_reason:row.failure_reason,target_server_id:row.target_server_id,target_generation:Number(row.target_generation),
 created_at:row.created_at,validated_at:row.validated_at,fulfilled_at:row.fulfilled_at,
 currency,amount,price_display:currency?amount+' '+currency:'',reward_snapshot:parseJsonb(row.reward_snapshot)||[],
 financial:currency?{google_order_id:row.google_order_id,currency,original_amount:amount,tax_amount:row.tax_amount,refunded_amount:row.refunded_amount,last_synced_at:row.last_synced_at}:null,
 timeline:[{action:'created',time:row.created_at},...(row.validated_at?[{action:'validated',time:row.validated_at}]:[]),...(row.fulfilled_at?[{action:'fulfilled',time:row.fulfilled_at}]:[])]};
}
function portalOrderList(nk:nkruntime.Nakama,req:any):any {
 const limit=portalInt(req.limit,20,1,100),params:any[]=[],where:string[]=['TRUE'];
 const add=(sql:string,value:any)=>{params.push(value);where.push(sql.replace(/\?/g,'$'+params.length));};
 const search=portalText(req.search);if(search)add('(o.id ILIKE ? OR o.user_id ILIKE ? OR o.transaction_id ILIKE ? OR p.display_name ILIKE ?)','%'+search+'%');
 const status=portalText(req.status);if(status&&status!=='all')add('o.status=?',status);
 const platform=portalChoice(req.platform,['all','android','ios','web'],'all');if(platform!=='all')add('o.platform=?',platform);
 for(const key of ['date_from','date_to'])if(req[key]){const value=portalText(req[key]);if(!/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(value)||!isFinite(Date.parse(value)))throw Error('Invalid date');add(key==='date_from'?'o.created_at>=?::timestamptz':'o.created_at<=?::timestamptz',value);}
 const filter=where.join(' AND '),from=PORTAL_ORDER_SELECT.slice(PORTAL_ORDER_SELECT.indexOf(' FROM '));
 const totals=nk.sqlQuery(`SELECT COUNT(*)::INT AS total_orders,COUNT(*) FILTER(WHERE o.status='fulfilled')::INT AS fulfilled_orders,COUNT(*) FILTER(WHERE o.status IN ('pending','validated'))::INT AS pending_orders ${from} WHERE ${filter}`,params)[0];
 const revenue=nk.sqlQuery(`SELECT f.currency,SUM(f.original_amount)::text AS total_amount,SUM(COALESCE(refund.refunded_amount,0))::text AS refunded_amount ${from} WHERE ${filter} AND f.currency IS NOT NULL GROUP BY f.currency ORDER BY f.currency`,params);
 const cursor=portalText(req.cursor);if(cursor){const pivot=nk.sqlQuery('SELECT created_at::text,id FROM monetization_purchase_orders WHERE id=$1',[cursor])[0];if(!pivot)throw Error('Invalid cursor');params.push(pivot.created_at,pivot.id);where.push(`(o.created_at,o.id)<($${params.length-1}::timestamptz,$${params.length})`);}
 params.push(limit+1);const rows=nk.sqlQuery(`${PORTAL_ORDER_SELECT} WHERE ${where.join(' AND ')} ORDER BY o.created_at DESC,o.id DESC LIMIT $${params.length}`,params);
 const more=rows.length>limit;rows.splice(limit);
 return {orders:rows.map((row:any)=>Object.assign(portalOrder(row),{recovery:typeof pdSummary==='function'?pdSummary(nk,row):undefined})),total_count:Number(totals.total_orders),next_cursor:more?String(rows[rows.length-1].id):null,stats:{total_orders:Number(totals.total_orders),fulfilled_orders:Number(totals.fulfilled_orders),pending_orders:Number(totals.pending_orders),revenue_by_currency:revenue}};
}
function portalAdList(nk:nkruntime.Nakama,req:any):any {
 const limit=portalInt(req.limit,50,1,100),cursor=portalText(req.cursor),params:any[]=[];let where='';
 if(cursor){const pivot=nk.sqlQuery('SELECT created_at::text,ad_session_id FROM monetization_ad_rewards WHERE ad_session_id=$1',[cursor])[0];if(!pivot)throw Error('Invalid cursor');params.push(pivot.created_at,pivot.ad_session_id);where='WHERE (created_at,ad_session_id)<($1::timestamptz,$2)';}
 params.push(limit+1);const rows=nk.sqlQuery(`SELECT ad_session_id,COALESCE(admob_transaction_id,'') AS admob_transaction_id,user_id,placement_id,reward_type,reward_amount,status,created_at::text,granted_at::text,COALESCE(context->>'delivery_source','ad') AS delivery_source FROM monetization_ad_rewards ${where} ORDER BY created_at DESC,ad_session_id DESC LIMIT $${params.length}`,params);const more=rows.length>limit;rows.splice(limit);
 return {sessions:rows,total_count:Number(nk.sqlQuery('SELECT COUNT(*)::INT AS count FROM monetization_ad_rewards',[])[0].count),next_cursor:more?rows[rows.length-1].ad_session_id:null};
}
function portalAdminRead(ctx:nkruntime.Context,logger:nkruntime.Logger,nk:nkruntime.Nakama,payload:string,action:string):string {
 if(!ctx.userId||!isConfigAdmin(ctx))return portalError(403,'Forbidden');
 let req:any;try {if(payload.length>8192)throw Error();req=JSON.parse(payload||'{}');if(!req||Array.isArray(req)||typeof req!=='object')throw Error();}catch(_){return portalError(400,'Invalid JSON request');}
 try {
 let data:any;
 if(action==='users_list')data=portalUserList(nk,req);
 else if(action==='user_get')data=portalUserGet(nk,req);
 else if(action==='catalog_get')data={heroes:nk.sqlQuery('SELECT * FROM game_heroes ORDER BY id',[]).map(processHero),enemies:nk.sqlQuery('SELECT * FROM game_enemies ORDER BY id',[]).map(processEnemy),skills:nk.sqlQuery('SELECT * FROM game_skills ORDER BY id',[]).map(processSkill)};
 else if(action==='orders_list')data=portalOrderList(nk,req);
 else if(action==='order_get'){const id=portalText(req.order_id);if(!id)return portalError(400,'order_id required');const row=nk.sqlQuery(PORTAL_ORDER_SELECT+' WHERE o.id=$1',[id])[0];if(!row)return portalError(404,'Order not found');data=Object.assign(portalOrder(row),{recovery:typeof pdSummary==='function'?pdSummary(nk,row):undefined});}
 else if(action==='ads_list')data=portalAdList(nk,req);
 else if(action==='reconciliation'){
 const release=nk.sqlQuery('SELECT config_version,snapshot FROM remote_config_releases ORDER BY config_version DESC LIMIT 1',[])[0];
 if(!release)return portalError(503,'CONFIG_REQUIRED');const snapshot=parseJsonb(release.snapshot),policy=portalValidatePolicy(snapshot&&snapshot.system&&snapshot.system.payment_reconciliation);
 const row=nk.sqlQuery(portalReportSql(policy),[])[0];const value=parseJsonb(row&&row.json_build_object);data=portalMakeReport(value,policy,Number(release.config_version));
 } else return portalError(404,'Unknown operation');
 return JSON.stringify({success:true,data});
 }catch(error){const message=String(error&&error.message||error);if(message==='User not found')return portalError(404,message);if(message.indexOf('Invalid')===0)return portalError(400,message);if(message.indexOf('CONFIG_')>=0)return portalError(503,'CONFIG_REQUIRED');logger.error('C270 admin read failed: %s',action);return portalError(503,'Admin data unavailable');}
}
function rpcPortalUsersList(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return portalAdminRead(c,l,n,p,'users_list');}
function rpcPortalCatalogGet(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return portalAdminRead(c,l,n,p,'catalog_get');}
function rpcPortalOrderList(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return portalAdminRead(c,l,n,p,'orders_list');}
function rpcPortalOrderGet(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return portalAdminRead(c,l,n,p,'order_get');}
function rpcPortalAdList(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return portalAdminRead(c,l,n,p,'ads_list');}
function rpcPortalReconciliation(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return portalAdminRead(c,l,n,p,'reconciliation');}

function portalUserGet(nk:nkruntime.Nakama,req:any):any {
 const id=portalText(req.id);if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw Error('Invalid user ID');
 const queryDb=(sql:string,params:any[]=[])=>({rows:nk.sqlQuery(sql,params)});
    const userRes = queryDb(
      `SELECT
        u.id, u.username, u.display_name, u.avatar_url, u.email, u.lang_tag,
        u.location, u.timezone, u.wallet::text, u.metadata::text,
        u.create_time::text, u.update_time::text, u.verify_time::text, u.disable_time::text,
        u.custom_id,
        COALESCE(pref.last_server_id, c.server_id) AS server_id,
        s.display_name AS server_name,
        del.status AS deletion_status,
        del.soft_deleted_at::text,
        del.restore_until::text
      FROM users u
      LEFT JOIN player_server_preferences pref ON pref.account_id = u.id
      LEFT JOIN LATERAL (
        SELECT pc.server_id FROM player_characters pc
        WHERE pc.account_id = u.id
        ORDER BY pc.last_entered_at DESC NULLS LAST, pc.created_at DESC
        LIMIT 1
      ) c ON true
      LEFT JOIN game_servers s ON s.server_id = COALESCE(pref.last_server_id, c.server_id)
      LEFT JOIN LATERAL (
        SELECT status, soft_deleted_at, restore_until FROM account_identity_deletions
        WHERE user_id = u.id AND status <> 'cancelled'
        ORDER BY created_at DESC
        LIMIT 1
      ) del ON true
      WHERE u.id = $1::uuid`,
      [id],
    );

    if (userRes.rows.length === 0) {
      throw Error('User not found');
    }

    const row = userRes.rows[0];

    // 2. Lấy hồ sơ game (player_profiles)
    const profileRes = queryDb(
      `SELECT key, value::text FROM storage
       WHERE user_id = $1::uuid AND collection = 'player_profiles'
       ORDER BY (key LIKE '%s001%') DESC, create_time DESC LIMIT 1`,
      [id],
    );
    let profileData: any | null = null;
    if (profileRes.rows.length > 0) {
      try {
        profileData = JSON.parse(profileRes.rows[0].value);
      } catch {
        profileData = null;
      }
    }

    // 3. Lấy kho đồ (player_inventory)
    const invRes = queryDb(
      `SELECT value::text FROM storage
       WHERE user_id = $1::uuid AND collection = 'player_inventory'
       ORDER BY create_time DESC LIMIT 1`,
      [id],
    );
    let inventoryData: any | null = null;
    if (invRes.rows.length > 0) {
      try {
        inventoryData = JSON.parse(invRes.rows[0].value);
      } catch {
        inventoryData = null;
      }
    }

    // 4. Lấy thông tin compliance/xác thực (compliance_activation)
    const compRes = queryDb(
      `SELECT value::text FROM storage
       WHERE user_id = $1::uuid AND collection = 'compliance_activation' AND key = 'profile'
       LIMIT 1`,
      [id],
    );
    let complianceData = null;
    if (compRes.rows.length > 0) {
      try {
        complianceData = JSON.parse(compRes.rows[0].value);
      } catch {
        complianceData = null;
      }
    }

    // 5. Lấy danh sách nhân vật và máy chủ
    const charRes = queryDb(
      `SELECT
        c.server_id, s.display_name AS server_name, c.generation, c.status,
        c.created_at::text, c.last_entered_at::text
      FROM player_characters c
      LEFT JOIN game_servers s ON s.server_id = c.server_id
      WHERE c.account_id = $1::uuid
      ORDER BY c.created_at ASC`,
      [id],
    );
    const characters: any = charRes.rows.map((c) => ({
      server_id: c.server_id,
      server_name: c.server_name || c.server_id,
      generation: c.generation,
      status: c.status,
      created_at: c.created_at,
      last_entered_at: c.last_entered_at,
    }));

    // 6. Lấy ví tiền (wallet)
    let wallet = {};
    if (row.wallet) {
      try {
        wallet = JSON.parse(row.wallet);
      } catch {
        wallet = {};
      }
    }

    // 7. Lấy danh sách thiết bị
    const devRes = queryDb(
      "SELECT id FROM user_device WHERE user_id = $1::uuid",
      [id],
    );
    const devices = devRes.rows;

    const isDisableTimeSet = row.disable_time && !row.disable_time.startsWith("1970");
    const isVerifyTimeSet = row.verify_time && !row.verify_time.startsWith("1970");
    const isPhoneVerified = Boolean(complianceData?.is_phone_verified);

    let userStatus: any = "active";
    if (row.deletion_status === "soft_deleted") {
      userStatus = "soft_deleted";
    } else if (isDisableTimeSet) {
      userStatus = "deactivated";
    }

    const user: any = {
      id: row.id,
      username: row.username,
      display_name: row.display_name || "",
      avatar_url: row.avatar_url || "",
      email: row.email,
      lang_tag: row.lang_tag || "vi",
      location: row.location || "",
      timezone: row.timezone || "",
      online: false,
      create_time: row.create_time,
      update_time: row.update_time,
      verify_time: isVerifyTimeSet ? row.verify_time : null,
      disable_time: isDisableTimeSet ? row.disable_time : null,
      server_id: row.server_id,
      server_name: row.server_name,
      has_profile: Boolean(profileData),
      profile: profileData,
      compliance: complianceData,
      status: userStatus,
      deletion_status: row.deletion_status,
      soft_deleted_at: row.soft_deleted_at,
      restore_until: row.restore_until,
      is_verified: isVerifyTimeSet || isPhoneVerified,
      custom_id: row.custom_id || undefined,
    };

    const detailData: any = {
      user,
      wallet,
      devices,
      profile: profileData,
      inventory: inventoryData,
      characters,
    };


 return detailData;
}
function rpcPortalUserGet(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return portalAdminRead(c,l,n,p,'user_get');}
