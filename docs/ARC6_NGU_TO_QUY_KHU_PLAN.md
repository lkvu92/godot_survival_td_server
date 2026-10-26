# Arc 6 — Ngũ Tố Quy Khư

Ngày: 2026-10-26. Contract: [C221](contracts/C221_ARC6_NGU_TO_QUY_KHU.md).

## Thiết kế đã chốt

Vùng đất linh khí hỗn loạn: dung nham và lôi điện trong khe nứt, cây cỏ hóa kim loại, hơi ẩm kết băng. Vạn vật sinh từ hỗn độn và quy về hư vô. Địa hình là hình ảnh; chưa thêm hazard gameplay.

- Arc `arc_ngu_to_quy_khu`, order 6, 10 stage `stage_6_01`…`stage_6_10`, mỗi stage 20 wave; Normal/Epic/Legend.
- Level hiển thị 51–60 nối Arc 5; mốc cân bằng chiến đấu cố định Lv.35. Không scale theo level Hero đang chơi.
- Random lúc sinh catalog bằng seed cố định, từng slot độc lập: Kim/Thủy/Mộc/Hỏa/Thổ = 20% mỗi hệ. Không ép đủ hệ; runtime đọc entries như các Arc trước.
- Lõi Normal/Ranger/Tank, giữ luật sáu wave đầu chưa Tank, ba wave đầu chưa rusher.
- Tái sử dụng creep/animation/đòn đánh cũ qua biến thể riêng, giữ nguyên enemy gốc; thêm đúng một generic skill không trùng.
- Chỉ số gốc × entry modifier → campaign pressure resolver → difficulty resolver → buff. Không nhân áp lực hoặc độ khó hai lần.
- Mid-boss 6-05 wave 20 dùng hai chiêu Wraith; final 6-10 wave 20 dùng bốn chiêu. Dùng scheduler Wraith hiện có.
- Rune một loại mỗi trận, chia đều năm hệ; giữ điều kiện item/tier/reward và progression hiện hành.
- Server DB/published config có thẩm quyền, không client gameplay JSON fallback.

## Danh sách ải

1. Hỗn Khí Ngoại Vực
2. Thiết Mộc Hoang Lâm
3. Băng Diễm Liệt Cốc
4. Ngũ Mạch Giao Tranh
5. Tàn Ảnh Quy Khư (mid-boss)
6. Vạn Tượng Băng Hoại
7. Nghịch Lưu Linh Hải
8. Ngũ Tố Loạn Táng
9. Vô Giới Chi Môn
10. Thái Sơ Quy Hư (final boss)

## Lõi wave (số cuối sau opening relief)

| Wave | Normal | Ranger | Tank |
|---|---:|---:|---:|
|1–2|3|1|0|
|3–4|4|2|0|
|5–6|5|3|0|
|7–8|5|3|1|
|9–10|6|4|2|
|11–12|7|4|2|
|13–14|8|5|3|
|15–16|9|6|3|
|17–18|10|6|4|
|19|11|7|4|
|20 thường|12|7|5|
|20 boss|3|2|1 + 1 boss|

## Pool

| Hệ | Normal | Ranger | Tank |
|---|---|---|---|
|Kim|steam_automaton|iron_crossbowman|shield_sentinel|
|Thủy|frost_lancer|snow_mage|frost_knight (biến thể Thủy Hàn Giáp Vệ)|
|Mộc|spore_crawler|thorn_spitter|ent_protector|
|Hỏa|flame_imp|pyromancer|lava_brute|
|Thổ|snow_skeleton|seismic_shaman|granite_colossus|

Nội tại ưu tiên: Kim defense_buff; Thủy debuff_resistance; Mộc regeneration; Hỏa haste; Thổ damage_shield. Nếu trùng ID gốc, chọn skill khác engine đã hỗ trợ. Thông số, ngoại lệ và cân bằng ghi trong config/report sinh ra.

## Asset

- Background: `res://assets/bg/arc6_bg.jpg`.
- Càn quét: `res://assets/ui/clear-map-widget/ngu-hanh-quy-khu.png`.
- Boss: `res://assets/boss/primordial-wraith/`, dùng nguyên bộ VFX hiện có.
- Biến thể tái sử dụng frame nguồn qua AtlasRegistry; không ghi đè asset người dùng.

## Triển khai và nghiệm thu

1. Contract + registry/index ở hai repo.
2. Generator catalog có version, seed, check/write idempotent; chỉ tác động Arc 6.
3. Enemy variants, 200 wave, 30 stage levels, loot/progression, pressure/EXP tool compatibility.
4. Client roster, element, atlas, background/sweep, boss integration.
5. Tests dữ liệu, original-catalog preservation, EXP, difficulty/pressure, spawn/resume/boss, online-only, static suites và backend build.
6. Godot runtime thử Lv.35 và report thực tế; không ghi nhận mô phỏng phân tích như clear rate thực chiến.
7. Đánh giá trạng thái hoàn thành từ evidence; production deploy không tự thực hiện. Local catalog chỉ có hiệu lực khi seed/publish theo workflow hiện hành.

## Theo dõi

- [x] Lưu plan và định nghĩa contract.
- [x] Catalog và tool tích hợp.
- [x] Client presentation/runtime.
- [ ] Kiểm thử và report.

## Triển khai hiện tại

`tools/arc6_catalog.cjs --write|--check` sinh nội dung idempotent. Không random lại khi chơi. Pool hiện có 15 biến thể thường và `arc6_wraith_mid`/`arc6_wraith_final`; alias presentation ở client dùng nguyên frame nguồn. `stage_rules` lưu seed, trọng số hệ và mốc Lv.35 qua DB.

