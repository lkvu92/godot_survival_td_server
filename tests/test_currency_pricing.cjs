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
assert.equal(p('gold_vault').rewards[0].quantity,1000000);
const unit={gems:1,gold:1/250,stamina:2,campaign_sweep_ticket:20,talisman_enhance_charm:80,element_enlightenment_charm:80};
for(const [id,value] of [['daily_deal',1000],['flash_sale',2860]]){
 const pack=p(id);
 // C182 adds event-only premium cards without a direct shop valuation.
 const priced=pack.rewards.filter(r=>r.metadata?.event_pack!=='boost');
 const total=priced.reduce((sum,r)=>sum+r.quantity*unit[r.reward_id]*(r.metadata?.daily_pack_days===30?30:1),0);
 assert.equal(total,value,id+' total catalog valuation');
 assert(pack.rewards.some(r=>!r.metadata?.daily_pack_days),'instant bonus exists');
 assert.equal(pack.duration_days,30);
 assert(pack.rewards.every(r=>r.metadata.pricing_version===pack.pricing_version));
}
console.log('PASS C173 pricing: dual-currency ratios, stamina, hero prices, first-purchase bonus and full 30-day pack valuations');
