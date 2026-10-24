from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[2]
contract='''# C202 Hero 5 palm and mark display sizes

Version: 1.0.0
Status: IN_PROGRESS

## Presentation schema and interfaces
Reuse C201 manifest display_scale_multiplier: hero_5_skill4_effect2=0.7,
hero_5_skill3_sprite=2.0. BuddhaMark.setup applies0.7 to its initial base scale;
existing5% consecutive-hit growth is relative to this reduced base at all levels.
SkillManager's falling-palm stage1 visual applies2.0 to both its initial/end
scale at all five levels. No effect on crack/waves, palm radius, damage,
collision, timing, stun, punch or phantom sizes. Source PNGs remain3x3/400px.
All asset access stays in AtlasRegistry. No balance JSON/RPC/signals/UiSkin
changes and no local gameplay fallback (C121). Client presentation only.

## Acceptance
At every level assert palm moving visual start/end scales exactly2x configured
values and mark first-hit sprite scale exactly0.7x explosion_vfx_scale.
Existing tests prove damage/propagation/stun/mark increments remain unchanged.
Run corresponding Hero5 runtime regressions and complete static suites.

## Changelog
| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-24 | Reduce initial Skill4 mark30%; double Skill3 stage1 palm artwork at every level. |
'''
for name in ['server','client']:
 repo=ROOT/name;(repo/'docs/contracts/C202_HERO5_PALM_MARK_SIZE.md').write_text(contract,encoding='utf-8');p=repo/'docs/contracts/REGISTRY.json';d=json.loads(p.read_text(encoding='utf-8'));d['contracts'].insert(0,dict(id='C202_HERO5_PALM_MARK_SIZE',version='1.0.0',status='IN_PROGRESS',updated_at='2026-10-24',contract_file='docs/contracts/C202_HERO5_PALM_MARK_SIZE.md'));p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');p=repo/'docs/INDEX.md';p.write_text(p.read_text(encoding='utf-8')+'\n- [C202 Hero5 palm/mark size](contracts/C202_HERO5_PALM_MARK_SIZE.md): stage1 palm2x; initial target mark0.7x, all levels.\n',encoding='utf-8')
 p=repo/'docs/heroes/HERO_5.md';s=p.read_text(encoding='utf-8').replace('Version: 1.0.3','Version: 1.0.4');s=s.replace('Tầng 1: chưởng rơi sau 0,35s,','Tầng 1: chưởng rơi sau 0,35s, artwork tăng **100% (2×)** ở mọi cấp theo C202; bán kính/damage không đổi,',1);s=s.replace('Tầng 3: khi trúng tạo ấn ở tâm mục tiêu','Tầng 3: size ấn ban đầu giảm **30% (0,7×)** ở mọi cấp theo C202; vẫn tăng5% mỗi hit nối tiếp trên base mới. Khi trúng tạo ấn ở tâm mục tiêu',1);s=s.replace('| 1.0.3 | 2026-10-24 |','| 1.0.4 | 2026-10-24 | Chưởng tầng1 tăng100%, ấn ký ban đầu giảm30% theo C202. |\n| 1.0.3 | 2026-10-24 |',1);p.write_text(s,encoding='utf-8')
p=ROOT/'client/data/atlas_registry.json';m=json.loads(p.read_text(encoding='utf-8'));m['spritesheet_vfx']['hero_5_skill4_effect2']['display_scale_multiplier']=0.7;m['spritesheet_vfx']['hero_5_skill3_sprite']['display_scale_multiplier']=2;p.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
