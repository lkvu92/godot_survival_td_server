# Arc 7 — Vạn Yêu Cổ Lĩnh: Rừng Thiêng Đẫm Máu

## Revision 1.5.0 — Campaign continuation (2026-10-29)

Implemented: shared Arc6 CORE population/roles, shared formation/EXP utilities,
Lv60 role-normalized bases and continuing authored HP/ATK/DEF curves. This
supersedes the old standalone 1.00–1.315 stage curve and count cap of 15.
See reports/ARC7_PROGRESSION_V2.md for 135 mortal runs and limitations. Previous
all-pass balance evidence is invalid for this revision; full per-hero loadout
tuning and minimum-power recommendation are not claimed by the new audit.

Ngày: 2026-10-29. Trạng thái: kế hoạch tích hợp, chưa triển khai gameplay. Contract C237 v1.1.0. Background/minimap ?? t?o v? ??ng k?; gameplay ch?a tri?n khai.

## Phạm vi đã chốt

- 10 stage `stage_7_01` … `stage_7_10`, mỗi stage 20 wave theo pipeline campaign hiện hành.
- Stage 5, wave 20: **Bạch Hổ Yêu Vương**, asset `client/assets/boss/bach_ho_yeu_vuong`.
- Stage 10, wave 20: **Chu Tước Nữ Vương**, asset `client/assets/boss/chu_tuoc_nu_vuong`.
- 7 creep từ `client/assets/creep/arc7`; 15 chiêu sử dụng 30 PNG VFX trong `client/assets/skill_vfx/creep/arc7`.
- Hero **Lv60 cố định** là nền tảng cân bằng toàn arc. Stage có thể mang level tiến trình 61–70 nhưng không được tự đổi baseline thành Lv61–70.
- Hệ ngẫu nhiên trong Kim/Thủy/Mộc/Hỏa/Thổ, xác suất 20% mỗi hệ. Màu và motif VFX giữ theo nhân vật.

## Bối cảnh và nhịp chiến đấu

Rừng cổ thụ che kín trời, chướng khí tím sát đất, hài cốt cự thú và dấu tích săn mồi. Lời dẫn dùng cốt truyện người dùng cung cấp: yêu tộc lấy nhục thân và huyết mạch làm gốc, cuồng bạo khi thấp máu, Yêu Vương áp chế bằng pháp tướng. Giai đoạn đầu dạy đọc hướng đòn; giữa arc phối hợp lao và đạn; cuối arc tăng áp lực né vùng và bạo thể.

Áp bách huyết mạch và chướng khí trước mắt là bối cảnh/visual. Không ngầm giảm tốc hero, khóa hồi chiêu hay thêm độc toàn bản đồ. Nếu thêm debuff môi trường phải có thiết kế và phép đo riêng.

## Roster và kỹ năng

| ID asset | Vai trò | Chiêu duy nhất / hành vi |
|---|---|---|
| pha_son_cu_vien | Bruiser | C01 Phá Nham Quyền; đấm nặng, hit một lần |
| huyet_man_cuong_su | Melee DPS | C02 Huyết Nha Phệ; ngoạm một mục tiêu |
| co_giap_long_te | Tank | C03 Thiết Giác Xung; báo đường, khóa hướng, húc ngắn |
| doc_tich_man_ngac | Ranger | C04 Chướng Độc Thóa; đạn độc và DoT, không thêm vũng |
| loi_trao_hung_bi | Bruiser | C05 Lôi Liệt Trảo; quét cận, không mặc định gây stun |
| huyen_lan_long_bao | Chaser | C06 Huyền Ảnh Tập; vồ nhanh một nhịp |
| man_cot_toan_nghe | Ranger | C07 Cốt Khí Phá; một đạn cốt khí |

Bạch Hổ có đúng 4 chiêu: B01 Bạch Kim Hổ Trảo; B02 Liệp Ảnh Vồ Sát; B03 Hổ Khiếu Chấn Lĩnh; B04 Bạo Thể·Vạn Yêu Phục. B01 là cơ bản, B04 là bạo thể, không cộng thêm đòn thứ năm. B03 là mặt sóng một lần, không tick cả hình tròn.

