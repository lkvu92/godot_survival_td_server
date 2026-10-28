# Hero 3 — Vô Cực Kiếm Tôn

Version: 1.1.0
Cập nhật: 2026-10-29

[Danh sách 5 hero](../HERO_SKILLS_CURRENT.md) · [Config skill nguồn](../../data/skills.json)

Tài liệu phản ánh **source hiện tại**, không xác nhận config đang chạy trên local/VPS. Giá trị là cơ sở trước buff trang bị, giảm hồi chiêu chung, phòng thủ và chí mạng. Gameplay vẫn cần snapshot server hợp lệ; không dùng tài liệu làm fallback.

Các cột Lv1–Lv5 là **cấp skill trong trận**. Level hero mở skill và level trong trận để chọn thẻ là hai điều kiện riêng. `speed_pct` là % tốc độ di chuyển của hero, ngoại trừ bonus tốc độ của nội tại Hero 1 Skill 4; `projectile_speed` là px/s cố định. Hệ số phần trăm dạng 0–1 được đổi sang % khi nhãn ghi (%); raw key giữ trong ngoặc để đối chiếu JSON.

| Slot | Skill | Level hero mở | Level trong trận | Loại |
|---|---|---:|---:|---|
| 1 | Kiếm Phiến | 1 | 1 | `fan_projectile` / `active` |
| 2 | Kiếm Ấn Giáng Lâm | 10 | 5 | `two_phase_aoe` / `active` |
| 3 | Vạn Kiếm Liên Hoàn | 20 | 10 | `arc_sequence` / `active` |
| 4 | Thất Tinh Trận | 30 | 15 | `hero_aura` / `passive` |

## Chỉ số hero và tăng cấp — C238

[Bảng chung và hệ số JSON](../HERO_STATS_CURRENT.md). Lv dưới đây là cấp hero ngoài trận, khác cấp skill. Cấp tạm trong trận dùng cùng hệ số với mức 25% cho nhóm nhân.

| Lv | HP | ATK | DEF | Tốc chạy | Tốc đánh | Tầm đánh | Chí mạng (%) | ST chí mạng (%) | Hồi HP/10s (%) | HP hồi/10s | Sức tấn công lý thuyết |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 440.00 | 26.00 | 15.00 | 290.00 | 1.55 | 250.00 | 8.00 | 165.00 | 1.50 | 6.60 | 42.40 |
| 50 | 7646.10 | 899.47 | 163.82 | 319.83 | 2.52 | 250.00 | 27.60 | 238.50 | 6.40 | 489.35 | 3138.03 |
| 70 | 24522.08 | 3820.83 | 434.66 | 332.87 | 3.08 | 250.00 | 35.60 | 268.50 | 8.40 | 2059.86 | 18825.47 |

## Skill 1 — Kiếm Phiến

Kiếm Phiến có tốc độ cố định **416px/s**, không nhân tốc độ di chuyển và không tăng khi Thất Tinh Trận buff chạy. Đẩy lùi cố định 35px; hướng quạt theo bước 10°. Với 5 kiếm, các góc là −20/−10/0/10/20°. Không xuyên (`pierce=0`).

### Chỉ số gameplay

| Thông số | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| Sát thương (% ATK) (`damage_pct`) | 110.5 | 118 | 127 | 137.5 | 149.5 |
| Range cơ sở (px) (`range`) | 768 | 782 | 822.25 | 868.25 | 896 |
| Số projectile (`projectile_count`) | 1 | 2 | 3 | 4 | 5 |
| Hồi chiêu (s) (`cooldown`) | 2.4 | 2.25 | 2.05 | 1.85 | 1.6 |
| Bán kính radius (px) (`radius`) | 28 | 29 | 31 | 33 | 35 |

Thông số cố định cho cả 5 cấp:

| Thông số | Giá trị |
|---|---:|
| Số mục tiêu xuyên (`pierce`) | 0 |
| Bước góc (độ) (`angle_step`) | 10 |
| Giới hạn lệch mỗi bên (độ) (`fan_half_angle`) | 30 |
| Tốc độ bay cố định (px/s) (`projectile_speed`) | 416 |

