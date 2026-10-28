# Hero 4 — U Ảnh Độc Tôn

Version: 1.3.0
Cập nhật: 2026-10-29

[Danh sách 5 hero](../HERO_SKILLS_CURRENT.md) · [Config skill nguồn](../../data/skills.json)

Tài liệu phản ánh **source hiện tại**, không xác nhận config đang chạy trên local/VPS. Giá trị là cơ sở trước buff trang bị, giảm hồi chiêu chung, phòng thủ và chí mạng. Gameplay vẫn cần snapshot server hợp lệ; không dùng tài liệu làm fallback.

Các cột Lv1–Lv5 là **cấp skill trong trận**. Level hero mở skill và level trong trận để chọn thẻ là hai điều kiện riêng. `speed_pct` là % tốc độ di chuyển của hero, ngoại trừ bonus tốc độ của nội tại Hero 1 Skill 4; `projectile_speed` là px/s cố định. Hệ số phần trăm dạng 0–1 được đổi sang % khi nhãn ghi (%); raw key giữ trong ngoặc để đối chiếu JSON.

| Slot | Skill | Level hero mở | Level trong trận | Loại |
|---|---|---:|---:|---|
| 1 | Độc Phi Tiêu | 1 | 1 | `volley_projectile` / `active` |
| 2 | Hồi Hoàn Độc Luân | 10 | 5 | `boomerang_fan` / `active` |
| 3 | Hủ Cốt Độc Cạm | 20 | 10 | `trap` / `active` |
| 4 | Vạn Độc Thần Phong | 30 | 15 | `poison_vortex` / `active` |

**C196 v1.5:** Skill 1 tăng sát thương trực tiếp lên 40/55/70/85/100% ATK sau C238; Skill 2–3 chuyển 50% sát thương trực tiếp sang độc, giữ tổng hệ số thô khi trúng một lần và độc chạy đủ thời gian. Độc vẫn dùng strongest/refresh, nên không coi đây là tổng damage bảo đảm khi trúng nhiều lần hoặc chồng với độc khác.

## Chỉ số hero và tăng cấp — C238

[Bảng chung và hệ số JSON](../HERO_STATS_CURRENT.md). Lv dưới đây là cấp hero ngoài trận, khác cấp skill. Cấp tạm trong trận dùng cùng hệ số với mức 25% cho nhóm nhân.

| Lv | HP | ATK | DEF | Tốc chạy | Tốc đánh | Tầm đánh | Chí mạng (%) | ST chí mạng (%) | Hồi HP/10s (%) | HP hồi/10s | Sức tấn công lý thuyết |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 370.00 | 25.00 | 6.00 | 335.00 | 1.95 | 400.00 | 16.00 | 180.00 | 1.20 | 4.44 | 54.99 |
| 50 | 5100.02 | 547.11 | 41.00 | 387.96 | 5.15 | 400.00 | 40.50 | 278.00 | 5.12 | 261.12 | 4844.73 |
| 70 | 14880.63 | 1927.80 | 89.84 | 411.92 | 7.65 | 400.00 | 50.50 | 318.00 | 6.72 | 999.98 | 30968.12 |

## Skill 1 — Độc Phi Tiêu

Mỗi tiêu gây 40/55/70/85/100% ATK trực tiếp và đặt độc 12,5/15/17,5/20/22,5% ATK **mỗi giây**, trong 2s. Số tiêu 1/2/2/3/3, bắn nối tiếp theo `volley_interval`; không nhân toàn bộ độc với số tiêu vì độc thường dùng max potency/refresh.

### Chỉ số gameplay

| Thông số | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| Sát thương (% ATK) (`damage_pct`) | 40 | 55 | 70 | 85 | 100 |
| Tốc độ bay (% tốc độ di chuyển hero) (`speed_pct`) | 230 | 244 | 258 | 274 | 292 |
| Range cơ sở (px) (`range`) | 680 | 700 | 720 | 740 | 760 |
| Số projectile (`projectile_count`) | 1 | 2 | 2 | 3 | 3 |
| Khoảng cách giữa tiêu (s) (`volley_interval`) | 0.12 | 0.12 | 0.12 | 0.12 | 0.1 |
| Hồi chiêu (s) (`cooldown`) | 2.4 | 2.2 | 2 | 1.8 | 1.6 |

Thông số cố định cho cả 5 cấp:

| Thông số | Giá trị |
|---|---:|
| Bán kính radius (px) (`radius`) | 0 |

### Hiệu ứng theo cấp

| Effect / thuộc tính | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| `poison.duration` | 2 | 2 | 2 | 2 | 2 |
| `poison.dps_pct` | 12.5 | 15 | 17.5 | 20 | 22.5 |

