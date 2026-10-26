from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
p=root/'data/vip_config.json';c=json.loads(p.read_text(encoding='utf-8'));c['version']=3
c['milestone_rewards']=c['milestone_rewards'][:9]
for m in c['milestone_rewards']:
    if m['level']>=8: next(r for r in m['rewards'] if r.get('id')=='exp_boost_card_25')['amount']=3
pool=['talisman_fragment_'+str(t['id']) for t in json.loads((root/'data/talismans.json').read_text(encoding='utf-8')) if t['quality']=='mid']
assert len(pool)==10
base=c['milestone_rewards'][-1]['rewards']
for lv,heal,energy,cards,charms,frag,fruits,resets in [(10,35,23,3,2,50,3,2),(11,40,26,4,8,70,3,3),(12,45,30,4,10,100,5,4)]:
    rewards=json.loads(json.dumps(base))
    amounts={'healing_elixir':heal,'energy_elixir':energy,'exp_boost_card_25':cards,'element_enlightenment_charm':charms,'talisman_enhance_charm':charms,'spirit_root_reset':resets}
    for r in rewards:
        if r.get('id') in amounts:r['amount']=amounts[r['id']]
        if r['type']=='random_items' and r['pool'][0].endswith('_aptitude_fruit'):r['amount']=fruits
    rewards.append({'type':'random_item_bundle','amount':frag,'pool':pool,'label':'Mảnh pháp bảo trung cấp ngẫu nhiên (một loại)'})
    c['milestone_rewards'].append({'level':lv,'rewards':rewards})
p.write_text(json.dumps(c,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
p=root/'docs/contracts/C224_VIP_BENEFITS_MILESTONES.md';s=p.read_text(encoding='utf-8').replace('Version: 1.0.0','Version: 1.1.0',1).replace('levels1–9','levels1–12').replace('only gift milestones1–9 are defined','gift milestones1–12 are defined').replace('VIP1–9','VIP1–12')
s+='\n## Revision1.1.0 — VIP10–12\n\nVIP8–10 grant3 EXP25% cards; VIP11–12 grant4. Add all user-specified gifts for milestones10/11/12. New random_item_bundle selects one of the ten mid-quality talisman fragment IDs16–25 and grants the entire50/70/100 bundle of that type. Random rune/fruit units still roll independently. VIP12 has5 fruits and4 reset fruits. Stable milestone source IDs preserve one-time delivery.\n\n| Version | Date | Change |\n|---|---|---|\n| 1.1.0 | 2026-10-26 | Extend gifts/UI to VIP12; correct VIP8/9 cards and add single-type fragment bundles. |\n'
p.write_text(s,encoding='utf-8')
p=root/'docs/contracts/REGISTRY.json';s=p.read_text(encoding='utf-8').replace('"id":"C224_VIP_BENEFITS_MILESTONES","version":"1.0.0"','"id":"C224_VIP_BENEFITS_MILESTONES","version":"1.1.0"');p.write_text(s,encoding='utf-8')
p=root/'tmp/VipRewardsDialog.gd';s=p.read_text(encoding='utf-8').replace('!= 9','!= 12').replace('(),1,9)','(),1,12)').replace('str(reward.type) == "random_items"','str(reward.type) != "item"');p.write_text(s,encoding='utf-8')
p=root/'tmp/install_vip_rewards_ui.py';s=p.read_text(encoding='utf-8').replace('"version":"1.0.0"','"version":"1.1.0"');p.write_text(s,encoding='utf-8')
print('VIP1–12 configured, fragment pool16–25')