### Hiệu ứng theo cấp

| Effect / thuộc tính | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| `knockback.distance` | 35 | 35 | 35 | 35 | 35 |
| `knockback.duration` | 0.16 | 0.17 | 0.18 | 0.19 | 0.2 |

Bảng effect giữ **giá trị JSON gốc**: `chance`/`slow_percent=0.2` nghĩa là 20%; `dps_pct=25` nghĩa là 25% ATK mỗi giây. `duration` tính bằng giây.

### Thông số hiển thị và đồng bộ va chạm

| Thông số | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| `vfx_scale` | 0.264 | 0.276 | 0.288 | 0.3 | 0.312 |


### Frame/asset qua AtlasRegistry

| Vai trò | Số ID | ID đầu | PNG đã đăng ký (nếu ánh xạ trực tiếp) |
|---|---:|---|---|
| `vfx_frames` | 9 | `hero_3_skill_1_frame_0` | `res://assets/hero/hero_3/hero_3_skill_1.png` |

<!-- skill-stats-source hero_3_skill_1 4fa524448f43d4ccce23f367e4b76b26a7d6c840a2be20a35faae0fd7245eb59 -->

## Skill 2 — Kiếm Ấn Giáng Lâm

Kiếm lớn gây một hit lên mục tiêu đã khóa; tám kiếm là **một lần sát thương AOE**, không phải 8 lần hệ số đó. Thêm 3 sóng lan ở thời điểm impact +0/+0,3/+0,6s, mỗi sóng gây một phần ba hệ số AOE và chỉ trúng một lần/mục tiêu/sóng. Mỗi sóng có 30% choáng 0,2s; không còn choáng chắc chắn từ kiếm lớn/AOE. Hồi chiêu mới 8/7,5/7/6,5/6s trước giảm từ Skill 4.

### Chỉ số gameplay

| Thông số | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| Sát thương (% ATK) (`damage_pct`) | 143 | 153.5 | 165.5 | 180.5 | 200 |
| Sát thương pha phụ (% ATK) (`second_damage_pct`) | 78 | 82.5 | 88.5 | 96 | 105 |
| Range cơ sở (px) (`range`) | 620 | 650 | 690 | 735 | 795 |
| Hồi chiêu (s) (`cooldown`) | 8 | 7.5 | 7 | 6.5 | 6 |
| Bán kính radius (px) (`radius`) | 70 | 82 | 96 | 112 | 130 |
| Bán kính AOE pha phụ (px) (`second_radius`) | 135 | 149 | 162 | 176 | 189 |
| Độ trễ chạm đất (s) (`impact_delay`) | 0.32 | 0.32 | 0.3 | 0.28 | 0.26 |
| Độ cao rơi (px) (`above_height`) | 330 | 340 | 350 | 360 | 370 |
| `phase_b_duration` | 0.24 | 0.25 | 0.26 | 0.27 | 0.28 |
| Sát thương mỗi sóng (% ATK) (`wave_damage_pct`) | 26 | 27.5 | 29.5 | 32 | 35 |
| Bán kính sóng (px) (`wave_radius`) | 135 | 149 | 162 | 176 | 189 |

Thông số cố định cho cả 5 cấp:

| Thông số | Giá trị |
|---|---:|
| Số sóng (`wave_count`) | 3 |
| Khoảng cách giữa sóng (s) (`wave_interval`) | 0.3 |
| Tỷ lệ choáng mỗi sóng (%) (`wave_stun_chance`) | 30 |
| Thời gian choáng mỗi sóng (s) (`wave_stun_duration`) | 0.2 |
| Thời gian mỗi sóng (s) (`wave_duration`) | 0.54 |


### Thông số hiển thị và đồng bộ va chạm

| Thông số | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| `phase_a_vfx_scale` | 0.441 | 0.504 | 0.588 | 0.672 | 0.777 |
| `phase_b_vfx_scale` | 0.75 | 0.82777778 | 0.9 | 0.97777778 | 1.05 |

