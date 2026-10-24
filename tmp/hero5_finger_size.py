from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[2]
contract='''# C201 Hero 5 finger display size after 400px normalization

Version: 1.0.0
Status: IN_PROGRESS

## Presentation and interfaces
Hero5 Skill1 correctly uses hero_5_skill1_sprite.png,3x3/nine400px cells.
Its old vfx_scale0.0686..0.0882 yields only27.44..35.28px cell width.
Manifest display_scale_multiplier=3.135 (1254/400) restores the prior intended
world footprint of86.0244..110.6028px without changing gameplay.
AtlasRegistry.get_vfx_display_scale_multiplier(frame_id) reads optional
presentation metadata, default1 for all other sheets. Only the independent
gold-finger travelling SkillVfx applies the multiplier; hidden damage carrier,
hit radius, range, damage, explosion artwork/size and Skill4 punches unchanged.
Existing original scale data is not modified, so no balance publish is required.
No new RPC, PNG rewrite, UiSkin change or signals; C121 remains authoritative.

## Acceptance
Verify actual cast resolves requested PNG with400px cells and world width
86.0244/92.169/98.3136/104.4582/110.6028px across five levels; movement visual
uses compensated size and normal direct/explosion damage remains unchanged.
Run asset/grid and layered Hero5 regressions and both static suites.

## Changelog
| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-24 | Compensate obsolete tiny finger scale after switching to400px cells. |
'''
for name in ['server','client']:
 repo=ROOT/name;(repo/'docs/contracts/C201_HERO5_FINGER_DISPLAY_SIZE.md').write_text(contract,encoding='utf-8');p=repo/'docs/contracts/REGISTRY.json';d=json.loads(p.read_text(encoding='utf-8'));d['contracts'].insert(0,dict(id='C201_HERO5_FINGER_DISPLAY_SIZE',version='1.0.0',status='IN_PROGRESS',updated_at='2026-10-24',contract_file='docs/contracts/C201_HERO5_FINGER_DISPLAY_SIZE.md'));p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');p=repo/'docs/INDEX.md';p.write_text(p.read_text(encoding='utf-8')+'\n- [C201 Hero5 finger display size](contracts/C201_HERO5_FINGER_DISPLAY_SIZE.md): compensate tiny legacy scale after400px frame normalization.\n',encoding='utf-8')
 p=repo/'docs/heroes/HERO_5.md';s=p.read_text(encoding='utf-8').replace('Version: 1.0.2','Version: 1.0.3');s=s.replace('### Chỉ số gameplay','Kích thước tia hiển thị có hệ số bù **3,135×** từ manifest (C201), vì scale cũ áp lên ô400px chỉ còn27–35px. Bề rộng ô hiển thị mới khoảng86–111px theo cấp; damage, hitbox và kích thước nổ không đổi.\n\n### Chỉ số gameplay',1);s=s.replace('| 1.0.2 | 2026-10-24 |','| 1.0.3 | 2026-10-24 | Bù scale hiển thị tia Skill1 sau chuẩn hóa400px. |\n| 1.0.2 | 2026-10-24 |',1);p.write_text(s,encoding='utf-8')
p=ROOT/'client/data/atlas_registry.json';m=json.loads(p.read_text(encoding='utf-8'));m['spritesheet_vfx']['hero_5_skill1_sprite']['display_scale_multiplier']=3.135;p.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
