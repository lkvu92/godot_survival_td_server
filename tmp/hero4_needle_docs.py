from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[2]
for name in ['server','client']:
 repo=ROOT/name;p=repo/'docs/heroes/HERO_4.md';s=p.read_text(encoding='utf-8').replace('Version: 1.0.1','Version: 1.0.2').replace('| `needle_vfx_frames` | 1 |','| `needle_vfx_frames` | 9 |')
 start=s.index('## Chuẩn hóa asset — C200');end=s.index('## Nguồn triển khai',start)
 s=s[:start]+'''## Chuẩn hóa asset — C200 v1.1.0

Cả **6 sheet animation**, gồm cả kim Skill4, dùng lưới **3×3, 9 frame400×400px**.
PNG kim mới `hero_4_skill_4_2_animation.png` là1200×1200; danh sách nguồn
`needle_vfx_frames` gồm frame0 đến8. Kim bay loop animation theo nhịp0,06s/frame.
Role hiển thị kim qua AtlasRegistry bảo đảm đọc đủ9 frame ngay cả khi metadata
cũ của server chỉ có1 frame. Không đổi damage, tốc độ bay, scale hay độc.
Chỉ các icon `*_projectile.png` vẫn là ảnh đầy đủ.
Chi tiết: [C200](../contracts/C200_HERO4_ASSET_GRID.md).

'''+s[end:];s=s.replace('| 1.0.1 | 2026-10-24 |','| 1.0.2 | 2026-10-24 | Kim Skill4 đã đổi sang animation3×3/9frame400px. |\n| 1.0.1 | 2026-10-24 |',1);p.write_text(s,encoding='utf-8')
 p=repo/'docs/contracts/C184_HERO_4_VENOM_VORTEX.md'
 if p.exists():
  s=p.read_text(encoding='utf-8').replace('Version: 1.0.1','Version: 1.0.2').replace('Needle frame hero_4_skill_4b_frame_0 uses the complete image, not a ninth.','Needle now uses frame_0 through frame_8 of a3x3/400px sheet under C200 v1.1.0.');s=s.replace('|---|---|---|','|---|---|---|\n| 1.0.2 | 2026-10-24 | Updated user needle sheet to nine400px animation cells; balance unchanged. |',1);p.write_text(s,encoding='utf-8')
 p=repo/'docs/contracts/C200_HERO4_ASSET_GRID.md';s=p.read_text(encoding='utf-8').replace('Status: IN_PROGRESS','Status: ACTIVE').replace('Acceptance: Godot TestHero4AssetGrid PASS45','Historical1.0.0 acceptance: Godot TestHero4AssetGrid PASS45');row='| 1.1.0 | 2026-10-24 | Replace former whole-image needle with user-provided3x3/nine400px animation and canonical role. |';s=s.replace('\n'+row+'\n','\n');s=s.replace('|---|---|---|','|---|---|---|\n'+row,1);s+='\n1.1.0 validation: Godot TestHero4AssetGrid PASS54 cells/six sheets and\nreal flying needle animation frames0..8 then loop0, with stale one-frame\nmetadata overridden cosmetically. TestHero4Vortex emission/DPS/stun/poison\nregressions and complete server/client static suites PASS. Gate score9/10.\nServer seed frame array now has9 IDs; no live seed/publication performed.\n';p.write_text(s,encoding='utf-8')
 p=repo/'docs/contracts/REGISTRY.json';d=json.loads(p.read_text(encoding='utf-8'));e=next(x for x in d['contracts'] if x['id']=='C200_HERO4_ASSET_GRID');e['status']='ACTIVE'
 for entry in d['contracts']:
  if entry['id']=='C184_HERO_4_VENOM_VORTEX':entry['version']='1.0.2'
 p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 p=repo/'docs/INDEX.md';s=p.read_text(encoding='utf-8').replace('five animation sheets at3x3/400px; needle/icons stay whole-image.','v1.1.0: six animation sheets at3x3/400px including the updated needle; UI icons stay whole-image.');p.write_text(s,encoding='utf-8')
