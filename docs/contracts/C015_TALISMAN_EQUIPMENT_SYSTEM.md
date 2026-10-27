# C015 — Talisman low-tier balance

Version: 1.17.0

## Addendum 1.17.0 — Pháp Bảo Trung phẩm theo C230 (2026-10-27)

ID 16–25 dùng 31 tầng từ ảnh thực tế và effect thật theo [C230](C230_MID_TIER_TALISMAN_SKILLS.md), thay mô tả/behavior Trung phẩm cũ. ID 22 đổi tên skill thành Thần Mộc Long Hộ (shield + regen), không còn trói/hút chân khí. Hệ ngũ hành chuẩn giữ nguyên; skill seed khai báo element tường minh. Description top-level, từng level, talismans.skill và items.attributes.skill_name/skill_description phải đồng bộ. Source đã triển khai; chưa publish DB.

## Addendum 1.16.2 — Hấp Huyết Thứ Hạ phẩm: dây gai và nhịp hút máu (2026-10-27)

Giữ ID 14 Hạ phẩm, hệ Mộc: đơn mục tiêu 100% ATK, hồi 20% HP thực mất sau DEF/shield, không trói hoặc gây DOT. Dùng sheet dây gai người dùng đã sửa tại `skill_talisman_14/layer-01-thorn-impact.draft.png`, thực tế 1200×1200 / 9 frame 400×400 dù tên file còn draft. Atlas phải trỏ tới sheet này thay xoáy đỏ.

`lifesteal_strike.cast_config` thêm `impact_delay: 0.21`, `vfx_duration: 0.63`, `vfx_layer: 65`. Dây gai bám mục tiêu, chạy một lần 9 frame (0.07s/frame); hit và heal đúng một lần ở đầu frame 4. Callback kiểm tra caster sống, target sống và spawn generation trước khi hit; target chết hoặc được tái sử dụng không chuyển hit sang quái mới. Không có target thì cast thất bại. Giữ nguyên RPC, giới hạn lượt và độ bền C015/C121. Khi không khai báo impact_delay, family vẫn hỗ trợ hit ngay cho các skill khác. AttachedSkillVfx.setup thêm tham số cuối `loop_animation: bool = true`; false chạy một lần theo lifetime.

Kiểm thử: đúng asset 400px/frame, VFX theo target, chưa damage trước 0.21s, đúng 100% và hồi 20%; shield/overkill không hồi thừa; target tái sử dụng không ăn hit; không đánh lại theo frame. Chỉ cập nhật source/seed; chưa publish DB.

## Addendum 1.16.1 — Kiểm tra asset người dùng chuẩn hóa (2026-10-27)

Đã kiểm tra 15 PNG chính ID 1–15: RGBA 1200×1200, lưới 3×3, mỗi frame 400×400. Atlas khai báo rõ frame_width/frame_height = 400; cập nhật toàn bộ region theo kích thước mới. Skill 14 chuyển từ draft 1254×1254 sang `huyet_dang_ho_menh.png` 1200×1200 do người dùng chuẩn hóa; giữ draft cũ làm lịch sử. PNG chuẩn kích thước không đồng nghĩa đã đạt nội dung hình ảnh: asset 14 chính hiện là xoáy đỏ, chưa phải dây gai; vẫn cần kiểm tra pivot/viền dư và gameplay trên thiết bị.

## Addendum 1.16.0 — Cân bằng và tích hợp 14 Pháp Bảo Hạ phẩm (2026-10-27)

**Status: IN_PROGRESS.** Mục này thay thế các thông số ID 2–15 trong bảng 4.3 và addendum cũ. ID 1 giữ nguyên theo yêu cầu; ID 16–30 không thay đổi. Đây là baseline cân bằng cần kiểm chứng runtime và trải nghiệm, chưa phải kết luận playtest hoàn tất.

### Nguồn chỉ số và giới hạn phẩm cấp

