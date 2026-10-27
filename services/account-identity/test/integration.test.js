import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createService} from '../src/server.js';
import {hash,newToken} from '../src/security.js';

test('C232 on real Nakama 3.24.2 / PostgreSQL: registration races, scanners, legacy proof and multi-server deletion',
 {skip:process.env.C232_INTEGRATION!=='true',timeout:120000},async t=>{
 const mails=[], env={...process.env,PGHOST:'127.0.0.1',PGPORT:'25432',PGDATABASE:'nakama',PGUSER:'postgres',PGPASSWORD:'c232-isolated-test-only',
   ACCOUNT_IDENTITY_SECRET:'a'.repeat(64),ACCOUNT_IDENTITY_OUTBOX_KEY:'b'.repeat(64),NAKAMA_HTTP_KEY:'c232-test-http',NAKAMA_URL:'http://127.0.0.1:27350',
   SMTP_USER:'test@example.com',SMTP_PASSWORD:'test-app-password',SMTP_FROM:'test@example.com',ACCOUNT_IDENTITY_PUBLIC_URL:'https://identity.example',APP_ENVIRONMENT:'develop',PORT:'0',GOOGLE_WEB_CLIENT_IDS:'test-client'};
 const app=await createService(env,{transport:{async sendMail(mail){mails.push(mail);}},google:{async verifyIdToken({idToken}){if(idToken!=='test-proof')throw Error();return {getPayload:()=>({sub:'test-google-'+unique,iat:Math.floor(Date.now()/1000)})};}}});
 await app.start();t.after(()=>app.close());const url='http://127.0.0.1:'+app.server.address().port;
 const q=(sql,p=[])=>app.pool.query(sql,p);
 await q('DELETE FROM account_identity_rates');
 async function post(path,body,token){const r=await fetch(url+'/account'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});return {status:r.status,...await r.json()};}
 async function native(path,body,token){const r=await fetch(env.NAKAMA_URL+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:token?'Bearer '+token:'Basic '+Buffer.from('c232-test-key:').toString('base64')},body:JSON.stringify(body)});return {status:r.status,...await r.json()};}
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
 await q("INSERT INTO leaderboard(id) VALUES('c232-fixture') ON CONFLICT DO NOTHING");
 await q("INSERT INTO leaderboard_record(leaderboard_id,owner_id,username,score,subscore,num_score,max_num_score,metadata,create_time,update_time,expiry_time) VALUES('c232-fixture',$1,'Private name',1,0,1,1,'{}',NOW(),NOW(),to_timestamp(0))",[user]);
 await q("INSERT INTO purchase(create_time,update_time,environment,product_id,purchase_time,raw_response,store,transaction_id,user_id,refund_time) VALUES(NOW(),NOW(),0,$1,NOW(),'{\"email\":\"fixture@example.com\"}',0,$2,$3,to_timestamp(0))",[product,'native-'+unique,user]);
 const plan=randomUUID();
 await q("INSERT INTO server_operation_plans(id,server_id,action,generation,revision,actor_id,reason,manifest,manifest_hash) VALUES($1,'first','reset',1,1,$2,'fixture',$3,'fixture-hash')",[plan,peer,JSON.stringify({storage:[{user_id:user,key:'first:g1:main',value:{private:true}}],characters:[],weekly_scores:[],weekly_awards:[]})]);
 const deletion=await requestMail(email,'delete_account',login.token);
 assert.equal((await post('/action/complete',{token:deletion.token,purpose:'delete_account',password:winningPassword,confirmation:''})).success,false);
 const accepted=await post('/action/complete',{token:deletion.token,purpose:'delete_account',password:winningPassword,confirmation:'XOA'});assert.equal(accepted.success,true);
 assert.equal((await post('/deletion/status',{receipt:accepted.receipt})).status,'queued');
 const manifest=(await q("SELECT server_lifecycle_manifest('first',1) AS value")).rows[0].value;
 assert.ok(manifest.storage.every(row=>row.user_id!==user),'new server manifests exclude pending erasures');
 const blocked=await native('/v2/rpc/account_identity_status','{}',login.token);assert.notEqual(blocked.status,200);
 await q('UPDATE account_link_state SET active_requests=1 WHERE user_id=$1',[user]);
 await app.tick();assert.equal((await post('/deletion/status',{receipt:accepted.receipt})).status,'retrying');
 await q('UPDATE account_link_state SET active_requests=0 WHERE user_id=$1',[user]);
 await q("UPDATE account_identity_deletions SET updated_at=NOW()-INTERVAL '31 seconds' WHERE user_id=$1",[user]);
 await app.tick();const done=await post('/deletion/status',{receipt:accepted.receipt});assert.equal(done.status,'completed');
 for(const [table,column] of [['users','id'],['storage','user_id'],['player_characters','account_id'],['player_server_preferences','account_id']])assert.equal((await q(`SELECT count(*)::INT n FROM ${table} WHERE ${column}=$1`,[user])).rows[0].n,0,table);
 assert.equal((await q('SELECT count(*)::INT n FROM storage WHERE user_id=$1',[peer])).rows[0].n,1);
 assert.equal((await q('SELECT count(*)::INT n FROM users WHERE id=$1',[alias])).rows[0].n,0);
 assert.equal((await q('SELECT user_id FROM store_receipt_reservations WHERE token_hash=$1',[tokenHash])).rows[0].user_id,'00000000-0000-0000-0000-000000000000');
 assert.equal((await q('SELECT user_id FROM monetization_purchases WHERE purchase_token_hash=$1',[tokenHash])).rows[0].user_id,'00000000-0000-0000-0000-000000000000');
 assert.equal((await q('SELECT count(*)::INT n FROM leaderboard_record WHERE owner_id=$1',[user])).rows[0].n,0);
 const nativePurchase=(await q('SELECT user_id,raw_response FROM purchase WHERE transaction_id=$1',['native-'+unique])).rows[0];
 assert.equal(nativePurchase.user_id,'00000000-0000-0000-0000-000000000000');assert.deepEqual(nativePurchase.raw_response,{});
 assert.deepEqual((await q('SELECT manifest FROM server_operation_plans WHERE id=$1',[plan])).rows[0].manifest.storage,[],'old lifecycle snapshot redacted');
 const late=await fetch(env.NAKAMA_URL+'/v2/rpc/admob_ssv_confirm?http_key='+env.NAKAMA_HTTP_KEY,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(JSON.stringify({verifier_secret:'c232-test-verifier',user_id:user,ad_session_id:'late-'+unique,transaction_id:'late-tx-'+unique}))});
 const lateResult=JSON.parse((await late.json()).payload);assert.equal(lateResult.success,false);
 assert.equal((await q('SELECT count(*)::INT n FROM storage WHERE user_id=$1',[user])).rows[0].n,0,'late callback cannot recreate progress');
 const deleteReplay=await post('/action/complete',{token:deletion.token,purpose:'delete_account',password:winningPassword,confirmation:'XOA'});
 assert.equal(deleteReplay.receipt,accepted.receipt); // Safe retry recovers the same status receipt, never a second delete.

 // Provider subject mismatch is rejected; a fresh Google proof does not send email.
 await q('UPDATE users SET google_id=$2 WHERE id=$1',[peer,'wrong-'+unique]);
 const requestKey=newToken();
 assert.equal((await post('/deletion/google',{id_token:'test-proof',confirmation:'XOA',request_key:requestKey},otherAccount.token)).success,false);
 await q('UPDATE users SET google_id=$2 WHERE id=$1',[peer,'test-google-'+unique]);
 const mailCount=mails.length;
 const googleDelete=await post('/deletion/google',{id_token:'test-proof',confirmation:'XOA',request_key:requestKey},otherAccount.token);assert.equal(googleDelete.success,true);assert.equal(mails.length,mailCount);
 await app.tick();assert.equal((await post('/deletion/status',{receipt:googleDelete.receipt})).status,'completed');
});
