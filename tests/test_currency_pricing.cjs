const fs=require('fs'),path=require('path'),assert=require('assert');
const read=name=>JSON.parse(fs.readFileSync(path.join(__dirname,'../data',name+'.json'),'utf8'));
const offers=read('progression').talisman_system.store.materials;
const groups=new Map();
for(const row of offers.filter(r=>r.enabled!==false)){
 if(!groups.has(row.item_id))groups.set(row.item_id,{});
 groups.get(row.item_id)[row.currency]=row.price/row.quantity;
}
for(const [id,p] of groups)if(p.gold&&p.gems){
 const ratio=offers.some(r=>r.item_id===id&&r.category==='boost_cards')?500:250; // C182 shop cards use their documented 500:1 ratio.
 assert.equal(p.gold,p.gems*ratio,id+' '+ratio+':1');
}
assert.deepEqual(groups.get('energy_elixir'),{gems:40,gold:10000});
const heroes=read('heroes');
for(const id of ['hero_3','hero_4']){const h=heroes.find(h=>h.id===id);assert.equal(h.price.gold,h.price.gems*250);}
const packs=Object.values(read('packs').packs_by_tab).flat();
const p=id=>packs.find(p=>p.id===id);
assert.equal(p('gem_sack').rewards.filter(r=>r.metadata?.condition!=='first_purchase').reduce((s,r)=>s+r.quantity,0),2000);
assert.equal(p('gem_sack').rewards.reduce((s,r)=>s+r.quantity,0),4000);
assert.equal(p('gem_chest').rewards.reduce((s,r)=>s+r.quantity,0),10000);
assert.equal(p('gold_vault').rewards[0].quantity,2500000);
const exactDaily={
 daily_deal:[['campaign_sweep_ticket',5],['gems',50],['gold',25000],['stamina',15]],
 flash_sale:[['talisman_enhance_charm',1],['element_enlightenment_charm',1],['exp_boost_card_10',1],['gems',100],['gold',50000],['stamina',30],['campaign_sweep_ticket',10]]
};
for(const [id,expected] of Object.entries(exactDaily)){
 const pack=p(id);
 assert.deepEqual(pack.rewards.map(r=>[r.reward_id,r.quantity]),expected,id+' must match exact requested list without extras');
 assert.equal(pack.duration_days,30);
 assert.equal(pack.pricing_version,250002);
 assert(pack.rewards.every(r=>r.metadata.pricing_version===250002&&r.metadata.daily_pack_days===30));
}
assert.equal(p('gold_vault').pricing_version,250002);
assert.equal(p('gold_vault').rewards[0].metadata.pricing_version,250002);
console.log('PASS C173 pricing: dual-currency ratios, stamina, hero prices, first-purchase bonus and exact user-approved daily bundles and 2.5M Gold Vault');
