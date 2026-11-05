C268 v1.1 (2026-11-05): all heroes start at 100 SPD. SPD(L)=100*growth^(L-1); equipment and buffs excluded. Growth factors are unchanged; wood grows fastest. SPD and theoretical offense-proxy columns below have been recalculated. Basic runtime/CP use SPD/100; skill flight remains deferred.

# Chỉ số hero — cân bằng vòng 3

Version: 1.2.0 | Cập nhật: 2026-11-05 | Contracts: [C238](contracts/C238_HERO_GROWTH_BALANCE.md), [C268](contracts/C268_CANONICAL_SPD_ENGINE.md)

Dữ liệu từ server/data/heroes.json; không dùng tài liệu làm gameplay fallback. SPD Lv1 của mọi hero là 100; giữ nguyên các chỉ số khác, tầm đánh và skill. Chưa tính trang bị, skill, buff hoặc cấp trong trận. Đây là mô phỏng công thức, chưa chứng minh cân bằng thực chiến.

## Công thức

HP/ATK/DEF/tốc chạy/tốc đánh/tầm đánh = gốc × hệ số^(Lv−1). Chí mạng, ST chí mạng và hồi phục cộng mức tăng × (Lv−1), với trần lần lượt 100%, 1000%, 10% HP/10s. Cấp hero tối đa 70 và không vượt cấp tài khoản.

Trong trận: mỗi cấp tạm cộng chỉ số nền đầu trận × (hệ số−1) × 25% cho nhóm nhân; nhóm cộng nhận đủ mức tăng. Bonus phần trăm và hồi máu khi tăng HP tối đa giữ hành vi Player hiện tại. Tốc chạy mới cũng ảnh hưởng kỹ năng dùng speed_pct; không sửa hệ số skill.

Sức tấn công lý thuyết = ATK × (SPD/100) × [1 + chí mạng × (hệ số ST chí mạng−1)], giả định đòn 100% ATK, có crit và đánh liên tục. Không tính giáp, độc, AoE, cooldown hoặc giới hạn animation. Đây không phải DPS thực chiến.

## Hệ số JSON chính xác

| Hero | hp | atk | def | move_speed | attack_speed | attack_range | crit_rate | crit_damage | regen_percent_per_10s |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| hero_1 | 1.06 | 1.075 | 1.045 | 1.002 | 1.01 | 1 | 0.004 | 0.015 | 0.001 |
| hero_2 | 1.057139 | 1.07806 | 1.04 | 1.002 | 1.012 | 1 | 0.0033 | 0.02 | 0.0008 |
| hero_3 | 1.06 | 1.075 | 1.05 | 1.002 | 1.01 | 1 | 0.004 | 0.015 | 0.001 |
| hero_4 | 1.056458 | 1.065 | 1.04 | 1.003 | 1.016488 | 1 | 0.005 | 0.012 | 0.0008 |
| hero_5 | 1.065 | 1.075 | 1.05 | 1.002 | 1.01 | 1 | 0.004 | 0.015 | 0.001 |

## Băng Tuyết Thánh Nữ

| Lv | HP | ATK | DEF | Tốc chạy | Tốc đánh | Tầm đánh | Chí mạng (%) | ST chí mạng (%) | Hồi HP/10s (%) | HP hồi/10s | Sức tấn công lý thuyết |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 480.00 | 23.00 | 10.00 | 280.00 | 100.00 | 350.00 | 6.00 | 150.00 | 3.00 | 14.40 | 23.69 |
| 30 | 2600.83 | 187.32 | 35.84 | 296.70 | 133.45 | 350.00 | 17.60 | 193.50 | 5.90 | 153.45 | 291.12 |
| 50 | 8341.20 | 795.69 | 86.44 | 308.80 | 162.83 | 350.00 | 25.60 | 223.50 | 7.90 | 658.95 | 1705.30 |
| 70 | 26751.36 | 3379.96 | 208.46 | 321.39 | 198.69 | 350.00 | 33.60 | 253.50 | 9.90 | 2648.39 | 10179.27 |

## Liệt Diễm Tiễn Tôn

| Lv | HP | ATK | DEF | Tốc chạy | Tốc đánh | Tầm đánh | Chí mạng (%) | ST chí mạng (%) | Hồi HP/10s (%) | HP hồi/10s | Sức tấn công lý thuyết |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 360.00 | 30.00 | 5.00 | 295.00 | 100.00 | 450.00 | 12.00 | 175.00 | 1.00 | 3.60 | 32.70 |
| 30 | 1803.57 | 265.32 | 15.59 | 312.60 | 141.33 | 450.00 | 21.57 | 233.00 | 3.32 | 59.88 | 482.55 |
| 50 | 5479.93 | 1192.96 | 34.17 | 325.34 | 179.41 | 450.00 | 28.17 | 273.00 | 4.92 | 269.61 | 3183.33 |
| 70 | 16650.11 | 5363.94 | 74.86 | 338.61 | 227.75 | 450.00 | 34.77 | 313.00 | 6.52 | 1085.59 | 21263.68 |

