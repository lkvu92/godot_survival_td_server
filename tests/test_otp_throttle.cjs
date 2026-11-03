const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto'),path=require('path');
let now=1800000000;class Clock extends Date{static now(){return now*1000;}}
const c={Date:Clock,JSON,Math,Number,String,Array,isFinite};vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(__dirname,'../nakama/data/modules/build/main.js'),'utf8'),c);
const policy={schema_version:1,revision:1,game_id:'fixture',guardian_below_age:16,guardian_phone_max_accounts:3,provider:'mock',otp_ttl_seconds:300,otp_max_attempts:5,otp_resend_seconds:60,otp_rate_window_seconds:3600,otp_rate_account_max:5,otp_rate_phone_max:2,otp_rate_ip_max:10,lease_seconds:45,age_bands:[{below_age:18,per_game_seconds:3600,total_seconds:10800}]};c.getActiveRemoteConfig=()=>({config:{system:{compliance_policy:policy}}});
const rows=new Map();let seq=0;const key=r=>`${r.userId}/${r.collection}/${r.key}`;
const nk={uuidv4:()=>`id-${++seq}`,base64Encode:x=>Buffer.from(x).toString('base64'),hmacSha256Hash:(v,k)=>crypto.createHmac('sha256',k).update(v).digest(),storageRead:a=>a.map(r=>rows.get(key(r))).filter(Boolean).map(r=>structuredClone(r)),storageWrite(a){for(const r of a){const old=rows.get(key(r));if(r.version==='*'&&old||r.version&&r.version!=='*'&&r.version!==old?.version)throw Error('CAS');}for(const r of a)rows.set(key(r),{...structuredClone(r),version:`v${++seq}`});},storageDelete:a=>a.forEach(r=>rows.delete(key(r))),sqlQuery:q=>q.includes('personal_count')?[{personal_count:0,guardian_count:0}]:[{used:0,total:0,remaining:3600,until_at:0}]};
const ctx=(user,ip='10.0.0.1')=>({userId:user,clientIp:ip,env:{APP_ENVIRONMENT:'develop',COMPLIANCE_ALLOW_MOCK:'true'}}),call=(user,req,ip)=>JSON.parse(c.complianceAccess(ctx(user,ip),{},nk,JSON.stringify(req))),req={action:'request',full_name:'Test User',birth_date:'1990-01-01',phone_number:'0901234567'};
let r=call('a',req);assert(r.success);assert.equal(r.expires_at-r.server_time,300);assert.equal(r.resend_at-r.server_time,60);
r=call('a',req);assert.equal(r.reason,'OTP_COOLDOWN');assert.equal(r.retry_at-now,60);
assert(call('a',{action:'verify',otp:'12345'}).allowed);r=call('a',{action:'profile'});assert.equal(r.retry_at-now,60);r=call('a',req);assert.equal(r.reason,'OTP_COOLDOWN');assert.equal(r.retry_at-now,60);
now+=60;assert(call('b',req,'10.0.0.2').success);r=call('c',req,'10.0.0.3');assert.equal(r.reason,'OTP_COOLDOWN');assert.equal(r.retry_at,1800003600);
assert([...rows.keys()].filter(k=>k.includes('/otp_rate_limit/')).every(k=>!k.includes('0901234567')&&!k.includes('10.0.0.')));
now=1800003600;assert(call('c',req,'10.0.0.3').success);assert.equal(call('c',{action:'verify',otp:'12345'}).allowed,true);
assert.equal(call('d',req,'').reason,'OTP_RATE_UNAVAILABLE');
console.log('PASS OTP timing and rate: TTL/resend, cooldown survives verification, cross-account phone cap, reset boundary, pseudonymous keys, missing IP fail closed. Storage fixture only.');
