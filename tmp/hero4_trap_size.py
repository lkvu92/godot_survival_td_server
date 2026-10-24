from pathlib import Path
import json,re
root=Path(__file__).resolve().parents[2]
for repo in ['server','client']:
 p=root/repo/'docs/contracts/C196_HERO4_SKILL_REBALANCE.md';s=p.read_text(encoding='utf-8').replace('Version: 1.0.0','Version: 1.1.0');s+='\n## Revision1.1.0 Skill3 visual sizes\nMultiply Skill3 vfx_scale and explosion_vfx_scale by0.6 at every level: reduce idle trap and explosion artwork40%. Server seed remains authoritative through existing config snapshot RPC. No schema/interface additions, hitbox/range/damage/duration changes or offline fallback. Assets remain AtlasRegistry-managed3x3/400px.\n\n| 1.1.0 | 2026-10-24 | Reduce Skill3 trap and explosion visual sizes40%. |\n';p.write_text(s,encoding='utf-8')
 p=p.parent/'REGISTRY.json';d=json.loads(p.read_text(encoding='utf-8'))
 for c in d['contracts']:
  if c['id'].startswith('C196'):c['version']='1.1.0'
 p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 p=root/repo/'docs/INDEX.md';p.write_text(p.read_text(encoding='utf-8')+'\n- C196 v1.1.0: Hero4 Skill3 artwork40% smaller.\n',encoding='utf-8')
p=root/'server/data/skills.json';d=json.loads(p.read_text(encoding='utf-8'));skill=next(s for s in d if s['id']=='hero_4_skill_3')
for l in skill['levels']:
 for k in ['vfx_scale','explosion_vfx_scale']:l['stats'][k]=round(l['stats'][k]*0.6,8)
p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
for repo in ['server','client']:
 p=root/repo/'docs/heroes/HERO_4.md';s=p.read_text(encoding='utf-8');a,b=s.split('## Skill 3',1);b,c=b.split('## Skill 4',1)
 for k in ['vfx_scale','explosion_vfx_scale']:b=re.sub(r'^\| `'+k+r'` \|[^\n]*','| `'+k+'` | '+' | '.join(str(l['stats'][k]) for l in skill['levels'])+' |',b,flags=re.M)
 p.write_text(a+'## Skill 3'+b+'\nC196 v1.1.0: size bẫy và hiệu ứng nổ giảm40%, phạm vi và sát thương giữ nguyên.\n\n## Skill 4'+c,encoding='utf-8')
p=root/'server/tests/test_hero_skill_damage_balance.cjs';s=p.read_text(encoding='utf-8').replace('const baselineIce=baselineSkills.find',"baselineSkills.find(s=>s.id==='hero_4_skill_3').levels.forEach(l=>{for(const k of ['vfx_scale','explosion_vfx_scale'])l.stats[k]=Number((l.stats[k]/0.6).toFixed(8));});\nconst baselineIce=baselineSkills.find");s=s.replace('explosion_vfx_scale:[1.495,1.69,1.885,2.08,2.34]','explosion_vfx_scale:[0.897,1.014,1.131,1.248,1.404]');s+="\nassert.deepEqual(index.hero_4_skill_3.levels.map(l=>l.stats.vfx_scale),[0.051,0.054,0.057,0.06,0.063]);\n";p.write_text(s,encoding='utf-8')