Thông số cố định cho cả 5 cấp:

| Thông số | Giá trị |
|---|---:|
| `phase_b_ring_width` | 24 |
| `phase_b_collision_padding` | 16 |
| `phase_b_ring_tick_count` | 12 |
| `wave_ring_width` | 12 |
| `wave_collision_padding` | 8 |
| `wave_radius_progress` | `[0.17,0.41,0.6,0.77,0.87,1,1,1,1]` |


### Frame/asset qua AtlasRegistry

| Vai trò | Số ID | ID đầu | PNG đã đăng ký (nếu ánh xạ trực tiếp) |
|---|---:|---|---|
| `vfx_frames` | 9 | `hero_3_skill_2a_frame_0` | `res://assets/hero/hero_3/hero_3_skill_2_a.png` |
| `phase_b_vfx_frames` | 9 | `hero_3_skill_2b_frame_0` | `res://assets/hero/hero_3/hero_3_skill_2_b.png` |
| `wave_vfx_frames` | 9 | `hero_3_skill_2c_frame_0` | `res://assets/hero/hero_3/hero_3_skill_2_c.png` |

<!-- skill-stats-source hero_3_skill_2 385c0127284d463b9a524160b40eafb54099bae5384d5563e5b399e404f9490c -->

## Skill 3 — Vạn Kiếm Liên Hoàn

Phóng 6/8/10/12/14 kiếm thường cách nhau 0,1s rồi thêm kiếm cuối. Kiếm thường gây 12,5/15/17,5/20/25% ATK, kiếm cuối 100/130/140/150/160%. Xuyên 999; hiệu ứng đẩy lùi cấu hình được áp dụng cho kiếm cuối, còn kiếm thường đặt `effects=[]`. Hồi chiêu 12/11/10/9/8s.

### Chỉ số gameplay

| Thông số | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| Sát thương (% ATK) (`damage_pct`) | 12.5 | 15 | 17.5 | 20 | 25 |
| Sát thương kiếm cuối (% ATK) (`final_damage_pct`) | 100 | 130 | 140 | 150 | 160 |
| Tốc độ bay (% tốc độ di chuyển hero) (`speed_pct`) | 260 | 275 | 290 | 310 | 335 |
| Range cơ sở (px) (`range`) | 700 | 735 | 775 | 825 | 890 |
| Hồi chiêu (s) (`cooldown`) | 12 | 11 | 10 | 9 | 8 |
| Bán kính radius (px) (`radius`) | 36 | 39 | 42 | 44 | 47 |
| Bán kính kiếm cuối (px) (`final_radius`) | 55 | 60 | 65 | 72 | 81 |
| Số kiếm thường (`sequence_count`) | 6 | 8 | 10 | 12 | 14 |

Thông số cố định cho cả 5 cấp:

| Thông số | Giá trị |
|---|---:|
| Số mục tiêu xuyên (`pierce`) | 999 |
| Khoảng cách giữa kiếm thường (s) (`sequence_interval`) | 0.1 |
| Trễ thêm của kiếm cuối (s) (`final_delay`) | 0.08 |

### Hiệu ứng theo cấp

| Effect / thuộc tính | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| `knockback.distance` | 40 | 45 | 50 | 55 | 60 |
| `knockback.duration` | 0.22 | 0.23 | 0.24 | 0.25 | 0.26 |

Bảng effect giữ **giá trị JSON gốc**: `chance`/`slow_percent=0.2` nghĩa là 20%; `dps_pct=25` nghĩa là 25% ATK mỗi giây. `duration` tính bằng giây.

### Thông số hiển thị và đồng bộ va chạm

| Thông số | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| `vfx_scale` | 0.3432 | 0.3588 | 0.3744 | 0.39 | 0.4056 |
| `final_vfx_scale` | 0.9945 | 1.08225 | 1.17 | 1.25775 | 1.404 |


### Frame/asset qua AtlasRegistry