Chu Tước có đúng 4 chiêu: Z01 Xích Vũ Liên Châu (3 đạn lệch nhịp); Z02 Liệt Dực Hoành Tảo; Z03 Thiên Vũ Lạc Hỏa (3 điểm khóa sau báo trước); Z04 Chu Tước·Phần Thiên Lĩnh (hỏa ảnh, sóng, vành lửa). Không hồi sinh/hồi đầy máu. Z04 phải có lối né, không phủ kín đấu trường.

Chi tiết layer/tái sử dụng lấy từ `../../client/assets/skill_vfx/creep/arc7/plan.md` tính từ server root; đường dẫn tương đối từ tài liệu này là `../../client/assets/skill_vfx/creep/arc7/plan.md`. Kiểm tra native dimensions, alpha, pivot, grid của từng PNG trước đăng ký; không mặc định mọi file đúng 1200×1200 và không tạo lại ảnh để sửa kích thước. Một số chiêu chưa có manifest: C05, C07; phải bổ sung metadata trình bày khi tích hợp.

## Cân bằng dựa trên Lv60

Nguồn: `server/data/heroes.json`, cách tăng chỉ số trong `UserContext._apply_level_up_stats_to_attributes`. HP/ATK/DEF = base × growth^59. Các số sau làm tròn để tham khảo, chưa gồm trang bị, affinity, Law, card và skill:

| Hero | HP | ATK | DEF |
|---|---:|---:|---:|
| hero_1 | 25,995 | 1,640 | 134 |
| hero_2 | 4,832 | 6,347 | 21 |
| hero_3 | 13,693 | 1,854 | 467 |
| hero_4 | 6,582 | 2,344 | 34 |
| hero_5 | 25,453 | 1,711 | 213 |

Chênh lệch hero lớn nên không lấy trung bình HP/ATK rồi gán thẳng cho quái. Trích snapshot Lv60 qua service hiện hành, mô phỏng bằng công thức damage/DEF thật và kiểm tra cả 5 hero. Đóng băng loadout, skill levels, seed, mode và phương thức di chuyển trong fixture. Hai profile: base Lv60 không đồ để đo thuộc tính; loadout tham chiếu có khai báo để đo khả năng hoàn thành. Không dùng bất tử để kết luận cân bằng.

Mục tiêu ban đầu để hiệu chỉnh, chưa phải số đã nghiệm thu: creep thường chết sau 2–4 nhịp cơ bản; tank 5–8 nhịp; đòn thường lên hero_1 khoảng 3–5% HP sau mitigation; chiêu nặng boss 12–20%, có báo trước. Phải đo lại với hero_2/4 và toàn bộ tổng damage của 3 đạn Z01/DoT/zone, tránh one-shot do cộng dồn. Boss HP nhắm khoảng 45–75 giây chiến đấu chủ động, không kéo dài chỉ nhờ DEF.

Không chốt curve stage 1.00–1.45/wave 1.00–1.30 từng đề xuất trước khi audit pipeline hiện hành. Base attribute của từng vai trò được hiệu chỉnh từ fixture Lv60; không bê base Arc6 rồi nhân tiếp curve Arc6. Runtime áp độ khó đúng một lần; boss có budget riêng cho HP/ATK/DEF và multi-hit. Speed không ăn curve HP/ATK/DEF.

### Luồng attribute hiện hành đã đọc từ source

