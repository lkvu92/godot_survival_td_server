const fs=require('fs'),crypto=require('crypto'),cp=require('child_process'),assert=require('assert'),path=require('path');
const env=Object.fromEntries(fs.readFileSync(path.join(__dirname,'../nakama/.env.local'),'utf8').split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).replace(/^['"]|['"]$/g,'')];}));
const custom='c247-fixture-'+crypto.randomUUID();let uid='',token='';
async function post(route,body,authorization){const r=await fetch('http://127.0.0.1:7350'+route,{method:'POST',headers:{Authorization:authorization,'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw Error('HTTP '+r.status);return r.json();}
async function rpc(body){const r=await post('/v2/rpc/compliance_access',JSON.stringify(body),'Bearer '+token);return JSON.parse(r.payload);}
(async()=>{
 const session=await post('/v2/account/authenticate/custom?create=true',{id:custom},'Basic '+Buffer.from(env.NAKAMA_SERVER_KEY+':').toString('base64'));token=session.token;uid=JSON.parse(Buffer.from(token.split('.')[1],'base64url')).uid;assert(/^[a-f0-9-]{36}$/.test(uid));
 const responses=[];
 let r=await rpc({action:'profile'});assert.deepEqual(r.profile,{});responses.push({phase:'empty-own-profile',response:r});
 const personal={action:'request',full_name:'Fixture player',birth_date:'1990-01-01',phone_number:'0900001111'};
 assert((await rpc(personal)).success);
 r=await rpc({action:'verify',otp:'12345'});assert.equal(r.profile.revision,1);assert.equal(r.profile.phone_mask,'******1111');assert.equal(r.profile.phone_number,'0900001111');responses.push({phase:'first-verified-mock',response:r});
 const updated={...personal,full_name:'Fixture updated',phone_number:'0910002222'};
 r=await rpc(updated);assert.equal(r.reason,'OTP_COOLDOWN');await new Promise(resolve=>setTimeout(resolve,Math.ceil((r.retry_at-r.server_time)*1000)+250));assert((await rpc(updated)).success);
 const wrong=await rpc({action:'verify',otp:'000000'});assert.equal(wrong.reason,'OTP_INVALID');
 r=await rpc({action:'profile',user_id:'not-the-owner'});assert.equal(r.profile.revision,1);assert.equal(r.profile.full_name,'Fixture player');assert.equal(r.profile.phone_number,'0900001111');responses.push({phase:'wrong-code-keeps-old-profile',response:r});
 r=await rpc({action:'verify',otp:'12345'});assert.equal(r.profile.revision,2);assert.equal(r.profile.phone_mask,'******2222');assert.equal(r.profile.phone_number,'0910002222');responses.push({phase:'updated-after-reverification',response:r});
 r=await rpc({...personal,birth_date:'2015-01-01'});assert.equal(r.reason,'DOB_REVIEW_REQUIRED');responses.push({phase:'dob-change-needs-review',response:r});
 const audit=cp.execFileSync('docker',['exec','survival_td_local-postgres-1','psql','-U','postgres','-d','nakama','-XAtq','-c',`SELECT json_build_object('audit_count',COUNT(*),'protected',BOOL_AND((to_jsonb(s)->>'read')::INT=0 AND (to_jsonb(s)->>'write')::INT=0),'revisions',json_agg((value->>'revision')::INT ORDER BY (value->>'revision')::INT)) FROM storage s WHERE user_id='${uid}'::uuid AND collection='compliance_activation' AND key LIKE 'audit:%'`],{encoding:'utf8'});
 const stats=JSON.parse(audit.trim());assert.equal(stats.audit_count,2);assert.equal(stats.protected,true);assert.deepEqual(stats.revisions,[1,2]);
 const redact=(k,v)=>k==='phone_number'?'[redacted]':v;const text=JSON.stringify(responses,redact);assert(!text.includes('0900001111')&&!text.includes('0910002222'));
 console.log(JSON.stringify({suite:'B3/C247 local HTTP and storage',generated_at:new Date().toISOString(),scope:'disposable custom account, mock OTP; not email/SMS/guardian proof',responses,audit:stats},redact,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>{if(uid){assert(/^[a-f0-9-]{36}$/.test(uid));cp.execFileSync('docker',['exec','survival_td_local-postgres-1','psql','-U','postgres','-d','nakama','-v','ON_ERROR_STOP=1','-c',`BEGIN;DELETE FROM account_link_state WHERE user_id='${uid}'::uuid AND EXISTS(SELECT 1 FROM users WHERE id='${uid}'::uuid AND custom_id='${custom}');DELETE FROM users WHERE id='${uid}'::uuid AND custom_id='${custom}';COMMIT;`],{encoding:'utf8'});}});
