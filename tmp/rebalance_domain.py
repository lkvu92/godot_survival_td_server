from pathlib import Path
import json,re
root=Path(__file__).resolve().parents[2]
for repo in [root/'server',root/'client']:
 p=repo/'docs/contracts/C180_HERO_1_ICE_DOMAIN_LAYERS.md'
 s=(p if p.exists() else root/'server/docs/contracts/C180_HERO_1_ICE_DOMAIN_LAYERS.md').read_text(encoding='utf-8').replace('Version: 1.0.0','Version: 1.0.1')
 s=s.split('\n\n## 1.0.1 support domain rebalance')[0]
 s+='''

## 1.0.1 support domain rebalance (2026-10-24)
After C189 this domain is hero_1_skill_3. Level curves: cooldown
15/14.5/14/13.5/13 seconds; lifetime 6/7/8/9/10 seconds; radius
240/250/260/270/280px; enemy attack-speed slow 20/22.5/25/27.5/30 percent;
defense reduction 15/17.5/20/22.5/25 percent. damage_pct is zero: support only.
Recasting first clears this SkillManager owner's domain visuals and enemy
modifiers before creating the new domain; other owners remain unaffected.
Existing stun/slow, JSON/RPC interfaces and C121 online-only rules remain.

| Version | Date | Change |
|---|---|---|
| 1.0.1 | 2026-10-24 | Support domain level curves, zero damage, owner-specific replacement. |
'''
 p.write_text(s,encoding='utf-8')
 p=repo/'docs/contracts/REGISTRY.json'; s=p.read_text(encoding='utf-8'); s=re.sub(r'("id": "C180_HERO_1_ICE_DOMAIN_LAYERS",\s*"version": ")[^"]+',r'\g<1>1.0.1',s); p.write_text(s,encoding='utf-8')
 p=repo/'docs/INDEX.md'; p.write_text(p.read_text(encoding='utf-8')+'\nC180 v1.0.1: support-only ice domain level curves and owner-specific recast cleanup.\n',encoding='utf-8')
p=root/'server/data/skills.json'; a=json.loads(p.read_text(encoding='utf-8')); skill=next(s for s in a if s['id']=='hero_1_skill_3')
for i,l in enumerate(skill['levels']):
 s=l['stats']; s.update(cooldown=15-i*0.5,domain_duration=6+i,domain_radius=240+i*10,attack_speed_slow=0.20+i*0.025,def_reduction=0.15+i*0.025,damage_pct=0)
 s['attack_speed_slow']=round(s['attack_speed_slow'],3); s['def_reduction']=round(s['def_reduction'],3)
 l['description_rows']=[l['description_rows'][0],f"Băng giới tồn tại {6+i}s (CD {15-i*0.5:g}s), bán kính {240+i*10}px",l['description_rows'][2],f"Giảm {20+i*2.5:g}% tốc độ đánh của quái",f"Giảm {15+i*2.5:g}% giáp của quái",'Hỗ trợ, không gây sát thương trực tiếp']
p.write_text(json.dumps(a,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
