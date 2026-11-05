// Survival TD — Nakama Server Modules

function compliancePolicy(nk: nkruntime.Nakama, ctx:nkruntime.Context): any {
    const active = getActiveRemoteConfig(nk);
    const p = active.config && active.config.system && active.config.system.compliance_policy;
    const validated=compliancePolicyValue(p), env=ctx.env||{};
    if(env.APP_ENVIRONMENT==='develop') return Object.assign({},validated,{provider:'mock'});
    if(env.APP_ENVIRONMENT==='production') return Object.assign({},validated,{provider:'speedsms'});
    throw Error('COMPLIANCE_ENVIRONMENT_INVALID');
}
function compliancePolicyValue(p:any):any {
    if(p)for(const spec of [['lease_seconds',10,60],['otp_ttl_seconds',30,900],['otp_max_attempts',1,10],['otp_resend_seconds',10,86400],['otp_rate_window_seconds',60,86400],['otp_rate_account_max',1,1000],['otp_rate_phone_max',1,1000],['otp_rate_ip_max',1,10000],['guardian_phone_max_accounts',1,100]] as any[])
        if(!Number.isSafeInteger(p[spec[0]])||p[spec[0]]<spec[1]||p[spec[0]]>spec[2])throw Error('COMPLIANCE_POLICY_INVALID');
    if(p && p.allow_birth_date_change!==undefined && typeof p.allow_birth_date_change!=='boolean')throw Error('COMPLIANCE_POLICY_INVALID');
    if(p && p.warning_seconds!==undefined && (!Array.isArray(p.warning_seconds) || p.warning_seconds.length>10 || p.warning_seconds.some((v:any)=>!Number.isSafeInteger(v)||v<1||v>86400)))throw Error('COMPLIANCE_POLICY_INVALID');
    if(!p || !Number.isInteger(p.revision) || p.revision<1 || ['mock','zalo_oa','speedsms'].indexOf(p.provider)<0 || typeof p.game_id!=='string' || p.game_id.length>100)throw Error('COMPLIANCE_POLICY_INVALID');
    if (!p || p.schema_version !== 1 || typeof p.game_id !== 'string' || !p.game_id || !Number.isInteger(p.guardian_below_age) || p.guardian_below_age<1 || p.guardian_below_age>100 || !Array.isArray(p.age_bands) || !p.age_bands.length || !(p.lease_seconds>=10 && p.lease_seconds<=60) || !(p.otp_ttl_seconds>=30 && p.otp_ttl_seconds<=900) || !(p.otp_max_attempts>=1 && p.otp_max_attempts<=10) || !(p.otp_resend_seconds>=10)) throw Error('COMPLIANCE_POLICY_INVALID');
    for (const band of p.age_bands) if (!(band.below_age>0 && band.per_game_seconds>0 && band.total_seconds>=band.per_game_seconds)) throw Error('COMPLIANCE_POLICY_INVALID');
    return p;
}
function complianceAge(dob: string, now: number): number {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return -1;
    const born = new Date(dob+'T00:00:00Z');
    if (!isFinite(born.getTime()) || born.toISOString().slice(0,10)!==dob) return -1;
    const today = new Date((now+25200)*1000).toISOString().slice(0,10);
    const age = Number(today.slice(0,4))-Number(dob.slice(0,4))-(today.slice(5)<dob.slice(5)?1:0);
    return dob>today || age>120 ? -1 : age;
}
function complianceFailure(reason: string, message: string): any { return {success:false,allowed:false,reason:reason,message:message}; }
function speedSmsReady(env:any):boolean {
    const type=String(env.SPEEDSMS_SMS_TYPE||'4'),sender=String(env.SPEEDSMS_SENDER||'');
    return !!env.SPEEDSMS_ACCESS_TOKEN && !/[\r\n:]/.test(env.SPEEDSMS_ACCESS_TOKEN) && /^[a-fA-F0-9]{64,}$/.test(String(env.SPEEDSMS_OTP_HMAC_KEY||'')) && ['2','3','4','5','6'].indexOf(type)>=0 && (!['3','5'].includes(type)||!!sender.trim()) && String(env.SPEEDSMS_CONTENT||'Ma xac thuc cua dao huu la {pin_code}. Khong chia se ma nay.').indexOf('{pin_code}')>=0;
}
function speedSmsPin(nk:nkruntime.Nakama):string {
    for(let i=0;i<16;i++) {
      const raw=nk.uuidv4();
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw))throw Error('invalid randomness');
      const n=parseInt(raw.slice(0,8),16);
      if(n<4294000000)return String(n%1000000).padStart(6,'0');
    }
    throw Error('randomness unavailable');
}
function speedSmsDigest(nk:nkruntime.Nakama,env:any,id:string,pin:string):string {
    return nk.base64Encode(nk.hmacSha256Hash(id+':'+pin,env.SPEEDSMS_OTP_HMAC_KEY));
}
function otpTiming(now:number,value:any):any {
    return {server_time:now,expires_at:Number(value&&value.expires||0),resend_at:Number(value&&value.resend_at||0)};
}
function otpRateKey(nk:nkruntime.Nakama,ctx:nkruntime.Context,scope:string,value:string):string {
    const secret=String((ctx.env||{}).SPEEDSMS_OTP_HMAC_KEY||'development-only-otp-rate-key');
    return scope+':'+nk.base64Encode(nk.hmacSha256Hash(scope+':'+value,secret)).replace(/[+/=]/g,'_');
}
function compliancePhoneLocks(nk:nkruntime.Nakama,ctx:nkruntime.Context,oldPhone:string,newPhone:string):any[] {
    const owner='00000000-0000-0000-0000-000000000000';
    const numbers=[oldPhone,newPhone].filter((v,i,a)=>!!v&&a.indexOf(v)===i);
    const refs=numbers.map(phone=>({collection:'compliance_phone_locks',key:otpRateKey(nk,ctx,'phone_ownership',phone),userId:owner})).sort((a,b)=>a.key.localeCompare(b.key));
    const rows=nk.storageRead(refs),byKey:any={};for(const row of rows)byKey[row.key]=row;
    return refs.map(ref=>Object.assign({},ref,{value:{nonce:nk.uuidv4()},version:byKey[ref.key]?byKey[ref.key].version:'*',permissionRead:0,permissionWrite:0}));
}
function otpAccountRetry(ctx:nkruntime.Context,nk:nkruntime.Nakama,p:any,now:number):number {
    const row=nk.storageRead([{collection:'otp_rate_limit',key:otpRateKey(nk,ctx,'account',ctx.userId),userId:'00000000-0000-0000-0000-000000000000'}])[0];
    if(!row)return 0;
    const v=row.value,start=Number(v.start||0),end=start+p.otp_rate_window_seconds;
    return Math.max(Number(v.resend_at||0),now>=start&&now<end&&Number(v.count||0)>=p.otp_rate_account_max?end:0);
}
function otpRateReserve(ctx:nkruntime.Context,nk:nkruntime.Nakama,p:any,phone:string,now:number):any {
    const env=ctx.env||{},key=String(env.SPEEDSMS_OTP_HMAC_KEY||'');
    if((p.provider==='speedsms'&&!/^[a-fA-F0-9]{64,}$/.test(key))||!ctx.clientIp)return {error:true};
    const owner='00000000-0000-0000-0000-000000000000';
    const scopes=[['account',ctx.userId,p.otp_rate_account_max],['phone',phone,p.otp_rate_phone_max],['ip',ctx.clientIp,p.otp_rate_ip_max]] as any[];
    const refs=scopes.map(s=>({collection:'otp_rate_limit',key:otpRateKey(nk,ctx,String(s[0]),String(s[1])),userId:owner}));
    for(let attempt=0;attempt<4;attempt++) {
      const existing=nk.storageRead(refs), byKey:any={};for(const obj of existing)byKey[obj.key]=obj;
      const writes:any[]=[];let retry=0;
      for(let i=0;i<refs.length;i++) {
        const old=byKey[refs[i].key],v=old?old.value:{},start=Number(v.start||0),same=now>=start&&now<start+p.otp_rate_window_seconds,count=same?Number(v.count||0):0;
        if(count>=scopes[i][2])retry=Math.max(retry,start+p.otp_rate_window_seconds);
        if(i===0&&Number(v.resend_at||0)>now)retry=Math.max(retry,Number(v.resend_at));
        writes.push(Object.assign({},refs[i],{value:{start:same?start:now,count:count+1,resend_at:i===0?now+p.otp_resend_seconds:0},version:old?old.version:'*',permissionRead:0,permissionWrite:0}));
      }
      if(retry>now)return {retry_at:retry};
      try{nk.storageWrite(writes);return {ok:true};}catch(_e){}
    }
    return {error:true};
}
function compliancePublicProfile(value:any):any {
    if(!value)return {};
    const phone=String(value.phone_number||'');
    return {full_name:String(value.full_name||''),birth_date:String(value.birth_date||''),phone_number:phone,phone_mask:phone.length>4?'*'.repeat(phone.length-4)+phone.slice(-4):'',guardian_name:String(value.guardian_name||''),phone_owner:String(value.phone_owner||'self'),revision:Number(value.revision||0),verification_method:String(value.verification_method||''),is_phone_verified:value.is_phone_verified===true,verified_at:Number(value.verified_at||0)};
}
function complianceStatus(ctx: nkruntime.Context,nk: nkruntime.Nakama,p: any,playing: boolean): any {
    const now=Date.now()/1000;
    const profile=nk.storageRead([{collection:'compliance_activation',key:'profile',userId:ctx.userId}])[0];
    const v=profile ? profile.value : {};
    if(v.verification_method==='mock' && (p.provider!=='mock'||String((ctx.env||{}).COMPLIANCE_ALLOW_MOCK)!=='true')) return Object.assign(complianceFailure('PHONE_VERIFICATION_REQUIRED','Hồ sơ thử nghiệm chưa xác thực số điện thoại thật. Đạo hữu hãy xác thực lại.'),{policy:p,is_phone_verified:false});
    const age=complianceAge(String(v.birth_date||''),now);
    if (!v.is_phone_verified || age<0 || (age<p.guardian_below_age && (!v.guardian_name || v.phone_owner!=='guardian'))) return Object.assign(complianceFailure('PHONE_VERIFICATION_REQUIRED',String(p.notice||'Đạo hữu hãy xác thực hồ sơ và số điện thoại trước khi tham gia chiến đấu.')),{policy:p,is_phone_verified:false});
    // Serialize every game/account budget update inside one PostgreSQL statement.
    const day=new Date((now+25200)*1000).toISOString().slice(0,10);
    const midnight=Math.floor((now+25200)/86400)*86400-25200;
    const bands=p.age_bands.filter((b:any)=>age<Number(b.below_age));
    let gameLimit=86400,totalLimit=86400;
    for(const band of bands) {gameLimit=Math.min(gameLimit,Number(band.per_game_seconds));totalLimit=Math.min(totalLimit,Number(band.total_seconds));}
    const row=nk.sqlQuery(`SELECT * FROM compliance_budget($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9)`,[ctx.userId,p.game_id,day,now,midnight,p.lease_seconds,gameLimit,totalLimit,playing])[0];
    const used=Number(row.used),total=Number(row.total),remaining=Number(row.remaining);
    const allowed=remaining>0;
    return {success:true,allowed:allowed,is_phone_verified:true,verification_method:v.verification_method,age:age,policy:p,server_time:now,day:day,seconds:used,total_seconds:total,remaining_seconds:Math.max(0,remaining),lease_until:Number(row.until_at),reason:allowed?'':'PLAYTIME_LIMIT',message:allowed?'':'Đạo hữu đã hết thời gian chơi hôm nay. Xin nghỉ ngơi và trở lại vào ngày mai.'};
}
function linkedRpc_compliance_access(ctx:nkruntime.Context,logger:nkruntime.Logger,nk:nkruntime.Nakama,payload:string):string {
    return accountGuardedRpc('compliance_access',complianceAccess)(ctx,logger,nk,payload);
}
function privacyPolicyValue(p:any):any {
    if(!p||p.schema_version!==1||!Number.isSafeInteger(p.revision)||p.revision<1||!p.notice||typeof p.notice.text!=='string'||p.notice.text.length<20||p.notice.text.length>10000||!p.notice.id||!Number.isSafeInteger(p.notice.revision)||!Array.isArray(p.purposes)||p.purposes.length>8)throw Error('PRIVACY_POLICY_INVALID');
    const ids:any={};for(const x of p.purposes){if(!/^[a-z][a-z0-9_]{1,48}$/.test(x.id)||ids[x.id]||typeof x.label!=='string'||!x.label||!Number.isSafeInteger(x.revision)||x.revision<1||typeof x.enabled!=='boolean'||x.processing_enabled!==false)throw Error('PRIVACY_POLICY_INVALID');ids[x.id]=true;}return p;
}
function privacyView(ctx:nkruntime.Context,nk:nkruntime.Nakama):any {
    const p=getActiveRemoteConfig(nk).config.system.privacy_consent;
    if(!p)return null;
    privacyPolicyValue(p);
    const hash=nk.sqlQuery("SELECT encode(sha256(convert_to($1,'UTF8')),'hex') AS hash",[JSON.stringify(p)])[0].hash;
    const old=nk.storageRead([{collection:'privacy_consent',key:'state',userId:ctx.userId}])[0];
    return {policy:p,notice_hash:String(hash),state:old?old.value:{revision:0,choices:{}},state_version:old?old.version:'*'};
}
function privacyCapture(ctx:nkruntime.Context,nk:nkruntime.Nakama,req:any):any {
    const view=privacyView(ctx,nk);if(!req.privacy)return null;
    if(!view||req.kyc_confirmation!==true||req.privacy.notice_hash!==view.notice_hash||req.privacy.expected_revision!==view.state.revision)throw Error('PRIVACY_CHANGED');
    const choices=req.privacy.choices;
    if(!choices||typeof choices!=='object'||Array.isArray(choices))throw Error('PRIVACY_INVALID');
    const normalized:any={};for(const purpose of view.policy.purposes){const v=choices[purpose.id];if(v!==true&&v!==false)throw Error('PRIVACY_INVALID');if(v&&!purpose.enabled)throw Error('PRIVACY_INVALID');normalized[purpose.id]=v;}
    if(Object.keys(choices).length!==view.policy.purposes.length)throw Error('PRIVACY_INVALID');
    return {notice_hash:view.notice_hash,policy:view.policy,choices:normalized,base_revision:view.state.revision,base_version:view.state_version};
}
function privacyWrites(ctx:nkruntime.Context,nk:nkruntime.Nakama,snapshot:any,id:string,method:string,actor:string):any[] {
    if(!snapshot)return [];
    const view=privacyView(ctx,nk);if(!view||view.notice_hash!==snapshot.notice_hash||view.state_version!==snapshot.base_version)throw Error('PRIVACY_CHANGED');
    const state={revision:Number(snapshot.base_revision)+1,choices:snapshot.choices,notice_hash:snapshot.notice_hash,at:Date.now()/1000,verification_method:method,actor_role:actor};
    const event=Object.assign({},state,{event_id:id,notice:snapshot.policy.notice,policy_snapshot:snapshot.policy,purpose_versions:snapshot.policy.purposes.map((x:any)=>({id:x.id,revision:x.revision})),action:method==='session_withdrawal'?'withdraw':'kyc_confirmation'});
    return [{collection:'privacy_consent',key:'state',userId:ctx.userId,value:state,version:snapshot.base_version,permissionRead:0,permissionWrite:0},{collection:'privacy_consent',key:'event:'+id,userId:ctx.userId,value:event,version:'*',permissionRead:0,permissionWrite:0}];
}
function privacyWithdraw(ctx:nkruntime.Context,nk:nkruntime.Nakama,req:any):any {
    try{
      const view=privacyView(ctx,nk);if(!view||req.expected_revision!==view.state.revision)throw Error('PRIVACY_CHANGED');
      const choices:any={};
      if(req.choices!==undefined&&(!req.choices||typeof req.choices!=='object'||Array.isArray(req.choices)||Object.keys(req.choices).length!==view.policy.purposes.length))throw Error('PRIVACY_INVALID');
      for(const purpose of view.policy.purposes){
        const next=req.choices===undefined?false:req.choices[purpose.id];
        if(typeof next!=='boolean'||(next&&view.state.choices[purpose.id]!==true))throw Error('PRIVACY_INVALID');
        choices[purpose.id]=next;
      }
      const snapshot={notice_hash:view.notice_hash,policy:view.policy,choices:choices,base_revision:view.state.revision,base_version:view.state_version};
      nk.storageWrite(privacyWrites(ctx,nk,snapshot,nk.uuidv4(),'session_withdrawal','account_holder'));
      return {success:true,privacy:privacyView(ctx,nk),message:'Đạo hữu đã lưu lựa chọn sử dụng dữ liệu.'};
    }catch(_e){return complianceFailure('PRIVACY_CHANGED','Lựa chọn đã thay đổi hoặc chưa sẵn sàng. Đạo hữu hãy tải lại hồ sơ.');}
}
function complianceAccess(ctx:nkruntime.Context,_logger:nkruntime.Logger,nk:nkruntime.Nakama,payload:string):string {
    if(!ctx.userId)return JSON.stringify(complianceFailure('AUTH_REQUIRED','Đạo hữu hãy đăng nhập lại.'));
    let req:any,p:any;
    try {req=JSON.parse(payload||'{}');if(!req||typeof req!=='object'||Array.isArray(req))throw Error();p=compliancePolicy(nk,ctx);} catch(_e){return JSON.stringify(complianceFailure('POLICY_UNAVAILABLE','Thiết lập xác thực chưa sẵn sàng. Đạo hữu hãy thử lại sau.'));}
    const action=String(req.action||'status');
    if(action==='privacy_withdraw')return JSON.stringify(privacyWithdraw(ctx,nk,req));
    if(action==='profile'){
      const saved=nk.storageRead([{collection:'compliance_activation',key:'profile',userId:ctx.userId}])[0];
      const pending=nk.storageRead([{collection:'compliance_activation',key:'challenge',userId:ctx.userId}])[0];
      const now=Date.now()/1000;
      let privacy:any=null;try{privacy=privacyView(ctx,nk);}catch(_e){}
      const publicProfile=compliancePublicProfile(saved?saved.value:null);if(privacy)publicProfile.consent=privacy.state;
      return JSON.stringify(Object.assign({success:true,profile:publicProfile,privacy:privacy,policy:p,retry_at:otpAccountRetry(ctx,nk,p,now)},otpTiming(now,pending?pending.value:null)));
    }
    if(action==='status'||action==='heartbeat')return JSON.stringify(complianceStatus(ctx,nk,p,action==='heartbeat'&&req.playing===true));
    const env=ctx.env||{};
    if(!((p.provider==='mock'&&String(env.COMPLIANCE_ALLOW_MOCK)==='true')||(p.provider==='speedsms'&&speedSmsReady(env))))return JSON.stringify(complianceFailure('PROVIDER_UNAVAILABLE','Xác thực số điện thoại chưa sẵn sàng. Đạo hữu hãy thử lại sau.'));
    const now=Date.now()/1000;
    const stored=nk.storageRead([{collection:'compliance_activation',key:'challenge',userId:ctx.userId}])[0];
    if(action==='request') {
      if(stored&&Number(stored.value.resend_at)>now)return JSON.stringify(Object.assign(complianceFailure('OTP_COOLDOWN','Đạo hữu hãy chờ trước khi yêu cầu mã mới.'),otpTiming(now,stored.value),{retry_at:Number(stored.value.resend_at)}));
      const current=nk.storageRead([{collection:'compliance_activation',key:'profile',userId:ctx.userId}])[0];
      if(current&&String(current.value.birth_date)!==String(req.birth_date)&&p.allow_birth_date_change!==true)return JSON.stringify(complianceFailure('DOB_REVIEW_REQUIRED','Đạo hữu hãy liên hệ hỗ trợ để điều chỉnh ngày sinh đã xác thực.'));
      const age=complianceAge(String(req.birth_date||''),now),guardian=age>=0&&age<p.guardian_below_age;
      const phone=String(guardian?req.guardian_phone:req.phone_number).replace(/[\s.-]/g,'').replace(/^\+84/,'0');
      if(age<0||String(req.full_name||'').trim().length<2||String(req.full_name).length>100||!/^0[35789]\d{8}$/.test(phone)||(guardian&&(String(req.guardian_name||'').trim().length<2||String(req.guardian_name).length>100||req.guardian_consent!==true)))return JSON.stringify(complianceFailure('PROFILE_INVALID','Đạo hữu hãy nhập đúng họ tên, ngày sinh, số di động Việt Nam và thông tin người giám hộ nếu cần.'));
      let privacy:any=null;try{privacy=privacyCapture(ctx,nk,req);}catch(_e){return JSON.stringify(complianceFailure('PRIVACY_CHANGED','Đạo hữu hãy xem lại lựa chọn dữ liệu và xác nhận thông tin KYC. Chỉ người đủ tuổi theo chính sách mới được bật mục tùy chọn.'));}
      const limit=otpRateReserve(ctx,nk,p,phone,now);
      if(limit.retry_at)return JSON.stringify({success:false,allowed:false,reason:'OTP_COOLDOWN',message:'Đạo hữu đã yêu cầu mã gần đây. Hãy chờ trước khi thử lại.',server_time:now,retry_at:limit.retry_at,resend_at:limit.retry_at});
      if(!limit.ok)return JSON.stringify(complianceFailure('OTP_RATE_UNAVAILABLE','Chưa thể kiểm tra giới hạn gửi mã. Đạo hữu hãy thử lại sau.'));
      const value:any={full_name:String(req.full_name).trim(),birth_date:String(req.birth_date),phone_number:phone,guardian_name:guardian?String(req.guardian_name).trim():'',phone_owner:guardian?'guardian':'self',guardian_consent:guardian&&req.guardian_consent===true,guardian_consent_at:guardian?now:null,challenge_id:nk.uuidv4(),base_profile_version:current?current.version:'*',base_profile_revision:current?Number(current.value.revision||0):0,expires:now+p.otp_ttl_seconds,resend_at:now+p.otp_resend_seconds,attempts:0,policy_revision:p.revision,provider:p.provider};
      if(privacy)value.privacy=privacy;
      try{nk.storageWrite([{collection:'compliance_activation',key:'challenge',userId:ctx.userId,value:value,version:stored?stored.version:'*',permissionRead:0,permissionWrite:0}]);}
      catch(_e){return JSON.stringify(complianceFailure('OTP_REQUEST_BUSY','Đạo hữu vừa yêu cầu một mã khác. Hãy dùng mã mới nhất hoặc thử lại sau.'));}
      if(p.provider==='speedsms') {
        try {
          const pin=speedSmsPin(nk),template=String(env.SPEEDSMS_CONTENT||'Ma xac thuc cua dao huu la {pin_code}. Khong chia se ma nay.');
          const smsType=Number(env.SPEEDSMS_SMS_TYPE||'4'),sender=String(env.SPEEDSMS_SENDER||'');
          const smsBody:any={to:[phone],sms_type:smsType,content:template.split('{pin_code}').join(pin)};
          if(smsType!==4||sender.trim())smsBody.sender=sender;
          const response=nk.httpRequest('https://api.speedsms.vn/index.php/sms/send','POST',{'Content-Type':'application/json','Authorization':'Basic '+nk.base64Encode(env.SPEEDSMS_ACCESS_TOKEN+':x')},JSON.stringify(smsBody),10000);
          const body=JSON.parse(response.body);
          if(response.code!==200||body.status!=='success'||String(body.code)!=='00'||!body.data||!(Number(body.data.totalSMS)>0)||!Array.isArray(body.data.invalidPhone)||body.data.invalidPhone.length!==0)throw Error('provider rejected');
          const pending=nk.storageRead([{collection:'compliance_activation',key:'challenge',userId:ctx.userId}])[0];
          if(!pending||pending.value.challenge_id!==value.challenge_id||Date.now()/1000>=value.expires)throw Error('challenge changed');
          value.otp_digest=speedSmsDigest(nk,env,value.challenge_id,pin);
          nk.storageWrite([{collection:'compliance_activation',key:'challenge',userId:ctx.userId,value:value,version:pending.version,permissionRead:0,permissionWrite:0}]);
        } catch(_e) {return JSON.stringify(Object.assign(complianceFailure('PROVIDER_UNAVAILABLE','Chưa thể gửi mã xác thực. Đạo hữu hãy chờ rồi thử lại.'),otpTiming(Date.now()/1000,value)));}
        return JSON.stringify(Object.assign({success:true,mock:false,message:'Mã xác thực đã được yêu cầu gửi. Đạo hữu hãy kiểm tra tin nhắn.',phone_owner:value.phone_owner},otpTiming(Date.now()/1000,value)));
      }
      return JSON.stringify(Object.assign({success:true,mock:true,message:'Chế độ thử nghiệm: nhập mã 12345. Chưa gửi SMS thật.',phone_owner:value.phone_owner},otpTiming(Date.now()/1000,value)));
    }
    if(action==='verify') {
      if(!stored||!stored.value.challenge_id||!stored.value.base_profile_version||stored.value.expires<=now||stored.value.attempts>=p.otp_max_attempts||stored.value.policy_revision!==p.revision||String(stored.value.provider||'mock')!==p.provider||(p.provider==='speedsms'&&!stored.value.otp_digest))return JSON.stringify(complianceFailure('OTP_EXPIRED','Mã đã hết hiệu lực. Đạo hữu hãy yêu cầu mã mới.'));
      const value=stored.value;value.attempts+=1;
      try{nk.storageWrite([{collection:'compliance_activation',key:'challenge',userId:ctx.userId,value:value,version:stored.version,permissionRead:0,permissionWrite:0}]);}
      catch(_e){return JSON.stringify(complianceFailure('OTP_BUSY','Mã đang được kiểm tra. Đạo hữu hãy chờ giây lát.'));}
      if(p.provider==='mock'?String(req.otp)!=='12345':speedSmsDigest(nk,env,value.challenge_id,String(req.otp||''))!==value.otp_digest)return JSON.stringify(complianceFailure('OTP_INVALID','Mã xác thực chưa đúng. Đạo hữu hãy kiểm tra lại.'));
      let locks:any[];
      try {
        const old=nk.storageRead([{collection:'compliance_activation',key:'profile',userId:ctx.userId}])[0];
        if((old?old.version:'*')!==value.base_profile_version)throw Error('profile changed');
        locks=compliancePhoneLocks(nk,ctx,String(old&&old.value.phone_number||''),String(value.phone_number));
        const counts=nk.sqlQuery(`SELECT COUNT(*) FILTER (WHERE COALESCE(value->>'phone_owner','self')='self') AS personal_count, COUNT(*) FILTER (WHERE value->>'phone_owner'='guardian') AS guardian_count FROM storage WHERE collection='compliance_activation' AND key='profile' AND user_id<>$1::uuid AND value->>'phone_number'=$2 AND value->>'is_phone_verified'='true' AND ($3::boolean OR COALESCE(value->>'verification_method','')<>'mock')`,[ctx.userId,value.phone_number,p.provider==='mock'])[0];
        if(!counts||!Number.isSafeInteger(Number(counts.personal_count))||!Number.isSafeInteger(Number(counts.guardian_count)))throw Error('phone check unavailable');
        if(value.phone_owner==='self'&&Number(counts.personal_count)>0)return JSON.stringify(complianceFailure('PHONE_ALREADY_USED','Số điện thoại này đã được dùng cho một tài khoản khác. Đạo hữu hãy chọn số khác hoặc liên hệ hỗ trợ.'));
        if(value.phone_owner==='guardian'&&Number(counts.guardian_count)>=p.guardian_phone_max_accounts)return JSON.stringify(complianceFailure('GUARDIAN_PHONE_LIMIT','Số điện thoại người giám hộ đã đạt giới hạn hồ sơ. Đạo hữu hãy dùng số khác hoặc liên hệ hỗ trợ.'));
      }catch(_e){return JSON.stringify(complianceFailure('PROFILE_CHANGED','Không thể kiểm tra hồ sơ hiện tại. Đạo hữu hãy tải lại và yêu cầu mã mới.'));}
      const profile={full_name:value.full_name,birth_date:value.birth_date,phone_number:value.phone_number,guardian_name:value.guardian_name,phone_owner:value.phone_owner,guardian_consent:value.guardian_consent,guardian_consent_at:value.guardian_consent_at,policy_revision:p.revision,activation_challenge_id:value.challenge_id,revision:Number(value.base_profile_revision)+1,is_phone_verified:true,verification_method:p.provider,verified_at:now};
      let consentWrites:any[]=[];try{consentWrites=privacyWrites(ctx,nk,value.privacy,value.challenge_id,p.provider,value.phone_owner==='guardian'?'guardian':'account_holder');}catch(_e){return JSON.stringify(complianceFailure('PRIVACY_CHANGED','Lựa chọn dữ liệu đã thay đổi. Đạo hữu hãy xem lại hồ sơ và yêu cầu mã mới.'));}
      const audit={schema_version:1,action:'verified_profile_update',revision:profile.revision,at:now,method:p.provider,phone_owner:profile.phone_owner,guardian_consent:profile.guardian_consent,policy_revision:p.revision};
      try{nk.storageWrite([
        {collection:'compliance_activation',key:'profile',userId:ctx.userId,value:profile,version:value.base_profile_version,permissionRead:0,permissionWrite:0},
        {collection:'compliance_activation',key:'audit:'+value.challenge_id,userId:ctx.userId,value:audit,version:'*',permissionRead:0,permissionWrite:0},
        ...locks, ...consentWrites
      ]);}catch(_e){return JSON.stringify(complianceFailure('PROFILE_CHANGED','Hồ sơ đã thay đổi. Đạo hữu hãy tải lại và yêu cầu mã mới.'));}
      try{nk.storageDelete([{collection:'compliance_activation',key:'challenge',userId:ctx.userId}]);}catch(_e){/* Profile+audit already committed; CAS prevents replay until cleanup/expiry. */}
      const publicProfile=compliancePublicProfile(profile);let privacy:any=null;try{privacy=privacyView(ctx,nk);}catch(_e){}if(privacy)publicProfile.consent=privacy.state;
      return JSON.stringify(Object.assign(complianceStatus(ctx,nk,p,false),{profile:publicProfile,privacy:privacy}));
    }
    return JSON.stringify(complianceFailure('INVALID_ACTION','Thao tác chưa hợp lệ.'));
}
function complianceCombatGate(id:string,ctx:nkruntime.Context,nk:nkruntime.Nakama):string|null {
    const combat=['start_stage','start_trial_tower','prepare_trial_tower','tribulation_action','start_sweep','award_stage_progression','finish_trial_tower'];
    if(combat.indexOf(id)<0||!ctx.userId)return null;
    try {const result=complianceStatus(ctx,nk,compliancePolicy(nk,ctx),true);return result.allowed?null:JSON.stringify(result);}
    catch(_e){return JSON.stringify(complianceFailure('POLICY_UNAVAILABLE','Thiết lập quyền chơi chưa sẵn sàng. Đạo hữu hãy thử lại sau.'));}
}