1. Persistent hero: server `progressionHeroAttributes`/`cpHeroAttributes`, client `CombatPowerService.hero_attributes` và `UserContext` dùng base nhân growth theo từng cấp cho HP/ATK/DEF/move_speed/attack_speed/attack_range; stat còn lại cộng theo cấp. Lv60 là 59 lần tăng, không phải run level 60.
2. Đầu trận `Player._build_starting_attributes` ưu tiên `hero_state.current_attribute`, chỉ dựng lại từ definition nếu trống; áp snapshot pháp bảo có durability, merge snapshot Thần Luân với overwrite rồi clamp. Chốt basic_attack_range từ definition riêng và lưu `base_attributes`. Không cộng lại bonus đã có trong current_attribute. Comment cũ về rune không đủ làm bằng chứng có một phép cộng rune riêng trong hàm hiện hành.
3. Lên cấp trong trận: stat nhân tăng tuyến tính `base_attributes[stat] × (growth−1) × 0.25` mỗi cấp; stat cộng tăng bằng growth. Bonus card phần trăm tích lũy trên `bonus_base_attributes`, không nhân lũy thừa mỗi lần nhặt. Phải mô phỏng EXP, card và skill unlock theo wave.
4. Quái: entry modifiers → `CampaignWavePressure.modifiers` nếu được bật → `WaveManager._difficulty_modifiers` → `Enemy._apply_modifiers` → generic buffs. Override tuyệt đối `hp/atk/def` ưu tiên hơn `*_mul`; HP/DEF cộng `*_add` sau đó. `max_hp_buff` còn nhân max_hp sau modifiers. Boss damage dạng flat được nhân atk_mul khi không có damage_multiplier; không giả định thay atk tuyệt đối cũng scale flat skill damage.
5. Pressure v1 thêm HP/DEF từ baseline wave đầu theo block growth_interval; tăng skill_recovery và bỏ qua boss. Đây là lớp tăng thêm, không được vô tình cộng trùng authored wave curve. Mỗi variant hệ mới cần baseline tương ứng hoặc kiểm tra fallback entry đầu wave 1.
6. Độ khó hiện tại hard-coded cho combat stats: Normal 1.00, Epic 1.25, Legend 1.50; speed_mul còn nhân cấu hình stage_level riêng. HP/ATK/DEF trong enemy_modifiers không phải nguồn quyết định ở hàm runtime này. Không nhân lại difficulty trong generator.
7. Damage ở `CombatFormulaService`: raw sau outgoing bonus × crit × elemental multiplier × `100/(100+effective_DEF)`, minimum 1 cho raw dương; còn các lớp giảm damage/status phía actor. Affinity, amplification, counter và resistance đều tác động; DoT/multi-hit phải đo từng nguồn. CP là chỉ số đề cử, không phải trực tiếp hệ số HP/ATK/DEF.

Tham chiếu source: `client/src/actors/Player.gd`, `Enemy.gd`, `client/src/services/CampaignWavePressure.gd`, `CombatFormulaService.gd`, `CombatPowerService.gd`, `client/src/managers/WaveManager.gd`, `server/nakama/data/modules/combat_power.ts`, `progression_rpc.ts`. Simulator phân tích chỉ hỗ trợ đề xuất; mortal Godot fixture mới là bằng chứng chốt cân bằng.

### Asset môi trường theo chuẩn hiện có

- Background gameplay/stage-select: các arc 2–7 dùng 572×1024. Tạo mới `client/assets/bg/arc7_van_yeu_co_linh_bg.jpg`, giữ `arc7_bg.jpg` cũ vì hình hiện tại là di tích pháp bảo. V1 dùng cùng background rừng cho 10 stage; phân biệt bằng tên/lore và encounter, không cần 10 ảnh gần giống nhau.
- Minimap clear stage/sweep: tạo `client/assets/ui/clear-map-widget/van-yeu-co-linh.png`, đúng 512×170 theo Arc6 (các arc khác cao 168–170). Banner cảnh ngang, không UI/text; palette và landmark đồng bộ rừng, chướng khí, xương cự thú.
- Đăng ký `arc_background_7` và alias `get_sweep_background(arc_van_yeu_co_linh)` qua AtlasRegistry. Generator stage sau này trỏ background mới; không sửa seed gameplay trong bước chuẩn bị asset. Kiểm tra import, kích thước và crop ở tỷ lệ hiển thị thật.

Bạo thể đề xuất: kích hoạt một lần khi HP ≤30%; creep ATK ×1.35, move speed ×1.15, không hồi máu, không tăng số đạn/hit. Bạch Hổ dùng B04 để vào bạo thể, Chu Tước chỉ tăng áp lực trong 4 chiêu cũ. Tham số phải nằm trong server config và được benchmark trước chốt. Root thông thường bị miễn nhiễm có chọn lọc theo effect ID; không tự mở rộng sang stun/freeze/knockback. Phải chứng minh cơ chế hiện có hỗ trợ hoặc bổ sung runtime + test trước bật.

## Hệ random và wave

Phương án v1: tạo 5 variant hệ cho mỗi archetype, gồm boss (35 creep variant + 10 boss variant); dùng chung atlas/skill identity. Generator có seed chọn variant 20% mỗi hệ và ghi thành entry cụ thể trong catalog, tương tự Arc6. Đây là random khi build catalog, ổn định qua retry/save/resume; không reroll theo frame hoặc khi tải lại trận. Nếu muốn reroll mỗi lượt chơi cần mở rộng authoritative run seed và resume protocol riêng.