- `% ATK` là ATK chiến đấu cuối của hero (`player.attributes.atk`), đã cộng thuộc tính pháp bảo sau hệ số độ bền; không nhân ATK trang bị hoặc hệ số độ bền lần thứ hai. Đây là công thức runtime hiện hành, áp dụng cả skill phẩm cao. Sửa cách gọi mơ hồ “ATK pháp bảo” trong mô tả hồi máu.
- Hạ phẩm hỗ trợ một vai trò chính. Chiêu xuyên/AOE có hệ số thấp hơn chiêu đơn mục tiêu; khống chế ngắn và xác suất thấp; không có sát thương chuẩn, execute hoặc debuff vĩnh viễn. Buff không cộng dồn cùng ID.
- Các hệ số trong bảng cố định ở cả 5 level skill; cường hóa vẫn tăng thuộc tính trang bị, cooldown level 1–5 là 30/29/28/27/26 giây. Không tăng số đạn, damage hoặc thời gian buff ngầm ở level cao. Passive không có cooldown cast.
- Mốc đối chiếu: ID 16 có 120% AOE và freeze 3s; ID 26 có tổng 120%, ignore DEF/execute; ID 29 có 140% AOE và debuff kéo dài. Hạ phẩm không sao chép những đặc quyền này. Đơn mục tiêu có thể đạt hệ số cao hơn AOE để bù phạm vi; không khẳng định phẩm cấp chỉ dựa trên một con số damage.

| ID | Pháp bảo / Skill | Baseline mới (mọi level skill) | Thay đổi so với cũ |
|---|---|---|---|
| 2 | Xích Đồng Đao / Xích Viêm Trảm | 60% mỗi tia; tâm tổng 150%; xuyên, mỗi mục tiêu tối đa 150% | 150/400 → 60/150 |
| 3 | Bách Luyện Thương / Bách Luyện Phá Giáp | 140–180% đơn mục tiêu; bỏ qua 15% DEF | 200–800%, 30% → 140–180%, 15% |
| 4 | Ô Thiết Thuẫn / Ô Thiết Hộ Bích | +15% DEF và miễn critical 3s; vẫn chịu damage thường | +20%, 5s → +15%, 3s |
| 5 | Lưu Thủy Hoàn / Thủy Ba Tẩy Lễ | Cleanse ngay; miễn debuff 2s; hồi 3% Max HP/s, tổng 6% | 3s/30% HP → 2s/6% HP |
| 6 | Huyền Mộc Trượng / Hồi Xuân Quyết | Hồi tức thời 150% ATK, không vượt Max HP | 250% → 150% |
| 7 | Phá Nham Chùy / Liệt Địa Trọng Kích | Trả tối đa 10% Max HP, không dưới 1 HP; 180% AOE tại mục tiêu, radius 120 | 20%/700%/170 → 10%/180%/120 |
| 8 | Băng Tinh Châm / Hàn Băng Thần Châm | 3 tia song song, 45%/tia; 20% freeze 0.5s mỗi hit | 200%, 40%/1s → 45%, 20%/0.5s |
| 9 | Hỏa Vân Phiến / Hỏa Diễm Tản | Sóng xuyên 90%, knockback 50 | 300%/90 → 90%/50 |
| 10 | Tỏa Hồn Linh / Kim Cang Định Tâm | 70% AOE radius 100; 25% stun 0.35s mỗi target | 150%/145/40%/0.5s → 70%/100/25%/0.35s |
| 11 | Tật Phong Tiễn / Tật Phong Tiễn | 3 mũi 25/45/70%; knockback 20/35/50; tổng tối đa 140% | 50/100/200%; 40/80/120 → baseline mới |
| 12 | Hoàng Thổ Ấn / Thái Sơn Hộ Thể | +30% DEF trong 3s, không DEF phẳng | base × 1.4 + 200 trong 5s → base × 1.3 trong 3s |
| 13 | Lôi Lôi Châm / Cửu Thiên Lôi Giật | 3 nhịp 35%, chọn lại target mỗi nhịp; 20% stun 0.3s | 100%, 40%/0.5s → 35%, 20%/0.3s |
| 14 | Hấp Huyết Thứ / Huyết Đằng Hộ Mệnh | Đơn mục tiêu 100%; hồi 20% HP thực bị trừ; không hút từ shield/overkill | 250%/30% → 100%/20% |
| 15 | Dạ Quang Châu / Quang Mang Hộ Thể | 3 cầu, radius 0.25 viewport height; 8%/contact, quay 4s; cooldown 1.5s/orb/target và target cap 1 hit/0.5s | 35%, 3s, 0.35s → baseline mới |

