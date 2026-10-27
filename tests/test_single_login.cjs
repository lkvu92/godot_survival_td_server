const fs=require('fs'),vm=require('vm'),assert=require('assert');
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(require('path').join(__dirname,'../nakama/data/modules/build/account_identity.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(require('path').join(__dirname,'../nakama/data/modules/build/server_context.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(require('path').join(__dirname,'../nakama/data/modules/build/account_link.js'),'utf8'),context);
const fn=name=>vm.runInContext(name,context);
const owners=new Map();let sequence=0,handled=0,pushes=[];
const nk={notificationSend(...args){pushes.push(args);},uuidv4:()=>`server-${++sequence}`,sqlExec(sql,args){
  if(sql.includes('INSERT INTO player_login_sessions')) owners.set(args[0],args[1]);
},sqlQuery(sql,args){
  if(sql.includes('FROM player_login_sessions')) return owners.has(args[0])?[{generation:owners.get(args[0])}]:[];
  if(sql.includes('INSERT INTO account_link_state')) return [{user_id:args[0]}];
  return [];
}};
function login(){
  const request={account:{vars:{login_generation:'client-forged',other:'kept'}}};
  fn('beforeSingleLogin')({}, {},nk,request);
  assert.notEqual(request.account.vars.login_generation,'client-forged');
  assert.equal(request.account.vars.other,'kept');
  const ctx={userId:'player',vars:request.account.vars};
  fn('afterSingleLogin')(ctx,{},nk,{},request);
  return ctx;
}
const a=login();assert.equal(fn('requireCurrentLogin')(a,nk),null);
const b=login();
assert.equal(pushes.length,2);
assert.equal(pushes[1][3],131);assert.equal(pushes[1][5],false);
assert.equal(pushes[1][2].type,'session_changed');
assert(!JSON.stringify(pushes).includes('server-'),'push must not leak signed generation');
const rejected=JSON.parse(fn('requireCurrentLogin')(a,nk));
assert.equal(rejected.reason,'SESSION_REPLACED');assert.equal(rejected.code,401);
assert.equal(rejected.message,'Tài khoản đã được đăng nhập ở thiết bị khác');
assert.equal(fn('requireCurrentLogin')(b,nk),null);
for(const vars of [{},{login_generation:'client-forged'},a.vars])
  assert.equal(JSON.parse(fn('requireCurrentLogin')({userId:'player',vars},nk)).reason,'SESSION_REPLACED');
// A failed authentication never invokes after-auth: before-auth alone cannot steal B.
fn('beforeSingleLogin')({}, {},nk,{account:{vars:{}}});
assert.equal(fn('requireCurrentLogin')(b,nk),null);
const guarded=fn('accountGuardedRpc')('test',()=>{handled++;return '{"success":true}';});
assert.equal(JSON.parse(guarded(a,{},nk,'{}')).code,401);assert.equal(handled,0);
assert.equal(JSON.parse(guarded(b,{},nk,'{}')).success,true);assert.equal(handled,1);
const confirm=fn('accountGuardedRpc')('confirm_google_link',()=>{handled++;return '{}';});
assert.equal(JSON.parse(confirm(a,{},nk,'{}')).code,401);assert.equal(handled,1);
assert.equal(fn('requireCurrentLogin')({},nk),null,'HTTP-key callbacks retain their own guards');
assert(!fn('sessionStatus')(b,{},nk,'{}').includes('server-'));
const main=fs.readFileSync(require('path').join(__dirname,'../nakama/data/modules/main.ts'),'utf8');
for(const provider of ['Email','Google','Device','Custom']) {
  assert(main.includes(`registerBeforeAuthenticate${provider}(`));
  assert(main.includes(`registerAfterAuthenticate${provider}(${provider==='Google'?'identityAfterGoogle':'afterSingleLogin'})`));
}
assert(main.includes('registerRpc("session_status",linkedRpc_session_status)')||/registerRpc\("session_status",\s*linkedRpc_session_status\)/.test(main));
let warned=false;
const originalSend=nk.notificationSend;
nk.notificationSend=()=>{throw Error('transport unavailable');};
fn('afterSingleLogin')(b,{warn(){warned=true;}},nk,{}, {account:{vars:b.vars}});
assert(warned);assert.equal(fn('requireCurrentLogin')(b,nk),null,'push failure cannot undo authoritative ownership');
nk.notificationSend=originalSend;
console.log('PASS single login: takeover, forged/legacy tokens, failed auth, all RPC guards, precise notice, auth hooks');