Bảng effect giữ **giá trị JSON gốc**: `chance`/`slow_percent=0.2` nghĩa là 20%; `dps_pct=25` nghĩa là 25% ATK mỗi giây. `duration` tính bằng giây.

### Thông số hiển thị và đồng bộ va chạm

| Thông số | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| `vfx_scale` | 0.09 | 0.095 | 0.0975 | 0.1025 | 0.105 |


### Frame/asset qua AtlasRegistry

| Vai trò | Số ID | ID đầu | PNG đã đăng ký (nếu ánh xạ trực tiếp) |
|---|---:|---|---|
| `vfx_frames` | 9 | `hero_4_skill_1_frame_0` | `res://assets/hero/hero_4/hero_4_skill_1_animation.png` |


## Skill 2 — Hồi Hoàn Độc Luân

Độc luân xuyên, bay đi rồi quay lại; mỗi lần trúng chia 50% sát thương trực tiếp và 50% thành độc trong 2s. Cả hai phần cùng giảm tuyến tính theo khoảng cách từ 100% xuống 30% tại tầm tối đa, ở cả lượt đi/về. Tổng hệ số thô trước chia là 85/95/105/115/125% ATK mỗi lần trúng. Bước góc 10°, giới hạn ±20°; slow và tốc độ bay giữ nguyên.

### Chỉ số gameplay

| Thông số | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| Sát thương (% ATK) (`damage_pct`) | 42.5 | 47.5 | 52.5 | 57.5 | 62.5 |
| Tốc độ bay (% tốc độ di chuyển hero) (`speed_pct`) | 248 | 261 | 275 | 291 | 310 |
| Range cơ sở (px) (`range`) | 700 | 720 | 740 | 760 | 780 |
| Số projectile (`projectile_count`) | 1 | 2 | 3 | 4 | 5 |
| Hồi chiêu (s) (`cooldown`) | 6.5 | 6 | 5.5 | 5 | 4.5 |
| Bán kính radius (px) (`radius`) | 30 | 31 | 32 | 33 | 34 |

Thông số cố định cho cả 5 cấp:

| Thông số | Giá trị |
|---|---:|
| Bước góc (độ) (`angle_step`) | 10 |
| Giới hạn lệch mỗi bên (độ) (`fan_half_angle`) | 20 |
| Số mục tiêu xuyên (`pierce`) | 999 |

### Hiệu ứng theo cấp

| Effect / thuộc tính | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| `slow.duration` | 1.5 | 1.75 | 2 | 2.25 | 2.5 |
| `slow.slow_percent` | 0.15 | 0.175 | 0.2 | 0.225 | 0.25 |
| `poison.duration` | 2 | 2 | 2 | 2 | 2 |
| `poison.dps_pct` | 21.25 | 23.75 | 26.25 | 28.75 | 31.25 |
| `poison.scale_dps_with_range` | true | true | true | true | true |

Bảng effect giữ **giá trị JSON gốc**: `chance`/`slow_percent=0.2` nghĩa là 20%; `dps_pct=25` nghĩa là 25% ATK mỗi giây. `duration` tính bằng giây.

### Thông số hiển thị và đồng bộ va chạm

| Thông số | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| `vfx_scale` | 0.117 | 0.1235 | 0.12675 | 0.13 | 0.1365 |


### Frame/asset qua AtlasRegistry

| Vai trò | Số ID | ID đầu | PNG đã đăng ký (nếu ánh xạ trực tiếp) |
|---|---:|---|---|
| `vfx_frames` | 9 | `hero_4_skill_2_frame_0` | `res://assets/hero/hero_4/hero_4_skill_2_animation.png` |


## Skill 3 — Hủ Cốt Độc Cạm

Giới hạn 3/4/5/6/9 bẫy **riêng mỗi caster**; đặt vượt giới hạn thu hồi bẫy đang sống cũ nhất, không cho bẫy đó nổ. Bẫy hết hạn/đã nổ không chiếm slot. Creep phải ở trong vùng kích hoạt đủ 1s. Effect nổ tăng size 30% so với bản cũ, loop **1,5s**, nhưng sát thương và trạng thái chỉ áp dụng **một lần**. Phân biệt bán kính kích hoạt với bán kính nổ. Các dòng mô tả radius cũ không còn là nguồn thông số.

### Chỉ số gameplay