## Vô Cực Kiếm Tôn

| Lv | HP | ATK | DEF | Tốc chạy | Tốc đánh | Tầm đánh | Chí mạng (%) | ST chí mạng (%) | Hồi HP/10s (%) | HP hồi/10s | Sức tấn công lý thuyết |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 440.00 | 26.00 | 15.00 | 290.00 | 100.00 | 250.00 | 8.00 | 165.00 | 1.50 | 6.60 | 27.35 |
| 30 | 2384.09 | 211.75 | 61.74 | 307.30 | 133.45 | 250.00 | 19.60 | 208.50 | 4.40 | 104.90 | 342.67 |
| 50 | 7646.10 | 899.47 | 163.82 | 319.83 | 162.83 | 250.00 | 27.60 | 238.50 | 6.40 | 489.35 | 2024.53 |
| 70 | 24522.08 | 3820.83 | 434.66 | 332.87 | 198.69 | 250.00 | 35.60 | 268.50 | 8.40 | 2059.86 | 12145.47 |

Kháng ngũ hành gốc 15%, không tăng theo cấp.

## U Ảnh Độc Tôn

| Lv | HP | ATK | DEF | Tốc chạy | Tốc đánh | Tầm đánh | Chí mạng (%) | ST chí mạng (%) | Hồi HP/10s (%) | HP hồi/10s | Sức tấn công lý thuyết |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 370.00 | 25.00 | 6.00 | 335.00 | 100.00 | 400.00 | 16.00 | 180.00 | 1.20 | 4.44 | 28.20 |
| 30 | 1819.35 | 155.27 | 18.71 | 365.40 | 160.68 | 400.00 | 30.50 | 214.80 | 3.52 | 64.04 | 336.85 |
| 50 | 5457.09 | 547.11 | 41.00 | 387.96 | 222.85 | 400.00 | 40.50 | 238.80 | 5.12 | 279.40 | 1904.61 |
| 70 | 16368.39 | 1927.80 | 89.84 | 411.92 | 309.07 | 400.00 | 50.50 | 262.80 | 6.72 | 1099.96 | 10856.74 |

## Vạn Tượng Quán Âm

| Lv | HP | ATK | DEF | Tốc chạy | Tốc đánh | Tầm đánh | Chí mạng (%) | ST chí mạng (%) | Hồi HP/10s (%) | HP hồi/10s | Sức tấn công lý thuyết |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 470.00 | 24.00 | 12.00 | 285.00 | 100.00 | 350.00 | 8.00 | 165.00 | 2.00 | 9.40 | 25.25 |
| 30 | 2919.02 | 195.46 | 49.39 | 302.00 | 133.45 | 350.00 | 19.60 | 208.50 | 4.90 | 143.03 | 316.31 |
| 50 | 10285.58 | 830.28 | 131.06 | 314.31 | 162.83 | 350.00 | 27.60 | 238.50 | 6.90 | 709.70 | 1868.79 |
| 70 | 36242.72 | 3526.92 | 347.73 | 327.13 | 198.69 | 350.00 | 35.60 | 268.50 | 8.90 | 3225.60 | 11211.21 |

## Triển khai

Đã đồng bộ local DB và khởi động lại Nakama local; healthcheck 200. Hồ sơ tải lại được tính chỉ số từ cấu hình hiện tại. Không migration hàng loạt profile, không triển khai production. Cần đăng nhập/bootstrap lại để nhận cấu hình mới. Xem C238 cho kết quả kiểm tra.

## Mục tiêu vòng 3

Tại Lv70: H2 ATK bằng 1,5 lần trung bình H1/3/5, HP tăng 15%; H4 tốc đánh bằng 2 lần trung bình H1/3/5, HP tăng 10%. Giảm growth CRR H2 và CD H4 theo C238 v1.1.0. Chỉ số Lv1 không đổi; phần trăm tăng HP không phải bonus phẳng ở mọi level. Kiểm chứng rollout vòng 3 được ghi riêng trong C238.

Vòng 3 đã đồng bộ riêng growth H2/H4 vào DB local, đọc lại khớp seed và healthcheck HTTP200. Static client/server và backend build PASS. Cần đăng nhập/bootstrap lại. Sáu lượt runtime chẩn đoán chưa chứng minh độ khó đã cân bằng; xem C238 v1.1.0 cho wave chết và giới hạn kiểm chứng.

## Production — 2026-10-30

Đã triển khai sáu trường growth H2/H4 lên production và đối soát DB, seed, API HTTPS. Chỉ số Lv1, các trường khác và profile người chơi được giữ nguyên. Không cần build/restart server hay publish settings; cần đăng nhập/bootstrap lại và vào trận mới. Xem [báo cáo triển khai](reports/C238_PRODUCTION_ROLLOUT.md). Các ghi chú chỉ-local ở trên là lịch sử trước triển khai này.
