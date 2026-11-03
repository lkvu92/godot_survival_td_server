import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile,mkdir,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createService} from '../src/server.js';
import {hash,newToken,unseal} from '../src/security.js';
import {archiveAccount,purgeGameplay} from '../src/archive.js';
import {policy} from './archive-policy.fixture.js';

test('C232 on real Nakama 3.24.2 / PostgreSQL: registration races, scanners, legacy proof and multi-server deletion',
 {skip:process.env.C232_INTEGRATION!=='true',timeout:120000},async t=>{
 const mails=[], env={...process.env,PGHOST:'127.0.0.1',PGPORT:'25433',PGDATABASE:'nakama',PGUSER:'postgres',PGPASSWORD:'c232-isolated-test-only',ACCOUNT_RETENTION_KEY:'c'.repeat(64),ACCOUNT_RETENTION_KEY_ID:policy.retention_key_id,
   ACCOUNT_IDENTITY_SECRET:'a'.repeat(64),ACCOUNT_IDENTITY_OUTBOX_KEY:'b'.repeat(64),NAKAMA_HTTP_KEY:'c232-test-http',NAKAMA_URL:'http://127.0.0.1:27350',
   SMTP_USER:'test@example.com',SMTP_PASSWORD:'test-app-password',SMTP_FROM:'test@example.com',ACCOUNT_IDENTITY_PUBLIC_URL:'https://identity.example',APP_ENVIRONMENT:'develop',PORT:'0',GOOGLE_WEB_CLIENT_IDS:'test-client'};
 const app=await createService(env,{transport:{async sendMail(mail){mails.push(mail);}},google:{async verifyIdToken({idToken}){if(idToken!=='test-proof')throw Error();return {getPayload:()=>({sub:'test-google-'+unique,iat:Math.floor(Date.now()/1000)})};}}});
 await app.start();t.after(()=>app.close());const url='http://127.0.0.1:'+app.server.address().port;
 const q=(sql,p=[])=>app.pool.query(sql,p);
 await q(await readFile(new URL('../archive-permissions.sql',import.meta.url),'utf8'));
 await q('DELETE FROM account_identity_rates');
 await q("UPDATE account_deletion_notices SET status='discarded',payload='' WHERE status='queued'");
 await q("UPDATE account_identity_outbox SET status='discarded',payload='' WHERE status='queued'");
 await q(`INSERT INTO remote_config_releases(config_version,snapshot,min_app_version,latest_app_version) VALUES(1,$1,'0.0.0','0.0.0') ON CONFLICT(config_version) DO UPDATE SET snapshot=EXCLUDED.snapshot`,[JSON.stringify({system:{account_deletion:policy,compliance_policy:{"schema_version":1,"revision":2,"game_id":"thong_thien_lo","guardian_below_age":16,"guardian_phone_max_accounts":3,"provider":"mock","otp_ttl_seconds":300,"otp_max_attempts":5,"otp_resend_seconds":60,"otp_rate_window_seconds":3600,"otp_rate_account_max":50,"otp_rate_phone_max":100,"otp_rate_ip_max":1000,"lease_seconds":45,"age_bands":[{"below_age":18,"per_game_seconds":3600,"total_seconds":10800}],"notice":"Theo quy định của pháp luật Việt Nam, đạo hữu cần xác thực số điện thoại di động để kích hoạt quyền tham gia trò chơi."}}})]);
 await q('UPDATE remote_config_releases SET snapshot=(SELECT snapshot FROM remote_config_releases WHERE config_version=1) WHERE config_version=(SELECT max(config_version) FROM remote_config_releases)');
 async function post(path,body,token){const r=await fetch(url+'/account'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});return {status:r.status,...await r.json()};}
 async function native(path,body,token,method='POST'){const r=await fetch(env.NAKAMA_URL+path,{method,headers:{'Content-Type':'application/json',Authorization:token?'Bearer '+token:'Basic '+Buffer.from('c232-test-key:').toString('base64')},body:JSON.stringify(body)});return {status:r.status,...await r.json()};}
 const decode=token=>JSON.parse(Buffer.from(token.split('.')[1],'base64url'));
 const unique=randomUUID().replaceAll('-','').slice(0,10),email='race'+unique+'@example.com';
 async function requestMail(address,purpose='register_email',token){
   await q("UPDATE account_identity_challenges SET created_at=NOW()-INTERVAL '61 seconds' WHERE email=$1",[address]);
   const before=mails.length;const result=await post(purpose==='register_email'?'/registration/request':'/action/request',purpose==='register_email'?{email:address}:{purpose},token);
   assert.equal(result.success,true,JSON.stringify(result));await app.tick();assert.equal(mails.length,before+1);
   const link=new URL(mails.at(-1).text.split('\n').find(s=>s.startsWith('https://')));return {link:link.href,token:new URLSearchParams(link.hash.slice(1)).get('token')};
 }
 const direct=await native('/v2/account/authenticate/email?create=true',{email,password:'password123'});assert.notEqual(direct.status,200);
 const a=await requestMail(email),b=await requestMail(email);
 assert.equal((await post('/link/status',{token:a.token,purpose:'register_email'})).success,true);
 assert.equal((await post('/link/status',{token:a.token,purpose:'delete_account'})).status,410);
 assert.equal((await q('SELECT count(*)::INT n FROM users WHERE email=$1',[email])).rows[0].n,0);
 const scanner=await fetch(url+'/account/confirm');assert.equal(scanner.status,200);
 assert.equal((await q('SELECT consumed_at FROM account_identity_challenges WHERE token_hash=$1',[hash(a.token)])).rows[0].consumed_at,null);
 const registration=await Promise.all([post('/registration/complete',{token:a.token,username:'racea'+unique,password:'first-password123'}),post('/registration/complete',{token:b.token,username:'raceb'+unique,password:'other-password123'})]);
 assert.equal(registration.filter(r=>r.success).length,1);
 assert.equal((await q('SELECT count(*)::INT n FROM users WHERE email=$1',[email])).rows[0].n,1);
 const winningPassword=registration[0].success?'first-password123':'other-password123';
 const login=await native('/v2/account/authenticate/email?create=false',{email,password:winningPassword});assert.equal(login.status,200);
 const user=decode(login.token).uid;
 assert.equal((await q('SELECT custom_id FROM users WHERE id=$1',[user])).rows[0].custom_id,null);
 assert.equal((await q('SELECT count(*)::INT n FROM account_identity_challenges WHERE email=$1 AND consumed_at IS NULL',[email])).rows[0].n,0);
 assert.ok(mails.every(m=>!m.text.includes(winningPassword)));
 assert.ok((await q('SELECT payload FROM account_identity_outbox')).rows.every(r=>r.payload===''));
 const replay=await post('/registration/complete',{token:a.token,username:'replay'+unique,password:'changed-password123'});assert.equal(replay.success,false);
 const used=await post('/link/status',{token:a.token,purpose:'register_email'});assert.equal(used.status,410);assert.equal(used.code,'LINK_EXPIRED');
 const existing=await post('/registration/request',{email});assert.equal(existing.status,409);assert.equal(existing.code,'ACCOUNT_EXISTS');

 const expiryEmail='expiry'+unique+'@example.com',old=await requestMail(expiryEmail);
 await q('UPDATE account_identity_challenges SET expires_at=NOW()-INTERVAL \'1 second\' WHERE token_hash=$1',[hash(old.token)]);
 assert.equal((await post('/link/status',{token:old.token,purpose:'register_email'})).status,410);
 assert.equal((await post('/registration/complete',{token:old.token,username:'exp'+unique,password:'password123'})).success,false);
 const renewed=await requestMail(expiryEmail);assert.notEqual(renewed.token,old.token);
 assert.equal((await post('/registration/complete',{token:renewed.token,username:'renew'+unique,password:'password123'})).success,true);
 const expiryUser=(await q('SELECT id FROM users WHERE email=$1',[expiryEmail])).rows[0].id;
 await q('DELETE FROM account_identity_verifications WHERE user_id=$1',[expiryUser]);
 const legacyLogin=await native('/v2/account/authenticate/email?create=false',{email:expiryEmail,password:'password123'});
 const stale=await requestMail(expiryEmail,'verify_legacy_email',legacyLogin.token);
 await native('/v2/account/authenticate/email?create=false',{email:expiryEmail,password:'password123'});
 assert.equal((await post('/link/status',{token:stale.token,purpose:'verify_legacy_email'})).status,410);
 assert.equal((await post('/action/complete',{token:stale.token,purpose:'verify_legacy_email',password:'password123'})).success,false,'another login invalidates old verification links');

 // Legacy fixture: a real password credential exists but verification row is absent.
 await q('DELETE FROM account_identity_verifications WHERE user_id=$1',[user]);
 const gated=await native('/v2/rpc/list_servers','{}',login.token);assert.equal(JSON.parse(gated.payload).reason,'EMAIL_VERIFICATION_REQUIRED');
 const legacy=await requestMail(email,'verify_legacy_email',login.token);
 assert.equal((await post('/action/complete',{token:legacy.token,purpose:'verify_legacy_email',password:'wrong-password123'})).success,false);
 assert.equal((await post('/action/complete',{token:legacy.token,purpose:'delete_account',password:winningPassword,confirmation:'XOA'})).success,false);
 assert.equal((await post('/action/complete',{token:legacy.token,purpose:'verify_legacy_email',password:winningPassword})).success,true);
 const status=await native('/v2/rpc/account_identity_status','{}',login.token);assert.equal(JSON.parse(status.payload).verified,true);
 const nativeDelete=await fetch(env.NAKAMA_URL+'/v2/account',{method:'DELETE',headers:{Authorization:'Bearer '+login.token}});assert.notEqual(nativeDelete.status,200);
 const linkEmail=await native('/v2/account/link/email',{email:'other'+unique+'@example.com',password:'new-password123'},login.token);assert.notEqual(linkEmail.status,200);

 for(const sid of ['first','second']) {
   await q("INSERT INTO game_servers(server_id,display_name,status) VALUES($1,$1,'open') ON CONFLICT DO NOTHING",[sid]);
   await q("INSERT INTO player_characters(account_id,server_id,generation,status) VALUES($1,$2,1,'ready')",[user,sid]);
   await q("INSERT INTO storage(collection,key,user_id,value,version,read,write) VALUES('player_profiles',$1,$2,'{}','test',0,0)",[sid+':g1:main',user]);
 }
 await q('INSERT INTO player_server_preferences(account_id,last_server_id) VALUES($1,\'first\')',[user]);
 const otherAccount=await native('/v2/account/authenticate/custom?create=true',{id:'peer-'+unique});assert.equal(otherAccount.status,200);const peer=decode(otherAccount.token).uid;
 await q("INSERT INTO storage(collection,key,user_id,value,version,read,write) VALUES('player_profiles','first:g1:main',$1,'{}','test',0,0)",[peer]);
 const aliasLogin=await native('/v2/account/authenticate/custom?create=true',{id:'alias-'+unique});const alias=decode(aliasLogin.token).uid;
 await q('UPDATE users SET custom_id=NULL,disable_time=NOW() WHERE id=$1',[alias]);
 await q("INSERT INTO account_link_state(user_id,status,merged_into) VALUES($1,'archived',$2)",[alias,user]);
 await q("INSERT INTO storage(collection,key,user_id,value,version,read,write) VALUES('player_profiles','old:g2:main',$1,'{}','test',0,0)",[alias]);
 const product='test-'+unique,order='order-'+unique,tokenHash=hash('receipt-'+unique);
 await q('INSERT INTO game_store_products(product_id,pack_id,display_name) VALUES($1,$1,$1)',[product]);
 await q("INSERT INTO monetization_purchase_orders(id,user_id,product_id,reward_snapshot,fulfillment_type,purchase_token_hash) VALUES($1,$2,$3,'[]','consumable',$4)",[order,user,product,tokenHash]);
 await q("INSERT INTO store_receipt_reservations(token_hash,order_id,user_id,target_server_id,target_generation) VALUES($1,$2,$3,'first',1)",[tokenHash,order,user]);
 await q("INSERT INTO monetization_purchases(request_id,user_id,platform,product_id,purchase_token_hash,status,purchase_order_id) VALUES($1,$2,'android',$3,$4,'verified',$1)",[order,user,product,tokenHash]);
 await q("INSERT INTO payment_financial_records(purchase_order_id,google_order_id,currency,original_amount,tax_amount) VALUES($1,$2,'VND',21000,1909.09)",[order,'GPA.fixture-'+unique]);
 await q("INSERT INTO payment_financial_snapshots(purchase_order_id,snapshot_hash,provider_event_at,provider_state,refunded_amount,snapshot) VALUES($1,$2,NOW(),'CHARGED',0,$3::jsonb)",[order,hash(order),JSON.stringify({currency:'VND',paid_amount:'21000',fixture:true})]);
 await q('INSERT INTO payment_financial_attempts(purchase_order_id,failures) VALUES($1,0)',[order]);
 await q("INSERT INTO leaderboard(id) VALUES('c232-fixture') ON CONFLICT DO NOTHING");
 await q("INSERT INTO leaderboard_record(leaderboard_id,owner_id,username,score,subscore,num_score,max_num_score,metadata,create_time,update_time,expiry_time) VALUES('c232-fixture',$1,'Private name',1,0,1,1,'{}',NOW(),NOW(),to_timestamp(0))",[user]);
 await q("INSERT INTO purchase(create_time,update_time,environment,product_id,purchase_time,raw_response,store,transaction_id,user_id,refund_time) VALUES(NOW(),NOW(),0,$1,NOW(),'{\"email\":\"fixture@example.com\"}',0,$2,$3,to_timestamp(0))",[product,'native-'+unique,user]);
 const plan=randomUUID();
 await q("INSERT INTO server_operation_plans(id,server_id,action,generation,revision,actor_id,reason,manifest,manifest_hash) VALUES($1,'first','reset',1,1,$2,'fixture',$3,'fixture-hash')",[plan,peer,JSON.stringify({storage:[{user_id:user,key:'first:g1:main',value:{private:true}}],characters:[],weekly_scores:[],weekly_awards:[]})]);
 const deletion=await requestMail(email,'delete_account',login.token);
 await q("INSERT INTO storage(collection,key,user_id,value,version,read,write) VALUES('compliance_activation','profile',$1,$2,'test',0,0)",[user,JSON.stringify({is_phone_verified:true,phone:'0900000001',phone_owner:'guardian',full_name:'Fixture',birth_date:'2015-01-01'})]);
 assert.equal((await post('/action/complete',{token:deletion.token,purpose:'delete_account',password:winningPassword,confirmation:''})).success,false);
 const accepted=await post('/action/complete',{token:deletion.token,purpose:'delete_account',password:winningPassword,confirmation:'XOA'});assert.equal(accepted.success,true);
 const acceptedState=await post('/deletion/status',{receipt:accepted.receipt});assert.equal(acceptedState.status,'soft_deleted');
 const softNativeWrite=await native('/v2/storage',{objects:[{collection:'client_fixture',key:'main',value:'{}',permission_read:1,permission_write:1}]},login.token,'PUT');assert.notEqual(softNativeWrite.status,200,'native storage blocked already during soft-delete, before native account disable');
 const deadline=(await post('/deletion/status',{receipt:accepted.receipt})).restore_until;
 assert.ok(new Date(deadline)>new Date(Date.now()+13*86400000));
 assert.equal((await post('/registration/request',{email})).code,'ACCOUNT_EXISTS','email remains reserved');
 await app.tick();assert.equal((await q('SELECT id FROM users WHERE id=$1',[user])).rowCount,1,'worker cannot delete early');
 assert.equal((await q("SELECT value->>'phone' AS phone FROM storage WHERE user_id=$1 AND collection='compliance_activation' AND key='profile'",[user])).rows[0].phone,'0900000001','phone and guardian reservation profile stays intact');
 await q("UPDATE account_identity_challenges SET created_at=NOW()-INTERVAL '61 seconds' WHERE email=$1",[email]);
 assert.equal((await post('/restoration/request',{email})).success,true);await app.tick();
 const restoreUrl=new URL(mails.at(-1).text.split('\n').find(line=>line.startsWith('https://')));
 const restoreToken=new URLSearchParams(restoreUrl.hash.slice(1)).get('token');
 assert.equal((await post('/action/complete',{token:restoreToken,purpose:'restore_account',password:'wrong-password123'})).success,false);
 const simultaneousRestore=await Promise.all([1,2].map(()=>post('/action/complete',{token:restoreToken,purpose:'restore_account',password:winningPassword})));
 assert.equal(simultaneousRestore.filter(r=>r.success).length,1,'concurrent recovery consumes proof exactly once');
 const restoredState=await post('/deletion/status',{receipt:accepted.receipt});assert.equal(restoredState.status,'cancelled');
 assert.equal((await post('/action/complete',{token:restoreToken,purpose:'restore_account',password:winningPassword})).success,false,'single use recovery');
 const restoredLogin=await native('/v2/account/authenticate/email?create=false',{email,password:winningPassword});
 await q('DELETE FROM account_identity_rates'); // Test fixture crosses the real 5 mails/hour quota.
 const newDeletion=await requestMail(email,'delete_account',restoredLogin.token);
 const secondAccepted=await post('/action/complete',{token:newDeletion.token,purpose:'delete_account',password:winningPassword,confirmation:'XOA'});
 assert.equal(secondAccepted.success,true);assert.notEqual(secondAccepted.receipt,accepted.receipt);
 accepted.receipt=secondAccepted.receipt;deletion.token=newDeletion.token;
 const manifest=(await q("SELECT server_lifecycle_manifest('first',1) AS value")).rows[0].value;
 assert.ok(manifest.storage.every(row=>row.user_id!==user),'new server manifests exclude pending erasures');
 const blocked=await native('/v2/rpc/account_identity_status','{}',restoredLogin.token);assert.ok(blocked.status!==200||JSON.parse(blocked.payload).success===false);
 const jobId=(await q("SELECT id FROM account_identity_deletions WHERE user_id=$1 AND status='soft_deleted'",[user])).rows[0].id;
 const statusOf=()=>post('/deletion/status',{receipt:accepted.receipt});
 const scanNow=()=>q("UPDATE account_archive_worker_state SET next_run_at=NOW() WHERE name='gameplay'");
 const switchPolicy=(key,value)=>q(`UPDATE remote_config_releases SET snapshot=jsonb_set(snapshot,ARRAY['system','account_deletion',$1],$2::jsonb) WHERE config_version=(SELECT max(config_version) FROM remote_config_releases)`,[key,JSON.stringify(value)]);
 await q('UPDATE account_link_state SET active_requests=1 WHERE user_id=$1',[user]);
 await q("UPDATE account_identity_deletions SET restore_until=NOW()-INTERVAL '1 second' WHERE id=$1",[jobId]);
 await app.tick();assert.equal((await statusOf()).status,'soft_deleted','active leases defer archive');assert.equal((await statusOf()).restore_eligible,false);
 await q('UPDATE account_link_state SET active_requests=0 WHERE user_id=$1',[user]);
 await q('UPDATE account_identity_deletions SET hold=true WHERE id=$1',[jobId]);await app.tick();assert.equal((await statusOf()).identity_released,false);
 await q('UPDATE account_identity_deletions SET hold=false WHERE id=$1',[jobId]);
 const key=env.ACCOUNT_RETENTION_KEY;env.ACCOUNT_RETENTION_KEY='';await app.tick();assert.equal((await statusOf()).identity_released,false);env.ACCOUNT_RETENTION_KEY=key;
 await switchPolicy('archive_transition_enabled',false);await app.tick();assert.equal((await statusOf()).identity_released,false);await switchPolicy('archive_transition_enabled',true);
 // Abort after all archive writes: none of credential detach/profile release may escape rollback.
 const db=await app.pool.connect();try{await db.query('BEGIN');assert.equal(await archiveAccount(db,jobId,key,policy.retention_key_id),true);await db.query('ROLLBACK');}finally{db.release();}
 assert.equal((await q('SELECT email FROM users WHERE id=$1',[user])).rows[0].email,email);
 assert.equal((await q('SELECT 1 FROM account_retention_archives WHERE deletion_id=$1',[jobId])).rowCount,0);
 await q(`CREATE OR REPLACE FUNCTION c232_fixture_fail_detach() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${user}'::uuid AND NEW.email IS NULL THEN RAISE EXCEPTION 'fixture detach failure'; END IF; RETURN NEW; END $$;
 DROP TRIGGER IF EXISTS c232_fixture_detach ON users; CREATE TRIGGER c232_fixture_detach BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION c232_fixture_fail_detach()`);
 await app.tick();assert.equal((await statusOf()).status,'archive_failed');assert.equal((await q('SELECT email FROM users WHERE id=$1',[user])).rows[0].email,email);
 assert.equal((await q('SELECT 1 FROM account_retention_archives WHERE deletion_id=$1',[jobId])).rowCount,0,'failed detach rolls archive and reservation release back');
 await q('DROP TRIGGER c232_fixture_detach ON users; DROP FUNCTION c232_fixture_fail_detach()');await q('UPDATE account_identity_deletions SET next_attempt_at=NOW() WHERE id=$1',[jobId]);
 await app.tick();const archived=await statusOf();assert.equal(archived.status,'archived');assert.equal(archived.identity_released,true);assert.equal(archived.restore_eligible,false);
 const tombstone=(await q('SELECT email,password,google_id,custom_id,display_name FROM users WHERE id=$1',[user])).rows[0];assert.ok(Object.values(tombstone).every(v=>v===null));
 assert.notEqual((await native('/v2/account/authenticate/email?create=false',{email,password:winningPassword})).status,200);
 assert.notEqual((await native('/v2/storage',{objects:[{collection:'client_fixture',key:'main',value:'{}',permission_read:1,permission_write:1}]},restoredLogin.token,'PUT')).status,200,'old signed token cannot recreate native storage');
 assert.notEqual((await native('/v2/storage',{object_ids:[{collection:'player_profiles',key:'first:g1:main',user_id:user}]},restoredLogin.token)).status,200,'archived gameplay is inaccessible through native API');
 assert.notEqual((await native('/v2/account',{display_name:'resurrected'},restoredLogin.token,'PUT')).status,200,'old token cannot update archived profile');
 assert.notEqual((await native('/v2/account/link/custom',{id:'resurrect-'+unique},restoredLogin.token)).status,200,'old token cannot attach new credentials');
 assert.equal((await q("SELECT 1 FROM storage WHERE user_id=$1 AND collection='compliance_activation'",[user])).rowCount,0,'phone no longer participates in uniqueness/quota');
 assert.equal((await q("SELECT 1 FROM storage WHERE user_id=$1 AND collection='player_profiles'",[user])).rowCount,2,'gameplay retained during archive');
 const archive=(await q('SELECT payload,retain_until,key_id FROM account_retention_archives WHERE deletion_id=$1',[jobId])).rows[0];assert.ok(!archive.payload.includes(email));
 const subjects=unseal(archive.payload,key).subjects;assert.equal(subjects.length,2);assert.equal(subjects.find(s=>s.id===user).activation_profile.phone,'0900000001');
 const calendar=(await q(`SELECT (('2024-01-31T16:00:00Z'::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')+INTERVAL '1 month') AT TIME ZONE 'Asia/Ho_Chi_Minh' AS leap`)).rows[0];assert.equal(calendar.leap.toISOString(),'2024-02-29T16:00:00.000Z');
 const expected=(await q("SELECT ((archived_at AT TIME ZONE 'Asia/Ho_Chi_Minh')+INTERVAL '3 months') AT TIME ZONE 'Asia/Ho_Chi_Minh' AS until FROM account_identity_deletions WHERE id=$1",[jobId])).rows[0].until;
 assert.equal(new Date(archived.gameplay_purge_at).getTime(),expected.getTime(),'three calendar months from exact archive commit instant');
 await scanNow();await app.tick();assert.equal((await statusOf()).status,'archived','no early gameplay cleanup');
 // Identity reuse happens at archive, while gameplay and financial ownership remain old user.
 const reused=await requestMail(email);assert.equal((await post('/registration/complete',{token:reused.token,username:'reused'+unique,password:'new-owner-password123'})).success,true);
 const reusedId=(await q('SELECT id FROM users WHERE email=$1',[email])).rows[0].id;assert.notEqual(reusedId,user);
 const reusedLogin=await native('/v2/account/authenticate/email?create=false',{email,password:'new-owner-password123'});assert.equal(reusedLogin.status,200);
 assert.equal((await native('/v2/storage',{objects:[{collection:'client_fixture',key:'main',value:'{}',permission_read:1,permission_write:1}]},reusedLogin.token,'PUT')).status,200,'native storage guard permits active new account');
 await q("DELETE FROM storage WHERE user_id=$1 AND collection='client_fixture'",[reusedId]);
 assert.equal((await post('/action/complete',{token:restoreToken,purpose:'restore_account',password:winningPassword})).success,false);
 await q("INSERT INTO storage(collection,key,user_id,value,version,read,write) VALUES('player_inventory','main',$1,$2,'test',0,0)",[reusedId,JSON.stringify({items:[]})]);
 await q("UPDATE account_identity_deletions SET gameplay_purge_at=NOW()-INTERVAL '1 second' WHERE id=$1",[jobId]);
 await switchPolicy('gameplay_purge_enabled',false);await scanNow();await app.tick();assert.equal((await statusOf()).status,'archived');await switchPolicy('gameplay_purge_enabled',true);
 const operate=extra=>JSON.parse(execFileSync(process.execPath,[fileURLToPath(new URL('../src/archive-operator.js',import.meta.url)),'--job='+jobId,'--confirm='+jobId,'--case=fixture-case',...extra],{env:{...env,USERNAME:'fixture-operator'},encoding:'utf8'}));
 const holdId=operate(['--action=hold','--scope=gameplay_purge']).hold_id;
 await scanNow();await app.tick();assert.equal((await statusOf()).status,'archived');assert.equal((await statusOf()).identity_released,true,'hold never re-reserves identity');
 assert.equal(operate(['--action=release','--hold='+holdId]).success,true);
 const purgeDb=await app.pool.connect();try{await purgeDb.query('BEGIN');assert.equal(await purgeGameplay(purgeDb,jobId),true);await purgeDb.query('ROLLBACK');}finally{purgeDb.release();}
 assert.equal((await q("SELECT 1 FROM storage WHERE user_id=$1 AND collection='player_profiles'",[user])).rowCount,2,'purge rollback restores entire checkpoint');
 await q(`CREATE OR REPLACE FUNCTION c232_fixture_fail_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.user_id='${user}'::uuid THEN RAISE EXCEPTION 'fixture cleanup failure'; END IF; RETURN OLD; END $$;
 DROP TRIGGER IF EXISTS c232_fixture_cleanup ON storage; CREATE TRIGGER c232_fixture_cleanup BEFORE DELETE ON storage FOR EACH ROW EXECUTE FUNCTION c232_fixture_fail_cleanup()`);
 await scanNow();await app.tick();assert.equal((await statusOf()).status,'archived');assert.equal((await q("SELECT 1 FROM storage WHERE user_id=$1 AND collection='player_profiles'",[user])).rowCount,2,'worker cleanup failure preserves checkpoint');
 await q('DROP TRIGGER c232_fixture_cleanup ON storage; DROP FUNCTION c232_fixture_fail_cleanup()');await q('UPDATE account_identity_deletions SET next_attempt_at=NOW() WHERE id=$1',[jobId]);
 await scanNow();await app.tick();const purged=await statusOf();assert.equal(purged.status,'gameplay_purged');
 for(const id of [user,alias]){assert.equal((await q('SELECT 1 FROM users WHERE id=$1',[id])).rowCount,1,'minimal user retained');assert.equal((await q('SELECT 1 FROM storage WHERE user_id=$1',[id])).rowCount,0);}
 assert.equal((await q('SELECT 1 FROM player_characters WHERE account_id=$1',[user])).rowCount,0);
 for(const id of [peer,reusedId])assert.equal((await q('SELECT 1 FROM storage WHERE user_id=$1',[id])).rowCount,1,'peer/new account untouched');
 assert.equal((await q('SELECT user_id FROM store_receipt_reservations WHERE token_hash=$1',[tokenHash])).rows[0].user_id,user);
 assert.equal((await q('SELECT user_id FROM monetization_purchases WHERE purchase_token_hash=$1',[tokenHash])).rows[0].user_id,user);
 const purchase=(await q('SELECT user_id,raw_response FROM purchase WHERE transaction_id=$1',['native-'+unique])).rows[0];assert.equal(purchase.user_id,user);assert.deepEqual(purchase.raw_response,{email:'fixture@example.com'});
 const financial=(await q('SELECT currency,original_amount,tax_amount FROM payment_financial_records WHERE purchase_order_id=$1',[order])).rows[0];assert.equal(financial.currency,'VND');assert.equal(Number(financial.original_amount),21000);assert.equal(Number(financial.tax_amount),1909.09);
 assert.deepEqual((await q('SELECT snapshot FROM payment_financial_snapshots WHERE purchase_order_id=$1',[order])).rows[0].snapshot,{currency:'VND',paid_amount:'21000',fixture:true});
 assert.equal((await q('SELECT failures FROM payment_financial_attempts WHERE purchase_order_id=$1',[order])).rows[0].failures,0);
 assert.deepEqual((await q('SELECT manifest FROM server_operation_plans WHERE id=$1',[plan])).rows[0].manifest.storage,[]);
 await scanNow();await app.tick();assert.equal((await q("SELECT 1 FROM account_archive_audit WHERE deletion_id=$1 AND action='gameplay_purged'",[jobId])).rowCount,1,'cleanup exactly once');
 const late=await fetch(env.NAKAMA_URL+'/v2/rpc/admob_ssv_confirm?http_key='+env.NAKAMA_HTTP_KEY,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(JSON.stringify({verifier_secret:'c232-test-verifier',user_id:user,ad_session_id:'late-'+unique,transaction_id:'late-tx-'+unique}))});assert.equal(JSON.parse((await late.json()).payload).success,false);
 // Actual OTP/mock HTTP flow: personal uniqueness and guardian sharing survive archive release.
 const phone='09'+String(Math.floor(Math.random()*100000000)).padStart(8,'0');
 async function phoneUser(){const r=await native('/v2/account/authenticate/custom?create=true',{id:'archive-phone-'+randomUUID()});return {uid:decode(r.token).uid,token:r.token};}
 async function activate(a,guardian){
  const request=await native('/v2/rpc/compliance_access',JSON.stringify({action:'request',full_name:'Fixture',birth_date:guardian?'2015-01-01':'1990-01-01',phone_number:phone,guardian_phone:phone,guardian_name:'Guardian Fixture',guardian_consent:true}),a.token);
  assert.equal(JSON.parse(request.payload).success,true,request.payload);
  const verify=await native('/v2/rpc/compliance_access',JSON.stringify({action:'verify',otp:'12345'}),a.token);return JSON.parse(verify.payload);
 }
 const parent=await phoneUser();assert.equal((await activate(parent,false)).allowed,true);
 const duplicate=await phoneUser();assert.equal((await activate(duplicate,false)).reason,'PHONE_ALREADY_USED');
 const children=[];for(let i=0;i<3;i++){const a=await phoneUser();assert.equal((await activate(a,true)).allowed,true);children.push(a);}
 const fourth=await phoneUser();assert.equal((await activate(fourth,true)).reason,'GUARDIAN_PHONE_LIMIT');
 const childJob=randomUUID();
 await q("UPDATE account_link_state SET status='deleting' WHERE user_id=$1",[children[0].uid]);
 await q(`INSERT INTO account_identity_deletions(id,user_id,receipt_hash,status,flow_version,soft_deleted_at,restore_until,policy_snapshot) VALUES($1,$2,$3,'soft_deleted',3,NOW()-INTERVAL '14 days',NOW()-INTERVAL '1 second',$4::jsonb)`,[childJob,children[0].uid,hash(newToken()),JSON.stringify(policy)]);
 const childDb=await app.pool.connect();try{await childDb.query('BEGIN');assert.equal(await archiveAccount(childDb,childJob,key,policy.retention_key_id),true);await childDb.query('COMMIT');}finally{childDb.release();}
 // Previous verify was denied ownership only; its unconsumed challenge remains usable.
 const fourthRetry=await native('/v2/rpc/compliance_access',JSON.stringify({action:'verify',otp:'12345'}),fourth.token);assert.equal(JSON.parse(fourthRetry.payload).allowed,true,'archived child releases exactly one guardian slot');
 assert.equal((await q("SELECT 1 FROM storage WHERE user_id=ANY($1::uuid[]) AND collection='compliance_activation' AND key='profile'",[[parent.uid,children[1].uid,children[2].uid]])).rowCount,3,'parent and siblings remain verified');
 const parentJob=randomUUID();await q("UPDATE account_link_state SET status='deleting' WHERE user_id=$1",[parent.uid]);
 await q(`INSERT INTO account_identity_deletions(id,user_id,receipt_hash,status,flow_version,soft_deleted_at,restore_until,policy_snapshot) VALUES($1,$2,$3,'soft_deleted',3,NOW()-INTERVAL '14 days',NOW()-INTERVAL '1 second',$4::jsonb)`,[parentJob,parent.uid,hash(newToken()),JSON.stringify(policy)]);
 const parentDb=await app.pool.connect();try{await parentDb.query('BEGIN');assert.equal(await archiveAccount(parentDb,parentJob,key,policy.retention_key_id),true);await parentDb.query('COMMIT');}finally{parentDb.release();}
 const personalRetry=await native('/v2/rpc/compliance_access',JSON.stringify({action:'verify',otp:'12345'}),duplicate.token);assert.equal(JSON.parse(personalRetry.payload).allowed,true,'personal phone becomes reusable on archive');
 const requestKey=newToken();await q('UPDATE users SET google_id=$2 WHERE id=$1',[peer,'wrong-'+unique]);assert.equal((await post('/deletion/google',{id_token:'test-proof',confirmation:'XOA',request_key:requestKey},otherAccount.token)).success,false);
 await q('UPDATE users SET google_id=$2 WHERE id=$1',[peer,'test-google-'+unique]);const googleDelete=await post('/deletion/google',{id_token:'test-proof',confirmation:'XOA',request_key:requestKey},otherAccount.token);assert.equal(googleDelete.success,true);
 assert.equal((await post('/restoration/google',{id_token:'test-proof'})).success,true);
 const legacyJob=randomUUID();await q('INSERT INTO account_identity_deletions(id,user_id,receipt_hash) VALUES($1,$2,$3)',[legacyJob,peer,hash(newToken())]);await app.tick();assert.equal((await q('SELECT status FROM account_identity_deletions WHERE id=$1',[legacyJob])).rows[0].status,'manual_review');
 if(process.env.C232_EVIDENCE==='true'){
  const dir=new URL('../../../../client/docs/standards/g2-registration/evidence/retention/B6/phase-v3/ARCH-03/',import.meta.url);await mkdir(dir,{recursive:true});
  const counts=(await q('SELECT (SELECT count(*) FROM users WHERE id=$1) AS minimal_users,(SELECT count(*) FROM storage WHERE user_id=$1) AS old_storage,(SELECT count(*) FROM monetization_purchases WHERE user_id=$2) AS preserved_transactions',[user,user])).rows[0];
  await writeFile(new URL('integration-results.json',dir),JSON.stringify({generated_at:new Date().toISOString(),environment:'isolated PostgreSQL16 / Nakama3.24.2, ports25433/27350',smtp:'mock',google_verifier:'mock; subject/freshness rules executed',policy,states:{accepted:acceptedState,restored:restoredState,archived,gameplay_purged:purged},counts,financial_fixture_preserved:financial,soft_deleted_native_write_http:softNativeWrite.status,archived_subjects:subjects.length,checks:['registration race/scanner/password proof','concurrent recovery single-use','14-day deadline and revoked generation','leases/hold/missing key/archive switch','rollback after archive writes retains identity','credentials and activation detached atomically','email reused before gameplay cleanup; new user ID','no restore over new owner','3 calendar months; leap-year arithmetic','no early cleanup','purge switch and scoped hold','rollback after cleanup restores checkpoint','minimal users and financial ownership retained','peer and new account untouched','duplicate cleanup exactly once','late reward callback denied','Google subject mismatch and fresh restore','legacy job manual_review','native storage/read/update/custom-link denied for old token; active account write allowed','archive detach failure and cleanup failure rollback/retry','host-only scoped hold/release CLI audited','real-paid fixture VND21000 and tax/snapshot retained','personal number release after parent archive','actual mock OTP personal uniqueness and three-child guardian limit','archiving one child releases exactly one slot without affecting parent/siblings']},null,2)+'\n');
 }
});
