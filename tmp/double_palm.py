from pathlib import Path
import json,re
root=Path(__file__).resolve().parents[2]
keys=['range','radius','wave_radius','wave_ring_width','wave_collision_padding','vfx_scale','crack_vfx_scale','wave_vfx_scale']
contract='''# C203 Hero 5 Skill 3 doubled scale and range

Version: 1.0.0
Status: IN_PROGRESS

## Schema and interfaces
Double existing server-authoritative level stats: range, radius, wave_radius,
wave_ring_width, wave_collision_padding, vfx_scale, crack_vfx_scale,
wave_vfx_scale at all five levels. Retain C202 palm display multiplier 2:
the final rendered palm is twice its immediately previous size.
Crack shares palm radius. All wave start/end sizes double proportionately.
No damage, cooldown, duration, wave count or stun changes. Above-height is
animation travel rather than combat range and remains unchanged.
Existing config snapshot RPC/schema and SkillManager interfaces unchanged.
Publish server skills through the normal catalog pipeline; no local gameplay
fallback is allowed under C121. Assets remain AtlasRegistry managed.

## Acceptance
Verify exact doubled curves and unchanged other fields; run Hero5 combat
regression plus both repository static suites.

## Changelog
| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-24 | Double all Skill3 visual scales and combat distances relative to C202. |
'''
for repo in ['server','client']:
 p=root/repo/'docs/contracts/C203_HERO5_PALM_DOUBLE.md';p.write_text(contract,encoding='utf-8')
 p=p.parent/'REGISTRY.json';d=json.loads(p.read_text(encoding='utf-8'));d['contracts'].insert(0,dict(id='C203_HERO5_PALM_DOUBLE',version='1.0.0',status='IN_PROGRESS',contract_file='docs/contracts/C203_HERO5_PALM_DOUBLE.md',updated_at='2026-10-24'));p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 p=root/repo/'docs/INDEX.md';p.write_text(p.read_text(encoding='utf-8')+'\n- [C203 Hero5 Skill3 double size/range](contracts/C203_HERO5_PALM_DOUBLE.md).\n',encoding='utf-8')
p=root/'server/data/skills.json';d=json.loads(p.read_text(encoding='utf-8'));s=next(s for s in d if s['id']=='hero_5_skill_3');old=json.loads(json.dumps(s))
for l in s['levels']:
 for k in keys:l['stats'][k]=round(l['stats'][k]*2,8)
 l['description_rows']=[re.sub(r'radius (\d+)px',lambda m:f'radius {int(m[1])*2}px',r) for r in l['description_rows']]
p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
for repo in ['server','client']:
 p=root/repo/'docs/heroes/HERO_5.md';text=p.read_text(encoding='utf-8');parts=text.split('## Skill 3',1);section,tail=parts[1].split('## Skill 4',1)
 for k in keys:
  section=re.sub(r'(^\|[^\n]*\(`'+k+r'`\) \|)([^\n]+)',lambda m:m[1]+''.join(' '+str(round(float(v.strip())*2,8)).removesuffix('.0')+' |' for v in m[2].split('|') if v.strip()),section,flags=re.M)
 text=parts[0]+'## Skill 3'+section+'\nC203: toàn bộ scale và phạm vi Skill 3 tăng gấp đôi so với C202; hệ số hiển thị chưởng 2× của C202 tiếp tục áp dụng.\n\n## Skill 4'+tail
 text=text.replace('Version: 1.0.4','Version: 1.0.5').replace('| 1.0.4 |','| 1.0.5 | 2026-10-24 | C203: Skill 3 tăng gấp đôi scale và phạm vi hiện tại. |\n| 1.0.4 |',1);p.write_text(text,encoding='utf-8')
# Baseline guard explicitly reverses only authorized C203 fields.
p=root/'server/tests/test_hero_skill_damage_balance.cjs';t=p.read_text(encoding='utf-8');needle='const baselineIce=baselineSkills.find'
t=t.replace(needle,"baselineSkills.find(s=>s.id==='hero_5_skill_3').levels.forEach(l=>{\n  for(const k of "+json.dumps(keys)+") l.stats[k]=Number((l.stats[k]/2).toFixed(8));\n  l.description_rows=l.description_rows.map(r=>r.replace(/radius (\\d+)px/g,(_,n)=>'radius '+Number(n)/2+'px'));\n});\n"+needle)
t=t.replace('radius:[70,75,80,85,90],wave_radius:[100,110,120,130,140]','radius:[140,150,160,170,180],wave_radius:[200,220,240,260,280]')
for k in keys:
 vals=[l['stats'][k] for l in s['levels']];t+='\nassert.deepEqual(index.hero_5_skill_3.levels.map(l=>l.stats.'+k+'),'+json.dumps(vals)+');\n'
p.write_text(t,encoding='utf-8')
p=root/'client/tests/test_hero5_rebalance.gd';t=p.read_text(encoding='utf-8').replace('var palm: Dictionary = skills.hero_5_skill_3','edge.position = Vector2(190, 0)\n\t\tvar palm: Dictionary = skills.hero_5_skill_3').replace('ring.radius == 100+index*10','ring.radius == 200+index*20');p.write_text(t,encoding='utf-8')
