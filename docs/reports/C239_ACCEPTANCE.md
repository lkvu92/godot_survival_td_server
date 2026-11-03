# C239 — nghiệm thu framework và stage thí điểm

Ngày: 2026-10-30. Version: 1.0.0. **Kỹ thuật: PASS. Migration hàng loạt: REVIEW_REQUIRED.**

Đã hoàn thành khung species growth độc lập hero, atlas skill chung lọc theo hệ, skill level/ATK runtime, compile spawn khi loading, bảng tra đa hệ, difficulty theo level, pooling/resume và stage thí điểm tách biệt. Catalog gồm 8 loài và 15 skill × 5 level. Loài không có element hay skill allowlist.

## Kiểm chứng

- Godot runtime: **1.097 kiểm tra PASS**, bao gồm 1.024 cặp tập hệ, điều kiện hệ, Player/Enemy dùng cùng skill, damage/effect, max level, RNG độc lập, VFX atlas, spawn/resume qua JSON, không tin stat/modifier trong save và pooling.
- Client `tests/run_static_tests.ps1`: PASS.
- Server `tests/run_static_tests.ps1`: PASS, gồm test C239 và 60 Python tests. Các bài PostgreSQL tùy chọn không chạy vì không cấu hình disposable DB; C239 không thêm migration DB/schema.
- Backend `npm run build` và runtime packaging: PASS.
- Đã cập nhật các SQL mock cũ thiếu truy vấn admission của campaign trong test Arc 6, arc mode, run lifecycle và stage sweep. Generator Arc 6 giữ tên/mô tả authored khi regenerate, cùng cách làm với Arc 7; không đổi combat hay seed Arc 6.

## 150 trận baseline/pilot

Hero Lv60, không gear/affinity/Thần Luân, tử vong thật, đủ mục tiêu 20 wave, card được offer bình thường, policy kite xác định. Mỗi ô có 5 hero × 5 seed. Dùng khắc hệ thực cho cả hai bên; baseline giữ công thức legacy, pilot dùng luật đa hệ mới.

| Difficulty | Baseline clear | Pilot clear | Wave trung bình baseline/pilot |
|---|---:|---:|---:|
| normal | 11/25 | 15/25 | 18.76 / 15.44 |
| epic | 10/25 | 10/25 | 15.92 / 13.60 |
| legend | 2/25 | 8/25 | 13.96 / 11.84 |

Không có lỗi runtime, timeout hay config admission trong 150 trận. Hero 1 clear Normal tốt hơn; Hero 3 clear cả ba mode của pilot; Hero 2 và Hero 4 chết sớm hơn baseline. Vì thế clear rate tổng không chứng minh độ khó tương đương giữa các hero. Skill direct hiện gây damage tức thì, khác các đòn có windup/projectile của baseline; đây là một yếu tố cần xét khi thiết kế/tuning tiếp.

| Hero | Baseline N/E/L | Pilot N/E/L |
|---|---|---|
| hero_1 | 1/0/0 | 5/0/0 |
| hero_2 | 0/0/0 | 0/0/0 |
| hero_3 | 5/5/0 | 5/5/5 |
| hero_4 | 0/0/0 | 0/0/0 |
| hero_5 | 5/5/2 | 5/5/3 |

Mỗi giá trị theo hero là số clear trên 5 seed, không phải ước lượng tỷ lệ thắng toàn bộ người chơi.

## 30 trận đo độ nhạy level

Giữ nguyên stage, skill level và policy, chỉ giảm/tăng 5 level cho creep/boss. Mỗi ô là 5 hero × 1 seed; đối chiếu cột level gốc bằng cùng seed 239.

| Difficulty | −5 level | Level gốc | +5 level |
|---|---:|---:|---:|
| normal | 3/5 | 3/5 | 2/5 |
| epic | 3/5 | 2/5 | 2/5 |
| legend | 2/5 | 2/5 | 0/5 |

Không có lỗi runtime/timeout trong 30 trận. Kết quả cho thấy chỉnh level tác động đến sức mạnh trong thực chiến; từng trận không bắt buộc biến thiên đơn điệu do đổi timing, card và diễn biến combat.

## Hiệu năng và nguồn kiểm chứng

Compile lớn nhất trên 180 trận: **34.08 ms**, dưới mục tiêu 250 ms. Peak static memory khoảng 645 MB ở pilot và 740 MB ở baseline trong môi trường này. Process-time peak có frame trên 16,7 ms; các lượt headless tăng tốc/chạy song song không dùng để chứng nhận hiệu năng mobile.

Hai báo cáo có cùng fingerprint mã nguồn `234a55390cd3c3f8b3035ddd7b68c88b5559da19139504804ce23b578d4a72b8` và xác nhận source không đổi trong lúc chạy. Kết quả trận ở lần chạy cuối lặp lại kết quả clear/death của lần trước.

- [150 trận và telemetry đầy đủ](C239_RUNTIME_BENCHMARK.json)
- [30 trận độ nhạy level](C239_LEVEL_SENSITIVITY.json)
- [Hướng dẫn cấu hình và chạy lại](../ENEMY_FRAMEWORK.md)

## Quyết định phạm vi

Gate kỹ thuật của framework/pilot: **9/10, PASS**. Contract ACTIVE trong phạm vi này. Chưa migrate campaign, đổi recommended_power, ghi DB/profile hay publish production. Chưa chuyển toàn bộ skill legacy sang atlas, chưa triển khai tính năng học skill từ pet. Icon hệ hiện có của enemy hiển thị hệ đầu tiên; hiển thị đầy đủ đa hệ là phần cần làm trước rollout cho người chơi.

Trước migration diện rộng cần chốt mục tiêu khó theo hero, bổ sung executor phù hợp cho các skill cần chuyển và tuning level/skill/formation theo benchmark. Giữ nguyên hai JSON đo gốc để đối chiếu; không dùng power cũ để suy ngược growth mới.

## Historical balance snapshot — C238 v1.1.0

The 180 C239 cases above used round-2 hero growth. C238 v1.1.0 subsequently changes H2/H4 growth; the original reports remain historical evidence and must not be presented as benchmarks of the new hero balance.

## Superseded damage semantics ? C240

The original benchmark JSON files are preserved as historical evidence. C240 makes the server-matrix damage pipeline global and confirms neutral basic attacks; their win rates do not validate current balance. Current runtime and campaign smoke evidence is recorded in C240_ACCEPTANCE.md. C239 spawn/growth migration remains opt-in.
