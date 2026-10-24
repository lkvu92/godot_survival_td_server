from pathlib import Path
import json,re
root=Path(__file__).resolve().parents[2]
for repo in [root/'server',root/'client']:
 p=repo/'docs/contracts/C189_HERO_1_SKILL_ORDER.md'; s=p.read_text(encoding='utf-8').replace('Version: 1.0.0','Version: 1.0.1'); s+='''

## 1.0.1 mastery balance (2026-10-24)
Hero 1 skill 4 damage bonus: 12.5/15/17.5/20/22.5 percent; Skill 1 projectile
speed bonus: 15/20/25/30/35 percent. freeze_chance=0.30, freeze_duration=0.2,
freeze_damage_multiplier=0.25 at every level. Existing lotus AOE triggers on
hit and deals 25% of the main projectile damage; only freezing rolls chance,
per directly hit enemy. Other projectile users default to guaranteed freeze
unless configured otherwise. Projectile pooled reuse resets chance to 1.
No unlock/RPC changes; server seed remains authoritative, C121 applies.

| Version | Date | Change |
|---|---|---|
| 1.0.1 | 2026-10-24 | Mastery damage/speed curves, 30% freeze for 0.2s, 25% lotus damage. |
'''; p.write_text(s,encoding='utf-8')
 p=repo/'docs/contracts/REGISTRY.json'; s=p.read_text(encoding='utf-8'); s=re.sub(r'("id": "C189_HERO_1_SKILL_ORDER",\s*"version": ")[^"]+',r'\g<1>1.0.1',s); p.write_text(s,encoding='utf-8')
 p=repo/'docs/INDEX.md'; p.write_text(p.read_text(encoding='utf-8')+'\nC189 v1.0.1: Hero 1 projectile mastery rebalance, probabilistic freeze and lotus damage.\n',encoding='utf-8')
p=root/'server/data/skills.json'; a=json.loads(p.read_text(encoding='utf-8')); sk=next(s for s in a if s['id']=='hero_1_skill_4')
for i,l in enumerate(sk['levels']):
 s=l['stats']; s.update(damage_pct=12.5+i*2.5,speed_pct=15+i*5,freeze_chance=0.3,freeze_duration=0.2,freeze_damage_multiplier=0.25)
 rows=l['description_rows']; rows[1]=f"Tăng {12.5+i*2.5:g}% DMG, +{15+i*5}% tốc độ bay"; rows[-1]='30% đóng băng quái 0.2s khi trúng'; rows.append('Nổ phụ gây 25% sát thương tia chính')
p.write_text(json.dumps(a,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
