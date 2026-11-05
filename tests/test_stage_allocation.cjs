const assert=require('node:assert/strict');
const {runtime}=require('../tools/enemy_catalog_db.cjs');
const c=runtime(),rates={metal:12.5,water:12.5,wood:12.5,fire:50,earth:12.5};
assert.equal(c.campaignRates(rates),true);assert.equal(c.campaignRates({...rates,fire:49}),false);assert.equal(c.campaignRates({...rates,fire:NaN}),false);assert.equal(c.campaignRates({...rates,extra:0}),false);
let checks=4;
for(let count=0;count<=300;count++){
 const allocated=Array.from(c.campaignAllocate(count,rates,c.campaignRandom(count))),again=Array.from(c.campaignAllocate(count,rates,c.campaignRandom(count)));
 assert.equal(allocated.length,count);assert.deepEqual(allocated,again);checks+=2;
 for(const e of ['metal','water','wood','fire','earth']){assert(Math.abs(allocated.filter(v=>v===e).length-count*rates[e]/100)<1);checks++;}
}
assert(Array.from(c.campaignAllocate(100,{metal:0,water:0,wood:0,fire:100,earth:0},c.campaignRandom(269))).every(e=>e==='fire'));checks++;
const framework={max_level:200,species:{creep:{visual_definition_id:'visual'},boss:{visual_definition_id:'visual',balance_profile:'element_boss'}},skill_atlas:{},loadout_templates:{}};
const rules=c.campaignDefaults();rules.element_rates=rates;rules.campaign_arc_order=1;rules.progression={start_wave:2,every:2,level_step:2,max_bonus:4};
const doc={id:'stage_fixture',arc_id:'arc_fixture',display_name:'Fixture',stage_rules:rules,waves:[{id:'wave_1',display_name:'Wave',entries:[{id:'creep_1',species_id:'creep',count:16,level:1,exp:2,interval:1,start_delay:0,boss:false,skills:[]},{id:'boss_1',species_id:'boss',count:1,level:1,exp:3,interval:1,start_delay:0,boss:true,elements:['fire'],skills:[]}]}]};
assert.deepEqual(Array.from(c.campaignValidate(doc,framework)),[]);checks++;
const plan=c.campaignResolve(doc,framework,'normal',269,'version');assert.equal(plan.total_count,17);assert.equal(plan.total_exp,35);assert.deepEqual(Array.from(plan.stage.waves[0].entries[1].resolved_elements[0]),['fire']);checks+=3;
const bad=structuredClone(doc);bad.waves[0].entries[1].elements=['fire','water'];assert(c.campaignValidate(bad,framework).length>0);checks++;
assert.equal(c.campaignBonus(rules,1),0);assert.equal(c.campaignBonus(rules,2),2);assert.equal(c.campaignBonus(rules,3),2);assert.equal(c.campaignBonus(rules,4),4);assert.equal(c.campaignBonus(rules,10),4);checks+=5;
console.log(JSON.stringify({status:'PASS',suite:'C269 pure allocation and stage validation',checks}));