Baseline là modifier đầu trận của `stage_4_05` (Lv.35), không level hiện tại của Hero. Hệ số giữa ải `1 + 0.035 × (ải - 1)`; hệ số entry theo wave `1 + 0.004 × (wave - 1)`. Sau pilot nhận sát thương thật, creep dùng thêm hệ số tuning HP `0.55`, ATK `0.15`, DEF `0.70` so với baseline. Tank Thủy/Thổ có hệ số HP riêng để giữ tương quan vai trò, không sửa attributes gốc. Campaign pressure v1 và difficulty vẫn do resolver cũ áp dụng đúng một lần.

Boss lấy bộ attributes tham chiếu Dreadnought Lv.35 (`6500 HP / 105 ATK / 45 DEF` trước entry modifier), giữ scheduler Wraith; entry ATK có hệ số `0.45` vì bộ chiêu nhiều hit. Không thêm cơ chế HP-phase hay hazard mới.

Loot dùng template đúng loại ải/tier của Arc 5, chia đều trọng số rune theo hệ và nối tiếp gold reward sau Arc 5 (không reset về ải 41). Quy tắc fragment Legend, vé Tháp và mở khóa dùng backend hiện tại; Arc 6 fragment chia đều năm hệ.

### Kiểm chứng cân bằng

Các pilot `stationary` và `approach` là lane chẩn đoán. `approach` dùng AI tiến gần của engine, không phải ước lượng tỷ lệ thắng người chơi. Đặc biệt Hero ít HP không nên ôm cụm ranged/CC.

Lane tham chiếu cuối dùng bot giữ khoảng cách đơn giản: tiến khi ngoài 85% tầm basic, lùi khi dưới 65%, đi vòng nửa tốc độ khi ở giữa; hướng theo parity của seed, không xem telegraph/đạn và không có perfect dodge. Hero nhận damage thật và chết tại 0 HP, không trang bị/Thần Luân/affinity; thẻ được chọn từ offer hợp lệ. Lv.35 là baseline thiết kế; loadout dùng để đo đề cử có thể cao hơn tùy ải/tier, giới hạn Lv.50 của game vẫn giữ nguyên.

File `ARC6_RUNTIME_PILOT.json` đầu tiên đã đánh dấu **invalid_for_balance** vì harness benchmark cũ giữ 1 HP. Không dùng các PASS đó để nghiệm thu. Test mortality riêng chứng minh mất đúng 1 HP khi nhận 1 true damage và chết khi chịu đòn chí tử.

Khi ma trận cuối đủ 10 ải × 3 tier × 5 Hero × 3 seed, generator nhận power từ `docs/reports/ARC6_RUNTIME_FINAL_REFERENCE.json` chỉ khi digest catalog khớp, có ít nhất 12/15 lượt vượt mỗi stage-level và mỗi Hero vượt ít nhất 2/3 seed. Đây là **mốc loadout đã kiểm chứng**, không phải tìm kiếm chiến lực tối thiểu hoặc tỷ lệ thắng quần thể. Thông tin đo được lưu trong `stage_levels.stage_rules.recommendation` và không tự thay đổi player profile.

### Tài liệu và lệnh kiểm tra

- `node tools/arc6_catalog.cjs --check`
- `node tests/test_arc6_catalog.cjs`
- `node tests/test_arc6_backend.cjs`
- `node tests/test_arc6_seed_sql.cjs` với `SEED_TEST_PSQL`/`SEED_TEST_PORT` trỏ DB dùng thử.
- Godot `TestArc6Campaign.tscn`: 698 frame, 135 actor spawn thật; có thể xuất `--output=<path>` sau đường dẫn fixture.
- Godot `TestCampaignHarnessMortality.tscn`: mortality, telemetry, stationary/approach/kite, khống chế và giới hạn sân.
- Godot `TestCampaignWaveExp.tscn`: 60 ải / 180 mode / 3555 wave clear / 64137 callback kill.
- `tools/arc6_runtime_audit.cjs`: full-run audit, có digest, seed, policy và kết quả từng trận.
- `tools/sync_arc6_local.cjs --check|--apply|--verify`: chỉ local compose `survival_td_local`, loopback 7350; backup và transaction seed/publish chọn lọc, kiểm tra hash nội dung ngoài phạm vi và không ghi player data.

### Giới hạn gate toàn repo

Kết quả kiểm chứng tiếp nối và các mục nghiệm thu còn mở: [ARC6_LOCAL_ACCEPTANCE.md](reports/ARC6_LOCAL_ACCEPTANCE.md). Server local đã xác minh config version 30 và runtime sau restart; ca thất bại boss cuối Legend được chạy lại và giữ nguyên trong báo cáo, không điều chỉnh cân bằng chỉ để tăng số PASS.

Client static và build backend đã PASS. Full server static đang gặp lỗi có trước Arc 6 ở kinh tế stamina: System seed quảng cáo +5 khác bootstrap +15; một số fixture còn kỳ vọng cap 30/330 trong khi runtime storage cap 200. Không đổi kinh tế hoặc các thay đổi người dùng đang làm để che lỗi gate. C221 giữ IN_PROGRESS tới khi gate toàn repo được giải quyết; nghiệm thu riêng Arc 6 và trạng thái local được ghi trong báo cáo hoàn tất.

C?p nh?t 2026-10-26: ng??i d?ng x?c nh?n th??ng qu?ng c?o +15. Seed rewarded_ads ?? ??ng b? +15 v? test C134 PASS. Full server static hi?n d?ng t?i daily-pack entitlement: k? v?ng stamina 330, runtime gi?i h?n storage 200; xem b?o c?o nghi?m thu ?? theo d?i gate c?n m?.