function linkedRpc_health_heartbeat(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc('health_heartbeat', healthHeartbeat)(ctx, logger, nk, payload);
}
function linkedRpc_admin_asset_trace(ctx:nkruntime.Context,logger:nkruntime.Logger,nk:nkruntime.Nakama,payload:string):string {
    return accountGuardedRpc('admin_asset_trace',adminAssetTrace)(ctx,logger,nk,payload);
}

function accountHistoryPolicy(p:any):any {
    const statuses=['pending','validated','fulfilled','failed','cancelled','expired','voided','granted','verified','consumed'];
    if(!p||p.schema_version!==1||!Number.isSafeInteger(p.revision)||p.revision<1||!Number.isSafeInteger(p.page_size)||!Number.isSafeInteger(p.max_page_size)||p.page_size<1||p.max_page_size<p.page_size||p.max_page_size>50||!Array.isArray(p.allowed_statuses)||p.allowed_statuses.some((s:any)=>statuses.indexOf(s)<0)||!Number.isSafeInteger(p.display_utc_offset_seconds)||Math.abs(p.display_utc_offset_seconds)>50400)throw Error('HISTORY_POLICY_INVALID');
    return p;
}
function accountHistoryCte():string {
    return `WITH history AS (
      SELECT 'order:'||o.id AS reference,o.product_id,o.platform,
      CASE WHEN EXISTS(SELECT 1 FROM monetization_purchases p WHERE p.user_id=o.user_id AND COALESCE(NULLIF(p.purchase_order_id,''),p.request_id)=o.id AND p.status='voided') THEN 'voided' ELSE o.status END AS status,
      o.created_at,o.target_server_id,o.target_generation,o.id AS financial_order_ref FROM monetization_purchase_orders o WHERE o.user_id=$1
      UNION ALL
      SELECT 'legacy:'||p.id::text,p.product_id,p.platform,p.status,p.created_at,p.target_server_id,p.target_generation,NULL::text
      FROM monetization_purchases p WHERE p.user_id=$1 AND NOT EXISTS(SELECT 1 FROM monetization_purchase_orders o WHERE o.user_id=p.user_id AND o.id=COALESCE(NULLIF(p.purchase_order_id,''),p.request_id)))`;
}
function accountHistoryQuery():string {
    return accountHistoryCte()+`
      SELECT reference,product_id,COALESCE((SELECT display_name FROM game_store_products s WHERE s.product_id=history.product_id),product_id) AS product_name,platform,status,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,target_server_id,target_generation,
      f.original_amount::text AS paid_amount,f.currency,f.source AS price_source,to_char(f.last_synced_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS financial_synced_at,snap.refunded_amount::text AS refunded_amount
      FROM history LEFT JOIN payment_financial_records f ON f.purchase_order_id=history.financial_order_ref
      LEFT JOIN LATERAL (SELECT refunded_amount FROM payment_financial_snapshots WHERE purchase_order_id=f.purchase_order_id ORDER BY provider_event_at DESC,synced_at DESC LIMIT 1) snap ON TRUE
      WHERE ($2='' OR status=$2) AND ($3='' OR (created_at,reference)<(NULLIF($3,'')::timestamptz,$4))
      ORDER BY created_at DESC,reference DESC LIMIT $5`;
}
function linkedRpc_account_history(ctx:nkruntime.Context,logger:nkruntime.Logger,nk:nkruntime.Nakama,payload:string):string {
    return accountGuardedRpc('account_history',accountHistory)(ctx,logger,nk,payload);
}
function accountHistory(ctx:nkruntime.Context,_logger:nkruntime.Logger,nk:nkruntime.Nakama,payload:string):string {
    if(!ctx.userId)return JSON.stringify({success:false,reason:'AUTH_REQUIRED',message:'Đạo hữu hãy đăng nhập để tra cứu.'});
    let req:any,policy:any,active:any;
    try{req=JSON.parse(payload||'{}');active=getActiveRemoteConfig(nk);policy=accountHistoryPolicy(active.config.system.account_history);}
    catch(_e){return JSON.stringify({success:false,reason:'HISTORY_UNAVAILABLE',message:'Sổ giao dịch chưa sẵn sàng. Đạo hữu hãy thử lại sau.'});}
    const status=String(req.status||'');
    if(status && policy.allowed_statuses.indexOf(status)<0)return JSON.stringify({success:false,reason:'INVALID_FILTER',message:'Bộ lọc giao dịch chưa hợp lệ.'});
    if(req.limit!==undefined && (!Number.isSafeInteger(req.limit)||req.limit<1))return JSON.stringify({success:false,reason:'INVALID_PAGE',message:'Số dòng tra cứu chưa hợp lệ.'});
    const numbered=req.page!==undefined;
    if(numbered&&(!Number.isSafeInteger(req.page)||req.page<1||req.cursor))return JSON.stringify({success:false,reason:'INVALID_PAGE',message:'Trang tra cứu chưa hợp lệ.'});
    const limit=Math.min(req.limit||(numbered?5:policy.page_size),policy.max_page_size);
    let cursor:any={created_at:'',reference:''};
    if(req.cursor){try{if(typeof req.cursor!=='string'||req.cursor.length>1000)throw Error();cursor=JSON.parse(req.cursor);if(typeof cursor.reference!=='string'||cursor.reference.length>300||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{1,6}Z$/.test(cursor.created_at)||!isFinite(Date.parse(cursor.created_at)))throw Error();}catch(_e){return JSON.stringify({success:false,reason:'INVALID_CURSOR',message:'Trang tra cứu đã thay đổi. Đạo hữu hãy tải lại.'});}}
    let page=1,totalCount=0,totalPages=1;
    if(numbered){
        const counts=nk.sqlQuery(accountHistoryCte()+" SELECT COUNT(*)::BIGINT AS total_count FROM history WHERE ($2='' OR status=$2)",[ctx.userId,status]);
        totalCount=Number(counts[0].total_count);
        totalPages=Math.max(1,Math.ceil(totalCount/limit));
        page=Math.min(req.page,totalPages);
    }
    const rows=nk.sqlQuery(accountHistoryQuery()+(numbered?' OFFSET $6':''),numbered?[ctx.userId,status,'','',limit+1,(page-1)*limit]:[ctx.userId,status,cursor.created_at,cursor.reference,limit+1]);
    const hasMore=rows.length>limit,transactions=rows.slice(0,limit).map((r:any)=>({reference:r.reference,product_id:r.product_id,product_name:r.product_name,platform:r.platform,status:r.status,created_at:r.created_at,target_server_id:r.target_server_id,target_generation:Number(r.target_generation),paid_amount:r.paid_amount==null?null:String(r.paid_amount),currency:r.currency||null,price_recorded:r.paid_amount!=null,price_source:r.price_source||null,refunded_amount:r.refunded_amount==null?null:String(r.refunded_amount),financial_synced_at:r.financial_synced_at||null}));
    const last=transactions[transactions.length-1];
    const stored=nk.storageRead([{collection:'player_profiles',key:'main',userId:ctx.userId},{collection:'player_inventory',key:'items',userId:ctx.userId}]);
    const profile=stored.find((r:any)=>r.collection==='player_profiles'),inventory=stored.find((r:any)=>r.collection==='player_inventory');
    const resources:any={};for(const key of ['gold','gems'])resources[key]=Math.max(0,Number(profile&&profile.value.resources&&profile.value.resources[key]||0));
    const now=Date.now()/1000,day=new Date((now+25200)*1000).toISOString().slice(0,10);
    const activity=nk.sqlQuery('SELECT seconds FROM player_health_activity WHERE user_id=$1::uuid AND day=$2',[ctx.userId,day]);
    const combat=nk.sqlQuery('SELECT COALESCE(SUM(seconds+GREATEST(0,LEAST($3,lease_until)-last_at)),0) AS seconds FROM compliance_playtime WHERE user_id=$1::uuid AND day=$2',[ctx.userId,day,now]);
    return JSON.stringify({success:true,config_version:active.version,server_time:now,policy:policy,summary:{resources:resources,inventory_entry_count:inventory&&Array.isArray(inventory.value.items)?inventory.value.items.length:0,activity_seconds:activity.length?Number(activity[0].seconds):0,combat_seconds:combat.length?Number(combat[0].seconds):0},transactions:transactions,next_cursor:hasMore?JSON.stringify({created_at:last.created_at,reference:last.reference}):'',...(numbered?{page,limit,total_count:totalCount,total_pages:totalPages}:{})});
}

