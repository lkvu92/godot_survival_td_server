// Creates its own disposable local account. Never authenticates an existing player.
const fs=require('fs'),crypto=require('crypto'),assert=require('assert'),cp=require('child_process'),path=require('path');
const env=Object.fromEntries(fs.readFileSync(path.join(__dirname,'../nakama/.env.local'),'utf8').split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1).replace(/^['"]|['"]$/g,'')];}));
const origin='http://127.0.0.1:7350',custom='c243-fixture-'+crypto.randomUUID();
let token='',uid='',steps=[];
async function json(url,options){const r=await fetch(origin+url,options);const t=await r.text();if(!r.ok)throw Error('HTTP '+r.status);return t.trim()?JSON.parse(t):{};}
async function rpc(id,payload){const r=await json('/v2/rpc/'+id,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(JSON.stringify(payload))});return JSON.parse(r.payload);}
(async()=>{
 const session=await json('/v2/account/authenticate/custom?create=true',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(env.NAKAMA_SERVER_KEY+':').toString('base64'),'Content-Type':'application/json'},body:JSON.stringify({id:custom})});
 token=session.token;uid=JSON.parse(Buffer.from(token.split('.')[1],'base64url')).uid;
 assert(/^[a-f0-9-]{36}$/.test(uid));
 let r=await rpc('compliance_access',{action:'status'});assert.equal(r.reason,'PHONE_VERIFICATION_REQUIRED');steps.push({phase:'unverified',response:r});
 r=await rpc('start_stage',{});assert.equal(r.allowed,false);steps.push({phase:'direct-combat-denied',response:r});
 r=await rpc('compliance_access',{action:'request',full_name:'Fixture player',birth_date:'2015-01-01',guardian_name:'Fixture guardian',guardian_phone:'0900000000',guardian_consent:true});assert.equal(r.mock,true);steps.push({phase:'guardian-challenge',response:r});
 r=await rpc('compliance_access',{action:'verify',otp:'12345'});assert.equal(r.allowed,true);assert.equal(r.verification_method,'mock');steps.push({phase:'mock-activated',response:r});
 assert.equal(r.profile.phone_owner,'guardian');assert.equal(r.profile.birth_date,'2015-01-01');assert(r.age<16);assert.equal(r.remaining_seconds,3600);
 cp.execFileSync('docker',['exec','survival_td_local-postgres-1','psql','-U','postgres','-d','nakama','-v','ON_ERROR_STOP=1','-c',`UPDATE compliance_playtime SET seconds=700,lease_until=0 WHERE user_id='${uid}'::uuid`],{encoding:'utf8'});
 const updated={action:'request',full_name:'Fixture player',birth_date:'2015-01-01',guardian_name:'Fixture new guardian',guardian_phone:'0980009876',guardian_consent:true};
 r=await rpc('compliance_access',updated);assert.equal(r.reason,'OTP_COOLDOWN');await new Promise(resolve=>setTimeout(resolve,Math.ceil((r.retry_at-r.server_time)*1000)+250));r=await rpc('compliance_access',updated);assert(r.success);
 r=await rpc('compliance_access',{action:'profile'});assert.equal(r.profile.guardian_name,'Fixture guardian');steps.push({phase:'guardian-change-pending-keeps-old',response:r});
 r=await rpc('compliance_access',{action:'verify',otp:'000000'});assert.equal(r.reason,'OTP_INVALID');
 r=await rpc('compliance_access',{action:'verify',otp:'12345'});assert(r.allowed);assert.equal(r.profile.guardian_name,'Fixture new guardian');assert.equal(r.profile.phone_mask,'******9876');assert.equal(r.profile.revision,2);assert.equal(r.seconds,700);assert.equal(r.remaining_seconds,2900);steps.push({phase:'guardian-updated-with-budget-preserved',response:r});
 const metadata=cp.execFileSync('docker',['exec','survival_td_local-postgres-1','psql','-U','postgres','-d','nakama','-XAtq','-c',`SELECT json_build_object('phone_owner',value->>'phone_owner','guardian_consent',value->'guardian_consent','revision',value->'revision','protected',(to_jsonb(s)->>'read')::INT=0 AND (to_jsonb(s)->>'write')::INT=0,'audit_count',(SELECT COUNT(*) FROM storage WHERE user_id='${uid}'::uuid AND collection='compliance_activation' AND key LIKE 'audit:%')) FROM storage s WHERE user_id='${uid}'::uuid AND collection='compliance_activation' AND key='profile'`],{encoding:'utf8'});
 const guardian=JSON.parse(metadata.trim());assert.equal(guardian.phone_owner,'guardian');assert.equal(guardian.guardian_consent,true);assert.equal(guardian.protected,true);assert.equal(guardian.audit_count,2);steps.push({phase:'guardian-consent-storage',response:guardian});
 cp.execFileSync('docker',['exec','survival_td_local-postgres-1','psql','-U','postgres','-d','nakama','-v','ON_ERROR_STOP=1','-c',`UPDATE compliance_playtime SET seconds=3600,lease_until=0 WHERE user_id='${uid}'::uuid`],{encoding:'utf8'});
 r=await rpc('compliance_access',{action:'status'});assert.equal(r.allowed,false);assert.equal(r.reason,'PLAYTIME_LIMIT');steps.push({phase:'daily-limit-denied',response:r});
 console.log(JSON.stringify({suite:'C243/B5 local HTTP integration',generated_at:new Date().toISOString(),environment:'localhost disposable custom account; mock OTP, not email/SMS/real guardian proof; 700/3600-second budget injected only in own fixture',steps},null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(async()=>{
 if(uid){
  assert(/^[a-f0-9-]{36}$/.test(uid));
  cp.execFileSync('docker',['exec','survival_td_local-postgres-1','psql','-U','postgres','-d','nakama','-v','ON_ERROR_STOP=1','-c',`BEGIN; DELETE FROM account_link_state WHERE user_id='${uid}'::uuid AND EXISTS(SELECT 1 FROM users WHERE id='${uid}'::uuid AND custom_id='${custom}'); DELETE FROM users WHERE id='${uid}'::uuid AND custom_id='${custom}'; COMMIT;`],{encoding:'utf8'});
 }
});