| Vai trò | Số ID | ID đầu | PNG đã đăng ký (nếu ánh xạ trực tiếp) |
|---|---:|---|---|
| `vfx_frames` | 9 | `hero_3_skill_3a_frame_0` | `res://assets/hero/hero_3/hero_3_skill_3-a.png` |
| `final_vfx_frames` | 9 | `hero_3_skill_3b_frame_0` | `res://assets/hero/hero_3/hero_3_skill_3_b.png` |

<!-- skill-stats-source hero_3_skill_3 c6a9152b99912d4646c0d13809de411cddf2236a9bd36f53b6ed3e9fda2ae1e3 -->

## Skill 4 — Thất Tinh Trận

Nội tại: giảm hồi chiêu Skill 2 là 15/20/25/30/35%; cộng **0,10/0,15/0,20/0,25/0,30 vào hệ số chí mạng** của Skill 3. Tốc độ di chuyển tổng thêm 0/5/10/15/20%; bonus phần trăm cấp mới thay cấp cũ, không cộng dồn 5+10+15+20. Né tránh tổng thêm 10/15/20/25/30%; `stat_flat` bên dưới là phần tăng ở từng lần nhận cấp (10% rồi +5% mỗi cấp).

### Chỉ số gameplay

| Thông số | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| Tổng né tránh cộng thêm (%) (`dodge_pct`) | 10 | 15 | 20 | 25 | 30 |
| Giảm hồi chiêu Skill 2 (%) (`skill_2_cooldown_reduction`) | 15 | 20 | 25 | 30 | 35 |
| Cộng vào hệ số sát thương chí mạng Skill 3 (`skill_3_crit_damage_bonus`) | 0.1 | 0.15 | 0.2 | 0.25 | 0.3 |
| Tăng tốc độ di chuyển (%) (`move_speed_pct`) | 0 | 5 | 10 | 15 | 20 |

Thông số cố định cho cả 5 cấp:

| Thông số | Giá trị |
|---|---:|
| Hồi chiêu (s) (`cooldown`) | 1 |


### Passive effect khi nhận từng cấp

| Type / stat | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| `stat_flat/dodge_rate` | 0.1 | 0.05 | 0.05 | 0.05 | 0.05 |
| `stat_percent/move_speed` | 0 | 0.05 | 0.1 | 0.15 | 0.2 |

`stat_percent` dùng giá trị của **cấp hiện tại thay cấp cũ**; `stat_flat` trong bảng này là phần tăng khi nhận từng cấp.

### Thông số hiển thị và đồng bộ va chạm


Thông số cố định cho cả 5 cấp:

| Thông số | Giá trị |
|---|---:|
| `vfx_scale` | 0.93 |
| `vfx_alpha` | 0.6 |


### Frame/asset qua AtlasRegistry

| Vai trò | Số ID | ID đầu | PNG đã đăng ký (nếu ánh xạ trực tiếp) |
|---|---:|---|---|
| `vfx_frames` | 9 | `hero_3_skill_4_frame_0` | `res://assets/hero/hero_3/hero_3_skill_4_animation.png` |

<!-- skill-stats-source hero_3_skill_4 cfa5f416a37931d3bd179e90f53731d77b245f2e4de608f85ad51842da6cfe10 -->

## Nguồn triển khai

- [SkillManager.gd](../../../client/src/managers/SkillManager.gd)
- [SkillValueService.gd](../../../client/src/services/SkillValueService.gd)
- [Projectile.gd](../../../client/src/combat/Projectile.gd)

## Changelog

| Version | Ngày | Thay đổi |
|---|---|---|
| 1.0.0 | 2026-10-24 | Tổng hợp đầy đủ config và hành vi sau các thay đổi trong phiên; tách thông số hiện tại khỏi thiết kế lịch sử. |

C195 v1.1.0: Skill1 tăng30% lên416px/s; phi kiếm thường tầng1 Skill3 giảm30%, arc_speed_pct=182|192.5|203|217|234.5% tốc độ di chuyển. Kiếm cuối giữ speed_pct=260|275|290|310|335%.
