from pathlib import Path
import json
server=Path(__file__).resolve().parents[1]
p=server/'data/vip_config.json';data=json.loads(p.read_text(encoding='utf-8'))
data['version']=2;data['reward_bonus_per_level']=0.1
elements=['metal','water','wood','fire','earth']
def item(id,n):return {'type':'item','id':id,'amount':n}
def runes(tier,n):
    prefix='rune' if tier=='high' else 'stone'
    return {'type':'random_items','pool':[f'{prefix}_{e}_{tier}' for e in elements],'amount':n,'label':{'low':'Rune hạ phẩm ngẫu nhiên','medium':'Rune trung phẩm ngẫu nhiên','high':'Rune thượng phẩm ngẫu nhiên'}[tier]}
def fruits(n):return {'type':'random_items','pool':[f'{e}_aptitude_fruit' for e in elements],'amount':n,'label':'Linh quả ngũ hành ngẫu nhiên'}
gifts=[]
heals=[10,10,15,20,25,30,30,35,35];energy=[3,5,8,11,14,17,20,23,23];tickets=[30,60,100,150,150,150,150,150,150]
for lv in range(1,10):
    rewards=[item('healing_elixir',heals[lv-1])]
    if lv==1:rewards.append(item('shield_elixir',10))
    rewards.append(item('energy_elixir',energy[lv-1]))
    if lv>=2:rewards.append(item('exp_boost_card_10' if lv<=3 else 'exp_boost_card_25',2))
    if lv>=3:rewards.append(runes('low' if lv<=5 else 'medium' if lv<=7 else 'high',{3:50,4:100,5:150,6:50,7:100,8:50,9:100}[lv]))
    rewards.append(item('campaign_sweep_ticket',tickets[lv-1]))
    if lv>=5:rewards.append(item('element_enlightenment_charm',2))
    if lv>=6:rewards.append(item('talisman_enhance_charm',2))
    if lv>=7:rewards.append(fruits(1 if lv==7 else 3))
    if lv==9:rewards.append(item('spirit_root_reset',2))
    gifts.append({'level':lv,'rewards':rewards})
data['milestone_rewards']=gifts
items={x['id'] for x in json.loads((server/'data/items.json').read_text(encoding='utf-8'))}
for gift in gifts:
    for r in gift['rewards']:
        assert all(id in items for id in ([r['id']] if r['type']=='item' else r['pool']))
p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
p=server/'docs/contracts/REGISTRY.json';s=p.read_text(encoding='utf-8').replace('"contracts": [','"contracts": [\n    {"id":"C224_VIP_BENEFITS_MILESTONES","version":"1.0.0","status":"IN_PROGRESS","updated_at":"2026-10-26","contract_file":"docs/contracts/C224_VIP_BENEFITS_MILESTONES.md"},',1);p.write_text(s,encoding='utf-8')
p=server/'docs/INDEX.md';p.write_text(p.read_text(encoding='utf-8')+'\n- [C224 VIP benefits and milestone mail](contracts/C224_VIP_BENEFITS_MILESTONES.md): +10% per VIP, one-time gifts1–9 and Home preview.\n',encoding='utf-8')
print('Configured VIP bonuses and9 validated gift milestones')
