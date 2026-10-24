from pathlib import Path
import json
root=Path(__file__).resolve().parents[2]
for name in ['server','client']:
 repo=root/name;p=repo/'docs/contracts/C197_HERO5_SKILL_REBALANCE.md';s=p.read_text(encoding='utf-8').replace('Version: 1.0.0','Version: 1.1.0');s+='''

## 1.1.0 Golden body and actual-hit marks (2026-10-24)
Skill4 phantom is fixed at cast origin, nonloop2s. Cleanse harmful debuffs
on cast; harmful-status immunity and full damage immunity both last first0.5s,
with no residual50% damage reduction for the remaining phantom lifetime.
Punch frames use hero_5_skill1_effect1. Damage40/40/50/55/60, count12/14/16/18/20,
interval0.2s, target radius700/730/760/790/820 from current hero position at
each emission. Punches originate at current hero position, not phantom.
Within a cast, first actual hit per target is full; subsequent actual hits50%.
Projectile optional hit_damage_resolver resolves this before damage, shared
cast ledger keyed by target instance and pool generation; no counter on launch.
On actual hit, a target-centred hero_5_skill4_effect2 mark follows the target.
Per-caster mark keeps total and consecutive counts. Pair gap<=0.5s continues
streak; gaps>0.5 break streak; gaps>1s reset both counts and visual. Three
consecutive hits within1s proc one0.5s holy stun per streak, no extra stun on
fourth/fifth hits. Each consecutive follow-up adds5% to base marker size.
Marker animation restarts on hit, nonloop, holds last frame, expires after1s
idle. Caster/target generation checks prevent pooled reuse/cross-caster leaks.
No legacy buddha_stack bonus damage or old map-coverage selection remains.
Skill4 cooldown unchanged; existing AtlasRegistry asset keys retained/reused.
New optional fields and Projectile callable have pooled resets. Existing RPCs,
server authority and C121 unchanged. Skill2 max-HP curve still awaits user input.

| Version | Date | Change |
|---|---|---|
| 1.1.0 | 2026-10-24 | Fixed phantom, half-second protection, current-hero punches and actual-hit consecutive marks. |
''';p.write_text(s,encoding='utf-8')
 p=repo/'docs/contracts/REGISTRY.json';d=json.loads(p.read_text(encoding='utf-8'));next(x for x in d['contracts'] if x['id']=='C197_HERO5_SKILL_REBALANCE')['version']='1.1.0';p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 p=repo/'docs/INDEX.md';p.write_text(p.read_text(encoding='utf-8')+'\nC197 v1.1.0: fixed golden phantom, 0.5s protection, actual-hit repeat damage and consecutive target marks.\n',encoding='utf-8')
p=root/'server/data/skills.json';a=json.loads(p.read_text(encoding='utf-8'));s=next(x for x in a if x['id']=='hero_5_skill_4');s['punch_vfx_frames']=[f'hero_5_skill1_effect1_{i}' for i in range(9)];s.pop('explosion_initial_scale_multiplier',None);s.pop('explosion_max_scale_multiplier',None)
for i,l in enumerate(s['levels']):
 st=l['stats']
 for key in ['map_coverage','stack_dmg_bonus','stun_after_hits']:st.pop(key,None)
 st.update(damage_pct=[40,40,50,55,60][i],protection_duration=0.5,punch_interval=0.2,target_radius=700+i*30,mark_pair_window=0.5,mark_stun_window=1,mark_reset_gap=1,mark_stun_hits=3,stun_duration=0.5)
 l['effects']=[];l['description_rows']=['Fixed golden phantom 2s; cleanse harmful debuffs','First 0.5s: harmful-status and damage immunity',f'{st["punch_count"]} punches x {st["damage_pct"]}% ATK, every 0.2s','First actual hit full; repeat target 50%',f'Target radius {st["target_radius"]}px from hero','3 consecutive hits within 1s: stun 0.5s; each follow-up mark +5% size',f'CD {st["cooldown"]:g}s']
p.write_text(json.dumps(a,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
