const fs=require('fs'),path=require('path'),assert=require('assert');
const {curves,poison,maskedHash}=require('../tools/hero_skill_damage_curves.cjs');
const skills=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/skills.json'),'utf8'));
const index=Object.fromEntries(skills.map(s=>[s.id,s]));
assert.equal(maskedHash(skills),'590129a831be3dda7cb1ccc2839f112c33b3342f8f8e22738596f6ac126a9429','Unrelated skills/stats/mechanics must be byte-value equivalent');
let components=0;
for(const [id,fields] of Object.entries(curves)){
  const skill=index[id];assert(skill&&skill.levels.length===5);
  for(const [key,old] of Object.entries(fields)){
    components++;
    for(let i=0;i<5;i++){
      const actual=skill.levels[i].stats[key];
      const expected=Math.round((old[0]+0.3*old[i])*10000)/10000;
      assert.equal(actual,expected,`${id} ${key} Lv${i+1}`);
      if(i>0)assert(actual>=skill.levels[i-1].stats[key]);
    }
    if(old[0]>0){
      assert(Math.abs(skill.levels[0].stats[key]/old[0]-1.3)<1e-9);
      assert(skill.levels[4].stats[key]<old[4],id+' end coefficient must decrease');
      assert(Math.abs((skill.levels[4].stats[key]-skill.levels[0].stats[key])/(old[4]-old[0])-0.3)<1e-9);
    }
  }
  for(const level of skill.levels){
    const text=level.description_rows.join('\n');
    const key=id==='hero_2_skill_3'?'burn_total_damage_pct':'damage_pct';
    assert(text.includes(String(level.stats[key])),id+' description must expose the new damage');
  }
}
for(const [id,old] of Object.entries(poison)){
  for(let i=0;i<5;i++){
    const level=index[id].levels[i],effect=level.effects.find(e=>e.id==='poison');
    assert.equal(effect.dps_pct,Math.round((old[0]+old[i]*0.3)*10000)/10000);
    assert(level.description_rows.join('\n').includes('Poison '+effect.dps_pct+'% ATK/s'));
  }
}
assert.deepEqual(index.hero_1_skill_1.levels.map(l=>l.stats.damage_pct),[97.5,103.5,111,120,130.5]);
assert.deepEqual(index.hero_5_skill_1.levels.map(l=>l.stats.damage_pct),[84.5,89.6,94.4,99.2,104]);
console.log(`PASS hero damage balance: ${Object.keys(curves).length} skills, ${components} ATK curves, two DOT curves; +30% Lv1, 30% old growth, matching descriptions and unchanged excluded mechanics/catalog`);
