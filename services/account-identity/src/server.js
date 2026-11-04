import http from 'node:http';
import {archivedPlayerIdentity} from './player-export.js';
import {retentionKeys,tickArchiveExpiry} from './archive-operations.js';
import {requestRestoration} from './deletion.js';
import {archivePolicy as deletionPolicy,archiveAccount} from './archive.js';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHmac,timingSafeEqual} from 'node:crypto';
import pg from 'pg';
import {createSmtpTransport} from './smtp.js';
import {renderAccountMail} from './mail-template.js';
import {OAuth2Client} from 'google-auth-library';
import {hash,newToken,normalizeEmail,seal,unseal,validateConfig,googleEmailAuthority} from './security.js';

const GENERIC='Nếu địa chỉ hợp lệ và đủ điều kiện, thư xác nhận sẽ được gửi. Kiểm tra hộp thư/spam; bạn có thể thử lại sau 60 giây.';
const fail=(code,status=400)=>Object.assign(new Error(code),{status});
const validToken=t=>typeof t==='string'&&/^[A-Za-z0-9_-]{43}$/.test(t);
const passwordValid=p=>typeof p==='string'&&[...p].length>=8&&Buffer.byteLength(p)<=72;

export async function createService(env=process.env,overrides={}) {
 const publicURL=validateConfig(env), pool=overrides.pool||new pg.Pool({max:8,host:env.PGHOST,port:Number(env.PGPORT||5432),database:env.PGDATABASE,user:env.PGUSER,password:env.PGPASSWORD,connectionTimeoutMillis:5000,statement_timeout:30000,idle_in_transaction_session_timeout:45000});
 const nkURL=new URL(env.NAKAMA_URL||'http://nakama:7350');
 const google=overrides.google||new OAuth2Client();
 const transport=overrides.transport||createSmtpTransport(env);
 await pool.query(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));
 await pool.query(await readFile(new URL('../archive-v3.sql',import.meta.url),'utf8'));
 await pool.query(await readFile(new URL('../archive-operations.sql',import.meta.url),'utf8'));
 const keys=retentionKeys(env);
 const bridge=overrides.bridge||async function(action,payload={}) {
   const url=new URL('/v2/rpc/account_identity_bridge',nkURL);url.searchParams.set('http_key',env.NAKAMA_HTTP_KEY);
   const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(JSON.stringify({...payload,action,secret:env.ACCOUNT_IDENTITY_SECRET})),signal:AbortSignal.timeout(20000)});
   const data=await r.json();if(!r.ok)throw fail('BACKEND_UNAVAILABLE',503);
   const result=JSON.parse(data.payload||'{}');if(!result.success)throw fail(result.reason||'BACKEND_REJECTED',409);return result;
 };
 async function session(bearer) {
   if(!/^Bearer [A-Za-z0-9_.-]+$/.test(bearer||''))throw fail('AUTH_REQUIRED',401);
   const r=await fetch(new URL('/v2/rpc/account_identity_status',nkURL),{method:'POST',headers:{Authorization:bearer,'Content-Type':'application/json'},body:'"{}"',signal:AbortSignal.timeout(10000)});
   const data=await r.json();if(!r.ok)throw fail('AUTH_REQUIRED',401);
   const a=JSON.parse(data.payload||'{}');if(!a.success)throw fail('AUTH_REQUIRED',401);return a;
 }
 async function transaction(fn) {
   const db=await pool.connect();try{await db.query('BEGIN');const result=await fn(db);await db.query('COMMIT');return result;}
   catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }
 async function limited(db,bucket,max,seconds) {
   const {rows}=await db.query(`INSERT INTO account_identity_rates(bucket,count,expires_at) VALUES($1,1,NOW()+$2*INTERVAL '1 second')
     ON CONFLICT(bucket) DO UPDATE SET count=CASE WHEN account_identity_rates.expires_at<=NOW() THEN 1 ELSE account_identity_rates.count+1 END,
     expires_at=CASE WHEN account_identity_rates.expires_at<=NOW() THEN EXCLUDED.expires_at ELSE account_identity_rates.expires_at END RETURNING count`,[hash(bucket),seconds]);
   return rows[0].count<=max;
 }
 async function queue(email,purpose,account,ip) {
   return transaction(async db=>{
     // Serialize rate/quota decisions for this address, without reserving it for registration.
     await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,232))',[email]);
     if(purpose==='register_email') {
       const existing=await db.query('SELECT 1 FROM users WHERE email=$1',[email]);
       if(existing.rowCount)throw fail('ACCOUNT_EXISTS',409);
     }
     if(!await limited(db,'mail-address:'+email,5,3600)||!await limited(db,'mail-ip:'+ip,30,3600)||!await limited(db,'mail-global',500,3600))return;
     const recent=await db.query(`SELECT 1 FROM account_identity_challenges WHERE email=$1 AND created_at>NOW()-INTERVAL '60 seconds' LIMIT 1`,[email]);
     if(recent.rowCount)return;
     const pending=await db.query(`SELECT count(*)::INT AS n FROM account_identity_challenges WHERE email=$1 AND purpose=$2 AND consumed_at IS NULL AND expires_at>NOW()`,[email,purpose]);
     if(pending.rows[0].n>=5)return;
     const token=newToken(),id=randomUUID();
     const ttl=['delete_account','restore_account'].includes(purpose)?(await deletionPolicy(db)).reauth.email_link_ttl_seconds:900;
     await db.query(`INSERT INTO account_identity_challenges(id,token_hash,purpose,email,user_id,generation,expires_at)
       VALUES($1,$2,$3,$4,$5,$6,NOW()+$7*INTERVAL '1 second')`,[id,hash(token),purpose,email,account?.user_id||null,account?.generation||'',ttl]);
     await db.query('INSERT INTO account_identity_outbox(challenge_id,payload) VALUES($1,$2)',[id,seal({token,purpose,email},env.ACCOUNT_IDENTITY_OUTBOX_KEY)]);
   });
 }
 const deletionReceipt=key=>createHmac('sha256',env.ACCOUNT_IDENTITY_SECRET).update('C232-deletion:'+key).digest('base64url');
 async function claimDeletion(db,a,confirmationHash) {
   const policy=await deletionPolicy(db);
   const receipt=confirmationHash?deletionReceipt(confirmationHash):newToken(),id=randomUUID();
   const current=await db.query(`SELECT u.id,u.email,u.google_id,s.generation FROM users u JOIN player_login_sessions s ON s.user_id=u.id WHERE u.id=$1 FOR UPDATE OF u`,[a.user_id]);
   const row=current.rows[0];if(!row||row.generation!==a.generation||String(row.email||'')!==a.email||String(row.google_id||'')!==String(a.google_id||''))throw fail('IDENTITY_CHANGED',409);
   await db.query(`SELECT g.server_id FROM game_servers g WHERE EXISTS(SELECT 1 FROM player_characters c WHERE c.server_id=g.server_id
     AND (c.account_id=$1 OR c.account_id IN(SELECT user_id FROM account_link_state WHERE merged_into=$1 AND status='archived'))) ORDER BY g.server_id FOR UPDATE`,[a.user_id]);
   const operations=await db.query(`SELECT 1 FROM server_lifecycle_jobs j JOIN player_characters c ON c.server_id=j.server_id
     WHERE (c.account_id=$1 OR c.account_id IN(SELECT user_id FROM account_link_state WHERE merged_into=$1 AND status='archived')) AND j.status<>'succeeded' LIMIT 1`,[a.user_id]);
   if(operations.rowCount)throw fail('ACCOUNT_BUSY',409);
   const lock=await db.query(`INSERT INTO account_link_state(user_id,status,active_requests) VALUES($1,'deleting',0)
     ON CONFLICT(user_id) DO UPDATE SET status='deleting' WHERE account_link_state.status='active' RETURNING user_id`,[a.user_id]);
   if(!lock.rowCount)throw fail('ACCOUNT_BUSY',409);
   const accepted=await db.query(`INSERT INTO account_identity_deletions(id,user_id,receipt_hash,confirmation_hash,status,flow_version,soft_deleted_at,restore_until,policy_snapshot)
     VALUES($1,$2,$3,$4,'soft_deleted',3,NOW(),NOW()+$5*INTERVAL '1 day',$6::jsonb) RETURNING restore_until`,[id,a.user_id,hash(receipt),confirmationHash||null,policy.soft_delete_days,JSON.stringify(policy)]);
   await db.query('UPDATE player_login_sessions SET generation=$2 WHERE user_id=$1',[a.user_id,'deleting-'+id]);
   if(a.email)await db.query('INSERT INTO account_deletion_notices(deletion_id,payload) VALUES($1,$2)',[id,seal({email:a.email,receipt,restore_until:accepted.rows[0].restore_until},env.ACCOUNT_IDENTITY_OUTBOX_KEY)]);
   return {success:true,receipt,status:'soft_deleted',restore_until:accepted.rows[0].restore_until,message:'Đạo hữu đã xác nhận yêu cầu xóa. Tài khoản tạm ngừng hoạt động; có thể gửi yêu cầu phục hồi để admin duyệt trước hạn trên biên nhận. Email và số điện thoại vẫn được giữ chỗ trong thời gian này.'};

 }
 async function completeRegistration(body) {
   if(!validToken(body.token)||!passwordValid(body.password)||! /^[A-Za-z0-9_\-]{3,64}$/.test(body.username||''))throw fail('INVALID_REGISTRATION');
   // Session advisory lock spans the Nakama API call. Connections are not returned while locked.
   const db=await pool.connect();let locked=false,email;
   try{
     let result=await db.query(`SELECT * FROM account_identity_challenges WHERE token_hash=$1 AND purpose='register_email' AND consumed_at IS NULL AND expires_at>NOW()`,[hash(body.token)]);
     if(!result.rowCount)throw fail('LINK_EXPIRED');email=result.rows[0].email;
     await db.query('SELECT pg_advisory_lock(hashtextextended($1,232))',[email]);locked=true;
     result=await db.query(`SELECT * FROM account_identity_challenges WHERE token_hash=$1 AND purpose='register_email' AND consumed_at IS NULL AND expires_at>NOW()`,[hash(body.token)]);
     if(!result.rowCount)throw fail('LINK_EXPIRED');
     // All valid links for one email share a stable creation intent to reconcile API timeouts.
     const first=await db.query(`SELECT id FROM account_identity_challenges WHERE email=$1 AND purpose='register_email' ORDER BY created_at,id LIMIT 1`,[email]);
     await bridge('create',{intent:first.rows[0].id,email,username:body.username,password:body.password});
     await db.query(`UPDATE account_identity_challenges SET consumed_at=NOW() WHERE email=$1 AND purpose='register_email' AND consumed_at IS NULL`,[email]);
     await db.query(`UPDATE account_identity_outbox SET payload='',status='discarded' WHERE challenge_id IN(SELECT id FROM account_identity_challenges WHERE email=$1 AND purpose='register_email') AND status<>'sent'`,[email]);
     return {success:true,message:'Đã xác nhận email và tạo tài khoản. Quay lại game để đăng nhập bằng email và mật khẩu vừa đặt.'};
   }finally{if(locked)await db.query('SELECT pg_advisory_unlock(hashtextextended($1,232))',[email]);db.release();}
 }
 async function completePasswordReset(body) {
   if(!validToken(body.token)||!passwordValid(body.password))throw fail('INVALID_PROOF');
   const digest=hash(body.token);
   const initial=await pool.query("SELECT user_id,reset_completed_at FROM account_identity_challenges WHERE token_hash=$1 AND purpose='reset_password'",[digest]);
   if(!initial.rowCount)throw fail('LINK_EXPIRED',410);
   if(initial.rows[0].reset_completed_at)return {success:true,already_completed:true,message:'Liên kết này đã hoàn tất đổi mật khẩu trước đó. Hãy đăng nhập lại.'};
   const hashed=await bridge('hash_reset_password',{password:body.password});
   if(!/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hashed.password_hash||''))throw fail('BACKEND_UNAVAILABLE',503);
   const outcome=await transaction(async db=>{
     const gate=await db.query('SELECT state FROM account_archive_restore_gate WHERE singleton=TRUE FOR SHARE');
     if(gate.rows[0]?.state!=='ready')throw fail('ARCHIVE_RESTORE_BLOCKED',503);
     const user=await db.query(`SELECT u.id,u.email,COALESCE(octet_length(u.password),0)>0 AS has_password,
       COALESCE(EXTRACT(EPOCH FROM u.disable_time),0)=0 AS enabled,
       EXISTS(SELECT 1 FROM account_identity_verifications v WHERE v.user_id=u.id AND v.email=u.email) AS verified,
       account_identity_erasure_pending(u.id) AS deleting FROM users u WHERE u.id=$1 FOR UPDATE OF u`,[initial.rows[0].user_id]);
     const challenge=await db.query("SELECT * FROM account_identity_challenges WHERE token_hash=$1 AND purpose='reset_password' FOR UPDATE",[digest]);
     const c=challenge.rows[0],u=user.rows[0];
     if(c?.reset_completed_at)return {already_completed:true};
     if(!c||c.consumed_at||new Date(c.expires_at)<=new Date()||!u||!u.enabled||!u.has_password||!u.verified||u.deleting||u.email!==c.email)throw fail('LINK_EXPIRED',410);
     const valid=await db.query("SELECT 1 FROM account_identity_challenges WHERE id=$1 AND expires_at>clock_timestamp()",[c.id]);
     if(!valid.rowCount)throw fail('LINK_EXPIRED',410);
     await db.query("UPDATE users SET password=convert_to($2,'UTF8'),update_time=NOW() WHERE id=$1",[u.id,hashed.password_hash]);
     await db.query("INSERT INTO player_login_sessions(user_id,generation) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET generation=EXCLUDED.generation,updated_at=NOW()",[u.id,'password-reset-'+c.id]);
     await db.query("UPDATE account_identity_challenges SET consumed_at=NOW(),reset_completed_at=CASE WHEN id=$2 THEN NOW() ELSE reset_completed_at END WHERE user_id=$1 AND purpose='reset_password' AND consumed_at IS NULL",[u.id,c.id]);
     return {user_id:u.id};
   });
   if(outcome.user_id)try{await bridge('logout_reset_sessions',{user_id:outcome.user_id});}catch{console.warn('account-identity: password-reset session logout unavailable; generation guard remains active');}
   return {success:true,already_completed:!!outcome.already_completed,message:outcome.already_completed?'Liên kết này đã hoàn tất đổi mật khẩu trước đó. Hãy đăng nhập lại.':'Đã đổi mật khẩu. Hãy đăng nhập lại bằng mật khẩu mới.'};
 }
 async function completeAction(body) {
   if(!validToken(body.token)||!passwordValid(body.password))throw fail('INVALID_PROOF');
   if(body.purpose==='delete_account'&&body.confirmation==='XOA') {
     const accepted=await pool.query('SELECT id FROM account_identity_deletions WHERE confirmation_hash=$1',[hash(body.token)]);
     if(accepted.rowCount)return {success:true,receipt:deletionReceipt(hash(body.token)),message:'Yêu cầu xóa đã được tiếp nhận trước đó.'};
   }
   return transaction(async db=>{
     const {rows}=await db.query(`SELECT * FROM account_identity_challenges WHERE token_hash=$1 AND purpose IN('verify_legacy_email','delete_account','restore_account')
       AND consumed_at IS NULL AND expires_at>NOW() FOR UPDATE`,[hash(body.token)]);
     const c=rows[0];if(!c||body.purpose!==c.purpose)throw fail('LINK_EXPIRED');
     if(c.purpose==='delete_account'&&body.confirmation!=='XOA')throw fail('CONFIRMATION_REQUIRED');
     await bridge(c.purpose==='restore_account'?'restore_password_proof':'password_proof',{user_id:c.user_id,email:c.email,generation:c.generation,password:body.password});
     await db.query('UPDATE account_identity_challenges SET consumed_at=NOW() WHERE id=$1',[c.id]);
     if(c.purpose==='restore_account')return requestRestoration(db,c.user_id,c.generation);
     if(c.purpose==='verify_legacy_email') {
       // Row lock + fresh identity recheck after network proof prevents link/email race.
       const owner=await db.query(`SELECT u.id FROM users u JOIN player_login_sessions s ON s.user_id=u.id WHERE u.id=$1 AND u.email=$2 AND s.generation=$3 FOR UPDATE OF u`,[c.user_id,c.email,c.generation]);
       if(!owner.rowCount)throw fail('IDENTITY_CHANGED',409);
       await db.query(`INSERT INTO account_identity_verifications(user_id,email,source) VALUES($1,$2,'legacy_email_link')
         ON CONFLICT(user_id) DO UPDATE SET email=EXCLUDED.email,verified_at=NOW(),source=EXCLUDED.source`,[c.user_id,c.email]);
       return {success:true,message:'Đã xác nhận email. Quay lại game và đăng nhập lại để tiếp tục.'};
     }
     const {rows:accounts}=await db.query('SELECT google_id FROM users WHERE id=$1',[c.user_id]);
     return claimDeletion(db,{user_id:c.user_id,email:c.email,generation:c.generation,google_id:accounts[0]?.google_id||''},hash(body.token));
   });
 }
 let running=false;
 async function tick() {
   if(running)return;running=true;
   try{
     if((await pool.query('SELECT state FROM account_archive_restore_gate WHERE singleton=TRUE')).rows[0]?.state!=='ready')return;
     const notices=await pool.query(`UPDATE account_deletion_notices SET lease_until=NOW()+INTERVAL '90 seconds'
       WHERE deletion_id IN(SELECT deletion_id FROM account_deletion_notices WHERE status='queued' AND next_attempt_at<=NOW() AND (lease_until IS NULL OR lease_until<NOW()) LIMIT 3 FOR UPDATE SKIP LOCKED) RETURNING *`);
     for(const notice of notices.rows)try{
       const data=unseal(notice.payload,env.ACCOUNT_IDENTITY_OUTBOX_KEY);
       const state=await pool.query('SELECT status FROM account_identity_deletions WHERE id=$1',[notice.deletion_id]);
       const archivedNotice=data.event==='archived';
       if(!state.rows.length||(archivedNotice?!['archived','gameplay_purged','gameplay_review'].includes(state.rows[0].status):state.rows[0].status!=='soft_deleted'||new Date(data.restore_until)<=new Date())){await pool.query("UPDATE account_deletion_notices SET payload='',status='discarded' WHERE deletion_id=$1",[notice.deletion_id]);continue;}
       const url=new URL('/account/confirm',publicURL);url.hash=new URLSearchParams({receipt:data.receipt}).toString();
       const until=archivedNotice?'':new Date(data.restore_until).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});
       await transport.sendMail({from:{name:'Thông Thiên Lộ',address:env.SMTP_FROM},to:data.email,subject:archivedNotice?'Thông Thiên Lộ — Tài khoản đã được lưu trữ':'Thông Thiên Lộ — Đã tiếp nhận yêu cầu xóa',
         text:archivedNotice?'Tài khoản của đạo hữu đã được lưu trữ và không thể khôi phục. Email và số điện thoại đã được giải phóng. Dữ liệu trò chơi được giữ lại. Biên nhận: '+url.href:'Đạo hữu đã xác nhận yêu cầu xóa. Tài khoản tạm ngừng hoạt động. Hạn khôi phục: '+until+' (GMT+7). Email và số điện thoại tiếp tục được giữ chỗ trong thời gian chờ. Hết hạn sẽ không thể khôi phục. Khi hoàn tất lưu trữ, thông tin đăng ký được giải phóng; dữ liệu trò chơi được giữ lại. Xóa không tự hủy đăng ký hoặc hoàn tiền Google Play. Biên nhận: '+url.href+' . Để khôi phục bằng email và mật khẩu: '+new URL('/account/confirm#restore=1',publicURL).href});
       await pool.query("UPDATE account_deletion_notices SET payload='',status='sent',lease_until=NULL WHERE deletion_id=$1 AND payload=$2",[notice.deletion_id,notice.payload]);
     }catch{await pool.query("UPDATE account_deletion_notices SET next_attempt_at=NOW()+INTERVAL '60 seconds',lease_until=NULL WHERE deletion_id=$1 AND payload=$2",[notice.deletion_id,notice.payload]);}
     const {rows}=await pool.query(`UPDATE account_identity_outbox SET lease_until=NOW()+INTERVAL '90 seconds',attempts=attempts+1
       WHERE challenge_id IN(SELECT o.challenge_id FROM account_identity_outbox o WHERE status='queued' AND next_attempt_at<=NOW()
       AND (lease_until IS NULL OR lease_until<NOW()) ORDER BY next_attempt_at LIMIT 3 FOR UPDATE SKIP LOCKED) RETURNING *`);
     for(const mail of rows){
       const {rows:cs}=await pool.query('SELECT * FROM account_identity_challenges WHERE id=$1',[mail.challenge_id]);const c=cs[0];
       if(!c||c.consumed_at||new Date(c.expires_at)<=new Date()) {await pool.query("UPDATE account_identity_outbox SET payload='',status='discarded' WHERE challenge_id=$1",[mail.challenge_id]);continue;}
       try{
         const data=unseal(mail.payload,env.ACCOUNT_IDENTITY_OUTBOX_KEY);
         const url=new URL('/account/confirm',publicURL);url.hash=new URLSearchParams({token:data.token,purpose:data.purpose}).toString();
         const content=renderAccountMail({purpose:data.purpose,actionUrl:url.href,publicOrigin:publicURL.origin,expiresAt:c.expires_at,allowLocalHttp:env.APP_ENVIRONMENT==='develop'});
         await transport.sendMail({from:{name:'Thông Thiên Lộ',address:env.SMTP_FROM},to:data.email,replyTo:env.SMTP_REPLY_TO||'admin@lkvustudio.com',
           envelope:{from:env.SMTP_FROM,to:[data.email]},
           headers:{'Auto-Submitted':'auto-generated','X-Auto-Response-Suppress':'All'},
           ...content});
         await pool.query("UPDATE account_identity_outbox SET payload='',status='sent',lease_until=NULL WHERE challenge_id=$1",[mail.challenge_id]);
       }catch{
         await pool.query("UPDATE account_identity_outbox SET next_attempt_at=NOW()+INTERVAL '60 seconds',lease_until=NULL WHERE challenge_id=$1",[mail.challenge_id]);
         console.warn('account-identity: SMTP send failed; retry queued (credentials and recipient omitted)');
       }
     }
     // v1/v2 destructive jobs require explicit migration/review; never use old delete_tick.
     await pool.query("UPDATE account_identity_deletions SET status='manual_review',updated_at=NOW() WHERE flow_version<>3 AND (status IN('queued','processing','retrying','purge_pending') OR status='soft_deleted' AND restore_until<=NOW())");
     let p;try{p=await deletionPolicy(pool);}catch{p=null;}
     if(p){
       const due=await pool.query("SELECT id FROM account_identity_deletions WHERE flow_version=3 AND status IN('soft_deleted','archive_failed') AND restore_until<=NOW() AND next_attempt_at<=NOW() AND NOT hold AND NOT EXISTS(SELECT 1 FROM account_archive_holds h WHERE h.deletion_id=account_identity_deletions.id AND h.released_at IS NULL AND h.action IN('all','archive')) AND EXISTS(SELECT 1 FROM account_link_state a WHERE a.user_id=account_identity_deletions.user_id AND a.active_requests=0) ORDER BY restore_until LIMIT $1",[p.worker.batch_size]);
       for(const job of due.rows)try{
         await transaction(db=>archiveAccount(db,job.id,env.ACCOUNT_RETENTION_KEY!==env.ACCOUNT_IDENTITY_OUTBOX_KEY&&env.ACCOUNT_RETENTION_KEY!==env.ACCOUNT_IDENTITY_SECRET?env.ACCOUNT_RETENTION_KEY:'',env.ACCOUNT_RETENTION_KEY_ID,{key:env.ACCOUNT_IDENTITY_OUTBOX_KEY,secret:env.ACCOUNT_IDENTITY_SECRET},keys));
       }catch{
         await pool.query("UPDATE account_identity_deletions SET attempts=attempts+1,status=CASE WHEN attempts+1 >= $2 THEN 'manual_review' ELSE 'archive_failed' END,last_error_code='ARCHIVE_DEFERRED',next_attempt_at=NOW()+$3*INTERVAL '1 second',updated_at=NOW() WHERE id=$1 AND status IN('soft_deleted','archive_failed')",[job.id,p.worker.max_attempts,p.worker.retry_backoff_seconds]);
       }
       // C232 v3.4: archive never schedules automatic gameplay cleanup.

     }
     await tickArchiveExpiry(pool);
     // No passwords in pending data; expired delivery payloads redacted promptly.
     await pool.query(`UPDATE account_identity_outbox SET payload='',status='discarded' WHERE status='queued' AND challenge_id IN(SELECT id FROM account_identity_challenges WHERE expires_at<=NOW() OR consumed_at IS NOT NULL)`);
     await pool.query("DELETE FROM account_identity_rates WHERE expires_at<NOW()-INTERVAL '1 day'");
     await bridge('reconcile');
     await pool.query("DELETE FROM account_identity_challenges WHERE purpose='register_email' AND expires_at<NOW()-INTERVAL '1 day'");
     await pool.query("DELETE FROM account_identity_challenges WHERE purpose<>'register_email' AND expires_at<NOW()-INTERVAL '1 day'");
   }finally{running=false;}
 }
 const messages={INVALID_EMAIL:'Địa chỉ email không hợp lệ.',INVALID_REGISTRATION:'Tên đăng nhập cần 3–64 ký tự chữ/số/_/-. Mật khẩu cần ít nhất 8 ký tự, tối đa 72 byte.',
   ARCHIVE_RESTORE_BLOCKED:'Máy chủ đang đối soát dữ liệu khôi phục. Đạo hữu vui lòng thử lại sau.',
   DELETION_POLICY_UNAVAILABLE:'Chưa có chính sách xóa tài khoản hợp lệ. Đạo hữu vui lòng thử lại sau.',RESTORE_UNAVAILABLE:'Đạo hữu không còn yêu cầu xóa có thể khôi phục trong thời hạn.',
   LINK_EXPIRED:'Link đã hết hạn, đã dùng hoặc không còn hợp lệ. Hãy yêu cầu link mới.',ACCOUNT_EXISTS:'Địa chỉ này đã có tài khoản. Hãy quay lại đăng nhập; link đăng ký không thể đổi mật khẩu.',
   INVALID_PROOF:'Thông tin xác nhận chưa hợp lệ.',AUTH_REQUIRED:'Vui lòng đăng nhập lại.',IDENTITY_CHANGED:'Tài khoản hoặc phiên đăng nhập đã đổi. Hãy yêu cầu link mới.',
   CONFIRMATION_REQUIRED:'Nhập XOA để xác nhận bắt đầu thời gian chờ xóa.',ACCOUNT_BUSY:'Tài khoản đang có yêu cầu xử lý. Hãy thử lại hoặc liên hệ hỗ trợ.',
   BACKEND_UNAVAILABLE:'Chưa thể xác minh với máy chủ. Vui lòng thử lại.',BACKEND_REJECTED:'Không xác minh được tài khoản. Kiểm tra mật khẩu hoặc yêu cầu link mới.',
   USE_GOOGLE_OR_SUPPORT:'Hãy xác nhận Google hoặc liên hệ admin@lkvustudio.com để được hỗ trợ xác minh.',
   VERIFY_EMAIL_FIRST:'Vui lòng xác nhận email tài khoản trước.',RATE_LIMIT:'Bạn thao tác quá nhanh. Vui lòng đợi một phút rồi thử lại.',
   INVALID_GOOGLE_PROOF:'Hãy xác thực lại đúng tài khoản Google đã liên kết.',GOOGLE_NOT_CONFIGURED:'Máy chủ chưa cấu hình Google. Vui lòng liên hệ hỗ trợ.'};
 async function readBody(req) {
   let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>8192)throw fail('BODY_TOO_LARGE',413);}
   try{const body=JSON.parse(text||'{}');if(!body||typeof body!=='object'||Array.isArray(body))throw Error();return body;}catch{throw fail('INVALID_JSON');}
 }
 function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));}
 const staticFiles={'/account/confirm':['confirm.html','text/html; charset=utf-8'],'/account/confirm.js':['confirm.js','application/javascript'],'/account/style.css':['style.css','text/css']};
 const server=http.createServer(async(req,res)=>{
   res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
   res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
   const path=new URL(req.url,'http://internal').pathname;
   try{
     if(req.method==='GET'&&path==='/healthz'){await pool.query('SELECT 1');return json(res,200,{success:true});}
     if(req.method==='GET'&&staticFiles[path]){const [file,type]=staticFiles[path];res.setHeader('Content-Type',type);return res.end(await readFile(new URL('../public/'+file,import.meta.url)));}
     if(req.method==='GET'&&['/account/privacy-policy/','/account/privacy-policy/index.html','/account/delete-account/','/account/delete-account/index.html'].includes(path)) {
       const file=path.includes('privacy-policy')?'privacy-policy/index.html':'delete-account/index.html';
       res.setHeader('Content-Type','text/html; charset=utf-8');res.removeHeader('Content-Security-Policy');return res.end(await readFile(new URL('../documents/'+file,import.meta.url)));
     }
     if(req.method!=='POST')throw fail('NOT_FOUND',404);
     if(!['/account/deletion/status','/account/link/status'].includes(path)&&(await pool.query('SELECT state FROM account_archive_restore_gate WHERE singleton=TRUE')).rows[0]?.state!=='ready')throw fail('ARCHIVE_RESTORE_BLOCKED',503);
     if(req.headers.origin&&req.headers.origin!==publicURL.origin)throw fail('FORBIDDEN',403);
     if(!String(req.headers['content-type']||'').startsWith('application/json'))throw fail('JSON_REQUIRED',415);
     const ip=req.socket.remoteAddress||'unknown';
     const internalPath=path.startsWith('/account/internal/');
     if(internalPath){
       const supplied=Buffer.from(String(req.headers.authorization||'')),expected=Buffer.from('Bearer '+env.ACCOUNT_IDENTITY_SECRET);
       if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))throw fail('FORBIDDEN',403);
     }else{
       const allowed=await transaction(db=>limited(db,'request-ip:'+ip,120,60));if(!allowed)throw fail('RATE_LIMIT',429);
     }
     const body=await readBody(req);let result;
     if(path==='/account/internal/player-export')return json(res,200,{success:true,...await archivedPlayerIdentity(pool,body.user_id,keys)});
     if(['/account/internal/google-email-proof','/account/internal/google-proof'].includes(path)) {
       const supplied=Buffer.from(String(req.headers.authorization||'')),expected=Buffer.from('Bearer '+env.ACCOUNT_IDENTITY_SECRET);
       if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))throw fail('FORBIDDEN',403);
       const audience=String(env.GOOGLE_WEB_CLIENT_IDS||'').split(',').map(s=>s.trim()).filter(Boolean);if(!audience.length)throw fail('GOOGLE_NOT_CONFIGURED',503);
       const ticket=await google.verifyIdToken({idToken:body.id_token,audience}),claims=ticket.getPayload();
       if(path==='/account/internal/google-proof') {
         const reserved=await pool.query(`SELECT 1 FROM users u JOIN account_identity_deletions d ON d.user_id=u.id WHERE (u.google_id=$1 OR (LOWER(u.email)=LOWER($2) AND $2<>'')) AND d.status<>'cancelled'`,[claims.sub,googleEmailAuthority(claims)?claims.email:'']);
         if(reserved.rowCount)throw fail('RESTORE_UNAVAILABLE',409);
       }
       if(path==='/account/internal/google-proof')return json(res,200,{success:true,authoritative_email:googleEmailAuthority(claims)?claims.email:''});
       const {rows}=await pool.query('SELECT email,google_id FROM users WHERE id=$1',[body.user_id]);
       if(!rows.length||rows[0].google_id!==claims.sub||rows[0].email!==claims.email||!googleEmailAuthority(claims))throw fail('VERIFY_EMAIL_FIRST',403);
       result={success:true,email:claims.email};
     }else if(path==='/account/link/status') {
       if(!validToken(body.token)||!['register_email','verify_legacy_email','delete_account','restore_account','reset_password'].includes(body.purpose))throw fail('LINK_EXPIRED',410);
       if(body.purpose==='reset_password'){
         const valid=await pool.query(`SELECT c.id FROM account_identity_challenges c JOIN users u ON u.id=c.user_id AND u.email=c.email
           JOIN account_identity_verifications v ON v.user_id=u.id AND v.email=u.email
           WHERE c.token_hash=$1 AND c.purpose='reset_password' AND c.consumed_at IS NULL AND c.expires_at>NOW()
           AND octet_length(u.password)>0 AND COALESCE(EXTRACT(EPOCH FROM u.disable_time),0)=0 AND NOT account_identity_erasure_pending(u.id)`,[hash(body.token)]);
         if(!valid.rowCount)throw fail('LINK_EXPIRED',410);
         return json(res,200,{success:true});
       }
       const {rows}=await pool.query(`SELECT c.id FROM account_identity_challenges c
         WHERE c.token_hash=$1 AND c.purpose=$2 AND c.consumed_at IS NULL AND c.expires_at>NOW()
         AND (c.purpose='register_email' AND NOT EXISTS(SELECT 1 FROM users u WHERE u.email=c.email)
           OR c.purpose<>'register_email' AND EXISTS(SELECT 1 FROM users u JOIN player_login_sessions s ON s.user_id=u.id
             WHERE u.id=c.user_id AND u.email=c.email AND s.generation=c.generation)
             AND (c.purpose<>'restore_account' OR EXISTS(SELECT 1 FROM account_identity_deletions d WHERE d.user_id=c.user_id AND d.status='soft_deleted' AND d.flow_version IN(2,3) AND d.restore_until>NOW())))`,[hash(body.token),body.purpose]);
       if(!rows.length)throw fail('LINK_EXPIRED',410);
       if(body.purpose==='delete_account'){const p=await deletionPolicy(pool);result={success:true,deletion_policy:{soft_delete_days:p.soft_delete_days,notice_template_revision:p.notice_template_revision}};}else result={success:true};
     }else if(path==='/account/password-reset/request') {
       const email=normalizeEmail(body.email);
       const {rows}=await pool.query(`SELECT u.id AS user_id,u.email,COALESCE(s.generation,'') AS generation FROM users u
         JOIN account_identity_verifications v ON v.user_id=u.id AND v.email=u.email
         LEFT JOIN player_login_sessions s ON s.user_id=u.id
         WHERE u.email=$1 AND octet_length(u.password)>0 AND COALESCE(EXTRACT(EPOCH FROM u.disable_time),0)=0
         AND NOT account_identity_erasure_pending(u.id)`,[email]);
       if(rows.length)await queue(email,'reset_password',rows[0],ip);
       result={success:true,message:GENERIC};
     }else if(path==='/account/password-reset/complete') {
       result=await completePasswordReset(body);
     }else if(path==='/account/restoration/request') {
       const email=normalizeEmail(body.email);
       const {rows}=await pool.query(`SELECT u.id AS user_id,u.email,s.generation FROM users u JOIN player_login_sessions s ON s.user_id=u.id
         JOIN account_identity_deletions d ON d.user_id=u.id WHERE u.email=$1 AND octet_length(u.password)>0 AND d.flow_version IN(2,3) AND d.status='soft_deleted' AND d.restore_until>NOW()`,[email]);
       if(rows.length)await queue(email,'restore_account',rows[0],ip);
       result={success:true,message:GENERIC};
     }else if(path==='/account/restoration/google') {
       const audience=String(env.GOOGLE_WEB_CLIENT_IDS||'').split(',').map(s=>s.trim()).filter(Boolean);if(!audience.length)throw fail('GOOGLE_NOT_CONFIGURED',503);
       const ticket=await google.verifyIdToken({idToken:body.id_token,audience}),claims=ticket.getPayload();
       if(!claims.sub||!claims.iat||claims.iat<Date.now()/1000-(await deletionPolicy(pool)).reauth.google_max_age_seconds||claims.iat>Date.now()/1000+30)throw fail('INVALID_GOOGLE_PROOF',403);
       const {rows}=await pool.query('SELECT u.id,s.generation FROM users u JOIN player_login_sessions s ON s.user_id=u.id WHERE u.google_id=$1',[claims.sub]);
       if(!rows.length)throw fail('RESTORE_UNAVAILABLE',409);
       result=await transaction(db=>requestRestoration(db,rows[0].id,rows[0].generation));
     }else if(path==='/account/registration/request') {
       await queue(normalizeEmail(body.email),'register_email',null,ip);result={success:true,message:GENERIC};
     }else if(path==='/account/registration/complete')result=await completeRegistration(body);
     else if(path==='/account/action/request') {
       const a=await session(req.headers.authorization),purpose=body.purpose;
       if(!['verify_legacy_email','delete_account'].includes(purpose)||!a.email||!a.has_password)throw fail('USE_GOOGLE_OR_SUPPORT',409);
       if(purpose==='delete_account'&&!a.verified)throw fail('VERIFY_EMAIL_FIRST',403);
       await queue(a.email,purpose,a,ip);result={success:true,message:GENERIC};
     }else if(path==='/account/action/complete')result=await completeAction(body);
     else if(path==='/account/deletion/google') {
       if(!validToken(body.request_key))throw fail('INVALID_PROOF');
       const existing=await pool.query('SELECT id FROM account_identity_deletions WHERE confirmation_hash=$1',[hash(body.request_key)]);
       if(existing.rowCount)return json(res,200,{success:true,receipt:deletionReceipt(hash(body.request_key)),message:'Yêu cầu xóa đã được tiếp nhận trước đó.'});
       const a=await session(req.headers.authorization);
       if(body.confirmation!=='XOA'||!a.google_linked||!body.id_token)throw fail('INVALID_PROOF');
       const audiences=String(env.GOOGLE_WEB_CLIENT_IDS||'').split(',').map(s=>s.trim()).filter(Boolean);if(!audiences.length)throw fail('GOOGLE_NOT_CONFIGURED',503);
       const ticket=await google.verifyIdToken({idToken:body.id_token,audience:audiences});const claims=ticket.getPayload();
       if(claims.sub!==a.google_id||!claims.iat||claims.iat<Date.now()/1000-(await deletionPolicy(pool)).reauth.google_max_age_seconds||claims.iat>Date.now()/1000+30)throw fail('INVALID_GOOGLE_PROOF',403);
       result=await transaction(db=>claimDeletion(db,a,hash(body.request_key)));
     }else if(path==='/account/deletion/status') {
       if(!validToken(body.receipt))throw fail('NOT_FOUND',404);
       const {rows}=await pool.query("SELECT status,CASE WHEN status='soft_deleted' AND restore_until<=NOW() THEN 'archive_pending' ELSE status END AS lifecycle_state,restore_until,archived_at,NULL::timestamptz AS gameplay_purge_at,gameplay_purged_at,identity_released_at IS NOT NULL AS identity_released,(SELECT CASE WHEN r.status='pending' AND account_identity_deletions.restore_until<=NOW() THEN 'expired' ELSE r.status END FROM account_restoration_requests r WHERE r.deletion_id=account_identity_deletions.id ORDER BY r.created_at DESC LIMIT 1) AS restoration_status,(status='soft_deleted' AND flow_version IN(2,3) AND restore_until>NOW()) AS restore_eligible FROM account_identity_deletions WHERE receipt_hash=$1",[hash(body.receipt)]);if(!rows.length)throw fail('NOT_FOUND',404);
       result={success:true,...rows[0]};
     }else throw fail('NOT_FOUND',404);
     json(res,200,result);
   }catch(error){json(res,error.status||400,{success:false,code:messages[error.message]?error.message:'REQUEST_FAILED',message:messages[error.message]||'Yêu cầu chưa hoàn tất. Thử lại hoặc liên hệ admin@lkvustudio.com.'});}
 });
 server.requestTimeout=15000;server.headersTimeout=10000;
 let timer;
 return {server,pool,tick,async start(){timer=setInterval(()=>tick().catch(()=>console.warn('account-identity: worker unavailable')),5000);await new Promise(resolve=>server.listen(Number(env.PORT||8080),'0.0.0.0',resolve));},async close(){clearInterval(timer);await new Promise(resolve=>server.close(resolve));await pool.end();}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
 try{const app=await createService();await app.start();for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>app.close().finally(()=>process.exit(0)));}
 catch(error){console.error('account-identity startup failed:',error.message.startsWith('Missing/invalid')?error.message:'configuration/database unavailable');process.exitCode=1;}
}