| Thông số | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| Sát thương (% ATK) (`damage_pct`) | 50.05 | 53.8 | 58 | 63.25 | 70 |
| Range cơ sở (px) (`range`) | 725 | 750 | 775 | 800 | 825 |
| Hồi chiêu (s) (`cooldown`) | 8.8 | 8.2 | 7.6 | 7 | 6.2 |
| Bán kính radius (px) (`radius`) | 85 | 95 | 105 | 115 | 125 |
| Bán kính kích hoạt bẫy (px) (`trigger_radius`) | 125 | 145 | 165 | 185 | 205 |
| Khoảng đặt bẫy về phía hero (px) (`place_offset`) | 130 | 135 | 140 | 145 | 150 |
| Tuổi thọ bẫy tối đa (s) (`trap_lifetime`) | 12.5 | 15 | 17.5 | 20 | 25 |
| Số bẫy tối đa / hero (`max_traps`) | 3 | 4 | 5 | 6 | 9 |

Thông số cố định cho cả 5 cấp:

| Thông số | Giá trị |
|---|---:|
| Thời gian ở trong vùng để kích hoạt (s) (`proximity_detonation_delay`) | 1 |
| Thời gian effect nổ (s) (`explosion_duration`) | 1.5 |
| Loop effect nổ (`explosion_loop`) | Có |

### Hiệu ứng theo cấp

| Effect / thuộc tính | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| `poison.duration` | 3 | 3.5 | 4 | 4.5 | 5 |
| `poison.dps_pct` | 61.683333333 | 70.371428571 | 79.5 | 89.055555556 | 99 |
| `slow.duration` | 2.5 | 2.5 | 2.75 | 3 | 3 |
| `slow.slow_percent` | 0.1 | 0.15 | 0.2 | 0.25 | 0.3 |

Bảng effect giữ **giá trị JSON gốc**: `chance`/`slow_percent=0.2` nghĩa là 20%; `dps_pct=25` nghĩa là 25% ATK mỗi giây. `duration` tính bằng giây.

### Thông số hiển thị và đồng bộ va chạm

| Thông số | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| `vfx_scale` | 0.051 | 0.054 | 0.057 | 0.06 | 0.063 |
| `explosion_vfx_scale` | 0.897 | 1.014 | 1.131 | 1.248 | 1.404 |


### Frame/asset qua AtlasRegistry

| Vai trò | Số ID | ID đầu | PNG đã đăng ký (nếu ánh xạ trực tiếp) |
|---|---:|---|---|
| `vfx_frames` | 9 | `hero_4_skill_3a_frame_0` | `res://assets/hero/hero_4/hero_4_skill_3_animation.png` |
| `explosion_vfx_frames` | 9 | `hero_4_skill_3b_frame_0` | `res://assets/hero/hero_4/hero_4_skill_3_2_animation.png` |



C196 v1.1.0: size bẫy và hiệu ứng nổ giảm40%, phạm vi và sát thương giữ nguyên.

## Skill 4 — Vạn Độc Thần Phong

Xoáy tồn tại **2,5s**, loop artwork chu kỳ 1s và quay **400°/s**. Tổng sát thương được chia 5 nhịp tại 0/0,5/1/1,5/2s; mỗi nhịp/mục tiêu độc lập có 20% choáng 0,1s. Kim bắt đầu 0,5s, cách 0,1s, hướng ngẫu nhiên độc lập. Mỗi kim cộng **5% ATK hero vào độc DPS hiện có** và cộng **0,5s thời gian độc còn lại**; chưa có độc thì bắt đầu 0,5s. Tổng độc bị giới hạn **5.000 DPS** trong thời gian hiệu ứng, tương đương tối đa 2.500 sát thương thô mỗi tick 0,5s. Độc thường nhận thêm trong thời gian này không vượt cap. Hết độc hoặc reset actor sẽ xóa cap. Đã bỏ độc cộng dồn theo % HP của bản cũ.

### Chỉ số gameplay

| Thông số | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| Tổng sát thương xoáy (% ATK) (`damage_pct`) | 120 | 130 | 140 | 150 | 160 |
| Sát thương mỗi kim (% ATK) (`needle_damage_pct`) | 25 | 27.5 | 30 | 35 | 40 |
| Range cơ sở (px) (`range`) | 700 | 730 | 765 | 805 | 860 |
| Hồi chiêu (s) (`cooldown`) | 13.5 | 12.6 | 11.7 | 10.8 | 9.6 |
| Bán kính radius (px) (`radius`) | 80 | 85 | 90 | 95 | 100 |
| Số kim (`needle_count`) | 4 | 5 | 6 | 7 | 8 |
| Tầm bay kim (px) (`needle_range`) | 250 | 275 | 300 | 325 | 350 |
| Tốc độ kim (% tốc độ hero) (`needle_speed_pct`) | 160 | 168 | 176 | 184 | 195 |
| Bán kính va chạm kim (px) (`needle_radius`) | 26 | 27 | 28 | 29 | 30 |

