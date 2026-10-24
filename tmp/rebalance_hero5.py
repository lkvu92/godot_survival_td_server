from pathlib import Path
import json
root=Path(__file__).resolve().parents[2]
contract='''# C197 Hero 5 three-layer skill rebalance

Version: 1.0.0
Status: IN_PROGRESS

## Schema and authority
Server skill seed supplies existing/new optional stats through existing config
RPCs; authenticated snapshot required (C121), no local gameplay JSON fallback.
Skill1 direct damage60/75/85/100/120 percent ATK, plus separate explosion
25/30/35/40/45 percent ATK; radius45/50/60/70/80; knockback30/35/40/45/50;
fan step10deg; range700/720/740/760/780. Remove old hardcoded 50/50 split.
Skill2 formation lasts2s nonloop, plays once then holds final frame. Initial
AOE70/85/100/115/130 ATK percent. Runes start at1s, loop for1.5s, three
ticks at1.5/2/2.5s, each25/30/35/40/45 ATK percent plus max-HP percent.
Five max-HP percentage levels require user clarification (four supplied).
Cooldown6.5/6/5.5/5/4.5; radius80/90/100/120/140; range720/740/760/780/800;
each damaging hit rolls35% holy_stun for0.1/0.125/0.15/0.175/0.2s.
Skill3 cooldown11/10/9/8/7; palm impact after0.35s, nonloop. Impact radius
70/75/80/85/90 and matching hand sprite scale; damage100/110/120/130/140.
Crack starts on impact, lasts1s nonloop, burns0.5/0.6/0.7/0.8/1 percent
max HP over1s in its area (two half-second pulses, affected targets rechecked).
No former 35% ATK crack hit or guaranteed stun. Propagating rings start on
impact and every0.2s, count1/2/2/3/3, same max radius100/110/120/130/140
for each ring. Each ring deals30/40/50/60/70 percent ATK once per target,
20% holy_stun0.1/0.15/0.2/0.25/0.3s. No fixed-radius instant wave damage
or max-HP wave damage. Existing expanding-ring hit ledger/collision retained.
Skill4 unchanged. Existing target snapshot fixes each cast center. AtlasRegistry
already maps all requested asset paths; UiSkin unchanged. Reusable SkillVfx
supports hold_last_frame without fading, resets that flag on pooled acquisition.

## Changelog
| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-24 | Separate finger explosion; delayed rune pulses; palm impact, crack burn and propagating ATK rings. |
'''
for name in ['server','client']:
 repo=root/name;(repo/'docs/contracts/C197_HERO5_SKILL_REBALANCE.md').write_text(contract,encoding='utf-8')
 p=repo/'docs/contracts/REGISTRY.json';d=json.loads(p.read_text(encoding='utf-8'));d['contracts'].insert(0,dict(id='C197_HERO5_SKILL_REBALANCE',version='1.0.0',status='IN_PROGRESS',updated_at='2026-10-24',contract_file='docs/contracts/C197_HERO5_SKILL_REBALANCE.md'));p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 p=repo/'docs/INDEX.md';p.write_text(p.read_text(encoding='utf-8')+'\n- [C197 Hero 5 rebalance](contracts/C197_HERO5_SKILL_REBALANCE.md): finger explosion, delayed runes, palm/crack/propagating waves.\n',encoding='utf-8')
p=root/'server/data/skills.json';a=json.loads(p.read_text(encoding='utf-8'));idx={s['id']:s for s in a}
for i,l in enumerate(idx['hero_5_skill_1']['levels']):
 s=l['stats'];s.update(damage_pct=[60,75,85,100,120][i],explosion_damage_pct=25+i*5,aoe_radius=[45,50,60,70,80][i],knockback_distance=30+i*5,fan_angle=10,range=700+i*20);l['effects'][0]['distance']=30+i*5
 l['description_rows']=[f'Direct {s["damage_pct"]}% ATK',f'Explosion {s["explosion_damage_pct"]}% ATK; radius {s["aoe_radius"]}px',f'Knockback {s["knockback_distance"]}px; fan step 10 degrees',f'CD {s["cooldown"]:g}s']
for i,l in enumerate(idx['hero_5_skill_2']['levels']):
 s=l['stats'];s.pop('burn_hp_percent',None);s.pop('burn_duration',None);s.update(damage_pct=70+i*15,cooldown=6.5-i*0.5,radius=[80,90,100,120,140][i],range=720+i*20,stun_duration=0.1+i*0.025,stun_chance=0.35,formation_duration=2,formation_animation_duration=1,rune_delay=1,rune_duration=1.5,rune_tick_interval=0.5,rune_damage_pct=25+i*5,vfx_scale=round([80,90,100,120,140][i]*0.45/70,5));s['stun_duration']=round(s['stun_duration'],3)
 l['effects']=[dict(id='holy_stun',chance=0.35,duration=s['stun_duration'])]
 l['description_rows']=[f'Formation {s["damage_pct"]}% ATK; lasts 2s',f'Runes after 1s: {s["rune_damage_pct"]}% ATK plus max-HP damage per tick','Runes loop 1.5s; damage every 0.5s',f'35% stun {s["stun_duration"]:g}s',f'Radius {s["radius"]}px; CD {s["cooldown"]:g}s']
for i,l in enumerate(idx['hero_5_skill_3']['levels']):
 s=l['stats'];s.pop('wave_hp_percent',None);s.update(damage_pct=100+i*10,cooldown=11-i,radius=70+i*5,impact_delay=0.35,vfx_scale=round((70+i*5)*0.385/100,5),crack_duration=1,crack_burn_hp_percent=[0.005,0.006,0.007,0.008,0.01][i],crack_tick_interval=0.5,wave_radius=100+i*10,wave_damage_pct=30+i*10,wave_stun_chance=0.2,stun_duration=[0.1,0.15,0.2,0.25,0.3][i],wave_count=[1,2,2,3,3][i],wave_interval=0.2)
 l['effects']=[];l['description_rows']=[f'Palm {s["damage_pct"]}% ATK; radius {s["radius"]}px',f'Crack burns {s["crack_burn_hp_percent"]*100:g}% max HP over 1s',f'{s["wave_count"]} waves x {s["wave_damage_pct"]}% ATK; radius {s["wave_radius"]}px',f'Waves 0.2s apart; 20% stun {s["stun_duration"]:g}s',f'CD {s["cooldown"]}s']
p.write_text(json.dumps(a,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
