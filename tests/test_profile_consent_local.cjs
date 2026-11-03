// No SMS/email; dedicated device on isolated c232-test only.
const assert=require('assert'),fs=require('fs'),path=require('path'),{execFileSync}=require('child_process'),crypto=require('crypto');
const meta=JSON.parse(execFileSync('docker',['inspect','c232-test-nakama-1'],{encoding:'utf8'}))[0];assert.equal(meta.Config.Labels['com.docker.compose.project'],'c232-test');
const base='http://127.0.0.1:27350',id='c251-consent-'+crypto.randomUUID();
async function main(){
 let r;for(let i=0;i<15;i++){try{r=await fetch(base+'/healthcheck');if(r.ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,400));}
 r=await fetch(base+'/v2/account/authenticate/device?create=true',{method:'POST',headers:{Authorization:'Basic '+Buffer.from('c232-test-key:').toString('base64'),'Content-Type':'application/json'},body:JSON.stringify({id})});assert(r.ok,'fixture auth '+r.status);const session=await r.json();const headers={Authorization:'Bearer '+session.token,'Content-Type':'application/json'};
 const call=async data=>{const response=await fetch(base+'/v2/rpc/compliance_access',{method:'POST',headers,body:JSON.stringify(JSON.stringify(data))});assert(response.ok,'rpc HTTP '+response.status);return JSON.parse((await response.json()).payload);};
 const view=await call({action:'profile'});assert(view.privacy?.notice_hash);assert.equal(view.privacy.notice_hash.length,64);
 const choices=Object.fromEntries(view.privacy.policy.purposes.map(x=>[x.id,false]));
 const requested=await call({action:'request',full_name:'C251 fixture',birth_date:'1990-01-01',phone_number:'09'+String(crypto.randomInt(0,100000000)).padStart(8,'0'),kyc_confirmation:true,privacy:{notice_hash:view.privacy.notice_hash,expected_revision:0,choices}});assert(requested.success,JSON.stringify(requested));assert(!((await call({action:'profile'})).profile.consent?.revision));
 const wrong=await call({action:'verify',otp:'00000'});assert.equal(wrong.reason,'OTP_INVALID');
 const result=await call({action:'verify',otp:'12345'});assert(result.success,JSON.stringify(result));assert.equal(result.profile.consent.revision,1);assert.equal(result.profile.consent.choices.game_marketing_email,false);
 const native=await fetch(base+'/v2/storage',{method:'PUT',headers,body:JSON.stringify({objects:[{collection:'privacy_consent',key:'forged',value:'{}',permission_read:1,permission_write:1}]})});assert(!native.ok,'native write must be rejected');
 const withdrawn=await call({action:'privacy_withdraw',expected_revision:1});assert(withdrawn.success);assert.equal(withdrawn.privacy.state.revision,2);assert.equal((await call({action:'profile'})).profile.consent.revision,2);
 const stale=await call({action:'privacy_withdraw',expected_revision:1});assert(!stale.success);
 const r2=await fetch(base+'/v2/account/authenticate/device?create=true',{method:'POST',headers:{Authorization:'Basic '+Buffer.from('c232-test-key:').toString('base64'),'Content-Type':'application/json'},body:JSON.stringify({id:id+'-grant'})});assert(r2.ok);const s2=await r2.json();
 const call2=async data=>{const response=await fetch(base+'/v2/rpc/compliance_access',{method:'POST',headers:{Authorization:'Bearer '+s2.token,'Content-Type':'application/json'},body:JSON.stringify(JSON.stringify(data))});assert(response.ok);return JSON.parse((await response.json()).payload);};
 const v2=await call2({action:'profile'}),selected={...choices,game_marketing_email:true};
 assert((await call2({action:'request',full_name:'C251 second fixture',birth_date:'1990-01-01',phone_number:'09'+String(crypto.randomInt(0,100000000)).padStart(8,'0'),kyc_confirmation:true,privacy:{notice_hash:v2.privacy.notice_hash,expected_revision:0,choices:selected}})).success);
 assert((await call2({action:'verify',otp:'12345'})).profile.consent.choices.game_marketing_email);
 assert((await call2({action:'privacy_withdraw',expected_revision:1,choices})).success);
 assert(!(await call2({action:'privacy_withdraw',expected_revision:2,choices:selected})).success,'withdraw RPC must not grant');
 const out=path.resolve(__dirname,'../../client/docs/standards/g2-registration/evidence/consent/D5/MIN-03');fs.mkdirSync(out,{recursive:true});
 const report={generated_at:new Date().toISOString(),environment:'real isolated Nakama 3.24.2 / PostgreSQL16, mock OTP, no SMS/email',kyc_without_optional_choices:true,otp_wrong_no_grant:true,receipt_revision:result.profile.consent.revision,withdraw_without_otp:true,individual_withdrawal:true,withdraw_cannot_grant:true,withdraw_revision:withdrawn.privacy.state.revision,stale_cas_rejected:true,native_storage_write_rejected:true,processing_enabled:false,provider_live:'NOT_TESTED'};
 fs.writeFileSync(path.join(out,'integration-results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(String(e.message).slice(0,700));process.exitCode=1;});