Thông số cố định cho cả 5 cấp:

| Thông số | Giá trị |
|---|---:|
| Thời điểm kim đầu (s) (`needle_delay`) | 0.5 |
| Tuổi thọ xoáy (s) (`vortex_duration`) | 2.5 |
| Khoảng cách nhịp xoáy (s) (`vortex_tick_interval`) | 0.5 |
| Khoảng cách giữa kim (s) (`needle_interval`) | 0.1 |
| Số nhịp sát thương xoáy (`vortex_tick_count`) | 5 |
| Tốc độ quay xoáy (độ/s) (`vortex_spin_speed`) | 400 |
| Độc DPS cộng mỗi kim (% ATK hero) (`needle_poison_atk_pct`) | 5 |
| Thời gian độc cộng mỗi kim (s) (`needle_poison_duration_extension`) | 0.5 |
| Giới hạn tổng độc (DPS) (`needle_poison_dps_cap`) | 5000 |

### Hiệu ứng theo cấp

| Effect / thuộc tính | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| `stun.duration` | 0.1 | 0.1 | 0.1 | 0.1 | 0.1 |
| `stun.chance` | 0.2 | 0.2 | 0.2 | 0.2 | 0.2 |
| `slow.duration` | 2 | 2.2 | 2.4 | 2.6 | 3 |
| `slow.slow_percent` | 0.1 | 0.15 | 0.2 | 0.25 | 0.3 |

Bảng effect giữ **giá trị JSON gốc**: `chance`/`slow_percent=0.2` nghĩa là 20%; `dps_pct=25` nghĩa là 25% ATK mỗi giây. `duration` tính bằng giây.

### Thông số hiển thị và đồng bộ va chạm

| Thông số | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| `vfx_scale` | 0.255 | 0.285 | 0.315 | 0.345 | 0.37 |
| `needle_vfx_scale` | 0.105 | 0.11 | 0.11 | 0.115 | 0.12 |

Thông số cố định cho cả 5 cấp:

| Thông số | Giá trị |
|---|---:|
| `vortex_animation_duration` | 1 |


### Frame/asset qua AtlasRegistry

| Vai trò | Số ID | ID đầu | PNG đã đăng ký (nếu ánh xạ trực tiếp) |
|---|---:|---|---|
| `vfx_frames` | 9 | `hero_4_skill_4a_frame_0` | `res://assets/hero/hero_4/hero_4_skill_4_1_animation.png` |
| `needle_vfx_frames` | 9 | `hero_4_skill_4b_frame_0` | `res://assets/hero/hero_4/hero_4_skill_4_2_animation.png` |

<!-- skill-stats-source hero_4_skill_4 3c5d8ad6c81f4c7953a6608d52f37b14d07e70bdfa7fc1f434fbcd6955d73ab4 -->

## Chuẩn hóa asset — C200 v1.1.0

Cả **6 sheet animation**, gồm cả kim Skill4, dùng lưới **3×3, 9 frame400×400px**.
PNG kim mới `hero_4_skill_4_2_animation.png` là1200×1200; danh sách nguồn
`needle_vfx_frames` gồm frame0 đến8. Kim bay loop animation theo nhịp0,06s/frame.
Role hiển thị kim qua AtlasRegistry bảo đảm đọc đủ9 frame ngay cả khi metadata
cũ của server chỉ có1 frame. Không đổi damage, tốc độ bay, scale hay độc.
Chỉ các icon `*_projectile.png` vẫn là ảnh đầy đủ.
Chi tiết: [C200](../contracts/C200_HERO4_ASSET_GRID.md).

## Nguồn triển khai

- [SkillManager.gd](../../../client/src/managers/SkillManager.gd)
- [SkillValueService.gd](../../../client/src/services/SkillValueService.gd)
- [Projectile.gd](../../../client/src/combat/Projectile.gd)
- [PoisonTrap.gd](../../../client/src/combat/PoisonTrap.gd)

## Changelog

| Version | Ngày | Thay đổi |
|---|---|---|
| 1.1.0 | 2026-10-27 | C196 v1.4: giảm hit Skill1, chuyển damage Skill2/3 sang độc và cập nhật mốc mở Skill4 cùng scale Skill2. |
| 1.0.2 | 2026-10-24 | Kim Skill4 đã đổi sang animation3×3/9frame400px. |
| 1.0.1 | 2026-10-24 | Chuẩn grid400px cho năm animation sheet; giữ nguyên kim đơn và icon. |
| 1.0.0 | 2026-10-24 | Tổng hợp đầy đủ config và hành vi sau các thay đổi trong phiên; tách thông số hiện tại khỏi thiết kế lịch sử. |
