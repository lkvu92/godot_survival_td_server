const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
let clock=Date.now();class Clock extends Date{static now(){return clock;}}
const c={Date:Clock,JSON,Math,Number,String,Array,isFinite};vm.createContext(c);vm.runInContext(fs.readFileSync(__dirname+'/../nakama/data/modules/build/main.js','utf8'),c);
const compliance={schema_version:1,revision:1,game_id:'fixture',guardian_below_age:16,guardian_phone_max_accounts:3,provider:'mock',otp_ttl_seconds:300,otp_max_attempts:5,otp_resend_seconds:60,otp_rate_window_seconds:3600,otp_rate_account_max:100,otp_rate_phone_max:100,otp_rate_ip_max:100,lease_seconds:45,age_bands:[{below_age:18,per_game_seconds:3600,total_seconds:10800}]};
const policy=JSON.parse(fs.readFileSync(__dirname+'/../data/privacy_consent.json','utf8'));
c.getActiveRemoteConfig=()=>({config:{system:{compliance_policy:compliance,privacy_consent:policy}}});
const rows=new Map();let seq=0,last=[];const key=x=>x.userId+'/'+x.collection+'/'+x.key;
const nk={uuidv4:()=>`fixture-${++seq}`,base64Encode:v=>Buffer.from(v).toString('base64'),hmacSha256Hash:(v,k)=>crypto.createHmac('sha256',k).update(v).digest(),storageRead:a=>a.map(x=>rows.get(key(x))).filter(Boolean).map(x=>structuredClone(x)),storageWrite(a){last=a;for(const x of a){const o=rows.get(key(x));if(x.version==='*'&&o||x.version&&x.version!=='*'&&x.version!==o?.version)throw Error('CAS');}for(const x of a)rows.set(key(x),{...structuredClone(x),version:'v'+(++seq)});},storageDelete:a=>a.forEach(x=>rows.delete(key(x))),sqlQuery(q,a){if(q.includes('sha256'))return [{hash:crypto.createHash('sha256').update(a[0]).digest('hex')}];if(q.includes('personal_count'))return [{personal_count:0,guardian_count:0}];return [{used:0,total:0,remaining:3600,until_at:0}];}};
const ctx=id=>({userId:id,clientIp:'127.0.0.1',env:{APP_ENVIRONMENT:'develop',COMPLIANCE_ALLOW_MOCK:'true'}}),call=(id,p)=>JSON.parse(c.complianceAccess(ctx(id),{},nk,JSON.stringify(p)));
const choices={game_marketing_email:false,optional_partner_sharing:false};
const request=(id,yes=false)=>{const v=call(id,{action:'profile'}).privacy;return {action:'request',full_name:'Fixture name',birth_date:'1990-01-01',phone_number:'0901234567',kyc_confirmation:true,privacy:{notice_hash:v.notice_hash,expected_revision:v.state.revision,choices:{...choices,game_marketing_email:yes}}};};
const results=[];function test(name,fn){fn();results.push({name,result:'PASS'});}
test('no selection KYC succeeds; private atomic state/event/profile and no PII',()=>{assert(call('a',request('a')).success);assert.equal(call('a',{action:'verify',otp:'00000'}).success,false);assert(!rows.has('a/privacy_consent/state'));assert(call('a',{action:'verify',otp:'12345'}).success);assert.equal(last.length,5);assert(last.every(x=>x.permissionRead===0&&x.permissionWrite===0));const privacy=call('a',{action:'profile'}).privacy;assert.equal(privacy.state.choices.game_marketing_email,false);const event=[...rows.values()].find(x=>x.collection==='privacy_consent'&&x.key.startsWith('event:')).value;for(const pii of ['Fixture name','1990-01-01','0901234567','12345'])assert(!JSON.stringify(event).includes(pii));});
test('optional grant only after OTP; profile returns own choice; replay cannot duplicate',()=>{const p=request('b',true);assert(call('b',p).success);assert(!rows.has('b/privacy_consent/state'));assert(call('b',{action:'verify',otp:'12345'}).profile.consent.choices.game_marketing_email);const n=rows.size;assert(!call('b',{action:'verify',otp:'12345'}).success);assert.equal(rows.size,n);assert.equal(call('c',{action:'profile',user_id:'b'}).privacy.state.revision,0);});
test('withdraw no OTP invalidates pending grant and keeps prior KYC untouched',()=>{clock+=61000;assert(call('b',request('b',true)).success);const v=call('b',{action:'profile'}).privacy;assert(call('b',{action:'privacy_withdraw',expected_revision:v.state.revision}).success);assert.equal(call('b',{action:'verify',otp:'12345'}).reason,'PRIVACY_CHANGED');assert.equal(call('b',{action:'profile'}).profile.revision,1);assert.equal(call('b',{action:'profile'}).privacy.state.choices.game_marketing_email,false);});
test('policy change binds OTP snapshot; no partial KYC write',()=>{assert(call('c',request('c',true)).success);policy.notice.text+=' Updated notice.';assert.equal(call('c',{action:'verify',otp:'12345'}).reason,'PRIVACY_CHANGED');assert(!rows.has('c/compliance_activation/profile'));});
test('malformed, unknown, disabled choices and unchecked KYC are rejected',()=>{for(const mutate of [p=>p.privacy.choices.unknown=true,p=>p.privacy.choices.optional_partner_sharing=true,p=>p.privacy.choices.game_marketing_email='true',p=>p.kyc_confirmation=false]){const p=request('d');mutate(p);assert.equal(call('d',p).reason,'PRIVACY_CHANGED');}});
test('guardian KYC records selected optional preference',()=>{let p=request('child',true);Object.assign(p,{birth_date:'2015-01-01',guardian_name:'Parent fixture',guardian_phone:'0901234567',guardian_consent:true});assert(call('child',p).success);assert(call('child',{action:'verify',otp:'12345'}).success);});
test('CAS withdraw conflict and enabled processing policy rejected',()=>{assert(!call('b',{action:'privacy_withdraw',expected_revision:0}).success);const p=structuredClone(policy);p.purposes[0].processing_enabled=true;assert.throws(()=>c.privacyPolicyValue(p));});
test('individual withdrawal preserves another existing grant; no action can introduce a grant',()=>{
 const ref={userId:'partial',collection:'privacy_consent',key:'state'};
 rows.set(key(ref),{...ref,version:'initial',value:{revision:4,choices:{game_marketing_email:true,optional_partner_sharing:true}}});
 const kept={game_marketing_email:false,optional_partner_sharing:true};
 assert(call('partial',{action:'privacy_withdraw',expected_revision:4,choices:kept}).success);
 const state=call('partial',{action:'profile'}).privacy.state;
 assert.equal(state.revision,5);assert.equal(state.choices.game_marketing_email,false);assert.equal(state.choices.optional_partner_sharing,true);
 for(const invalid of [{...kept,game_marketing_email:true},{game_marketing_email:false},{...kept,other:false},{...kept,game_marketing_email:'false'}]){
   assert(!call('partial',{action:'privacy_withdraw',expected_revision:5,choices:invalid}).success);
   assert.equal(call('partial',{action:'profile'}).privacy.state.revision,5);
 }
 assert(call('partial',{action:'privacy_withdraw',expected_revision:5}).success);
 assert.equal(call('partial',{action:'profile'}).privacy.state.choices.optional_partner_sharing,false);
});
console.log(JSON.stringify({suite:'C251 profile consent',environment:'atomic storage/CAS emulator, mock OTP; not production',results},null,2));