Wave 1–4 giới thiệu melee và đạn đơn; 5–9 thêm Tê/Báo với khoảng cách spawn rõ; 10–14 trộn tank/ranger; 15–19 kiểm tra bạo thể và đường né; wave 20 kết thúc stage. Boss wave chỉ thêm hộ vệ hạn chế, trì hoãn spawn để đọc chiêu mở đầu. Giữ ordered spawn formation và EXP budget hiện hành; không tăng count, HP, damage, speed đồng thời. Kiểm tra tỷ trọng hệ trên toàn 200 wave thay vì ép mỗi wave đủ 5 hệ.

## Trình tự triển khai

1. **Data/backend:** tạo `server/tools/arc7_catalog.cjs` có seed/version/hash, phát sinh enemies/stages/stage_levels/arcs từ nguồn versioned. Xác thực IDs, rewards, unlock, loot, Normal/Epic/Legend và config validation. Seed vào DB bằng công cụ hiện hành, không ghi đè hồ sơ người chơi. Review diff trước sync.
2. **Gameplay:** thêm cơ chế C01–C07, scheduler 4 chiêu/boss; damage đúng lúc va chạm, khóa hướng khi hết telegraph; bạo thể một lần; miễn root chọn lọc; reset đầy đủ trạng thái khi pool reuse và resume. Chỉ dùng interface hiện hành sau khi xác minh; chưa giả định scheduler cũ hỗ trợ toàn bộ.
3. **Presentation:** đăng ký animation/30 VFX qua AtlasRegistry và manifest; đo frame/pivot/bounds, tránh trùng hiệu ứng baked trong attack. Phân biệt telegraph hình học với damage zone; vòng đất không xoay thành vòng đứng. Arc select, stage title, loading lore, background và sweep thumbnail theo UiSkin. Chưa xác nhận có background Arc7 phù hợp: audit asset trước, ghi rõ phần còn thiếu.
4. **Kiểm thử/cân bằng:** generator deterministic/idempotent; schema/seed SQL/bootstrap; headless gameplay và parser; 5 hero Lv60 × 3 mode ở stage 1/5/10, kiểm tra thêm stage trung gian bằng catalog audit. Chạy thật mortal + movement, đo death/win, TTK, từng nguồn damage, heal, EXP và elapsed time. Kiểm tra từng chiêu, hit một lần, 3 đạn, vùng an toàn, pool reset, save/resume, reconnect và final-wave completion.
5. **Nghiệm thu:** chạy static suite client/server, backend build, Godot integration; lưu báo cáo và các sai lệch. Chỉ chuyển C237 ACTIVE khi đủ kết quả; không coi số đề xuất là chỉ số cân bằng cuối.

## Dữ liệu và online-only

Schema dự kiến dùng field hiện hành: enemy `{id, element, attributes, generic_skills, boss_skills, balance_reference_level:60}`; stage `{id, arc_id, waves, stage_rules}`; entry `{enemy_id,count,interval,start_delay,modifiers}`. Mọi field mới cho bạo thể/telegraph phải được mô tả ở contract trước code. Client chỉ giữ presentation manifest.

Không thêm RPC mới trong v1. Request/response chọn stage và bootstrap giữ contract hiện hành với `{stage_id,level_id}` và snapshot config được xác thực. Interface cần tích hợp: DataRegistry nhận snapshot; WaveManager resolve entry; Enemy/scheduler thực thi skill; AtlasRegistry resolve texture/frame. Khi config thiếu, mất kết nối hoặc snapshot không hợp lệ: chặn gameplay/mutation và về retry/login, không local gameplay JSON fallback.

## K?t qu? tri?n khai

Ho?n t?t catalog, runtime, 30 VFX, atlas, background/minimap, online bootstrap validation, seed SQL v? local release 47. 240/240 l??t mortal ?? pass. Ch? s? ?? c? l? CP t?i ?a trong b? 5 hero Lv60 ki?m ch?ng, kh?ng ph?i m?c CP t?i thi?u. M?c ti?u boss 45?75 gi?y kh?ng ??ng ??u gi?a hero: retained DPS differences, kh?ng th?m mi?n th??ng hay scale theo ng??i ch?i. Xem b?o c?o nghi?m thu cho TTK v? h?n ch?.
