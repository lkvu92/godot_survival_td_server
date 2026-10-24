from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[2]
contract='''# C200 Hero 4 animation grid

Version: 1.0.0
Status: IN_PROGRESS

## Presentation schema and scope
Five Hero4 animation sheets in the client AtlasRegistry manifest explicitly
declare columns3/rows3/frame_count9/frame_width400/frame_height400 and
normalize_grid=true. They are hero_4_skill_1,hero_4_skill_2,hero_4_skill_3a,
hero_4_skill_3b,hero_4_skill_4a. Current source PNGs already1200x1200;
reuse C199 cached normalization only if future source exports differ in size.
Extend loading-screen normalizer warm-up to Hero4 paths as well as Hero5.
No PNG editing, balance/RPC/config-server changes; no local gameplay fallback
(C121). All assets still accessed through AtlasRegistry; UiSkin/signals unchanged.

## Whole-image exception
hero_4_skill_4_2_animation.png is visually a single complete needle,1254x1254,
not a3x3 sheet. Keep hero_4_skill_4b at1x1/one frame and existing scale.
The four *_projectile.png UI icons also remain whole-image textures.
Cutting the needle into nine pieces would break its authored shape; do not
treat its filename suffix as evidence of an animation grid.

## Acceptance
Verify all45 animation frames have exact400x400 row-major regions and use
the registered PNG. Actual Skill1 projectile frames resolve correctly through
the real cast. Confirm needle and UI icons remain full-image; run poison/trap
and vortex regressions plus full client/server static checks.

## Changelog
| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-24 | Explicit400px Hero4 grid with full-image needle/icon exception and loading warm-up. |
'''
for name in ['server','client']:
 repo=ROOT/name;(repo/'docs/contracts/C200_HERO4_ASSET_GRID.md').write_text(contract,encoding='utf-8')
 p=repo/'docs/contracts/REGISTRY.json';d=json.loads(p.read_text(encoding='utf-8'));d['contracts'].insert(0,dict(id='C200_HERO4_ASSET_GRID',version='1.0.0',status='IN_PROGRESS',updated_at='2026-10-24',contract_file='docs/contracts/C200_HERO4_ASSET_GRID.md'));p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 p=repo/'docs/INDEX.md';p.write_text(p.read_text(encoding='utf-8')+'\n- [C200 Hero4 asset grid](contracts/C200_HERO4_ASSET_GRID.md): five animation sheets at3x3/400px; needle/icons stay whole-image.\n',encoding='utf-8')
 p=repo/'docs/heroes/HERO_4.md';s=p.read_text(encoding='utf-8').replace('Version: 1.0.0','Version: 1.0.1');s=s.replace('## Nguồn triển khai','''## Chuẩn hóa asset — C200

Năm sheet animation Skill1, Skill2, bẫy đặt, bẫy nổ và xoáy dùng lưới
**3×3, 9 frame400×400px**. PNG nguồn hiện đều1200×1200; AtlasRegistry
khai báo kích thước ô cố định và tái dùng normalization cache nếu sheet đổi
kích thước khi export. Không sửa PNG gốc hay thay chỉ số gameplay.

Riêng `hero_4_skill_4_2_animation.png` là **một ảnh kim đơn1254×1254**,
giữ1×1 để kim nguyên vẹn. Các icon `*_projectile.png` cũng giữ ảnh đầy đủ.
Chi tiết: [C200](../contracts/C200_HERO4_ASSET_GRID.md).

## Nguồn triển khai''',1);s=s.replace('| 1.0.0 | 2026-10-24 |','| 1.0.1 | 2026-10-24 | Chuẩn grid400px cho năm animation sheet; giữ nguyên kim đơn và icon. |\n| 1.0.0 | 2026-10-24 |',1);p.write_text(s,encoding='utf-8')
p=ROOT/'client/data/atlas_registry.json';m=json.loads(p.read_text(encoding='utf-8'))
for key in ['hero_4_skill_1','hero_4_skill_2','hero_4_skill_3a','hero_4_skill_3b','hero_4_skill_4a']:
 m['spritesheet_vfx'][key].update(columns=3,rows=3,frame_count=9,frame_width=400,frame_height=400,normalize_grid=True)
p.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
