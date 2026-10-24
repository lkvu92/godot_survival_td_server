from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[2]
for name in ['server','client']:
 repo=ROOT/name;p=repo/'docs/heroes/HERO_5.md';s=p.read_text(encoding='utf-8').replace('Version: 1.0.1','Version: 1.0.2')
 addition='''## Chuẩn hóa asset — C199

Mọi animation Hero5 đang dùng được ràng buộc bằng
`hero_skill_vfx_roles` trong manifest AtlasRegistry; frame cũ trong metadata
server không đổi asset của các vai trò này. Riêng nổ Skill1 luôn dùng
`hero_5_skill1_effect1.png`; quyền Skill4 cũng dùng sheet này theo yêu cầu.

Mười sheet `*_sprite`/`*_effect*` có lưới **3×3, 9 ô400×400px**. Một số
PNG nguồn đang cao1134/1212/1224/1266px; registry chuẩn hóa texture hiển thị
về1200×1200 trước cắt ô, giữ nguyên PNG gốc và alpha. Cache một lần/sheet,
chuẩn bị trong loading của tower và dọn cùng scope khi rời trận.
Các file `*_projectile.png` dùng làm icon vẫn là ảnh đầy đủ, không cắt icon
thành chín ô. Chi tiết: [C199](../contracts/C199_HERO5_ASSET_GRID.md).

'''
 s=s.replace('## Nguồn triển khai',addition+'## Nguồn triển khai',1)
 s=s.replace('| 1.0.1 | 2026-10-24 |','| 1.0.2 | 2026-10-24 | Ràng buộc đúng PNG nổ Skill1 và chuẩn hóa animation3×3/400px qua AtlasRegistry. |\n| 1.0.1 | 2026-10-24 |',1)
 p.write_text(s,encoding='utf-8')
 p=repo/'docs/HERO_SKILLS_CURRENT.md';s=p.read_text(encoding='utf-8').replace('Version: 1.0.1','Version: 1.0.2');s=s.replace('## Changelog','Hero5: [C199 — asset3×3/400px](contracts/C199_HERO5_ASSET_GRID.md) chuẩn hóa texture animation và ràng buộc đúng PNG nổ Skill1; icon giữ ảnh đầy đủ.\n\n## Changelog',1);s=s.replace('| 1.0.1 | 2026-10-24 |','| 1.0.2 | 2026-10-24 | Đồng bộ chuẩn grid và asset nổ Hero5. |\n| 1.0.1 | 2026-10-24 |',1);p.write_text(s,encoding='utf-8')
 p=repo/'docs/contracts/C197_HERO5_SKILL_REBALANCE.md';s=p.read_text(encoding='utf-8').replace('Version: 1.1.1','Version: 1.1.2');s+='\n## 1.1.2 Presentation binding (2026-10-24)\n\n[C199](C199_HERO5_ASSET_GRID.md) owns canonical Hero5 visual roles and\n3x3/400px texture normalization. In particular Skill1 impact cannot be replaced\nby stale remote frame metadata. Gameplay coefficients/timing are unchanged.\n\n| Version | Date | Change |\n|---|---|---|\n| 1.1.2 | 2026-10-24 | Link canonical presentation grid/role policy without changing skill balance. |\n';p.write_text(s,encoding='utf-8')
 p=repo/'docs/contracts/C199_HERO5_ASSET_GRID.md';s=p.read_text(encoding='utf-8').replace('Status: IN_PROGRESS','Status: ACTIVE');s+='\nAcceptance: TestHero5AssetGrid PASS all90 frames/ten sheets,400x400 regions,\n1200x1200 textures, row-major cells, cache identity and scoped derivative\ncleanup. Actual projectile collision with deliberately wrong root/level remote\nframe arrays spawns the requested PNG at all nine frames, keeping60+25 damage.\nWhole-image icons remain1254x1254. Hero5 layered/golden-body and Hero3 falling\nseal regressions plus full client/server static suites PASS. Gate score9/10.\nPNG source files and server skill data are unchanged; no seed/publish/deploy.\n';p.write_text(s,encoding='utf-8')
 p=repo/'docs/contracts/REGISTRY.json';d=json.loads(p.read_text(encoding='utf-8'));next(x for x in d['contracts'] if x['id']=='C197_HERO5_SKILL_REBALANCE')['version']='1.1.2';next(x for x in d['contracts'] if x['id']=='C199_HERO5_ASSET_GRID')['status']='ACTIVE';p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
