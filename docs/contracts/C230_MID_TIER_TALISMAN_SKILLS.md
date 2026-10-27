# C230 — Pháp Bảo Trung phẩm: 31 tầng và effect gameplay

Version: 1.0.0 | Status: IN_PROGRESS | Updated: 2026-10-27

## Scope và nguồn chuẩn

Triển khai ID 16–25 theo hình thực tế và kế hoạch `client/docs/reports/mid_tier_talismans/plan.md`. 31 ảnh = 31 loại layer: ID 16 có 4 (một overlay tĩnh 256px); ID 17–25 có 3 sheet 1200×1200 / 400px mỗi frame. Không bỏ tầng, không cộng damage theo số tầng hoặc frame. Giữ hệ catalog: water/wood/water/fire/earth/metal/wood/water/fire/earth. ID 22 đổi tên skill thành Thần Mộc Long Hộ theo hình rồng/khiên/hồi phục.

## Thứ tự triển khai và mô tả

Contract và `description`, `description_rows` top-level/từng level trong seed phải cập nhật trước runtime. Mô tả trang bị `talismans.skill` và `items.attributes.skill_description` đồng bộ. Tham số/nội dung dưới đây thay các mô tả cũ của Trung phẩm trong C015; C137 giữ nhận diện ID 16 và các skill phẩm cao.

| ID | Damage L1–L5 | Effect và timing |
|---|---|---|
| 16 | 120/150/180/210/240% | Giữ runtime ice: kiếm 30%, cụm băng 70%, freeze 3s; sửa frame/pivot theo kích thước thực. |
| 17 | 150/165/180/195/210% | Trảm xuyên, một hit/target; deep_wound 50%/4s ở hit. Hai vết nứt và hồn chỉ cosmetic. |
| 18 | 180/195/210/225/240% | Cột 2/3 đơn mục tiêu tại 0.25s; flash 1/6 AOE; điện lan 1/6 chia 3 tick. Cột roll paralyze 35%/0.5s một lần. |
| 19 | 240/255/270/285/300% | Vòng lửa 4s theo hero, áp burn 4s một lần/target/cast; toàn budget là burn 8 tick 0.5s, không direct AOE. |
| 20 | 0 | Chuông hình thành 0.12s: damage_reduction 50% + control_immune 4s. Sen và phù chỉ cosmetic. |
| 21 | 110/125/140/155/170% | Tối đa 3 target; direct 50/110 budget, poison 60/110 trong 4 tick 1s. Pool cosmetic; dấu độc theo status. |
| 22 | 0 | Tại 0.3s: shield 15% Max HP/3s, regen 2% Max HP/s ×3. Không damage, root hoặc hút mana. |
| 23 | 180/195/210/225/240% | 7 kiếm, cách 0.12s, trọng số 1..7 chia 28; mỗi kiếm một hit, burst cosmetic. |
| 24 | 80/90/100/110/120% | Tối đa 3 target, hit tại 0.33s; root 1.2s + silence 2s. Không biến root/silence thành stun. |
| 25 | 180/195/210/225/240% | Ấn 60% tại 0.38s; vòng quét 40%, một hit/target; stun 0.6s + knockback 60 tại vòng chạm. |

Cooldown mới ID 17–25: 30/29/28/27/26s; ID 16 giữ curve hiện tại để hồi quy. Mọi phần damage tính theo ATK chiến đấu cuối, qua DEF/crit/resistance và element chuẩn; không nhân độ bền lần hai. Chance effect qua EffectService đúng một lần, kháng/immunity/boss duration giữ luật chung.

## Schema và API

- `skills`: `skill_type: layered_talisman`, `cast_config: {behavior,range,duration,damage_pct,layers:{semantic_id:{frames,pivot,scale,start_at,duration,cycle,loop,hold,layer}},effect_bindings:[{id,phase,layer,chance,duration,...}]}`. Level override chỉ damage/cooldown, shallow merge không được làm mất layer.
- `MidTierTalismanCast` kế thừa helper cast/ledger của LayeredTalismanCast, validate riêng chín behavior. SkillManager chọn qua behavior/config; không hardcode ID. Buff self 20/22 không cần enemy; offensive thiếu target bị từ chối.
- TalismanLayer lấy tâm từ frame thật; phiên bản source pixel cũ có thể khai báo `coordinate_size: 256` để giữ hình phẩm cao. Các layer Trung phẩm dùng source pixel 400; overlay 256 giữ 256. Status layer theo đúng source scope/target generation.
- StatusEffectController hỗ trợ `scope_key` cho contribution độc lập: cùng caster/skill/status refresh, khác nguồn giữ riêng; `has`, `get_remaining`, `get_parameter`, UI snapshot vẫn canonical. DOT scoped do status_ticked xử lý đúng một lần, không đi vào timer DOT legacy của Enemy. Cleanse/remove/clear/pool reset phải xóa scope tương ứng. Damage type/element đi cùng tick để không đổi ngũ hành.
- Player scoped shield có capacity riêng; tiêu hao độc lập với item/legacy shield, recast cùng scope không cộng capacity. Regen dùng tick status hiện có; reduction dùng combat chung. Status UI gộp một icon/canonical effect, không nhân stack damage.
- Enemy root chặn di chuyển nhưng không basic attack; silence chặn/ngắt boss skill chứ không basic; control_immune chặn hard control; paralyze canonical stun. Scoped burn/poison shader/icon tồn tại đúng status.

## Authority / RPC / offline

Không đổi RPC hoặc payload C015. Snapshot server đầu trận quyết định trang bị, level, lượt và durability. 3 lượt active/trận theo config, không đưa vào pool card. C121 online-only: thiếu/invalid config chặn cast, không local gameplay fallback. Source JSON là seed; không tự publish production. Client có runtime mới trước khi publish behavior mới.

## Verification / gates

31 file phải có mapping và frame đúng. Test mỗi chiêu đủ tầng, damage/effect timing, chance 0/1, immunity/resistance, boss policy, long frame, cleanse, pooled target, caster death, interrupt/pause/scene reset; DOT cùng/khác nguồn Hero không đè nhau; shield vỡ/hết hạn; tổng 7 kiếm; ring sweep; root/silence/basic distinction. Kiểm tra mô tả năm level, giữ element ba catalog, hồi quy 14 skill Hạ phẩm và sáu cast C137. Chạy static client/server và parser; không coi test logic là playtest art trên thiết bị.

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-27 | Docs và mô tả trước runtime; 31 tầng Trung phẩm, effect thật và scope DOT/shield. |

## Kết quả triển khai

2026-10-27: source/seed JSON và 31 tầng đã triển khai, mô tả trước code. Runtime Trung phẩm, Hạ phẩm, C137 và static/data tests riêng đều PASS. Đã render fixture OpenGL. Chưa publish DB; backend suite tổng dừng ở lỗi stamina gói ngày 200/330 ngoài phạm vi. Giữ IN_PROGRESS cho nghiệm thu phát hành. Báo cáo: client/docs/reports/mid_tier_talismans/IMPLEMENTATION.md.