function healthHeartbeat(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    if (!ctx.userId) return JSON.stringify({success:false});
    const request = JSON.parse(payload || '{}');
    if (typeof request.active !== 'boolean') return JSON.stringify({success:false});
    const now = Date.now() / 1000;
    const day = new Date((now + 25200) * 1000).toISOString().slice(0,10);
    const midnight = Math.floor((now + 25200) / 86400) * 86400 - 25200;
    // Atomic account-wide update; repeated/concurrent requests cannot double credit.
    const credit = `CASE WHEN player_health_activity.active AND $4::boolean AND $3::double precision-player_health_activity.last_at BETWEEN 0 AND 90 THEN LEAST(45,$3::double precision-player_health_activity.last_at) ELSE 0 END`;
    const daily = `CASE WHEN player_health_activity.day=$2 THEN player_health_activity.seconds + (${credit}) ELSE LEAST((${credit}),$3::double precision-$5::double precision) END`;
    const rows = nk.sqlQuery(`INSERT INTO player_health_activity(user_id,day,last_at,active) VALUES($1::uuid,$2,$3,$4)
      ON CONFLICT(user_id) DO UPDATE SET day=$2, seconds=${daily},
      continuous_seconds=CASE WHEN (${credit})>0 THEN player_health_activity.continuous_seconds+(${credit}) ELSE 0 END,
      milestone=CASE WHEN player_health_activity.day=$2 THEN player_health_activity.milestone ELSE 0 END,
      last_at=GREATEST(player_health_activity.last_at,$3), active=$4
      RETURNING day,seconds,continuous_seconds,milestone`, [ctx.userId,day,now,request.active,midnight]);
    const row = rows[0];
    const milestone = Math.floor(Number(row.seconds) / 1800);
    const result = {success:true,day:row.day,seconds:Number(row.seconds),continuous_seconds:Number(row.continuous_seconds),milestone:milestone};
    if (milestone > Number(row.milestone)) {
      const claimed = nk.sqlQuery(`UPDATE player_health_activity SET milestone=$3 WHERE user_id=$1::uuid AND day=$2 AND milestone<$3 RETURNING user_id`, [ctx.userId,day,milestone]);
      if (claimed.length) {
        try { nk.notificationSend(ctx.userId, 'Health reminder', result, 148, undefined, false); }
        catch (error) { logger.warn('Health reminder push failed; heartbeat snapshot recovers'); }
      }
    }
    return JSON.stringify(result);
}
// Phase 2: Config Tables + Seed + Config RPC
// Build: npx esbuild data/modules/main.ts --bundle --platform=node --target=es5 --outfile=data/build/index.js

