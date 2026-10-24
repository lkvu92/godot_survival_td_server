from pathlib import Path
import json,copy,hashlib
root=Path(__file__).resolve().parents[2]
contract='''# C194 Arc 5 four-creep roster

Version: 1.0.0
Status: IN_PROGRESS

## Schema and authority
Arc 5 (arc_titan_realm) regular roster is granite_colossus, sand_stalker,
seismic_shaman, amber_spirit. primordial_wraith remains in the enemy catalog
for its separate boss/admin content; it must not spawn in Arc 5 campaign waves.
Existing enemy JSON schema and seed RPCs remain. New amber_spirit row reuses
the former grunt's HP400/ATK42/DEF18, move58, attack speed0.8, crit8%/1.8,
reward EXP/gold120, resistance duration multiplier0.5 and collision radius20.
It uses ranged earth_orb (range340, projectile speed360): 100% ATK, 65px AOE,
0.5s snapshot detonation, 20% paralysis0.2s, as specified by C169 for Amber.
It has no boss skills. No increase to grunt HP, ATK or reward budgets.

## Interfaces and presentation
Replace only 303 enemy_id references in all ten Arc 5 stages. All counts,
intervals, start delays, modifiers, EXP weights, boss entries and other arcs
remain identical. Shared waves apply to normal/epic/legend. Grunt role maps
to amber_spirit; rusher unlock wave4 and tanker wave7 remain.
WaveManager allowlist uses the four regular creeps. Old remote wraith entries
map specifically to Amber (including resumed saved enemies) instead of a random
role. New authoritative seed must still be published; no local gameplay JSON.
AtlasRegistry registers existing Amber avatar and five 3x3/nine-frame sheets;
run uses authored earth_monster_01_run.png. UiSkin/signals unchanged.
C121 missing config/disconnection still blocks gameplay and mutations.

## Acceptance
Compare canonical stages before/after with only Arc 5 ID substitutions masked;
verify preserved stats, counts, wave timing, EXP and boss entries. Check all
four creep animation states via AtlasRegistry and actual Enemy animation.
Full static checks client/server and Godot parser required. No deployment.

## Changelog
| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-24 | Replace Arc 5 wraith grunt with authored Amber Spirit; preserve wave budgets and add complete asset registration. |
'''
for name in ['server','client']:
 repo=root/name; (repo/'docs/contracts/C194_ARC5_CREEP_ROSTER.md').write_text(contract,encoding='utf-8')
 p=repo/'docs/contracts/REGISTRY.json'; d=json.loads(p.read_text(encoding='utf-8')); d['contracts'].insert(0,dict(id='C194_ARC5_CREEP_ROSTER',version='1.0.0',status='IN_PROGRESS',updated_at='2026-10-24',contract_file='docs/contracts/C194_ARC5_CREEP_ROSTER.md')); p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 p=repo/'docs/INDEX.md'; p.write_text(p.read_text(encoding='utf-8')+'\n- [C194 Arc 5 creep roster](contracts/C194_ARC5_CREEP_ROSTER.md): four authored creeps, Amber replaces campaign wraith.\n',encoding='utf-8')
p=root/'server/data/enemies.json'; a=json.loads(p.read_text(encoding='utf-8')); old=next(e for e in a if e['id']=='primordial_wraith'); amber=copy.deepcopy(old); amber.update(id='amber_spirit',display_name='Linh Thể Hổ Phách',attack_type='ranged',skills=['ranged_bolt']); amber.pop('boss_skills',None); amber['attributes'].update(attack_range=340,projectile_speed=360); amber['generic_skills'][0]['display_name']='Hổ Phách Hộ Thể'; amber['attack_skill']=copy.deepcopy(next(e for e in a if e['id']=='seismic_shaman')['attack_skill']); a.insert(a.index(old),amber); p.write_text(json.dumps(a,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
p=root/'server/data/stages.json'; stages=json.loads(p.read_text(encoding='utf-8')); before=copy.deepcopy(stages); count=0
for s in stages:
 if s['arc_id']=='arc_titan_realm':
  for w in s['waves']:
   for e in w['entries']:
    if e['enemy_id']=='primordial_wraith':e['enemy_id']='amber_spirit';count+=1
assert count==303
normalized=copy.deepcopy(stages)
for s in normalized:
 if s['arc_id']=='arc_titan_realm':
  for w in s['waves']:
   for e in w['entries']:
    if e['enemy_id']=='amber_spirit':e['enemy_id']='primordial_wraith'
assert normalized==before,'Only intended enemy IDs may change'
p.write_text(json.dumps(stages,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
for file in ['tools/campaign_wave_roles.cjs','tests/test_campaign_wave_roles.cjs']:
 p=root/'server'/file;p.write_text(p.read_text(encoding='utf-8').replace("grunt: 'primordial_wraith'","grunt: 'amber_spirit'"),encoding='utf-8')
p=root/'client/data/atlas_registry.json';d=json.loads(p.read_text(encoding='utf-8'));d['spritesheet_sources']['amber_spirit']={state:dict(path='res://assets/creep/arc5/'+('earth_monster_01_run.png' if state=='run' else 'amber_spirit_'+state+'.png'),columns=3,rows=3,frame_count=9) for state in ['idle','run','attack','hit','die']};p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('PASS 303 ID-only substitutions; wave counts, timing, modifiers, rewards and other arcs preserved')
