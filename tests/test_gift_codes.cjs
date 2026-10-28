// Execute the real compiled handlers against atomic CAS Storage, with injected races.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
const {drafts,date}=require('../tools/gift_codes.cjs');
const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/items.json'),'utf8').replace(/^\uFEFF/,''));
let now=Date.now(),serial=0,failWrites=0,beforeCommit=null,archivedClaim=false,queryRows=[];
class Clock extends Date{static now(){return now;}}
const c=vm.createContext({Date:Clock});
for(const name of ['character_repository','config_rpc','monetization_rpc','mailbox','gift_codes'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../nakama/data/modules/build',name+'.js'),'utf8'),c);
const fn=name=>vm.runInContext(name,c),copy=value=>JSON.parse(JSON.stringify(value)),store=new Map();
const owner='00000000-0000-0000-0000-000000000000',key=r=>r.userId+'/'+r.collection+'/'+r.key;
const logger={error(){},warn(){}};
const base={
 sqlQuery(sql,args){
  if(sql.includes('sha256'))return[{hash:crypto.createHash('sha256').update(args[0]).digest('hex')}];
  if(sql.includes('FROM game_items')){const item=catalog.find(r=>r.id===args[0]);return item?[copy(item)]:[];}
  if(sql.includes('FROM game_servers'))return args[0]==='s001'?[{server_id:'s001'}]:[];
  if(sql.includes('account_link_archives'))return archivedClaim?[{}]:[];
  if(sql.includes('FROM storage'))return copy(queryRows);
  throw Error('Unexpected SQL '+sql);
 },
 uuidv4:()=>crypto.randomUUID(),
 storageRead(refs){return refs.map(ref=>store.get(key(ref))).filter(Boolean).map(copy);},
 storageWrite(writes){
  if(writes.some(w=>w.collection==='gift_codes')&&beforeCommit){const callback=beforeCommit;beforeCommit=null;callback();}
  for(const write of writes){const old=store.get(key(write));if(write.version==='*'?old:!old||write.version!==old.version)throw Error('CAS conflict');}
  if(writes.some(w=>w.collection==='gift_code_redemptions')&&failWrites>0){failWrites--;throw Error('Injected failure');}
  const identities=writes.map(key);assert.equal(new Set(identities).size,identities.length);
  return writes.map(write=>{const row={...copy(write),version:'v'+(++serial)};store.set(key(write),row);return copy(row);});
 },notificationSend(){throw Error('Socket disconnected');}
};
c.getRemoteConfigValue=()=>({warning_hours:24,retention_days:7});
c.serverRequest=payload=>JSON.parse(payload);
c.requireServerAdmin=ctx=>ctx.userId==='admin'?null:JSON.stringify({success:false,code:'FORBIDDEN'});
const scope=user=>({accountId:user,serverId:'s001',generation:1});
const runtime=(user,server='s001',generation=1)=>fn('characterRuntime')(base,{...scope(user),serverId:server,generation});
const admin=request=>JSON.parse(fn('rpcGiftCodeAdmin')({userId:'admin'},logger,base,JSON.stringify(request)));
const newDraft=code=>{const d=drafts({start:now-1,end:now+10000})[0];d.definition.code=code;d.definition.enabled=true;return d;};
const create=(code,overrides={})=>{const d=newDraft(code);Object.assign(d.definition,overrides);assert.equal(admin(d).success,true,code);return d;};
const redeem=(code,user='player',id='request_00000000001',server='s001',generation=1)=>JSON.parse(fn('giftRedeem')({userId:user},logger,base,runtime(user,server,generation),JSON.stringify({code,request_id:id})));
const read=(collection,id,user=owner)=>store.get(key({collection,key:id,userId:user}));
const count=collection=>[...store.values()].filter(r=>r.collection===collection).length;
const clearRate=()=>{for(const [k,r]of store)if(r.collection==='gift_code_attempts')store.delete(k);};

const template=drafts({start:now-1,end:now+10000}),tester=template[2];
assert.match(tester.definition.code,/^TEST_[A-F0-9]{48}$/);
assert.notEqual(tester.definition.code,drafts()[2].definition.code);
assert.equal(tester.definition.rewards.length,catalog.length);
assert(tester.definition.rewards.every(r=>r.amount===(catalog.find(i=>i.id===r.id).category==='talisman'?1:1000)));
assert.throws(()=>date('2026-10-28'),/timezone/);
assert.equal(date('2026-10-28T00:00:00+07:00'),Date.parse('2026-10-27T17:00:00Z'));
assert.equal(template[0].definition.enabled,false);
assert.deepEqual(template[1].definition.rewards.slice(1).map(r=>[r.id,r.amount]),[['talisman_enhance_charm',1],['element_enlightenment_charm',1],['talisman_fragment_1',15],['campaign_sweep_ticket',20],['revive_talisman',1]]);

create('WELCOME');
const result=redeem(' welcome ');assert.equal(result.success,true);
assert.equal(read('gift_codes','WELCOME').value.used_count,1);
assert.equal(count('player_mail'),1);assert.equal(count('gift_code_redemptions'),1);
const mail=read('player_mail','s001:g1:'+result.mail_ids[0],'player');assert.equal(mail.value.attachments.length,5);
assert.equal(mail.value.expires_at_ms,now+30*86400000);
assert.equal(redeem('WELCOME').replayed,true);assert.equal(count('player_mail'),1);
assert.equal(redeem('WELCOME','player','another_request_0001').code,'ALREADY_USED');
assert.equal(redeem('WELCOME','player','another_request_0001','s002').code,'ALREADY_USED');
assert.equal(redeem('WELCOME','player','another_request_0001','s001',2).code,'ALREADY_USED');
assert.equal(redeem('UNKNOWN').code,'INVALID_CODE');
create('LOCKED',{enabled:false});assert.equal(redeem('LOCKED').code,'DISABLED');
create('FUTURE',{starts_at_ms:now+1});assert.equal(redeem('FUTURE').code,'NOT_STARTED');
clearRate();create('BOUNDARY',{expires_at_ms:now});assert.equal(redeem('BOUNDARY').code,'EXPIRED');
create('START',{starts_at_ms:now});assert.equal(redeem('START').success,true);
create('SERVER',{allowed_servers:['s001']});assert.equal(redeem('SERVER','wrong','request_00000000002','s002').code,'WRONG_SERVER');
assert.equal(redeem('SERVER','correct').success,true);

create('ROLLBACK');const before=count('player_mail');failWrites=4;
assert.equal(redeem('ROLLBACK','fault').code,'UNAVAILABLE');assert.equal(read('gift_codes','ROLLBACK').value.used_count,0);
assert.equal(read('gift_code_redemptions','ROLLBACK','fault'),undefined);assert.equal(count('player_mail'),before);
assert.equal(redeem('ROLLBACK','fault').success,true);

create('LASTSLOT',{max_uses:1});let rival;
beforeCommit=()=>{rival=redeem('LASTSLOT','rival');};
assert.equal(redeem('LASTSLOT','contender').code,'EXHAUSTED');assert.equal(rival.success,true);
assert.equal(read('gift_codes','LASTSLOT').value.used_count,1);assert.equal(read('gift_code_redemptions','LASTSLOT','contender'),undefined);

create('DUPLICATE');let concurrent;
beforeCommit=()=>{concurrent=redeem('DUPLICATE','same');};
assert.equal(redeem('DUPLICATE','same').replayed,true);assert.equal(concurrent.success,true);assert.equal(read('gift_codes','DUPLICATE').value.used_count,1);

template[1].definition.enabled=true;assert.equal(admin(template[1]).success,true);
const opening=redeem('KHAIMOSERVER','opening');assert.equal(opening.success,true);
const openingMails=opening.mail_ids.map(id=>read('player_mail','s001:g1:'+id,'opening').value);
assert.equal(openingMails.flatMap(m=>m.attachments).filter(r=>r.id.startsWith('rune_')).reduce((sum,r)=>sum+r.amount,0),20);
tester.definition.enabled=true;assert.equal(admin(tester).success,true);
const testResult=redeem(tester.definition.code,'tester');assert.equal(testResult.success,true);
const testMails=testResult.mail_ids.map(id=>read('player_mail','s001:g1:'+id,'tester').value);
assert(testMails.length>1);assert(testMails.every(m=>m.attachments.length<=32));
assert.equal(testMails.flatMap(m=>m.attachments).length,catalog.length);
assert(testMails.flatMap(m=>m.attachments).every(r=>r.amount===(catalog.find(i=>i.id===r.id).category==='talisman'?1:1000)));
const testerRuntime=runtime('tester');
for(const [collection,id,value]of [['player_profiles','main',{resources:{gold:0,gems:0}}],['player_inventory','items',{items:[]}],['player_heroes','states',{heroes:[]}]])
 testerRuntime.storageWrite([{collection,key:id,userId:'tester',value,version:'*',permissionRead:0,permissionWrite:0}]);
for(const id of testResult.mail_ids)assert.equal(fn('mailClaimOne')(testerRuntime,'tester',id).success,true,'tester mail must fit the real inventory rules');
const inventory=read('player_inventory','s001:g1:items','tester').value.items;
for(const item of catalog)assert.equal(inventory.filter(i=>i.item_id===item.id).reduce((sum,i)=>sum+i.quantity,0),item.category==='talisman'?1:1000,item.id);
assert.equal(fn('mailClaimOne')(testerRuntime,'tester',testResult.mail_ids[0]).already_claimed,true);
assert.equal(fn('mailClaimOne')(runtime('tester','s002'),'tester',testResult.mail_ids[0]).code,'MAIL_NOT_FOUND');
archivedClaim=true;assert.equal(redeem('KHAIMOSERVER','merged_account').code,'ALREADY_USED');archivedClaim=false;

const locked=newDraft('WELCOME');locked.expected_revision=1;locked.definition.rewards[0].amount++;
assert.equal(admin(locked).code,'INVALID_DEFINITION');
const update=newDraft('WELCOME');update.expected_revision=1;update.definition.enabled=false;
assert.equal(admin(update).success,true);assert.equal(read('gift_codes','WELCOME').value.used_count,1);
assert.equal(admin(update).code,'REVISION_CONFLICT');
clearRate();assert.equal(redeem('WELCOME').replayed,true,'replay succeeds even after disable');
assert.equal(JSON.parse(fn('rpcGiftCodeAdmin')({userId:'player'},logger,base,JSON.stringify(update))).code,'FORBIDDEN');
const bad=newDraft('BAD');bad.definition.rewards=[{type:'item',id:'missing',amount:1}];assert.equal(admin(bad).success,false);
const invalidServer=newDraft('BADSERVER');invalidServer.definition.allowed_servers=['missing'];assert.equal(admin(invalidServer).success,false);
clearRate();for(let i=0;i<10;i++)assert.equal(redeem('UNKNOWN','spam').code,'INVALID_CODE');assert.equal(redeem('UNKNOWN','spam').code,'RATE_LIMITED');
now+=60000;assert.equal(redeem('UNKNOWN','spam').code,'INVALID_CODE');
assert.equal(redeem('!invalid','invalid').code,'INVALID_CODE');
const raw=fn('giftRedeem')({userId:'player'},logger,base,runtime('player'),'{');assert.equal(JSON.parse(raw).code,'INVALID_CODE');
const operatorToken='a'.repeat(64),operatorContext={env:{CONFIG_PUBLISH_TOKEN:operatorToken}};
const operator=(request,ctx=operatorContext,nk=base)=>JSON.parse(fn('operatorGiftCodes')(ctx,logger,nk,JSON.stringify(request)));
const inaccessible=new Proxy({}, {get(){throw Error('Unauthorized operator touched Storage');}});
for(const [request,ctx]of [[{},operatorContext],[{publish_token:'wrong'},operatorContext],[{publish_token:operatorToken},{env:{}}],
 [{publish_token:operatorToken},{...operatorContext,userId:'admin'}],[null,operatorContext]])
 assert.equal(operator(request,ctx,inaccessible).code,'FORBIDDEN');
assert.equal(JSON.parse(fn('operatorGiftCodes')(operatorContext,logger,inaccessible,'{')).code,'INVALID_REQUEST');
const operatorDraft=newDraft('OPERATORTEST');operatorDraft.publish_token=operatorToken;
assert.equal(operator(operatorDraft).success,true);
assert([...store.values()].some(row=>row.collection==='gift_code_audit'&&row.value.code==='OPERATORTEST'&&row.value.actor_id==='operator:deploy'));
assert.equal(operator(operatorDraft).code,'REVISION_CONFLICT');
queryRows=[{key:'OPERATORTEST',value:Array.from(Buffer.from(JSON.stringify(read('gift_codes','OPERATORTEST').value),'utf8'))}];
assert.equal(operator({action:'list',publish_token:operatorToken}).entries[0].value.enabled,true,'SQL byte-array JSONB decoded for management list');
queryRows=[{user_id:'player',value:Array.from(Buffer.from(JSON.stringify({mail_ids:['m_test'],generation:1}),'utf8'))}];
assert.equal(operator({action:'history',code:'OPERATORTEST',publish_token:operatorToken}).entries[0].value.generation,1,'history decodes SQL byte-array JSONB');
queryRows=[];
console.log('PASS C234 gift codes: campaigns, atomic rollback, concurrent quota/deduplication, account/server scope, clocks, mail chunks, admin CAS, rate limit');
