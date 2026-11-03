const fs=require('fs'),vm=require('vm'),assert=require('assert'),cp=require('child_process'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'../nakama/data/modules/main.ts'),'utf8');
const ctx={Date,JSON,Math,Number,String,Array,isFinite};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../nakama/data/modules/build/main.js'),'utf8'),ctx);
let store={},writes=0;
const policy={schema_version:1,revision:1,game_id:'test',guardian_below_age:16,guardian_phone_max_accounts:3,provider:'mock',otp_ttl_seconds:300,otp_max_attempts:5,otp_resend_seconds:60,otp_rate_window_seconds:3600,otp_rate_account_max:100,otp_rate_phone_max:100,otp_rate_ip_max:100,lease_seconds:45,age_bands:[{below_age:18,per_game_seconds:3600,total_seconds:10800}]};
ctx.getActiveRemoteConfig=()=>({config:{system:{compliance_policy:policy}}});
const nk={uuidv4(){return 'fixture-challenge-'+(++writes);},hmacSha256Hash(v,k){return require('crypto').createHmac('sha256',k).update(v).digest();},base64Encode(v){return Buffer.from(v).toString('base64');},storageRead(keys){return keys.map(k=>store[k.key]).filter(Boolean);},storageWrite(rows){for(const r of rows){store[r.key]={key:r.key,value:structuredClone(r.value),version:String(++writes)};}},storageDelete(rows){for(const r of rows)delete store[r.key];},sqlQuery(q){if(q.includes('personal_count'))return [{personal_count:0,guardian_count:0}];return [{used:0,total:0,remaining:3600,until_at:0}];},sqlExec(){}};
const call=req=>JSON.parse(ctx.complianceAccess({userId:'test',clientIp:'127.0.0.1',env:{APP_ENVIRONMENT:'develop',COMPLIANCE_ALLOW_MOCK:'true'}},{},nk,JSON.stringify(req)));
const results=[];
function test(name,fn){fn();results.push({name,result:'PASS'});}
test('unverified lobby status denied gameplay only',()=>assert.equal(call({action:'status'}).reason,'PHONE_VERIFICATION_REQUIRED'));
test('reject invalid DOB and non-Vietnamese phone',()=>assert.equal(call({action:'request',full_name:'Test',birth_date:'2010-02-30',phone_number:'+12025550123'}).reason,'PROFILE_INVALID'));
test('under-16 requires guardian',()=>assert.equal(call({action:'request',full_name:'Test',birth_date:'2015-01-01',phone_number:'0901234567'}).reason,'PROFILE_INVALID'));
test('guardian request mock only',()=>assert.equal(call({action:'request',full_name:'Test',birth_date:'2015-01-01',guardian_name:'Guardian',guardian_phone:'0901234567',guardian_consent:true}).mock,true));
test('wrong OTP rejected',()=>assert.equal(call({action:'verify',otp:'000000'}).reason,'OTP_INVALID'));
test('mock success explicitly labeled and guardian ownership persisted',()=>{const r=call({action:'verify',otp:'12345'});assert.equal(r.allowed,true);assert.equal(r.verification_method,'mock');assert.equal(store.profile.value.phone_owner,'guardian');});
test('challenge cannot be replayed',()=>assert.equal(call({action:'verify',otp:'12345'}).reason,'OTP_EXPIRED'));
test('mock activation cannot authorize environment without explicit mock permission',()=>assert.equal(ctx.complianceStatus({userId:'test',env:{}},nk,policy,false).allowed,false));
test('all current combat RPCs denied without phone activation',()=>{store={};for(const id of ['start_stage','start_trial_tower','prepare_trial_tower','tribulation_action','start_sweep','award_stage_progression','finish_trial_tower'])assert.equal(JSON.parse(ctx.complianceCombatGate(id,{userId:'test'},nk)).allowed,false);});
test('combat guard covers start, preview lobby does not block',()=>{store={};assert.equal(ctx.complianceCombatGate('load_player_profile',{userId:'test'},nk),null);assert.equal(JSON.parse(ctx.complianceCombatGate('start_stage',{userId:'test'},nk)).allowed,false);});
if(process.argv.includes('--postgres')){
 const match=source.match(/nk.sqlExec\(`(CREATE OR REPLACE FUNCTION compliance_budget[\s\S]*?)`, \[\]\);/);
 assert(match);
 const sql=`BEGIN; CREATE TEMP TABLE compliance_playtime(user_id UUID,game_id TEXT,day TEXT,seconds DOUBLE PRECISION DEFAULT 0,last_at DOUBLE PRECISION,lease_until DOUBLE PRECISION DEFAULT 0,PRIMARY KEY(user_id,game_id,day)); ${match[1].replace('FUNCTION compliance_budget','FUNCTION pg_temp.compliance_budget')}
 ; DO $test$ DECLARE r RECORD; uid UUID:='00000000-0000-0000-0000-000000000001'; BEGIN
 SELECT * INTO r FROM pg_temp.compliance_budget(uid,'one','test',100,0,45,60,100,true); IF r.until_at<>145 THEN RAISE EXCEPTION 'lease'; END IF;
 SELECT * INTO r FROM pg_temp.compliance_budget(uid,'one','test',130,0,45,60,100,true); IF r.used<>30 OR r.until_at<>160 THEN RAISE EXCEPTION 'credit'; END IF;
 SELECT * INTO r FROM pg_temp.compliance_budget(uid,'one','test',160,0,45,60,100,true); IF r.remaining<>0 THEN RAISE EXCEPTION 'limit'; END IF;
 SELECT * INTO r FROM pg_temp.compliance_budget(uid,'two','test',160,0,45,60,100,true); IF r.remaining<>40 OR r.until_at<>200 THEN RAISE EXCEPTION 'total'; END IF;
 SELECT * INTO r FROM pg_temp.compliance_budget(uid,'two','test',1000,0,45,60,100,true); IF r.total<>100 OR r.remaining<>0 THEN RAISE EXCEPTION 'gap cap'; END IF;
 END $test$; ROLLBACK;`;
 cp.execFileSync('docker',['exec','-i','survival_td_local-postgres-1','psql','-U','postgres','-d','nakama','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8'});
 results.push({name:'PostgreSQL atomic lease, per-game, cross-game total and offline lease expiry',result:'PASS'});
}
console.log(JSON.stringify({suite:'C243',generated_at:new Date().toISOString(),environment:'isolated fixtures; optional PostgreSQL temporary objects rollback',results},null,2));
