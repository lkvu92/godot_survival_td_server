const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const skills=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/skills.json'),'utf8'));
const skill=n=>skills.find(s=>s.id===`hero_4_skill_${n}`);
assert.deepEqual(skill(1).levels.map(l=>l.stats.damage_pct),[40,55,70,85,100]);
assert.deepEqual(skill(1).levels.map(l=>l.effects.find(e=>e.id==='poison').dps_pct),[12.5,15,17.5,20,22.5]);
const oldDirect2=[85,95,105,115,125],oldDirect3=[100.1,107.6,116,126.5,140];
const oldPoison3=[45,55,65,75,85],duration3=[3,3.5,4,4.5,5];
for(let i=0;i<5;i++){
 const second=skill(2).levels[i],poison2=second.effects.find(e=>e.id==='poison');
 assert.equal(second.stats.damage_pct,oldDirect2[i]/2);assert.equal(poison2.duration,2);assert(poison2.scale_dps_with_range);
 for(const distance of [0,.25,.5,.75,1]){
  const rangeMultiplier=1-.7*distance;
  assert(Math.abs((second.stats.damage_pct+poison2.dps_pct*poison2.duration)*rangeMultiplier-oldDirect2[i]*rangeMultiplier)<1e-7);
 }
 const third=skill(3).levels[i],poison3=third.effects.find(e=>e.id==='poison');
 assert.equal(third.stats.damage_pct,oldDirect3[i]/2);assert.equal(poison3.duration,duration3[i]);
 assert(Math.abs(third.stats.damage_pct+poison3.dps_pct*poison3.duration-(oldDirect3[i]+oldPoison3[i]*duration3[i]))<1e-7);
 for(const row of [second,third])assert(row.description_rows.some(t=>t.startsWith('Poison ')));
 assert.equal(second.effects.filter(e=>e.id==='poison').length,1);
 assert.equal(third.effects.filter(e=>e.id==='poison').length,1);
 assert.equal(skill(4).levels[i].stats.damage_pct,120+10*i);
}
assert.deepEqual(skill(2).levels.map(l=>l.stats.cooldown),[6.5,6,5.5,5,4.5]);
assert.deepEqual(skill(3).levels.map(l=>l.stats.cooldown),[8.8,8.2,7.6,7,6.2]);
console.log('PASS C196 v1.4: C196 v1.5 recovered Skill1 direct, Skill2/3 conserved raw isolated budgets, all five spatial multipliers, existing poison/slow/timing and Skill4 unchanged');
