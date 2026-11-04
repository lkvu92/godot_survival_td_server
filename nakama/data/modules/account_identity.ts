// C232: server-owned email verification and durable account deletion.
function identityEnabled(ctx: nkruntime.Context): boolean { return !!ctx.env && ctx.env.ACCOUNT_IDENTITY_ENABLED === 'true'; }
function identityRestoreBlocked(nk:nkruntime.Nakama):boolean {
    const rows=nk.sqlQuery('SELECT state FROM account_archive_restore_gate WHERE singleton=TRUE',[]);
    return !rows.length||rows[0].state!=='ready';
}
function createAccountIdentityTables(nk: nkruntime.Nakama): void {
    nk.sqlExec(`CREATE TABLE IF NOT EXISTS account_archive_restore_gate(singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(singleton),state TEXT NOT NULL CHECK(state IN('ready','blocked')),checkpoint_digest TEXT,report JSONB NOT NULL DEFAULT '{}',updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
      INSERT INTO account_archive_restore_gate(singleton,state) VALUES(TRUE,'ready') ON CONFLICT DO NOTHING;`,[]);
    nk.sqlExec(`CREATE TABLE IF NOT EXISTS account_identity_verifications(
      user_id UUID PRIMARY KEY,email TEXT NOT NULL,verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),source TEXT NOT NULL,creation_intent UUID UNIQUE);
      ALTER TABLE account_identity_verifications ADD COLUMN IF NOT EXISTS creation_intent UUID UNIQUE;
      CREATE TABLE IF NOT EXISTS account_identity_deletions(
      id UUID PRIMARY KEY,user_id UUID NOT NULL UNIQUE,status TEXT NOT NULL DEFAULT 'queued',receipt_hash TEXT NOT NULL UNIQUE,
      attempts INT NOT NULL DEFAULT 0,confirmation_hash TEXT UNIQUE,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
      ALTER TABLE account_identity_deletions ADD COLUMN IF NOT EXISTS confirmation_hash TEXT UNIQUE;
      ALTER TABLE account_identity_deletions ADD COLUMN IF NOT EXISTS flow_version INT NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS soft_deleted_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS restore_until TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS policy_snapshot JSONB,
        ADD COLUMN IF NOT EXISTS hard_authorized_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS hold BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE account_identity_deletions DROP CONSTRAINT IF EXISTS account_identity_deletions_user_id_key;
      CREATE UNIQUE INDEX IF NOT EXISTS identity_deletion_active_owner ON account_identity_deletions(user_id) WHERE status<>'cancelled';
      CREATE OR REPLACE FUNCTION account_identity_erasure_pending(uid UUID) RETURNS BOOLEAN LANGUAGE plpgsql AS $erase$
      BEGIN RETURN EXISTS(SELECT 1 FROM account_identity_deletions WHERE user_id=uid AND status<>'cancelled')
        OR EXISTS(SELECT 1 FROM account_link_state a JOIN account_identity_deletions d ON d.user_id=a.merged_into WHERE a.user_id=uid AND a.status='archived' AND d.status<>'cancelled'); END $erase$;`, []);
}
function identityAccount(nk: nkruntime.Nakama, userId: string): any {
    const r=nk.sqlQuery(`SELECT u.id,u.email,u.google_id,u.custom_id,u.disable_time,
      COALESCE(octet_length(u.password),0)>0 AS has_password,
      EXISTS(SELECT 1 FROM account_identity_verifications v WHERE v.user_id=u.id AND v.email=u.email) AS verified,
      EXISTS(SELECT 1 FROM account_identity_deletions d WHERE d.user_id=u.id AND d.status<>'cancelled') AS deleting,
      COALESCE((SELECT generation FROM player_login_sessions WHERE user_id=u.id),'') AS generation
      FROM users u WHERE u.id=$1::UUID`,[userId]);
    return r.length?r[0]:null;
}
function identityGameplayGate(ctx: nkruntime.Context,nk: nkruntime.Nakama): string|null {
    if(!identityEnabled(ctx)||!ctx.userId)return null;
    const a=identityAccount(nk,ctx.userId);
    if(!a||a.deleting)return JSON.stringify({success:false,code:401,reason:'ACCOUNT_DELETING',message:'Tài khoản đang được xóa. Vui lòng đăng xuất.'});
    // Google proves provider ownership; an unrelated email string never merges accounts.
    if(a.has_password&&!a.google_id&&!a.verified)return JSON.stringify({success:false,code:403,reason:'EMAIL_VERIFICATION_REQUIRED',message:'Vui lòng xác nhận email trước khi vào game.'});
    return null;
}
function identityBeforeEmail(ctx:nkruntime.Context,_logger:nkruntime.Logger,nk:nkruntime.Nakama,req:any):any {
    if(!identityEnabled(ctx))return req;
    // Public email authentication can only log in, never create a new user.
    if(req.create!==false)throw Error('EMAIL_CONFIRMATION_REQUIRED: Đăng ký bằng link xác nhận email. Vui lòng cập nhật game.');
    const email=String((req.account||{}).email||'').trim().toLowerCase();
    if(email)(req.account||{}).email=email;
    return req;
}
function identityGuardNative(ctx:nkruntime.Context,_l:nkruntime.Logger,nk:nkruntime.Nakama,req:any):any {
    if(req&&(req.collection==='privacy_consent'||[...(req.objects||[]),...(req.objectIds||[])].some((x:any)=>x.collection==='privacy_consent')))throw Error('Đạo hữu hãy sử dụng chức năng quyền riêng tư trong hồ sơ.');
    if(identityRestoreBlocked(nk))throw Error('Máy chủ đang đối soát dữ liệu khôi phục. Đạo hữu vui lòng thử lại sau.');
    if(ctx.userId&&nk.sqlQuery('SELECT account_identity_erasure_pending($1::uuid) AS blocked',[ctx.userId])[0].blocked)
        throw Error('Đạo hữu không thể truy cập dữ liệu hoặc thay đổi tài khoản đang chờ xóa/lưu trữ.');
    if(ctx.userId&&requireCurrentLogin(ctx,nk))throw Error(LOGIN_REPLACED_MESSAGE);
    return req;
}
function identityBlockMutation(ctx:nkruntime.Context,_l:nkruntime.Logger,nk:nkruntime.Nakama,req:any):any {
    identityGuardNative(ctx,_l,nk,req);
    if(identityEnabled(ctx))throw Error('ACCOUNT_IDENTITY_MANAGED: Sử dụng quy trình xác nhận tài khoản.');
    return req;
}
function identityBeforeUpdate(ctx:nkruntime.Context,_l:nkruntime.Logger,nk:nkruntime.Nakama,req:any):any {
    identityGuardNative(ctx,_l,nk,req);
    if(identityEnabled(ctx)&&req.email!==undefined)throw Error('ACCOUNT_IDENTITY_MANAGED');
    return req;
}
function identityBeforeCustom(ctx:nkruntime.Context,logger:nkruntime.Logger,nk:nkruntime.Nakama,req:any):any {
    if(String((req.account||{}).id||'').indexOf('c232:')===0)throw Error('Internal identity');
    return beforeSingleLogin(ctx,logger,nk,req);
}
function identityBeforeGoogle(ctx:nkruntime.Context,logger:nkruntime.Logger,nk:nkruntime.Nakama,req:any):any {
    if(identityEnabled(ctx)) {
        const proof=nk.httpRequest('http://account-identity:8080/account/internal/google-proof','POST',
          {'Content-Type':'application/json','Authorization':'Bearer '+ctx.env.ACCOUNT_IDENTITY_SECRET},
          JSON.stringify({id_token:(req.account||{}).token}),10000);
        if(proof.code!==200)throw Error('Không thể xác nhận Google. Vui lòng thử lại.');
        const verified=JSON.parse(proof.body);
        if(!verified.success)throw Error('Invalid Google proof');
        req.account.vars=Object.assign({},req.account.vars||{},{c232_google_email:verified.authoritative_email||''});
    }
    return beforeSingleLogin(ctx,logger,nk,req);
}
function identityAfterGoogle(ctx:nkruntime.Context,logger:nkruntime.Logger,nk:nkruntime.Nakama,s:any,req:any):void {
    afterSingleLogin(ctx,logger,nk,s,req);
    if(!identityEnabled(ctx))return;
    const email=String(((req.account||{}).vars||{}).c232_google_email||'');
    if(email)nk.sqlExec(`INSERT INTO account_identity_verifications(user_id,email,source)
      SELECT id,email,'google_authoritative_email' FROM users WHERE id=$1::UUID AND email=$2 AND google_id IS NOT NULL
      ON CONFLICT(user_id) DO UPDATE SET email=EXCLUDED.email,verified_at=NOW(),source=EXCLUDED.source`,[ctx.userId,email]);
}
const accountIdentityStatus:nkruntime.RpcFunction=(ctx,_l,nk)=>{
    if(!ctx.userId)throw Error('Authentication required');
    const rejected=requireCurrentLogin(ctx,nk);if(rejected)return rejected;
    const a=identityAccount(nk,ctx.userId);if(!a||a.deleting)throw Error('Account unavailable');
    const characters=nk.sqlQuery('SELECT count(*)::INT AS count FROM player_characters WHERE account_id=$1::UUID',[ctx.userId]);
    const entitlement=nk.sqlQuery('SELECT no_ads_expires_at>NOW() AS active FROM player_monetization_entitlements WHERE user_id=$1',[ctx.userId]);
    const deletionRows=nk.sqlQuery("SELECT snapshot#>'{system,account_deletion}' AS policy FROM remote_config_releases ORDER BY config_version DESC LIMIT 1",[]);
    const deletionPolicy=deletionRows.length?parseJsonb(deletionRows[0].policy):null;
    const gameplay=deletionPolicy&&Array.isArray(deletionPolicy.datasets)?deletionPolicy.datasets.filter((d:any)=>d.id==='gameplay')[0]:null;
    const deletionPresentation=deletionPolicy&&deletionPolicy.schema_version===2&&gameplay?{soft_delete_days:deletionPolicy.soft_delete_days}:null;
    return JSON.stringify({success:true,user_id:ctx.userId,email:a.email||'',google_linked:!!a.google_id,
      google_id:a.google_id||'',has_password:!!a.has_password,verified:!!a.verified,generation:a.generation,
      character_server_count:Number(characters[0].count),no_ads_active:!!entitlement.length&&!!entitlement[0].active,
      deletion_policy:deletionPresentation,verification_required:identityEnabled(ctx)&&!!a.has_password&&!a.google_id&&!a.verified});
};
const accountIdentityBridge:nkruntime.RpcFunction=(ctx,logger,nk,payload)=>{
    const p=JSON.parse(payload||'{}');
    if(ctx.userId||!identityEnabled(ctx)||!ctx.env.ACCOUNT_IDENTITY_SECRET||p.secret!==ctx.env.ACCOUNT_IDENTITY_SECRET)throw Error('Forbidden');
    if(p.action==='hash_reset_password') {
        const password=String(p.password||'');
        let bytes=0;try{bytes=encodeURIComponent(password).replace(/%[0-9A-F]{2}|./g,'x').length;}catch(_e){throw Error('Invalid password');}
        if(Array.from(password).length<8||bytes>72)throw Error('Invalid password');
        return JSON.stringify({success:true,password_hash:nk.bcryptHash(password)});
    }
    if(p.action==='logout_reset_sessions') {
        if(!/^[a-f0-9-]{36}$/.test(String(p.user_id||'')))throw Error('Invalid user');
        nk.sessionLogout(String(p.user_id));
        return JSON.stringify({success:true});
    }
    if(p.action==='create') {
        if(!/^[a-f0-9-]{36}$/.test(String(p.intent||'')))throw Error('Invalid intent');
        const email=String(p.email||'').trim().toLowerCase(), custom='c232:'+p.intent;
        const existing=nk.sqlQuery('SELECT u.id,u.custom_id,v.creation_intent FROM users u LEFT JOIN account_identity_verifications v ON v.user_id=u.id WHERE u.email=$1',[email]);
        if(existing.length&&existing[0].custom_id!==custom&&existing[0].creation_intent!==p.intent) return JSON.stringify({success:false,reason:'ACCOUNT_EXISTS'});
        const auth=existing.length?{userId:String(existing[0].id)}:nk.authenticateCustom(custom,String(p.username||''),true);
        const current=identityAccount(nk,auth.userId);
        if(current.email&&current.email!==email)throw Error('Identity conflict');
        if(!current.email)nk.linkEmail(auth.userId,email,String(p.password||''));
        // Never overwrite the password of an account found on retry.
        nk.sqlExec(`INSERT INTO account_identity_verifications(user_id,email,source,creation_intent) VALUES($1::UUID,$2,'email_link',$3::UUID)
          ON CONFLICT(user_id) DO UPDATE SET email=EXCLUDED.email,verified_at=NOW(),source=EXCLUDED.source,creation_intent=EXCLUDED.creation_intent`,[auth.userId,email,p.intent]);
        if(current.custom_id===custom)nk.unlinkCustom(auth.userId,custom);
        return JSON.stringify({success:true});
    }
    if(p.action==='password_proof'||p.action==='restore_password_proof') {
        const a=identityAccount(nk,String(p.user_id||''));
        if(!a||(!p.action.startsWith('restore_')&&a.deleting)||!a.email||a.generation!==p.generation||a.email!==p.email||!a.has_password)throw Error('Identity changed');
        if(p.action==='restore_password_proof'&&!nk.sqlQuery("SELECT id FROM account_identity_deletions WHERE user_id=$1::uuid AND status='soft_deleted' AND flow_version IN(2,3) AND restore_until>NOW()",[p.user_id]).length)throw Error('Restore unavailable');
        const auth=nk.authenticateEmail(a.email,String(p.password||''),undefined,false);
        if(auth.userId!==p.user_id)throw Error('Identity mismatch');
        return JSON.stringify({success:true});
    }
    if(p.action==='delete_tick')return identityDeleteTick(nk,logger,String(p.job_id||''));
    if(p.action==='reconcile') {
        const pending=nk.sqlQuery("SELECT id,custom_id,email FROM users WHERE custom_id LIKE 'c232:%' AND create_time<NOW()-INTERVAL '1 hour' LIMIT 20",[]);
        for(const a of pending) {
            if(a.email) {
                nk.sqlExec(`INSERT INTO account_identity_verifications(user_id,email,source,creation_intent) VALUES($1::UUID,$2,'email_link',$3::UUID)
                  ON CONFLICT(user_id) DO NOTHING`,[a.id,a.email,String(a.custom_id).slice(5)]);
                nk.unlinkCustom(String(a.id),String(a.custom_id));
            } else nk.accountDeleteId(String(a.id),true);
        }
        return JSON.stringify({success:true});
    }
    throw Error('Unknown identity action');
};
function identityDeleteTick(_nk:nkruntime.Nakama,_logger:nkruntime.Logger,_jobId:string):string {
    return JSON.stringify({success:false,reason:'LEGACY_DELETE_DISABLED',message:'Yêu cầu cũ cần được rà soát; không thực hiện xóa tài khoản trực tiếp.'});
}
