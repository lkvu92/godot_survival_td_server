from pathlib import Path
import json
root=Path(__file__).resolve().parents[2]
contract='''# C196 Hero 4 poison skill rebalance

Version: 1.0.0
Status: IN_PROGRESS

## Schema and server authority
Skill seed JSON is authoritative, no RPC changes or local fallback (C121).
Skill1: damage40/45/50/55/60, poison DPS percent25/30/35/40/45 for2s,
cooldown2.4/2.2/2/1.8/1.6, range680/700/720/740/760, count1/2/2/3/3.
Skill2: damage85/95/105/115/125, cooldown6.5/6/5.5/5/4.5,
range700/720/740/760/780, slow15/17.5/20/22.5/25 percent.
Skill3: poison DPS percent45/55/65/75/85 for3/3.5/4/4.5/5s,
radius85/95/105/115/125, trigger125/145/165/185/205,
slow10/15/20/25/30 percent, range725/750/775/800/825,
lifetime12.5/15/17.5/20/25s, max_traps3/4/5/6/9 per caster.
At cap retire oldest live armed trap without detonating; ignore expired or
exploded traps. Explosion artwork scales 1.3 times prior size, loops for1.5s;
damage/status apply once, not once per VFX loop. Other trap stats unchanged.
Skill4: total vortex damage120/130/140/150/160; needle damage25/27.5/30/35/40;
needles4/5/6/7/8; radius80/85/90/95/100; needle range250/275/300/325/350.
Vortex lasts2.5s, five equal damage ticks at0/0.5/1/1.5/2s. Each tick rolls
20% stun0.1s independently per enemy. Artwork loops and spins400 degrees/s.
Needles begin0.5s, random angles0.1s apart. Replace HP-percent poison stack:
each hit adds snapshot hero ATK*0.05 to existing poison DPS and adds0.5s to
remaining poison duration, starting at0.5s when none exists. Combined poison
DPS caps at5000 while active; ordinary poison refresh cannot exceed the cap.
Existing regular poison uses max potency/refresh; additive fields affect only
these needles. Poison expiry and pooled reset clear cap and source state.
Status ID remains poison, carrying additive_dps/duration_extension/dps_cap;
display duration follows accumulated timer. Existing sprites via AtlasRegistry,
UiSkin unchanged. New stats are optional for older compatible snapshots.

## Validation
Explicit curves, owner-specific trap cap/expiry, one-shot explosion damage,
loop/spin lifetime, five-tick damage budget and stun distribution, random needle
timing, additive poison synergy/cap/duration/expiry/pool reset must be tested.

## Changelog
| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-24 | Four skill curves, trap cap/VFX and five-tick spinning vortex with additive ATK poison. |
'''
for name in ['server','client']:
 repo=root/name;(repo/'docs/contracts/C196_HERO4_SKILL_REBALANCE.md').write_text(contract,encoding='utf-8')
 p=repo/'docs/contracts/REGISTRY.json';d=json.loads(p.read_text(encoding='utf-8'));d['contracts'].insert(0,dict(id='C196_HERO4_SKILL_REBALANCE',version='1.0.0',status='IN_PROGRESS',updated_at='2026-10-24',contract_file='docs/contracts/C196_HERO4_SKILL_REBALANCE.md'));p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 p=repo/'docs/INDEX.md';p.write_text(p.read_text(encoding='utf-8')+'\n- [C196 Hero 4 rebalance](contracts/C196_HERO4_SKILL_REBALANCE.md): skill curves, capped traps and additive-ATK poison vortex.\n',encoding='utf-8')
p=root/'server/data/skills.json';a=json.loads(p.read_text(encoding='utf-8'));idx={s['id']:s for s in a}
for n in range(1,5):
 sk=idx[f'hero_4_skill_{n}']
 for i,l in enumerate(sk['levels']):
  s=l['stats']
  if n==1:
   s.update(damage_pct=40+i*5,cooldown=[2.4,2.2,2,1.8,1.6][i],range=680+i*20,projectile_count=[1,2,2,3,3][i]);l['effects'][0].update(duration=2,dps_pct=25+i*5)
   l['description_rows']=['Single target',f'Damage {s["damage_pct"]}% ATK',f'Poison {25+i*5}% ATK/s for 2s',f'Darts {s["projectile_count"]}',f'CD {s["cooldown"]:g}s']
  elif n==2:
   s.update(damage_pct=85+i*10,cooldown=[6.5,6,5.5,5,4.5][i],range=700+i*20);l['effects'][0]['slow_percent']=[0.15,0.175,0.2,0.225,0.25][i]
   l['description_rows']=['Piercing return',f'Damage {s["damage_pct"]}% ATK',f'Slow {15+i*2.5:g}%',f'Glaives {s["projectile_count"]}',f'CD {s["cooldown"]:g}s']
   sk['description']='Piercing boomerang glaives fly out and return; each level adds one glaive with a 10 degree fan step.'
  elif n==3:
   s.update(radius=85+i*10,trigger_radius=125+i*20,range=725+i*25,trap_lifetime=[12.5,15,17.5,20,25][i],max_traps=[3,4,5,6,9][i],explosion_duration=1.5,explosion_loop=True,explosion_vfx_scale=round(s['explosion_vfx_scale']*1.3,4))
   l['effects'][0].update(duration=3+i*0.5,dps_pct=45+i*10);l['effects'][1]['slow_percent']=[0.1,0.15,0.2,0.25,0.3][i]
   l['description_rows']=['Trap burst',f'Damage {s["damage_pct"]:g}% ATK',f'Poison {45+i*10}% ATK/s for {3+i*0.5:g}s',f'Slow {10+i*5}%',f'Area {s["radius"]}; trigger {s["trigger_radius"]}',f'Max traps {s["max_traps"]}; lifetime {s["trap_lifetime"]:g}s',f'CD {s["cooldown"]:g}s']
  else:
   for key in ['stack_hp_percent','stack_hp_percent_cap','stack_refresh']:s.pop(key,None)
   s.update(damage_pct=120+i*10,needle_damage_pct=[25,27.5,30,35,40][i],needle_count=4+i,radius=80+i*5,needle_range=250+i*25,vortex_duration=2.5,vortex_tick_count=5,vortex_tick_interval=0.5,vortex_spin_speed=400,needle_poison_atk_pct=5,needle_poison_duration_extension=0.5,needle_poison_dps_cap=5000)
   l['effects'][0].update(chance=0.2,duration=0.1)
   l['description_rows']=['Venom vortex',f'Hit {s["damage_pct"]}% ATK over 5 ticks',f'Needles {s["needle_count"]}x {s["needle_damage_pct"]:g}% ATK','Each needle adds 5% ATK poison DPS and 0.5s; max 5000 DPS','Each tick: 20% stun 0.1s',f'CD {s["cooldown"]:g}s','First needle 0.5s; random angles, 0.1s apart','Vortex loops 2.5s, spin 400 degrees/s']
 sk['description']='See level descriptions for authoritative damage, timing and effects.' if n!=2 else sk['description']
p.write_text(json.dumps(a,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
