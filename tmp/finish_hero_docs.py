from pathlib import Path
import json,re
ROOT=Path(__file__).resolve().parents[2]
# Regenerate only current hero pages after terminology review, not the notices.
namespace={'__file__':str(ROOT/'server/tmp/update_hero_docs.py')}
exec((ROOT/'server/tmp/update_hero_docs.py').read_text(encoding='utf-8').split('BASE=')[0],namespace)
for name in ['server','client']:
 repo=ROOT/name
 for number in range(1,6):namespace['hero_doc'](repo,number)
 registry_path=repo/'docs/contracts/REGISTRY.json';registry=json.loads(registry_path.read_text(encoding='utf-8'));entries={e['id']:e for e in registry['contracts']}
 # Replace the stale fixed-domain summary with current level-scaled behavior.
 p=repo/'docs/contracts/C180_HERO_1_ICE_DOMAIN_LAYERS.md'
 p.write_text('''# C180 — Hero 1: Cực Địa Băng Giới, các tầng hiển thị

Status: ACTIVE
Version: 1.0.2
Updated: 2026-10-24

Thông số hiện hành: [Hero 1](../heroes/HERO_1.md), [mục lục 5 hero](../HERO_SKILLS_CURRENT.md).
Sau C189, băng giới là **hero_1_skill_3**, không phải slot 4. Tên asset
hero_1_skill4_* được giữ lại để tương thích artwork, không quyết định slot skill.

## Dữ liệu và cơ chế

Đây là skill hỗ trợ, `damage_pct=0`, không gây sát thương trực tiếp.
Mở theo hero Lv20, chọn trong trận từ Lv10.

| Thông số | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| Hồi chiêu (s) | 15 | 14.5 | 14 | 13.5 | 13 |
| Tồn tại (s) | 6 | 7 | 8 | 9 | 10 |
| Bán kính (px) | 240 | 250 | 260 | 270 | 280 |
| Giảm tốc đánh quái (%) | 20 | 22.5 | 25 | 27.5 | 30 |
| Giảm giáp quái (%) | 15 | 17.5 | 20 | 22.5 | 25 |

Range chọn mục tiêu 768px; chậm di chuyển 10% ở biên tới 50% tại tâm;
lúc tạo vùng có 50% cơ hội choáng mục tiêu 0,1s. Tạo vùng mới dọn vùng,
visual và modifier cũ **cùng caster**, không ảnh hưởng caster khác.
Vùng được quét ở 10Hz; modifier rời vùng/được dọn phải được thu hồi.

## Các tầng hiển thị qua AtlasRegistry

| Tầng | Asset | Hành vi |
|---|---|---|
| 1 | hero_1_skill4_1.png | Beam 3×3, 9 frame; giáng một lần từ phía trên. |
| 2 | hero_1_skill4_2.png | Băng vệt 3×3, 9 frame; phát một lần, giữ trạng thái rồi fade. |
| 3 | hero_1_skill4_3.png | Băng ấn 3×3, 9 frame; loop ở tâm vùng. |
| 4 | hero_1_skill4_4.png | Tile seamless 128×128, source scale0.5; chỉ shader lặp và mask tròn theo bán kính. |

Ba sheet lớn dùng ô400×400. Không để TextureRect tự tile thêm ngoài shader.
Không có RPC mới; snapshot cấu hình server là bắt buộc theo C121,
không có fallback gameplay JSON phía client. UiSkin/signals không đổi.

## Changelog

| Version | Ngày | Thay đổi |
|---|---|---|
| 1.0.2 | 2026-10-24 | Đồng bộ mô tả hiện hành, slot3 và bảng theo cấp; liên kết trang Hero1. |
| 1.0.1 | 2026-10-24 | Đường cong hỗ trợ theo cấp, không damage, thay vùng theo owner. |
| 1.0.0 | 2026-10-23 | Phiên bản lịch sử có field10s/CD15s và slot4 trước C189. |
''',encoding='utf-8')
 if 'C180_HERO_1_ICE_DOMAIN_LAYERS' in entries:entries['C180_HERO_1_ICE_DOMAIN_LAYERS'].update(version='1.0.2',updated_at='2026-10-24')
 # Keep old curve methodology explicitly historical when newer contracts override it.
 for cid,version,hero in [('C162_HERO_SKILL_DAMAGE_CURVES','1.0.2',None),('C183_HERO_3_FALLING_SEAL','1.0.2',3),('C185_HERO_1_SKILL_UNLOCKS','1.0.1',1)]:
  p=repo/'docs/contracts'/f'{cid}.md'
  if not p.exists():continue
  s=p.read_text(encoding='utf-8');s=re.sub(r'(?m)^Version: [^\n]+',f'Version: {version}',s,count=1)
  if cid.startswith('C162'):
   notice='> **Hiện hành:** [Bảng của đủ 5 hero](../HERO_SKILLS_CURRENT.md). Công thức làm phẳng đường cong bên dưới là lịch sử; các override C189/C195/C196/C197 và bảng source hiện tại thay thế khi có mâu thuẫn. Không áp lại planner cũ như thông số hiện hành.'
  elif cid.startswith('C183'):
   notice='> **Cập nhật theo C195:** [Hero 3 hiện hành](../heroes/HERO_3.md). Hồi chiêu Skill 2 là 8/7,5/7/6,5/6s trước bonus Thất Tinh Trận; damage và ba sóng vẫn theo bảng hiện tại. Các mô tả giữ cooldown cũ bên dưới là lịch sử.'
  else:
   notice='> **ĐÃ ĐƯỢC C189 THAY THẾ VỀ GATE:** [Hero 1 hiện hành](../heroes/HERO_1.md). Level hero mở skill là 1/10/20/30; chọn trong trận là 1/5/10/15; domain ở slot3, mastery ở slot4. Mốc5/10/15 bên dưới là lịch sử, không còn áp dụng.'
  parts=s.split('\n',1);s=parts[0]+'\n\n'+notice+'\n'+parts[1]
  s=namespace['add_changelog'](s,version,'Đồng bộ đường dẫn thông số hiện hành và phạm vi override; không thay config/gameplay.')
  p.write_text(s,encoding='utf-8')
  if cid in entries:entries[cid].update(version=version,updated_at='2026-10-24')
 # C184 is kept as the focused vortex contract, not an old HP-based recipe.
 p=repo/'docs/contracts/C184_HERO_4_VENOM_VORTEX.md'
 if p.exists():
  p.write_text('''# C184 — Hero 4 Venom Vortex

Version: 1.0.1
Status: ACTIVE
Updated: 2026-10-24

Current scope follows [C196](C196_HERO4_SKILL_REBALANCE.md) and the complete
[Hero 4 page](../heroes/HERO_4.md). Authoritative row: hero_4_skill_4 in server
skills.json, transported by the existing seed/config RPCs. C121 applies.

Vortex loops for2.5s and rotates400 degrees/s. Animation cycles in1s.
Total ATK damage120/130/140/150/160 percent is split into five equal ticks at
0/0.5/1/1.5/2s. Every tick independently rolls20% stun0.1s per target.
Needles4/5/6/7/8 begin at0.5s, spaced0.1s, with independent random directions.
Each needle deals25/27.5/30/35/40 percent ATK; needle range250/275/300/325/350px;
vortex radius80/85/90/95/100px. Existing cooldown13.5/12.6/11.7/10.8/9.6s.

Each actual needle hit adds5% snapshot caster ATK to current poison DPS and
adds0.5s to remaining duration (none ->0.5s). Total poison capped at5000 DPS;
ordinary poison cannot bypass active cap. Expiry/actor reset clears cap.
This replaces the former0.2% max-HP stack/cap1.2% and3s refresh recipe.
Needle frame hero_4_skill_4b_frame_0 uses the complete image, not a ninth.
All artwork comes from AtlasRegistry. No local gameplay fallback/new RPC.

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.1 | 2026-10-24 | Replace outdated2s/HP poison description with C196 behavior and current curve reference. |
| 1.0.0 | 2026-10-23 | Historical looping vortex/needle image and former HP-poison balance. |
''',encoding='utf-8')
  if 'C184_HERO_4_VENOM_VORTEX' in entries:entries['C184_HERO_4_VENOM_VORTEX'].update(version='1.0.1',updated_at='2026-10-24')
 registry_path.write_text(json.dumps(registry,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Reconciled active domain/vortex docs, historical curve/gate notices and registry patch versions.')
