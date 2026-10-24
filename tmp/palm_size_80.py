from pathlib import Path
import json,re
root=Path(__file__).resolve().parents[2]
keys=['vfx_scale','crack_vfx_scale','wave_vfx_scale']
for repo in ['server','client']:
 p=root/repo/'docs/contracts/C203_HERO5_PALM_DOUBLE.md';s=p.read_text(encoding='utf-8').replace('Version: 1.0.0','Version: 1.1.0');s+='\n## Revision 1.1.0\nMultiply the three visual scales vfx_scale, crack_vfx_scale, wave_vfx_scale by 0.8 relative to 1.0.0, at all five levels. Preserve all combat distances and other stats. Existing server snapshot schema/RPC, presentation multiplier and online-only rules remain unchanged.\n\n| 1.1.0 | 2026-10-24 | Reduce all Skill3 visual sizes20%, retaining combat range. |\n';p.write_text(s,encoding='utf-8')
 p=p.parent/'REGISTRY.json';d=json.loads(p.read_text(encoding='utf-8'))
 for c in d['contracts']:
  if c['id']=='C203_HERO5_PALM_DOUBLE':c['version']='1.1.0'
 p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 p=root/repo/'docs/INDEX.md';p.write_text(p.read_text(encoding='utf-8')+'\n- C203 v1.1.0: Skill3 visual scales reduced20%; combat ranges retained.\n',encoding='utf-8')
p=root/'server/data/skills.json';d=json.loads(p.read_text(encoding='utf-8'));skill=next(s for s in d if s['id']=='hero_5_skill_3')
for l in skill['levels']:
 for k in keys:l['stats'][k]=round(l['stats'][k]*0.8,8)
p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
for repo in ['server','client']:
 p=root/repo/'docs/heroes/HERO_5.md';t=p.read_text(encoding='utf-8');a,b=t.split('## Skill 3',1);b,c=b.split('## Skill 4',1)
 for k in keys:b=re.sub(r'^\| `'+k+r'` \|[^\n]*','| `'+k+'` | '+' | '.join(str(l['stats'][k]) for l in skill['levels'])+' |',b,flags=re.M)
 b+='\nC203 v1.1.0: size hiệu ứng cả ba tầng giảm20% so với bản x2; phạm vi sát thương giữ nguyên.\n\n'
 p.write_text(a+'## Skill 3'+b+'## Skill 4'+c,encoding='utf-8')
p=root/'server/tests/test_hero_skill_damage_balance.cjs';t=p.read_text(encoding='utf-8');needle="baselineSkills.find(s=>s.id==='hero_5_skill_3').levels.forEach(l=>{"
t=t.replace(needle,needle+'\n  for(const k of '+json.dumps(keys)+') l.stats[k]=Number((l.stats[k]/0.8).toFixed(8));',1)
for k in keys:t=re.sub(r'assert.deepEqual\(index.hero_5_skill_3.levels.map\(l=>l.stats.'+k+r'\),\[[^\]]*\]\);','assert.deepEqual(index.hero_5_skill_3.levels.map(l=>l.stats.'+k+'),'+json.dumps([l['stats'][k] for l in skill['levels']])+');',t)
p.write_text(t,encoding='utf-8')
