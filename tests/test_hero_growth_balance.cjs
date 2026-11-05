const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const heroes=JSON.parse(fs.readFileSync(path.join(root,'data/heroes.json'),'utf8'));
const ctx=vm.createContext({parseJsonb:x=>x,parseJsonObject:x=>typeof x==='string'?JSON.parse(x):x});
for(const file of ['progression_rpc','player_rpc'])vm.runInContext(fs.readFileSync(path.join(root,'nakama/data/modules/build',file+'.js'),'utf8'),ctx);
const calc=vm.runInContext('progressionHeroAttributes',ctx),canonical=vm.runInContext('canonicalHeroStates',ctx);
const nk={sqlQuery(sql,args){return JSON.parse(JSON.stringify(sql.includes('WHERE id')?heroes.filter(h=>h.id===args[0]):heroes));}};
const near=(a,b)=>assert(Math.abs(a-b)<Math.max(1,Math.abs(b))*1e-9,`${a} != ${b}`);
const expected=[
 [1.06,1.075,1.045,1.002,1.01,.004,.015,.001],
 [1.057139,1.078060,1.04,1.002,1.012,.0033,.02,.0008],
 [1.06,1.075,1.05,1.002,1.01,.004,.015,.001],
 [1.056458,1.065,1.04,1.003,1.016488,.005,.012,.0008],
 [1.065,1.075,1.05,1.002,1.01,.004,.015,.001]
];
const keys=['hp','atk','def','move_speed','attack_speed','crit_rate','crit_damage','regen_percent_per_10s'];
for(const [i,h] of heroes.entries())assert.deepEqual(keys.map(k=>h.level_up_stats[k]),expected[i]);
for(const level of [1,30,50,70]){
 const stats=heroes.map(h=>calc(nk,h.id,level));
 for(const [i,h] of heroes.entries()){
  const a=stats[i],g=h.level_up_stats,n=level-1;
  for(const k of ['hp','atk','def','move_speed','attack_speed','attack_range'])near(a[k],h.attributes[k]*g[k]**n);
  for(const [k,cap] of [['crit_rate',1],['crit_damage',10],['regen_percent_per_10s',.1]])near(a[k],Math.min(cap,h.attributes[k]+g[k]*n));
  const source={heroes:[{hero_id:h.id,level,exp:123,owned:true,current_attribute:{hp:999999999,attack_speed:1.5}}]};
  const before=JSON.stringify(source),loaded=canonical(nk,source).find(x=>x.hero_id===h.id);
  near(loaded.current_attribute.hp,a.hp);near(loaded.current_attribute.attack_speed,a.attack_speed);assert.equal(loaded.level,level);assert.equal(loaded.exp,123);assert.equal(loaded.owned,true);assert.equal(JSON.stringify(source),before);
 }
 assert(stats.every(a=>a.move_speed<=stats[3].move_speed&&a.attack_speed<=stats[3].attack_speed));
 assert(stats.every(a=>a.def<=stats[2].def));
 if(level>1){
  assert(stats.every(a=>a.hp<=stats[4].hp));
  const proxy=a=>a.atk*(a.attack_speed/100)*(1+a.crit_rate*(a.crit_damage-1));
  assert(stats.every(a=>proxy(a)<=proxy(stats[1])));
 }
}
// Approved endpoint targets, allowing six-decimal authoring of growth factors.
const final=heroes.map(h=>calc(nk,h.id,70)),mean=k=>[0,2,4].reduce((sum,i)=>sum+final[i][k],0)/3;
const ratioNear=(actual,target)=>assert(Math.abs(actual-target)<.0001,`${actual} != ${target}`);
ratioNear(final[1].atk/mean('atk'),1.5);
// C268 v1.1 replaces the old 2x endpoint: all bases=100; only growth differs.
assert(heroes.every(h=>h.attributes.attack_speed===100));
ratioNear(final[3].attack_speed/mean('attack_speed'),(heroes[3].level_up_stats.attack_speed/heroes[0].level_up_stats.attack_speed)**69);
assert(final[3].attack_speed>final[1].attack_speed&&final[1].attack_speed>final[0].attack_speed);
ratioNear(final[1].hp/(heroes[1].attributes.hp*1.055**69),1.15);
ratioNear(final[3].hp/(heroes[3].attributes.hp*1.055**69),1.10);
near(final[1].crit_rate,.3477);near(final[3].crit_damage,2.628);
console.log('PASS C238 v1.1: actual backend Lv1/30/50/70, exact curves, H2/H4 non-SPD endpoint targets and C268 common-base SPD growth and stale-stat refresh without progress changes');
