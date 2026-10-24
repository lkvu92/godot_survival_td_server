from pathlib import Path
import json
root=Path(__file__).resolve().parents[2]
for repo in ['server','client']:
 p=root/repo/'docs/contracts/C195_HERO3_SKILL_REBALANCE.md';s=p.read_text(encoding='utf-8').replace('Version: 1.0.0','Version: 1.1.0');s+='\n## Revision1.1.0 speed schema\nSkill1 projectile_speed becomes416px/s at all five levels (+30%).\nSkill3 adds arc_speed_pct=182/192.5/203/217/234.5 (% hero movement): 70% of existing speed_pct, used only by ordinary stage1 swords. Existing speed_pct remains260/275/290/310/335 for the final sword. SkillManager resolves the arc-only value through SkillValueService using a copied stats dictionary. Legacy remote configs without arc_speed_pct retain their speed_pct. Existing RPC payload/config schema remains additive, no local config fallback (C121). Damage, count, interval, range and visuals unchanged.\n\n| 1.1.0 | 2026-10-24 | Skill1 flight+30%; Skill3 ordinary swords flight-30%; preserve finisher speed. |\n';p.write_text(s,encoding='utf-8')
 p=p.parent/'REGISTRY.json';d=json.loads(p.read_text(encoding='utf-8'))
 for c in d['contracts']:
  if c['id'].startswith('C195'):c['version']='1.1.0'
 p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 p=root/repo/'docs/INDEX.md';p.write_text(p.read_text(encoding='utf-8')+'\n- C195 v1.1.0: Hero3 Skill1+30% speed; ordinary Skill3 swords-30%.\n',encoding='utf-8')
p=root/'server/data/skills.json';d=json.loads(p.read_text(encoding='utf-8'))
for s in d:
 if s['id']=='hero_3_skill_1':
  for l in s['levels']:
   l['stats']['projectile_speed']=416
   l['description_rows']=[r.replace('320','416') for r in l['description_rows']]
 if s['id']=='hero_3_skill_3':
  for l in s['levels']:l['stats']['arc_speed_pct']=round(l['stats']['speed_pct']*0.7,8)
p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
for repo in ['server','client']:
 p=root/repo/'docs/heroes/HERO_3.md';s=p.read_text(encoding='utf-8').replace('320','416');s+='\nC195 v1.1.0: Skill1 tăng30% lên416px/s; phi kiếm thường tầng1 Skill3 giảm30%, arc_speed_pct=182|192.5|203|217|234.5% tốc độ di chuyển. Kiếm cuối giữ speed_pct=260|275|290|310|335%.\n';p.write_text(s,encoding='utf-8')
p=root/'server/tests/test_hero_skill_damage_balance.cjs';s=p.read_text(encoding='utf-8');s=s.replace('const baselineIce=baselineSkills.find',"baselineSkills.find(s=>s.id==='hero_3_skill_1').levels.forEach(l=>{l.stats.projectile_speed=320;l.description_rows=l.description_rows.map(r=>r.replace(/416/g,'320'));});\nbaselineSkills.find(s=>s.id==='hero_3_skill_3').levels.forEach(l=>delete l.stats.arc_speed_pct);\nconst baselineIce=baselineSkills.find");s=s.replace('l.stats.projectile_speed,320','l.stats.projectile_speed,416');s+="\nassert.deepEqual(index.hero_3_skill_3.levels.map(l=>l.stats.arc_speed_pct),[182,192.5,203,217,234.5]);\nassert.deepEqual(index.hero_3_skill_3.levels.map(l=>l.stats.speed_pct),[260,275,290,310,335]);\n";p.write_text(s,encoding='utf-8')
p=root/'client/tests/test_hero3_rebalance.gd';s=p.read_text(encoding='utf-8').replace('320','416');p.write_text(s,encoding='utf-8')
