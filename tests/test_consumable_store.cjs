const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const read = p => JSON.parse(fs.readFileSync(path.join(__dirname, '..', p), 'utf8'));
const catalog = read('data/items.json'), progression = read('data/progression.json');
const items = catalog.filter(i => i.attributes && Number.isInteger(i.attributes.atlas_slot));
assert.equal(items.length, 23);
assert(!catalog.some(i => i.id === 'loot_magnet_talisman'));
const offers = progression.talisman_system.store.materials;
const prices = {
 rename_talisman:[1000,0,'epic'], spirit_root_reset:[5000,0,'mythic'],
 exp_talisman:[500,125000,'epic'],gold_talisman:[300,0,'rare'],
 attack_talisman:[200,50000,'rare'], defense_talisman:[200,50000,'rare'],cooldown_talisman:[200,50000,'rare'],
 resistance_talisman:[300,75000,'rare'],critical_talisman:[100,25000,'rare'],attack_speed_talisman:[200,50000,'rare'],
 revive_talisman:[500,125000,'epic'],healing_elixir:[200,50000,'rare'],shield_elixir:[100,25000,'rare'],
 energy_elixir:[100,25000,'rare'],slow_talisman:[200,50000,'rare']
};
for (const element of ['metal','wood','water','fire','earth','wind','thunder','space']) prices[element+'_aptitude_fruit']=[2000,0,'legendary'];
for (const item of items) {
 assert.equal(item.rarity, prices[item.id][2], item.id+' rarity');
 for (const [index,currency] of ['gems','gold'].entries()) {
  const matching=offers.filter(p=>p.item_id===item.id && p.currency===currency);
  assert.equal(matching.length,prices[item.id][index]>0?1:0,item.id+' '+currency+' offer');
  if(matching.length) assert.equal(matching[0].price,prices[item.id][index]);
 }
}
const c=vm.createContext({});
const mountedContext=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../nakama/data/build/index.js'),'utf8'),mountedContext);
assert.equal(vm.runInContext('typeof storePurchase',mountedContext),'function','actual mounted runtime must include the strict purchase RPC');
for(const file of ['config_rpc','progression_rpc','inventory_rpc','player_rpc']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../nakama/data/modules/build/'+file+'.js'),'utf8'),c);
const action=vm.runInContext('talismanAction',c), rename=vm.runInContext('renamePlayer',c);
const storePurchase=vm.runInContext('storePurchase',c);
const clone=x=>JSON.parse(JSON.stringify(x));
let db, conflict=false, revision=0;
const key=(collection,k)=>collection+':'+k;
function row(collection,k,value){db[key(collection,k)]={collection,key:k,userId:'u',value:clone(value),version:'v'+(++revision)};}
const nk={
 sqlQuery(sql,args){if(sql.includes('FROM game_config'))return [{value:clone(progression)}];if(sql.includes('FROM game_items'))return catalog.filter(i=>i.id===args[0]).map(clone);throw Error('Unexpected SQL '+sql);},
 accountGetId:()=>({user:{username:'Player'}}),uuidv4:()=> 'abcdefgh-0000-0000-0000-000000000000',
 storageRead(reads){return reads.flatMap(r=>db[key(r.collection,r.key)]?[clone(db[key(r.collection,r.key)])]:[]);},
 storageWrite(writes){
  if(conflict) throw Error('conflict');
  for(const w of writes){const current=db[key(w.collection,w.key)];assert(w.version==='*'?!current:current && current.version===w.version,'CAS');}
  for(const w of writes) row(w.collection,w.key,w.value);
 }
};
function reset(){db={};conflict=false;row('player_profiles','main',{display_name:'Initial',name_changes_used:0,level:15,elements:{fire:12},resources:{gold:1000000,gems:20000}});row('player_identity','name',{display_name:'Initial',name_changes_used:0});row('player_inventory','items',{items:[{item_id:'rename_talisman',quantity:2},{item_id:'spirit_root_reset',quantity:2}]});}
const profile=()=>db['player_profiles:main'].value;
const inventory=()=>db['player_inventory:items'].value.items;
const quantity=id=>inventory().filter(i=>i.item_id===id).reduce((n,i)=>n+i.quantity,0);
const buy=(id,currency,request)=>JSON.parse(action({userId:'u'}, {}, nk,JSON.stringify({action:'buy_material',item_id:id,currency,request_id:request})));
const renameTo=name=>JSON.parse(rename({userId:'u'}, {}, nk,JSON.stringify({display_name:name})));
const reroll=id=>JSON.parse(action({userId:'u'}, {}, nk,JSON.stringify({action:'reroll_talent',request_id:id})));
reset();assert(renameTo('Free Name').used_free);assert.equal(quantity('rename_talisman'),2);
assert(renameTo('Paid Name').success);assert.equal(quantity('rename_talisman'),1);assert.equal(profile().name_changes_used,2);
assert(renameTo('Paid Name').success);assert.equal(quantity('rename_talisman'),1,'same-name retry cannot consume again');
assert(renameTo('Third Name').success);assert.equal(quantity('rename_talisman'),0);
assert(!renameTo('No More Cards').success);assert.equal(profile().name_changes_used,3);
db['player_identity:name'].value.name_changes_used=0;
assert(!renameTo('Legacy Counter Bypass').success);assert.equal(db['player_identity:name'].value.name_changes_used,3,'legacy identity cannot restore free rename');
reset();renameTo('Free Name');const before=clone(db);conflict=true;assert(!renameTo('Failed Paid Name').success);assert.deepEqual(db,before,'CAS rejection must not consume a rename card');
reset();assert(buy('attack_talisman','gems','buy-a').success);assert.equal(profile().resources.gems,19800);assert.equal(quantity('attack_talisman'),1);
assert(buy('attack_talisman','gems','buy-a').duplicate);assert.equal(quantity('attack_talisman'),1);
assert(!buy('shield_elixir','gems','buy-a').success);assert(!buy('attack_talisman','gold','buy-a').success);
assert(buy('attack_talisman','gold','buy-b').success);assert.equal(profile().resources.gold,950000);
assert(!buy('rename_talisman','gold','bad-currency').success);assert(!buy('wind_aptitude_fruit','gems','disabled').success);
assert(!buy('loot_magnet_talisman','gems','excluded').success);assert(!buy('attack_talisman','gems','').success);
profile().resources.gems='invalid';assert(!buy('attack_talisman','gems','bad-balance').success);profile().resources.gems=19800;
const beforeConflict=clone(db);conflict=true;assert(!buy('shield_elixir','gems','conflict').success);assert.deepEqual(db,beforeConflict);
reset();const roll=reroll('roll-a');assert(roll.success);assert.equal(quantity('spirit_root_reset'),1);assert.equal(profile().level,15);assert.equal(profile().elements.fire,12);
assert.equal(Object.keys(profile().element_affinities).length,5);assert(reroll('roll-a').duplicate);assert.equal(quantity('spirit_root_reset'),1);
db['player_inventory:items'].value._talent_reroll_receipts=[];
assert(reroll('roll-a').duplicate);assert.equal(quantity('spirit_root_reset'),1,'durable request record survives rolling inventory receipt window');
row('player_stage_runs','active',{status:'active',expires_at_ms:Date.now()+60000});assert(!reroll('roll-b').success);assert.equal(quantity('spirit_root_reset'),1);
reset();conflict=true;assert(!reroll('failed-roll').success);assert.equal(quantity('spirit_root_reset'),2);assert(!profile().talent_score);
reset();profile().name_changes_used='invalid';assert(!renameTo('Invalid Quota').success);assert.equal(quantity('rename_talisman'),2);
console.log('PASS consumables: 23 catalog entries, exact prices/rarities, disabled elements, atomic Gold/Gem purchases, replay binding, free/paid rename, stale quota, talent reroll and active-run/CAS guards');

const purchase=(id,currency,request_id,protocol=2)=>JSON.parse(storePurchase({userId:'u'},{},nk,JSON.stringify({item_id:id,currency,request_id,purchase_protocol:protocol})));
reset();const beforeMissingCurrency=clone(db);
assert(!purchase('fire_aptitude_fruit',undefined,'missing-currency').success);
assert(!purchase('fire_aptitude_fruit','gem','invalid-currency').success);
assert(!purchase('fire_aptitude_fruit','gems','legacy',1).success);
assert.deepEqual(db,beforeMissingCurrency,'invalid protocol/currency cannot debit anything');
for(let i=0;i<2;i++){
 const result=purchase('fire_aptitude_fruit','gems','gem-fruit-'+i);
 assert(result.success);assert.equal(result.currency,'gems');assert.equal(result.purchase_protocol,2);
 assert.equal(result.item_id,'fire_aptitude_fruit');
}
assert.equal(profile().resources.gems,16000);assert.equal(profile().resources.gold,1000000);assert.equal(quantity('fire_aptitude_fruit'),2);
assert(purchase('fire_aptitude_fruit','gems','gem-fruit-0').duplicate);assert.equal(quantity('fire_aptitude_fruit'),2);
assert(!purchase('fire_aptitude_fruit','gold','gem-fruit-0').success);
assert(purchase('attack_talisman','gold','gold-charm').success);assert.equal(profile().resources.gold,950000);
assert(purchase('attack_talisman','gems','gem-charm').success);assert.equal(profile().resources.gems,15800);
console.log('PASS store_purchase v2: explicit currency, Gem-only fruit, both charm currencies, repeat/replay and no cross-currency debit');
