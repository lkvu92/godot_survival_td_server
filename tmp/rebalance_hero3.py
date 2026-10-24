from pathlib import Path
import json
root=Path(__file__).resolve().parents[2]
contract='''# C195 Hero 3 skill rebalance

Version: 1.0.0
Status: IN_PROGRESS

## Schema, interfaces and authority
Server skill seed JSON remains authoritative; existing seed/config RPCs remain.
Skill 1 uses projectile_speed=320 world px/s (replacing speed_pct scaling),
knockback distance35 and angle_step10 at every level. Other stats unchanged.
SkillValueService.get_projectile_speed prefers an explicitly configured
projectile_speed; other skills retain existing speed_pct behavior. Description
rendering shows fixed px/s where configured. No local gameplay fallback (C121).
Skill 2 cooldown 8/7.5/7/6.5/6 seconds.
Skill 3 sequence_count6/8/10/12/14; damage_pct12.5/15/17.5/20/25;
final_damage_pct100/130/140/150/160; cooldown12/11/10/9/8;
knockback40/45/50/55/60; sequence_interval0.1 seconds.
Skill 4 skill_2_cooldown_reduction0.15/0.20/0.25/0.30/0.35;
skill_3_crit_damage_bonus0.10/0.15/0.20/0.25/0.30;
move_speed_pct0/5/10/15/20 with a stat_percent move_speed passive effect
at the resolved level. Existing Player percentage replacement avoids stacking
the prior level; dodge flat increments remain unchanged. No unlock changes.
Existing visuals use AtlasRegistry and UiSkin; no new assets or signals.

## Changelog
| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-24 | Hero 3 four skill curves, fixed-speed blades and formation movement bonus. |
'''
for name in ['server','client']:
 repo=root/name;(repo/'docs/contracts/C195_HERO3_SKILL_REBALANCE.md').write_text(contract,encoding='utf-8')
 p=repo/'docs/contracts/REGISTRY.json';d=json.loads(p.read_text(encoding='utf-8'));d['contracts'].insert(0,dict(id='C195_HERO3_SKILL_REBALANCE',version='1.0.0',status='IN_PROGRESS',updated_at='2026-10-24',contract_file='docs/contracts/C195_HERO3_SKILL_REBALANCE.md'));p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 p=repo/'docs/INDEX.md';p.write_text(p.read_text(encoding='utf-8')+'\n- [C195 Hero 3 skill rebalance](contracts/C195_HERO3_SKILL_REBALANCE.md): fixed-speed fan, new cooldown/damage curves and formation movement.\n',encoding='utf-8')
p=root/'server/data/skills.json';a=json.loads(p.read_text(encoding='utf-8'));idx={s['id']:s for s in a}
for n in range(1,5):
 skill=idx[f'hero_3_skill_{n}']
 for i,l in enumerate(skill['levels']):
  s=l['stats']
  if n==1:
   s.pop('speed_pct');s.update(projectile_speed=320,angle_step=10);l['effects'][0]['distance']=35
   l['description_rows']=[f'Damage {s["damage_pct"]:g}% ATK',f'Blades {s["projectile_count"]}', 'Speed 320px/s; angle step 10 degrees','Knockback 35',f'CD {s["cooldown"]:g}s']
  elif n==2:
   s['cooldown']=[8,7.5,7,6.5,6][i];l['description_rows'][-1]=f'Radius {s["second_radius"]}; CD {s["cooldown"]:g}s'
  elif n==3:
   s.update(sequence_count=[6,8,10,12,14][i],damage_pct=[12.5,15,17.5,20,25][i],final_damage_pct=[100,130,140,150,160][i],cooldown=[12,11,10,9,8][i],sequence_interval=0.1);l['effects'][0]['distance']=[40,45,50,55,60][i]
   l['description_rows']=['Piercing arcs',f'{s["sequence_count"]}x {s["damage_pct"]:g}% ATK',f'Stronger final {s["final_damage_pct"]:g}% ATK',f'Knockback {l["effects"][0]["distance"]}; interval 0.1s',f'CD {s["cooldown"]}s']
  else:
   s.update(skill_2_cooldown_reduction=[0.15,0.2,0.25,0.3,0.35][i],skill_3_crit_damage_bonus=[0.1,0.15,0.2,0.25,0.3][i],move_speed_pct=i*5)
   l['passive_effects'].append(dict(type='stat_percent',stat='move_speed',value=i*0.05))
   l['description_rows']=[l['description_rows'][0],f'Hồi chiêu Skill 2 -{15+i*5}%',f'Sát thương chí mạng Skill 3 +{10+i*5}%',f'Tốc độ di chuyển +{i*5}%']
p.write_text(json.dumps(a,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