function linkedRpc_rename_player(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("rename_player", renamePlayer)(ctx, logger, nk, payload);
}
function linkedRpc_admin_test_access(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("admin_test_access", adminTestAccess)(ctx, logger, nk, payload);
}
function linkedRpc_account_password_status(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("account_password_status", accountPasswordStatus)(ctx, logger, nk, payload);
}
function linkedRpc_setup_account_password(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("setup_account_password", setupAccountPassword)(ctx, logger, nk, payload);
}
function linkedRpc_google_link_status(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("google_link_status", googleLinkStatus)(ctx, logger, nk, payload);
}
function linkedRpc_prepare_google_link(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("prepare_google_link", prepareGoogleLink)(ctx, logger, nk, payload);
}
function linkedRpc_confirm_google_link(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("confirm_google_link", confirmGoogleLink)(ctx, logger, nk, payload);
}
function linkedRpc_seed_game_data(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("seed_game_data", seedGameData)(ctx, logger, nk, payload);
}
function linkedRpc_get_game_config(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("get_game_config", gatedGetGameConfig)(ctx, logger, nk, payload);
}
function linkedRpc_get_config_bootstrap(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("get_config_bootstrap", getConfigBootstrap)(ctx, logger, nk, payload);
}
function linkedRpc_publish_config_release(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("publish_config_release", publishConfigRelease)(ctx, logger, nk, payload);
}
function linkedRpc_save_player_profile(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("save_player_profile", gatedSavePlayerProfile)(ctx, logger, nk, payload);
}
function linkedRpc_load_player_profile(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("load_player_profile", gatedLoadPlayerProfile)(ctx, logger, nk, payload);
}
function linkedRpc_abandon_run(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("abandon_run", gatedAbandonRun)(ctx, logger, nk, payload);
}
function linkedRpc_set_player_avatar(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("set_player_avatar", setPlayerAvatar)(ctx, logger, nk, payload);
}
function linkedRpc_get_player_avatars(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("get_player_avatars", getPlayerAvatars)(ctx, logger, nk, payload);
}
function linkedRpc_save_compliance_profile(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("save_compliance_profile", gatedSaveComplianceProfile)(ctx, logger, nk, payload);
}
function linkedRpc_get_compliance_profile(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("get_compliance_profile", gatedGetComplianceProfile)(ctx, logger, nk, payload);
}
function linkedRpc_update_inventory(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("update_inventory", gatedUpdateInventory)(ctx, logger, nk, payload);
}
function linkedRpc_talisman_action(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("talisman_action", gatedTalismanAction)(ctx, logger, nk, payload);
}
function linkedRpc_store_purchase(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("store_purchase", gatedStorePurchase)(ctx, logger, nk, payload);
}
function linkedRpc_use_consumable(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("use_consumable", gatedUseConsumable)(ctx, logger, nk, payload);
}
function linkedRpc_talisman_cast(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("talisman_cast", gatedTalismanCast)(ctx, logger, nk, payload);
}
function linkedRpc_spend_resource(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("spend_resource", gatedSpendResource)(ctx, logger, nk, payload);
}
function linkedRpc_purchase_stamina(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("purchase_stamina", gatedPurchaseStamina)(ctx, logger, nk, payload);
}
function linkedRpc_purchase_hero(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("purchase_hero", gatedPurchaseHero)(ctx, logger, nk, payload);
}
function linkedRpc_daily_checkin_status(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("daily_checkin_status", gatedDailyCheckinStatus)(ctx, logger, nk, payload);
}
function linkedRpc_daily_checkin_claim(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("daily_checkin_claim", gatedDailyCheckinClaim)(ctx, logger, nk, payload);
}
function linkedRpc_event_list(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("event_list", gatedEventList)(ctx, logger, nk, payload);
}
function linkedRpc_event_claim(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("event_claim", gatedEventClaim)(ctx, logger, nk, payload);
}
function linkedRpc_start_stage(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("start_stage", gatedStartStage)(ctx, logger, nk, payload);
}
function linkedRpc_get_stage_plan(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("get_stage_plan", getStagePlan)(ctx, logger, nk, payload);
}
function linkedRpc_upgrade_element(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("upgrade_element", gatedUpgradeElement)(ctx, logger, nk, payload);
}
function linkedRpc_award_stage_progression(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("award_stage_progression", (c,l,n,p)=>gatedAwardStageProgression(c,l,mailCombatRuntime(n,c.userId),p))(ctx, logger, nk, payload);
}
function linkedRpc_tribulation_action(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("tribulation_action", (c,l,n,p)=>gatedTribulationAction(c,l,mailCombatRuntime(n,c.userId),p))(ctx, logger, nk, payload);
}
function linkedRpc_get_than_luan_state(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string {
    return accountGuardedRpc('get_than_luan_state',(cc,ll,nn,pp)=>invokeWithVersionGate(cc,ll,nn,pp,getThanLuanState))(c,l,n,p);
}
function linkedRpc_upgrade_than_luan(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string {
    return accountGuardedRpc('upgrade_than_luan',(cc,ll,nn,pp)=>invokeWithVersionGate(cc,ll,nn,pp,upgradeThanLuan))(c,l,n,p);
}
function linkedRpc_get_trial_tower_status(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("get_trial_tower_status", (c,l,n,p) => invokeWithVersionGate(c,l,n,p,trialTowerStatus))(ctx,logger,nk,payload);
}
function linkedRpc_start_trial_tower(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string {
    return accountGuardedRpc('start_trial_tower',(cc,ll,nn,pp)=>invokeWithVersionGate(cc,ll,nn,pp,startTrialTower))(c,l,n,p);
}
function linkedRpc_finish_trial_tower(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string {
    return accountGuardedRpc('finish_trial_tower',(cc,ll,nn,pp)=>invokeWithVersionGate(cc,ll,nn,pp,finishTrialTower))(c,l,n,p);
}
function linkedRpc_prepare_trial_tower(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string {
    return accountGuardedRpc('prepare_trial_tower',(cc,ll,nn,pp)=>invokeWithVersionGate(cc,ll,nn,pp,prepareTrialTower))(c,l,n,p);
}
function linkedRpc_get_monetization_status(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("get_monetization_status", gatedGetMonetizationStatus)(ctx, logger, nk, payload);
}
function linkedRpc_get_daily_pack_status(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("get_daily_pack_status", gatedGetDailyPackStatus)(ctx, logger, nk, payload);
}
function linkedRpc_claim_daily_pack(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("claim_daily_pack", gatedClaimDailyPack)(ctx, logger, nk, payload);
}
function linkedRpc_create_purchase_order(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("create_purchase_order", gatedCreatePurchaseOrder)(ctx, logger, nk, payload);
}
function linkedRpc_sync_play_purchase(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("sync_play_purchase", gatedSyncPlayPurchase)(ctx, logger, nk, payload);
}
function linkedRpc_iap_google_claim(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("iap_google_claim", gatedIapGoogleClaim)(ctx, logger, nk, payload);
}
function linkedRpc_prepare_rewarded_ad(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("prepare_rewarded_ad", gatedPrepareRewardedAd)(ctx, logger, nk, payload);
}
function linkedRpc_confirm_rewarded_ad(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("confirm_rewarded_ad", gatedConfirmRewardedAd)(ctx, logger, nk, payload);
}
function linkedRpc_consume_ad_gameplay_reward(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("consume_ad_gameplay_reward", gatedConsumeAdGameplayReward)(ctx, logger, nk, payload);
}
function linkedRpc_admob_ssv_confirm(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("admob_ssv_confirm", admobSsvConfirm)(ctx, logger, nk, payload);
}
function linkedRpc_google_play_rtdn_confirm(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("google_play_rtdn_confirm", googlePlayRtdnConfirm)(ctx, logger, nk, payload);
}
function linkedRpc_weekly_leaderboard_tick(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return weeklyLeaderboardTickRpc(ctx,logger,nk,payload);
}
function linkedRpc_get_weekly_leaderboard_rewards(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("get_weekly_leaderboard_rewards", (c,l,n,p) => invokeWithVersionGate(c,l,n,p,getWeeklyLeaderboardRewards))(ctx,logger,nk,payload);
}
function linkedRpc_claim_weekly_leaderboard_reward(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("claim_weekly_leaderboard_reward", (c,l,n,p) => invokeWithVersionGate(c,l,n,p,(cc,ll,nn,pp)=>{
        const result=claimWeeklyLeaderboardReward(cc,ll,nn,pp);
        if(JSON.parse(result).success)mailSyncWeeklyClaim(nn,cc.userId,pp);
        return result;
    }))(ctx,logger,nk,payload);
}
function linkedRpc_sync_player_leaderboards(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("sync_player_leaderboards", gatedSyncPlayerLeaderboards)(ctx, logger, nk, payload);
}
function linkedRpc_get_leaderboard_records(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("get_leaderboard_records", gatedGetLeaderboardRecords)(ctx, logger, nk, payload);
}
function linkedRpc_sync_all_leaderboards(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("sync_all_leaderboards", rpcSyncAllLeaderboards)(ctx, logger, nk, payload);
}

function linkedRpc_session_status(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
    return accountGuardedRpc("session_status", sessionStatus)(ctx, logger, nk, payload);
}

function linkedRpc_list_servers(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return accountGuardedRpc('list_servers',listGameServers)(c,l,n,p);}
function linkedRpc_list_my_characters(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return accountGuardedRpc('list_my_characters',listMyCharacters)(c,l,n,p);}
function linkedRpc_enter_server(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return accountGuardedRpc('enter_server',enterGameServer)(c,l,n,p);}
function linkedRpc_create_character(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return accountGuardedRpc('create_character',createServerCharacter)(c,l,n,p);}
function linkedRpc_iap_claim(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return accountGuardedRpc('iap_claim',(cc,ll,nn,pp)=>invokeWithVersionGate(cc,ll,nn,pp,iapClaim))(c,l,n,p);}
function linkedRpc_resolve_purchase_order(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return accountGuardedRpc('resolve_purchase_order',(cc,ll,nn,pp)=>invokeWithVersionGate(cc,ll,nn,pp,resolvePurchaseOrder))(c,l,n,p);}

function InitModule(
    ctx: nkruntime.Context,
    logger: nkruntime.Logger,
    nk: nkruntime.Nakama,
    initializer: nkruntime.Initializer
): void {
    createSupportTables(nk);
    initializer.registerRpc('support_create',rpc_support_create);
    initializer.registerRpc('support_list',rpc_support_list);
    initializer.registerRpc('support_get',rpc_support_get);
    initializer.registerRpc('support_read',rpc_support_read);
    initializer.registerRpc('support_reply',rpc_support_reply);
    initializer.registerRpc('support_close',rpc_support_close);
    initializer.registerRpc('support_reopen',rpc_support_reopen);
    initializer.registerRpc('admin_support_list',rpc_admin_support_list);
    initializer.registerRpc('admin_support_get',rpc_admin_support_get);
    initializer.registerRpc('admin_support_reply',rpc_admin_support_reply);
    initializer.registerRpc('admin_support_update',rpc_admin_support_update);
    initializer.registerRpc('health_heartbeat', linkedRpc_health_heartbeat);
    initializer.registerRpc('admin_asset_trace',linkedRpc_admin_asset_trace);
    initializer.registerRpc('admin_player_data_export',adminPlayerDataExport);
    initializer.registerRpc('compliance_access', linkedRpc_compliance_access);
    initializer.registerRpc('account_history', linkedRpc_account_history);
    initializer.registerRpc('google_play_financial_sync', googlePlayFinancialSync);
    nk.sqlExec(`CREATE TABLE IF NOT EXISTS compliance_playtime (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, game_id TEXT NOT NULL, day TEXT NOT NULL,
      seconds DOUBLE PRECISION NOT NULL DEFAULT 0,last_at DOUBLE PRECISION NOT NULL, lease_until DOUBLE PRECISION NOT NULL DEFAULT 0,
      PRIMARY KEY(user_id,game_id,day))`, []);
    nk.sqlExec(`CREATE OR REPLACE FUNCTION compliance_budget(uid UUID,gid TEXT,service_day TEXT,t DOUBLE PRECISION,midnight DOUBLE PRECISION,lease DOUBLE PRECISION,game_limit DOUBLE PRECISION,total_limit DOUBLE PRECISION,playing BOOLEAN)
      RETURNS TABLE(used DOUBLE PRECISION,total DOUBLE PRECISION,remaining DOUBLE PRECISION,until_at DOUBLE PRECISION) LANGUAGE plpgsql AS $budget$
      DECLARE reserved DOUBLE PRECISION;
      BEGIN
        PERFORM pg_advisory_xact_lock(hashtext(uid::text));
        UPDATE compliance_playtime SET seconds=seconds+GREATEST(0,LEAST(lease_until,CASE WHEN day=service_day THEN t ELSE midnight END)-last_at),last_at=GREATEST(last_at,LEAST(t,CASE WHEN day=service_day THEN t ELSE midnight END)),lease_until=CASE WHEN day=service_day THEN lease_until ELSE 0 END WHERE user_id=uid;
        INSERT INTO compliance_playtime(user_id,game_id,day,last_at) VALUES(uid,gid,service_day,t) ON CONFLICT DO NOTHING;
        SELECT seconds INTO used FROM compliance_playtime WHERE user_id=uid AND game_id=gid AND day=service_day;
        SELECT COALESCE(SUM(seconds),0),COALESCE(SUM(CASE WHEN game_id<>gid THEN GREATEST(0,lease_until-t) ELSE 0 END),0) INTO total,reserved FROM compliance_playtime WHERE user_id=uid AND day=service_day;
        remaining:=GREATEST(0,LEAST(game_limit-used,total_limit-total-reserved));
        until_at:=CASE WHEN playing AND remaining>0 THEN LEAST(t+lease,t+remaining,midnight+86400) ELSE 0 END;
        UPDATE compliance_playtime SET lease_until=until_at WHERE user_id=uid AND game_id=gid AND day=service_day;
        RETURN NEXT;
      END $budget$`, []);
    nk.sqlExec(`CREATE TABLE IF NOT EXISTS player_health_activity (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      day TEXT NOT NULL, seconds DOUBLE PRECISION NOT NULL DEFAULT 0,
      continuous_seconds DOUBLE PRECISION NOT NULL DEFAULT 0,
      last_at DOUBLE PRECISION NOT NULL, active BOOLEAN NOT NULL,
      milestone INTEGER NOT NULL DEFAULT 0)`, []);
    // Phase 2: Create tables on startup
    createServerRegistryTables(nk);
    initializer.registerRpc('gift_code_redeem',linkedRpc_gift_code_redeem);
    initializer.registerRpc('gift_code_admin',linkedRpc_gift_code_admin);
    initializer.registerRpc('operator_gift_codes',operatorGiftCodes);
    createMailboxTables(nk);
    initializer.registerRpc('mail_summary',linkedRpc_mail_summary);
    initializer.registerRpc('mail_list',linkedRpc_mail_list);
    initializer.registerRpc('mail_open',linkedRpc_mail_open);
    initializer.registerRpc('mail_claim',linkedRpc_mail_claim);
    initializer.registerRpc('mail_claim_all',linkedRpc_mail_claim_all);
    initializer.registerRpc('mail_delete',linkedRpc_mail_delete);
    initializer.registerRpc('mail_delete_read',linkedRpc_mail_delete_read);
    initializer.registerRpc('mail_admin_send',linkedRpc_mail_admin_send);
    initializer.registerRpc('mail_admin_campaign',linkedRpc_mail_admin_campaign);
    initializer.registerRpc('mail_tick',rpcMailTick);
    sweepCreateWorkerIndex(nk);
    initializer.registerRpc('get_sweep_options',linkedRpc_get_sweep_options);
    initializer.registerRpc('preview_sweep',linkedRpc_preview_sweep);
    initializer.registerRpc('start_sweep',linkedRpc_start_sweep);
    initializer.registerRpc('get_sweep_status',linkedRpc_get_sweep_status);
    initializer.registerRpc('cancel_sweep',linkedRpc_cancel_sweep);
    initializer.registerRpc('finish_sweep',linkedRpc_finish_sweep);
    initializer.registerRpc('sweep_tick',rpcSweepTick);
    initializer.registerRpc('admin_whoami',rpcAdminWhoami);
    initializer.registerRpc('admin_config_get', rpcAdminConfigGet);
    initializer.registerRpc('admin_config_update', rpcAdminConfigUpdate);
    initializer.registerRpc('admin_config_toggle', rpcAdminConfigToggle);
    initializer.registerRpc('admin_config_validate', rpcAdminConfigValidate);
    initializer.registerRpc('admin_config_rollback', rpcAdminConfigRollback);
    initializer.registerRpc("admin_enemy_catalog_list", rpc_admin_enemy_catalog_list);
    initializer.registerRpc("admin_enemy_catalog_get", rpc_admin_enemy_catalog_get);
    initializer.registerRpc("admin_enemy_catalog_save", rpc_admin_enemy_catalog_save);
    initializer.registerRpc("admin_enemy_catalog_delete", rpc_admin_enemy_catalog_delete);
    initializer.registerRpc("admin_enemy_visual_set_list", rpc_admin_enemy_visual_set_list);
    initializer.registerRpc("admin_enemy_visual_set_get", rpc_admin_enemy_visual_set_get);
    initializer.registerRpc("admin_enemy_visual_set_save", rpc_admin_enemy_visual_set_save);
    initializer.registerRpc("admin_enemy_visual_set_delete", rpc_admin_enemy_visual_set_delete);
    initializer.registerRpc("admin_enemy_visual_asset_list", rpc_admin_enemy_visual_asset_list);
    initializer.registerRpc("admin_enemy_visual_asset_get", rpc_admin_enemy_visual_asset_get);
    initializer.registerRpc("admin_enemy_visual_asset_save", rpc_admin_enemy_visual_asset_save);
    initializer.registerRpc("admin_enemy_visual_asset_delete", rpc_admin_enemy_visual_asset_delete);
    initializer.registerRpc("admin_enemy_skill_list", rpc_admin_enemy_skill_list);
    initializer.registerRpc("admin_enemy_skill_get", rpc_admin_enemy_skill_get);
    initializer.registerRpc("admin_enemy_skill_save", rpc_admin_enemy_skill_save);
    initializer.registerRpc("admin_enemy_skill_delete", rpc_admin_enemy_skill_delete);
    initializer.registerRpc("admin_campaign_overview", rpc_admin_campaign_overview);
    initializer.registerRpc("admin_campaign_stage_get", rpc_admin_campaign_stage_get);
    initializer.registerRpc("admin_campaign_stage_save", rpc_admin_campaign_stage_save);
    initializer.registerRpc("admin_campaign_stage_resolve", rpc_admin_campaign_stage_resolve);
    initializer.registerRpc("get_stage_plan", linkedRpc_get_stage_plan);
    initializer.registerRpc("admin_enemy_stage_entry_list", rpc_admin_enemy_stage_entry_list);
    initializer.registerRpc("admin_enemy_stage_entry_get", rpc_admin_enemy_stage_entry_get);
    initializer.registerRpc("admin_enemy_stage_entry_save", rpc_admin_enemy_stage_entry_save);
    initializer.registerRpc("admin_enemy_stage_entry_delete", rpc_admin_enemy_stage_entry_delete);
    initializer.registerRpc("admin_enemy_catalog_status", rpc_admin_enemy_catalog_status);
    initializer.registerRpc("admin_enemy_catalog_normalize", rpc_admin_enemy_catalog_normalize);
    initializer.registerRpc("admin_enemy_catalog_preview", rpc_admin_enemy_catalog_preview);
    initializer.registerRpc("admin_enemy_catalog_validate", rpc_admin_enemy_catalog_validate);
    initializer.registerRpc("admin_enemy_catalog_migrate", rpc_admin_enemy_catalog_migrate);
    initializer.registerRpc("admin_enemy_catalog_publish", rpc_admin_enemy_catalog_publish);
    initializer.registerRpc("admin_enemy_catalog_rollback", rpc_admin_enemy_catalog_rollback);
    initializer.registerRpc("admin_enemy_release_list", rpc_admin_enemy_release_list);
    initializer.registerRpc("admin_enemy_release_get", rpc_admin_enemy_release_get);
    initializer.registerRpc("admin_enemy_audit_list", rpc_admin_enemy_audit_list);
    initializer.registerRpc("admin_enemy_audit_get", rpc_admin_enemy_audit_get);
    initializer.registerRpc('admin_item_list', rpcAdminItemList);
    initializer.registerRpc('admin_item_get', rpcAdminItemGet);
    initializer.registerRpc('admin_item_update', rpcAdminItemUpdate);
    initializer.registerRpc('admin_item_toggle', rpcAdminItemToggle);
    initializer.registerRpc('admin_item_group_update', rpcAdminItemGroupUpdate);
    initializer.registerRpc('item_batch_get', rpcItemBatchGet);
    initializer.registerRpc('admin_pack_list', rpcAdminPackList);
    initializer.registerRpc('admin_pack_get', rpcAdminPackGet);
    initializer.registerRpc('admin_pack_save', rpcAdminPackSave);
    initializer.registerRpc('admin_pack_toggle', rpcAdminPackToggle);
    initializer.registerRpc('admin_pack_delete', rpcAdminPackDelete);
    initializer.registerRpc('admin_server_list',rpcAdminServerList);
    initializer.registerRpc('admin_server_inspect',rpcAdminServerInspect);
    initializer.registerRpc('admin_server_create',rpcAdminServerCreate);
    initializer.registerRpc('admin_server_disable',rpcAdminServerDisable);
    initializer.registerRpc('admin_server_enable',rpcAdminServerEnable);
    initializer.registerRpc('admin_server_update',rpcAdminServerUpdate);
    initializer.registerRpc('admin_server_expire_pending',rpcAdminServerExpirePending);
    initializer.registerRpc('admin_server_plan',rpcAdminServerPlan);
    initializer.registerRpc('admin_server_execute',rpcAdminServerExecute);
    initializer.registerRpc('admin_server_job',rpcAdminServerJob);
    initializer.registerRpc('admin_server_job_step',rpcAdminServerJobStep);
    initializer.registerRpc('admin_server_financial_list',rpcAdminServerFinancialList);
    initializer.registerRpc('admin_server_financial_retry',rpcAdminServerFinancialRetry);
    initializer.registerRpc("list_servers", linkedRpc_list_servers);
    initializer.registerRpc("list_my_characters", linkedRpc_list_my_characters);
    initializer.registerRpc("enter_server", linkedRpc_enter_server);
    initializer.registerRpc("create_character", linkedRpc_create_character);
    createGameConfigTables(nk, logger);
    createEnemyCatalogTables(nk);
    sweepMigratePublishedConfig(nk,logger);
    createMonetizationTables(nk, logger);
    initializer.registerRpc("iap_claim", linkedRpc_iap_claim);
    initializer.registerRpc("resolve_purchase_order", linkedRpc_resolve_purchase_order);
    createAccountLinkTables(nk);
    createSingleLoginTable(nk);
    createAccountIdentityTables(nk);
    initializer.registerRpc('account_identity_status',accountIdentityStatus);
    initializer.registerRpc('account_identity_bridge',accountIdentityBridge);
    (initializer as any).registerBeforeLinkEmail(identityBlockMutation);
    (initializer as any).registerBeforeUnlinkEmail(identityBlockMutation);
    (initializer as any).registerBeforeLinkGoogle(identityBlockMutation);
    (initializer as any).registerBeforeUnlinkGoogle(identityBlockMutation);
    (initializer as any).registerBeforeDeleteAccount(identityBlockMutation);
    (initializer as any).registerBeforeUpdateAccount(identityBeforeUpdate);
    // Native API access must not bypass game RPC gates with an old signed session.
    (initializer as any).registerBeforeReadStorageObjects(identityGuardNative);
    (initializer as any).registerBeforeListStorageObjects(identityGuardNative);
    (initializer as any).registerBeforeWriteStorageObjects(identityGuardNative);
    (initializer as any).registerBeforeDeleteStorageObjects(identityGuardNative);
    (initializer as any).registerBeforeGetAccount(identityGuardNative);
    (initializer as any).registerBeforeLinkCustom(identityGuardNative);
    (initializer as any).registerBeforeUnlinkCustom(identityGuardNative);
    (initializer as any).registerBeforeLinkDevice(identityGuardNative);
    (initializer as any).registerBeforeUnlinkDevice(identityGuardNative);
    (initializer as any).registerBeforeLinkApple(identityGuardNative);
    (initializer as any).registerBeforeUnlinkApple(identityGuardNative);
    (initializer as any).registerBeforeLinkFacebook(identityGuardNative);
    (initializer as any).registerBeforeUnlinkFacebook(identityGuardNative);
    (initializer as any).registerBeforeLinkFacebookInstantGame(identityGuardNative);
    (initializer as any).registerBeforeUnlinkFacebookInstantGame(identityGuardNative);
    (initializer as any).registerBeforeLinkGameCenter(identityGuardNative);
    (initializer as any).registerBeforeUnlinkGameCenter(identityGuardNative);
    (initializer as any).registerBeforeLinkSteam(identityGuardNative);
    (initializer as any).registerBeforeUnlinkSteam(identityGuardNative);
    initializer.registerBeforeAuthenticateEmail(beforeSingleLoginEmail);
    initializer.registerAfterAuthenticateEmail(afterSingleLogin);
    initializer.registerBeforeAuthenticateGoogle(identityBeforeGoogle);
    initializer.registerAfterAuthenticateGoogle(identityAfterGoogle);
    initializer.registerBeforeAuthenticateDevice(beforeSingleLogin);
    initializer.registerAfterAuthenticateDevice(afterSingleLogin);
    initializer.registerBeforeAuthenticateCustom(identityBeforeCustom);
    initializer.registerAfterAuthenticateCustom(afterSingleLogin);
    initializer.registerRpc("session_status", linkedRpc_session_status);
    initializer.registerRpc("admin_test_access", linkedRpc_admin_test_access);
    initializer.registerRpc("admin_exp_test_access", linkedRpc_admin_exp_test_access);
    initializer.registerRpc("admin_exp_test", linkedRpc_admin_exp_test);
    initializer.registerRpc("rename_player", linkedRpc_rename_player);
    initializer.registerRpc("account_password_status", linkedRpc_account_password_status);
    initializer.registerRpc("setup_account_password", linkedRpc_setup_account_password);
    initializer.registerRpc("google_link_status", linkedRpc_google_link_status);
    initializer.registerRpc("prepare_google_link", linkedRpc_prepare_google_link);
    initializer.registerRpc("confirm_google_link", linkedRpc_confirm_google_link);
    vipRuntimeMode = monetizationMode(ctx);

    // Phase 2: Seed RPC (call once from console/curl)
    initializer.registerRpc("seed_game_data", linkedRpc_seed_game_data);

    // Phase 2: Config query RPC
    initializer.registerRpc("get_game_config", linkedRpc_get_game_config);
    initializer.registerRpc("get_config_bootstrap", linkedRpc_get_config_bootstrap);
    initializer.registerRpc("publish_config_release", linkedRpc_publish_config_release);
    initializer.registerRpc("operator_config_release", operatorConfigRelease);

    // Phase 4: Player RPCs
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
    initializer.registerRpc("complete_feature_tour", linkedRpc_complete_feature_tour);
    initializer.registerRpc("award_stage_progression", linkedRpc_award_stage_progression);
    initializer.registerRpc("tribulation_action", linkedRpc_tribulation_action);
    initializer.registerRpc("get_than_luan_state", linkedRpc_get_than_luan_state);
    initializer.registerRpc("upgrade_than_luan", linkedRpc_upgrade_than_luan);
    initializer.registerRpc("get_trial_tower_status", linkedRpc_get_trial_tower_status);
    initializer.registerRpc("start_trial_tower", linkedRpc_start_trial_tower);
    initializer.registerRpc("prepare_trial_tower", linkedRpc_prepare_trial_tower);
    initializer.registerRpc("finish_trial_tower", linkedRpc_finish_trial_tower);
    initializer.registerRpc("get_monetization_status", linkedRpc_get_monetization_status);
    initializer.registerRpc("get_daily_pack_status", linkedRpc_get_daily_pack_status);
    initializer.registerRpc("claim_daily_pack", linkedRpc_claim_daily_pack);
    initializer.registerRpc("create_purchase_order", linkedRpc_create_purchase_order);
    initializer.registerRpc("sync_play_purchase", linkedRpc_sync_play_purchase);
    initializer.registerRpc("iap_google_claim", linkedRpc_iap_google_claim);
    initializer.registerRpc("prepare_rewarded_ad", linkedRpc_prepare_rewarded_ad);
    initializer.registerRpc("confirm_rewarded_ad", linkedRpc_confirm_rewarded_ad);
    initializer.registerRpc("consume_ad_gameplay_reward", linkedRpc_consume_ad_gameplay_reward);
    // These two callbacks are called by the verifier service, not game clients.
    initializer.registerRpc("admob_ssv_confirm", linkedRpc_admob_ssv_confirm);
    initializer.registerRpc("google_play_rtdn_confirm", linkedRpc_google_play_rtdn_confirm);

    // Phase 5: Leaderboards
    createWeeklyLeaderboardTables(nk);
    createServerWeeklyTables(nk);
    createMultiAccountLinkFunctions(nk);
    if(!ctx.env || ctx.env.MULTI_SERVER_ENABLED!=='true') {
        tickWeeklyLeaderboards(nk);
        createLeaderboards(nk, logger);
    }
    initializer.registerRpc("get_weekly_leaderboard_rewards", linkedRpc_get_weekly_leaderboard_rewards);
    initializer.registerRpc("claim_weekly_leaderboard_reward", linkedRpc_claim_weekly_leaderboard_reward);
    initializer.registerRpc("weekly_leaderboard_tick", linkedRpc_weekly_leaderboard_tick);
    initializer.registerRpc("sync_player_leaderboards", linkedRpc_sync_player_leaderboards);
    initializer.registerRpc("get_leaderboard_records", linkedRpc_get_leaderboard_records);
    initializer.registerRpc("sync_all_leaderboards", linkedRpc_sync_all_leaderboards);

    logger.info("Survival TD — Server modules initialized.");
}

function linkedRpc_get_sweep_options(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return accountGuardedRpc("get_sweep_options",(cc,ll,nn,pp)=>invokeWithVersionGate(cc,ll,nn,pp,getSweepOptions))(c,l,n,p);}

function linkedRpc_preview_sweep(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return accountGuardedRpc("preview_sweep",(cc,ll,nn,pp)=>invokeWithVersionGate(cc,ll,nn,pp,previewSweep))(c,l,n,p);}

function linkedRpc_start_sweep(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return accountGuardedRpc("start_sweep",(cc,ll,nn,pp)=>invokeWithVersionGate(cc,ll,nn,pp,startSweep))(c,l,n,p);}

function linkedRpc_get_sweep_status(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return accountGuardedRpc("get_sweep_status",(cc,ll,nn,pp)=>invokeWithVersionGate(cc,ll,nn,pp,getSweepStatus))(c,l,n,p);}

function linkedRpc_cancel_sweep(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return accountGuardedRpc("cancel_sweep",(cc,ll,nn,pp)=>invokeWithVersionGate(cc,ll,nn,pp,cancelSweep))(c,l,n,p);}

function linkedRpc_mail_summary(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string {return accountGuardedRpc("mail_summary",(cc,ll,nn,pp)=>invokeWithVersionGate(cc,ll,nn,pp,mailPlayerHandler("summary")))(c,l,n,p);}

function linkedRpc_mail_list(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string {return accountGuardedRpc("mail_list",(cc,ll,nn,pp)=>invokeWithVersionGate(cc,ll,nn,pp,mailPlayerHandler("list")))(c,l,n,p);}

function linkedRpc_mail_open(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string {return accountGuardedRpc("mail_open",(cc,ll,nn,pp)=>invokeWithVersionGate(cc,ll,nn,pp,mailPlayerHandler("open")))(c,l,n,p);}

function linkedRpc_mail_claim(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string {return accountGuardedRpc("mail_claim",(cc,ll,nn,pp)=>invokeWithVersionGate(cc,ll,nn,pp,mailPlayerHandler("claim")))(c,l,n,p);}

function linkedRpc_mail_claim_all(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string {return accountGuardedRpc("mail_claim_all",(cc,ll,nn,pp)=>invokeWithVersionGate(cc,ll,nn,pp,mailPlayerHandler("claim_all")))(c,l,n,p);}

function linkedRpc_mail_delete(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string {return accountGuardedRpc("mail_delete",(cc,ll,nn,pp)=>invokeWithVersionGate(cc,ll,nn,pp,mailPlayerHandler("delete")))(c,l,n,p);}

function linkedRpc_mail_delete_read(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string {return accountGuardedRpc("mail_delete_read",(cc,ll,nn,pp)=>invokeWithVersionGate(cc,ll,nn,pp,mailPlayerHandler("delete_read")))(c,l,n,p);}

function linkedRpc_mail_admin_send(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return accountGuardedRpc("mail_admin_send",rpcMailAdminSend)(c,l,n,p);}

function linkedRpc_mail_admin_campaign(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return accountGuardedRpc("mail_admin_campaign",rpcMailAdminCampaign)(c,l,n,p);}

function linkedRpc_finish_sweep(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return accountGuardedRpc("finish_sweep",(cc,ll,nn,pp)=>invokeWithVersionGate(cc,ll,mailCombatRuntime(nn,cc.userId),pp,finishSweep))(c,l,n,p);}

function linkedRpc_complete_feature_tour(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string {return accountGuardedRpc("complete_feature_tour",(cc,ll,nn,pp)=>invokeWithVersionGate(cc,ll,nn,pp,completeFeatureTour))(c,l,n,p);}

function linkedRpc_admin_exp_test_access(ctx:nkruntime.Context,logger:nkruntime.Logger,nk:nkruntime.Nakama,payload:string):string {
    return accountGuardedRpc("admin_exp_test_access",adminExpTestAccess)(ctx,logger,nk,payload);
}
function linkedRpc_admin_exp_test(ctx:nkruntime.Context,logger:nkruntime.Logger,nk:nkruntime.Nakama,payload:string):string {
    return accountGuardedRpc("admin_exp_test",(c,l,n,p)=>invokeWithVersionGate(c,l,n,p,adminExpTest))(ctx,logger,nk,payload);
}
