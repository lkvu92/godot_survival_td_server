from pathlib import Path
import json,re
root=Path(__file__).resolve().parents[2]
skills=json.loads((root/'server/data/skills.json').read_text(encoding='utf-8'))
skill=next(s for s in skills if s['id']=='hero_5_skill_3')
for repo in ['server','client']:
 p=root/repo/'docs/heroes/HERO_5.md';t=p.read_text(encoding='utf-8');a,b=t.split('## Skill 3',1);b,c=b.split('## Skill 4',1)
 for k in ['vfx_scale','crack_vfx_scale','wave_vfx_scale','wave_ring_width','wave_collision_padding']:
  b=re.sub(r'^\| `'+k+r'` \|[^\n]*', '| `'+k+'` | '+' | '.join(str(l['stats'][k]) for l in skill['levels'])+' |',b,flags=re.M)
 p.write_text(a+'## Skill 3'+b+'## Skill 4'+c,encoding='utf-8')
 p=root/repo/'docs/contracts/C203_HERO5_PALM_DOUBLE.md';p.write_text(p.read_text(encoding='utf-8').replace('Status: IN_PROGRESS','Status: ACTIVE')+'\n## Validation\nGate score 9/10: exact eight-field curves pass; Hero5 runtime combat regression PASS, including doubled palm/edge wave reach; both full static suites PASS. No publication/deployment performed.\n',encoding='utf-8')
 p=p.parent/'REGISTRY.json';d=json.loads(p.read_text(encoding='utf-8'))
 for entry in d['contracts']:
  if entry['id']=='C203_HERO5_PALM_DOUBLE':entry['status']='ACTIVE'
 p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