Passive ID 15 có trần lý thuyết 16% ATK/s trên cùng một target trước DEF nhờ target cap; không giới hạn tổng damage cả trận. Theo dõi riêng trận dài, không so trực tiếp tổng damage passive với một lần active. Không tạo hai bộ orb khi setup lặp; orb dừng khi caster chết.

### Schema, giao diện và online authority

- Server seed `skills.json`: `{id, skill_type, cast_config, levels:[{level, stats, description_rows, effects}]}`; `levels[].cast_config` nếu có phải đồng nhất baseline, không che thông số cũ. `stats.damage_pct` là giá trị đại diện: tâm X, kỳ vọng đòn đơn, tổng volley hoặc damage mỗi contact. `cast_config` quyết định số hit và hệ số thực. Mô tả top-level và từng level phải khớp config.
- Giữ mapping `talismans[id].skill_id` và `items[talisman_ID].attributes.skill_id`. Gameplay JSON chỉ ở server; client chỉ giữ manifest presentation.
- Giữ RPC `talisman_cast` theo C015 hiện hành; không thêm payload. Server snapshot đầu run quyết định món, level, lượt và độ bền. Active tối đa 3 lượt, 1 durability/cast; hao mòn kết trận theo cấu hình server hiện hành. Passive không RPC cast, không lượt/cooldown cast.
- Dùng `SkillManager._cast_config`, `_cast_skill`, `_setup_talisman_passive`; các cast family dùng chung. `OrbitingContactEffect.setup` thêm `target_contact_cooldown: float > 0` cùng cooldown từng orb.
- Thiếu cấu hình hoặc mất kết nối phải chặn gameplay/mutation theo C121; không lấy gameplay JSON local hoặc fallback inventory để thay snapshot server trong trận online.

### Asset và trình tự nghiệm thu

1. Nhóm 1: ID 2/3/8/9/11 — đường đạn, hitbox, xuyên, tổng damage.
2. Nhóm 2: ID 4/5/6/12 — thời hạn, DEF, cleanse, tick heal.
3. Nhóm 3: ID 7/10/13/14 — HP cost, delay impact, chọn target, damage thực.
4. Nhóm 4: ID 15 — target cap, không nhân đôi passive, chết/kết trận/pause.

Kiểm kê PNG hiện có trước khi thay. Asset hợp lệ được tái sử dụng; asset sai nội dung hoặc frame/pivot cần sửa đúng layer. Texture/frame chỉ qua AtlasRegistry; 3×3/9 frame, alpha thật, region khớp PNG, pivot ổn định. Chưa gọi asset “đạt chuẩn” chỉ vì tồn tại file. Preview từng nhóm và lưu bằng chứng; VFX rơi phải chạm đất mới gây damage, buff đi theo hero và kết thúc đúng hạn. Sheet kích thước cũ được giữ khi lưới hợp lệ; sheet tạo mới theo skill VFX là 1200×1200 / 400×400 mỗi frame.

Gate 4: static client và backend; parser Godot; test mapping/5 level/budget/asset frames; runtime đủ 14 family, thiếu target không mất HP, overkill/shield không hút thêm máu, purify tick đúng, DEF hết hạn, passive target cap và lifecycle. Kiểm tra hồi quy ID 1 và 16–30. Build Nakama nếu sửa runtime TS. Publish/seed DB là bước triển khai riêng; sửa seed file không đồng nghĩa dữ liệu live đã đổi.

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.17.0 | 2026-10-27 | Trung phẩm 31 tầng theo C230, tên/mô tả và element đồng bộ. |
| 1.16.2 | 2026-10-27 | Hấp Huyết Thứ hit một lần ở nhịp siết gai. |
| 1.16.1 | 2026-10-27 | Đồng bộ asset chuẩn hóa 400px/frame. |
| 1.16.0 | 2026-10-27 | Baseline ID 2–15; shared with client C015. |
