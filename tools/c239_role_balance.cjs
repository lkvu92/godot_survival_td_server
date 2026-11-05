/* Authored balance values are independent from the mutable hero catalog. */
const fs=require('node:fs'),path=require('node:path');
const baseline=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/c239_role_baselines.json'),'utf8').replace(/^\uFEFF/,''));
const damage=new Set(['a1_flame_imp','a2_snow_skeleton','a3_spore_crawler','a4_steam_automaton','a6_frost_lancer','a7_arc7_huyet_man_cuong_su','a7_arc7_huyen_lan_long_bao']);
const arcs={arc_2:[[1,10],[1,10]],arc_frozen_realm:[[10,20],[10,20]],arc_verdant_realm:[[20,30],[15,30]],arc_iron_bastion:[[30,40],[25,40]],arc_titan_realm:[[40,50],[35,50]],arc_ngu_to_quy_khu:[[50,60],[45,60]],arc_van_yeu_co_linh:[[55,65],[55,65]]};
function lerp(range,i){return Math.round(range[0]+(range[1]-range[0])*i/9);}
function apply(migration){
 for(const [id,s] of Object.entries(migration.species)){
  if(s.role==='boss'){s.balance_profile='element_boss';continue;}
  const role=damage.has(id)?'damage':s.role==='tank'?'tank':s.role==='ranger'?'ranger':s.role==='fast'?'runner':'medium';
  const base=baseline.roles[role];if(!base)throw Error('Missing role '+id);
  s.role=role;Object.assign(s.base_attributes,base);
  for(const stat of ['hp','atk','def'])s.growth_per_level[stat]=Number((base[stat]*0.8).toFixed(6));
  s.growth_per_level.attack_speed=0;s.growth_per_level.move_speed=0;
 }
 const range=arcs[migration.arc_id];if(!range)throw Error('Unknown arc '+migration.arc_id);
 for(const stage of migration.stages){
  const i=(Number(stage.level)-1)%10;if(!Number.isInteger(i)||i<0||i>9)throw Error('Invalid stage order '+stage.id);
  stage.level=lerp(range[0],i);stage.stage_rules.required_user_level=lerp(range[1],i);
  const speciesList=[...new Set(stage.waves.flatMap(w=>w.entries.filter(e=>!e.boss).map(e=>e.species_id)))].sort();
  for(const [wi,wave] of stage.waves.entries()){
   const countMap={14:1,15:2,16:2,17:3,18:4};
   const targetCount=countMap[wi]??(wi>=19?speciesList.length:0);
   const count=Math.min(targetCount,speciesList.length);
   const offset=speciesList.length?(i+wi)%speciesList.length:0;
   const elevated=new Set();
   for(let k=0;k<count;k++)elevated.add(speciesList[(offset+k)%speciesList.length]);
   for(const e of wave.entries){
    const isElevated=(wi>=14&&e.boss)||elevated.has(e.species_id);
    const level=stage.level+(isElevated?1:0);
    e.level=level;
    e.difficulty_overrides.epic.level=level+1;
    e.difficulty_overrides.legend.level=level+2;
   }
  }
 }
 return migration;
}
module.exports={baseline,apply};
