from pathlib import Path
import json,re,hashlib
ROOT=Path(__file__).resolve().parents[2]
for name in ['server','client']:
 repo=ROOT/name;p=repo/'docs/contracts/C197_HERO5_SKILL_REBALANCE.md';s=p.read_text(encoding='utf-8').replace('Version: 1.1.0','Version: 1.1.1')
 s=s.replace('Five max-HP percentage levels require user clarification (four supplied).','Confirmed max-HP percentages per rune tick: 0.2/0.3/0.6/0.8/1 percent;\nlevels[].stats.rune_hp_percent stores 0.002/0.003/0.006/0.008/0.01.')
 s=s.replace('Progress: full server/client static suites PASS;','Historical 1.0.0 progress (before HP clarification): full server/client static suites PASS;',1)
 s=s.replace('Skill2 max-HP curve still awaits user input.','Skill2 max-HP curve is completed by the 1.1.1 confirmation below.')
 s=s.replace('Overall contract remains IN_PROGRESS solely for missing Skill2 HP curve.','At 1.1.0 acceptance, the contract remained IN_PROGRESS for the HP curve; resolved by 1.1.1.')
 s+='\n## 1.1.1 Confirmed rune HP curve (2026-10-24)\n\nEach of the three rune pulses now deals25/30/35/40/45 percent ATK plus\n0.2/0.3/0.6/0.8/1 percent target max HP. Store the latter as fractional values\n0.002/0.003/0.006/0.008/0.01, never as0.2 through1. Same fixed centre,\nthree pulses at1.5/2/2.5s, existing35% stun and all other stats remain.\nNo RPC/schema change; C121 server authority unchanged.\n\n| Version | Date | Change |\n|---|---|---|\n| 1.1.1 | 2026-10-24 | Fill all five user-confirmed rune HP coefficients and replace synthetic test with authoritative values. |\n'
 p.write_text(s,encoding='utf-8')
 p=repo/'docs/contracts/REGISTRY.json';d=json.loads(p.read_text(encoding='utf-8'))
 next(x for x in d['contracts'] if x['id']=='C197_HERO5_SKILL_REBALANCE')['version']='1.1.1'
 next(x for x in d['contracts'] if x['id']=='C198_HERO_SKILL_DOCS_CURRENT')['version']='1.0.1'
 p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
p=ROOT/'server/data/skills.json';a=json.loads(p.read_text(encoding='utf-8'));skill=next(s for s in a if s['id']=='hero_5_skill_2')
for i,l in enumerate(skill['levels']):
 l['stats']['rune_hp_percent']=[0.002,0.003,0.006,0.008,0.01][i]
 l['description_rows'][1]=f'Runes after 1s: {25+i*5}% ATK + {[0.2,0.3,0.6,0.8,1][i]:g}% max HP per tick'
p.write_text(json.dumps(a,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
# Reuse the stat table renderer, with the formerly pending note replaced.
ns={'__file__':str(ROOT/'server/tmp/update_hero_docs.py')}
exec((ROOT/'server/tmp/update_hero_docs.py').read_text(encoding='utf-8').split('BASE=')[0],ns)
ns['NOTES']['hero_5_skill_2']='Đã chốt đủ 5 mốc: mỗi đợt cổ ngữ gây **25/30/35/40/45% ATK cộng 0,2/0,3/0,6/0,8/1% HP tối đa của mục tiêu**. `rune_hp_percent` lưu dạng tỷ lệ 0,002/0,003/0,006/0,008/0,01.\n\nTầng 1: trận xuất hiện tại tâm mục tiêu đã khóa, gây AOE ban đầu, phát animation một lượt trong 1s rồi giữ frame cuối tới đủ 2s, không loop/không fade frame giữ. Tầng 2: cổ ngữ xuất hiện tại **t=1s**, loop 1,5s; 3 nhịp sát thương tại **t=1,5/2/2,5s**. Cộng cả % ATK và % HP ở từng nhịp, không phải tổng của ba nhịp. Mỗi hit gây sát thương có 35% cơ hội choáng theo cấp. Không còn đặt burn 3s như phiên bản cũ.'
for name in ['server','client']:
 repo=ROOT/name;ns['hero_doc'](repo,5)
 p=repo/'docs/heroes/HERO_5.md';s=p.read_text(encoding='utf-8').replace('Version: 1.0.0  ','Version: 1.0.1');s=s.replace('| 1.0.0 | 2026-10-24 |','| 1.0.1 | 2026-10-24 | Chốt đủ năm mốc % HP mỗi đợt cổ ngữ. |\n| 1.0.0 | 2026-10-24 |',1);p.write_text(s,encoding='utf-8')
 p=repo/'docs/HERO_SKILLS_CURRENT.md';s=p.read_text(encoding='utf-8').replace('Version: 1.0.0','Version: 1.0.1');start=s.index('## Phần còn chờ chốt');end=s.index('## Timeline',start)
 s=s[:start]+'''## Hero 5 Skill 2 — đã chốt đủ năm cấp

Mỗi đợt cổ ngữ gây **25/30/35/40/45% ATK +0,2/0,3/0,6/0,8/1% HP tối đa**
của mục tiêu. Có ba đợt tại1,5/2/2,5s; đây là hệ số mỗi đợt, không phải tổng.
Config lưu `rune_hp_percent=0.002/0.003/0.006/0.008/0.01`.
Không còn mốc % HP chờ chốt. Việc seed/publish server là thao tác riêng.

'''+s[end:];s=s.replace('| 1.0.0 | 2026-10-24 |','| 1.0.1 | 2026-10-24 | Hoàn tất phần % HP tầng cổ ngữ Hero5. |\n| 1.0.0 | 2026-10-24 |',1);p.write_text(s,encoding='utf-8')
 p=repo/'docs/contracts/C198_HERO_SKILL_DOCS_CURRENT.md';s=p.read_text(encoding='utf-8').replace('Version: 1.0.0','Version: 1.0.1');s=s.replace('Hero5 skill2 rune_hp_percent remains absent: user supplied four values for five\nlevels. Runtime currently uses0 for that term; C197 stays IN_PROGRESS. Never\ninvent the missing value or state that server publication has occurred.','Hero5 skill2 rune_hp_percent is now confirmed at0.002/0.003/0.006/0.008/0.01\nunder C197 v1.1.1. No missing values remain. Server publication is separate.')
 s=s.replace('C197 remains IN_PROGRESS for its missing HP curve.','At documentation1.0.0, C197 awaited the HP curve; resolved by1.0.1.')
 s+='\n| 1.0.1 | 2026-10-24 | Synchronize the five confirmed rune HP levels, removing pending notices. |\n';p.write_text(s,encoding='utf-8')
 for fname in ['docs/INDEX.md','docs/features/F001_HERO_SYSTEM.md','docs/features/F002_SKILL_COMBAT.md']:
  p=repo/fname
  if p.exists():
   s=p.read_text(encoding='utf-8').replace('phần % HP Hero 5 còn chờ chốt','phần % HP Hero 5 đã chốt đủ 5 cấp').replace('riêng Hero 5 Skill 2 còn chờ một mốc % HP.','Hero 5 Skill 2 đã chốt đủ năm mốc % HP.').replace('(contracts/C198_HERO_SKILL_DOCS_CURRENT.md) v1.0.0','(contracts/C198_HERO_SKILL_DOCS_CURRENT.md) v1.0.1');p.write_text(s,encoding='utf-8')
print('Confirmed rune HP curve applied; current Hero5 docs and pending notices synchronized.')
