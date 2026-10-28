# Chỉ số hero — cân bằng vòng 2

Version: 1.0.0 | Cập nhật: 2026-10-29 | Contract: [C238](contracts/C238_HERO_GROWTH_BALANCE.md)

Dữ liệu từ server/data/heroes.json; không dùng tài liệu làm gameplay fallback. Giữ nguyên chỉ số Lv1, tầm đánh và skill. Chưa tính trang bị, skill, buff hoặc cấp trong trận. Đây là mô phỏng công thức, chưa chứng minh cân bằng thực chiến.

## Công thức

HP/ATK/DEF/tốc chạy/tốc đánh/tầm đánh = gốc × hệ số^(Lv−1). Chí mạng, ST chí mạng và hồi phục cộng mức tăng × (Lv−1), với trần lần lượt 100%, 1000%, 10% HP/10s. Cấp hero tối đa 70 và không vượt cấp tài khoản.

Trong trận: mỗi cấp tạm cộng chỉ số nền đầu trận × (hệ số−1) × 25% cho nhóm nhân; nhóm cộng nhận đủ mức tăng. Bonus phần trăm và hồi máu khi tăng HP tối đa giữ hành vi Player hiện tại. Tốc chạy mới cũng ảnh hưởng kỹ năng dùng speed_pct; không sửa hệ số skill.

Sức tấn công lý thuyết = ATK × tốc đánh × [1 + chí mạng × (hệ số ST chí mạng−1)], giả định đòn 100% ATK, có crit và đánh liên tục. Không tính giáp, độc, AoE, cooldown hoặc giới hạn animation. Đây không phải DPS thực chiến.

## Hệ số JSON chính xác

| Hero | hp | atk | def | move_speed | attack_speed | attack_range | crit_rate | crit_damage | regen_percent_per_10s |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| hero_1 | 1.06 | 1.075 | 1.045 | 1.002 | 1.01 | 1 | 0.004 | 0.015 | 0.001 |
| hero_2 | 1.055 | 1.08 | 1.04 | 1.002 | 1.012 | 1 | 0.005 | 0.02 | 0.0008 |
| hero_3 | 1.06 | 1.075 | 1.05 | 1.002 | 1.01 | 1 | 0.004 | 0.015 | 0.001 |
| hero_4 | 1.055 | 1.065 | 1.04 | 1.003 | 1.02 | 1 | 0.005 | 0.02 | 0.0008 |
| hero_5 | 1.065 | 1.075 | 1.05 | 1.002 | 1.01 | 1 | 0.004 | 0.015 | 0.001 |

## Băng Tuyết Thánh Nữ

| Lv | HP | ATK | DEF | Tốc chạy | Tốc đánh | Tầm đánh | Chí mạng (%) | ST chí mạng (%) | Hồi HP/10s (%) | HP hồi/10s | Sức tấn công lý thuyết |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 480.00 | 23.00 | 10.00 | 280.00 | 1.50 | 350.00 | 6.00 | 150.00 | 3.00 | 14.40 | 35.54 |
| 50 | 8341.20 | 795.69 | 86.44 | 308.80 | 2.44 | 350.00 | 25.60 | 223.50 | 7.90 | 658.95 | 2557.94 |
| 70 | 26751.36 | 3379.96 | 208.46 | 321.39 | 2.98 | 350.00 | 33.60 | 253.50 | 9.90 | 2648.39 | 15268.92 |

## Liệt Diễm Tiễn Tôn

| Lv | HP | ATK | DEF | Tốc chạy | Tốc đánh | Tầm đánh | Chí mạng (%) | ST chí mạng (%) | Hồi HP/10s (%) | HP hồi/10s | Sức tấn công lý thuyết |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 360.00 | 30.00 | 5.00 | 295.00 | 1.45 | 450.00 | 12.00 | 175.00 | 1.00 | 3.60 | 47.42 |
| 50 | 4962.19 | 1302.82 | 34.17 | 325.34 | 2.60 | 450.00 | 36.50 | 273.00 | 4.92 | 244.14 | 5529.33 |
| 70 | 14478.45 | 6072.40 | 74.86 | 338.61 | 3.30 | 450.00 | 46.50 | 313.00 | 6.52 | 944.00 | 39914.90 |

## Vô Cực Kiếm Tôn

| Lv | HP | ATK | DEF | Tốc chạy | Tốc đánh | Tầm đánh | Chí mạng (%) | ST chí mạng (%) | Hồi HP/10s (%) | HP hồi/10s | Sức tấn công lý thuyết |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 440.00 | 26.00 | 15.00 | 290.00 | 1.55 | 250.00 | 8.00 | 165.00 | 1.50 | 6.60 | 42.40 |
| 50 | 7646.10 | 899.47 | 163.82 | 319.83 | 2.52 | 250.00 | 27.60 | 238.50 | 6.40 | 489.35 | 3138.03 |
| 70 | 24522.08 | 3820.83 | 434.66 | 332.87 | 3.08 | 250.00 | 35.60 | 268.50 | 8.40 | 2059.86 | 18825.47 |

Kháng ngũ hành gốc 15%, không tăng theo cấp.

## U Ảnh Độc Tôn

| Lv | HP | ATK | DEF | Tốc chạy | Tốc đánh | Tầm đánh | Chí mạng (%) | ST chí mạng (%) | Hồi HP/10s (%) | HP hồi/10s | Sức tấn công lý thuyết |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 370.00 | 25.00 | 6.00 | 335.00 | 1.95 | 400.00 | 16.00 | 180.00 | 1.20 | 4.44 | 54.99 |
| 50 | 5100.02 | 547.11 | 41.00 | 387.96 | 5.15 | 400.00 | 40.50 | 278.00 | 5.12 | 261.12 | 4844.73 |
| 70 | 14880.63 | 1927.80 | 89.84 | 411.92 | 7.65 | 400.00 | 50.50 | 318.00 | 6.72 | 999.98 | 30968.12 |

## Vạn Tượng Quán Âm

| Lv | HP | ATK | DEF | Tốc chạy | Tốc đánh | Tầm đánh | Chí mạng (%) | ST chí mạng (%) | Hồi HP/10s (%) | HP hồi/10s | Sức tấn công lý thuyết |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 470.00 | 24.00 | 12.00 | 285.00 | 1.50 | 350.00 | 8.00 | 165.00 | 2.00 | 9.40 | 37.87 |
| 50 | 10285.58 | 830.28 | 131.06 | 314.31 | 2.44 | 350.00 | 27.60 | 238.50 | 6.90 | 709.70 | 2803.20 |
| 70 | 36242.72 | 3526.92 | 347.73 | 327.13 | 2.98 | 350.00 | 35.60 | 268.50 | 8.90 | 3225.60 | 16816.80 |

## Triển khai

Đã đồng bộ local DB và khởi động lại Nakama local; healthcheck 200. Hồ sơ tải lại được tính chỉ số từ cấu hình hiện tại. Không migration hàng loạt profile, không triển khai production. Cần đăng nhập/bootstrap lại để nhận cấu hình mới. Xem C238 cho kết quả kiểm tra.
