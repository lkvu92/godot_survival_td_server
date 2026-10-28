# Hero 2 — Liệt Diễm Tiễn Tôn

Version: 1.1.0
Cập nhật: 2026-10-29

[Danh sách 5 hero](../HERO_SKILLS_CURRENT.md) · [Config skill nguồn](../../data/skills.json)

Tài liệu phản ánh **source hiện tại**, không xác nhận config đang chạy trên local/VPS. Giá trị là cơ sở trước buff trang bị, giảm hồi chiêu chung, phòng thủ và chí mạng. Gameplay vẫn cần snapshot server hợp lệ; không dùng tài liệu làm fallback.

Các cột Lv1–Lv5 là **cấp skill trong trận**. Level hero mở skill và level trong trận để chọn thẻ là hai điều kiện riêng. `speed_pct` là % tốc độ di chuyển của hero, ngoại trừ bonus tốc độ của nội tại Hero 1 Skill 4; `projectile_speed` là px/s cố định. Hệ số phần trăm dạng 0–1 được đổi sang % khi nhãn ghi (%); raw key giữ trong ngoặc để đối chiếu JSON.

| Slot | Skill | Level hero mở | Level trong trận | Loại |
|---|---|---:|---:|---|
| 1 | Liệt Diễm Liên Tiễn | 1 | 1 | `hero_2_flame_arrow` / `active` |
| 2 | Chu Tước Hỏa Xung | 10 | 5 | `hero_2_phoenix` / `active` |
| 3 | Phần Thiên Tiễn Ý | 20 | 10 | `hero_2_flame_arrow_mastery` / `passive` |
| 4 | Tam Tài Diệt Thế Tiễn | 30 | 15 | `hero_2_triangle_volley` / `active` |

## Chỉ số hero và tăng cấp — C238

[Bảng chung và hệ số JSON](../HERO_STATS_CURRENT.md). Lv dưới đây là cấp hero ngoài trận, khác cấp skill. Cấp tạm trong trận dùng cùng hệ số với mức 25% cho nhóm nhân.

| Lv | HP | ATK | DEF | Tốc chạy | Tốc đánh | Tầm đánh | Chí mạng (%) | ST chí mạng (%) | Hồi HP/10s (%) | HP hồi/10s | Sức tấn công lý thuyết |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 360.00 | 30.00 | 5.00 | 295.00 | 1.45 | 450.00 | 12.00 | 175.00 | 1.00 | 3.60 | 47.42 |
| 50 | 4962.19 | 1302.82 | 34.17 | 325.34 | 2.60 | 450.00 | 36.50 | 273.00 | 4.92 | 244.14 | 5529.33 |
| 70 | 14478.45 | 6072.40 | 74.86 | 338.61 | 3.30 | 450.00 | 46.50 | 313.00 | 6.52 | 944.00 | 39914.90 |

## Skill 1 — Liệt Diễm Liên Tiễn

Bắn 1/1/2/2/3 tia. Bước lệch tia hiện tại là **10°** theo runtime; không dùng thông số góc rộng trước đây. Nội tại Skill 3 điều chỉnh hồi chiêu, thiêu đốt và tia tách.

### Chỉ số gameplay

| Thông số | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| Sát thương (% ATK) (`damage_pct`) | 91 | 97 | 104.5 | 113.5 | 124 |
| Tốc độ bay (% tốc độ di chuyển hero) (`speed_pct`) | 260 | 270 | 280 | 290 | 300 |
| Số projectile (`projectile_count`) | 1 | 1 | 2 | 2 | 3 |
| Hồi chiêu (s) (`cooldown`) | 2.4 | 2.25 | 2.1 | 1.95 | 1.8 |
| Bán kính radius (px) (`radius`) | 13 | 13.5 | 14 | 14.5 | 15 |

Thông số cố định cho cả 5 cấp:

| Thông số | Giá trị |
|---|---:|
| Range cơ sở (px) (`range`) | 896 |


### Thông số hiển thị và đồng bộ va chạm

| Thông số | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| `vfx_scale` | 0.196 | 0.203 | 0.21 | 0.217 | 0.224 |


### Frame/asset qua AtlasRegistry

| Vai trò | Số ID | ID đầu | PNG đã đăng ký (nếu ánh xạ trực tiếp) |
|---|---:|---|---|
| `vfx_frames` | 9 | `hero_2_skill1_frame_0` | `res://assets/hero/hero_2/hero_2_skill1_animation.png` |

<!-- skill-stats-source hero_2_skill_1 f53991d4074bea4f67501d3b175e36c57975722b72177f457c129fabd7952909 -->

## Skill 2 — Chu Tước Hỏa Xung

Phải tách rõ **cast_range=700px** (tầm xuất skill/tìm mục tiêu) và **range=1024px** (tầm bay). Bán kính 100/115/130/145/160px và VFX đã được chỉnh tương ứng. Chu Tước dùng artwork không phủ alpha tùy chỉnh và chỉ đẩy lùi nhẹ 24/27/30/33/36px trong 0,15s.

### Chỉ số gameplay

| Thông số | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| Sát thương (% ATK) (`damage_pct`) | 39 | 42 | 45.375 | 49.125 | 54 |
| Tốc độ bay (% tốc độ di chuyển hero) (`speed_pct`) | 240 | 250 | 260 | 270 | 280 |
| Hồi chiêu (s) (`cooldown`) | 7.5 | 7 | 6.5 | 6 | 5.5 |
| Bán kính radius (px) (`radius`) | 100 | 115 | 130 | 145 | 160 |
| Đẩy lùi (px) (`knockback_distance`) | 24 | 27 | 30 | 33 | 36 |

Thông số cố định cho cả 5 cấp:

| Thông số | Giá trị |
|---|---:|
| Range cơ sở (px) (`range`) | 1024 |
| Số mục tiêu xuyên (`pierce`) | 999 |
| Thời gian đẩy lùi (s) (`knockback_duration`) | 0.15 |
| Tầm tìm mục tiêu để xuất skill (px) (`cast_range`) | 700 |


### Thông số hiển thị và đồng bộ va chạm

| Thông số | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| `vfx_scale` | 0.694444 | 0.800633 | 0.901734 | 1.008021 | 1.108911 |


### Frame/asset qua AtlasRegistry

| Vai trò | Số ID | ID đầu | PNG đã đăng ký (nếu ánh xạ trực tiếp) |
|---|---:|---|---|
| `vfx_frames` | 9 | `hero_2_skill2_frame_0` | `res://assets/hero/hero_2/hero_2_skill2_animation.png` |

<!-- skill-stats-source hero_2_skill_2 5ac6a4724b0be977cbca7e40ecb3709f726d15c9375ce82c4a717c626d5d7a79 -->

## Skill 3 — Phần Thiên Tiễn Ý

Nội tại yêu cầu đã có Skill 1. Giảm hồi chiêu Skill 1, thêm tổng thiêu đốt theo % ATK và tia tách; mỗi tia tách gây 35% sát thương chính, tầm 360px. Không cộng bonus phần trăm của các cấp cũ lần nữa khi lên cấp.

Yêu cầu thêm: đã học `hero_2_skill_1`.

### Chỉ số gameplay

| Thông số | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| Giảm hồi chiêu Skill 1 (%) (`skill_1_cooldown_reduction`) | 10 | 15 | 20 | 25 | 30 |
| Tổng thiêu đốt (% ATK) (`burn_total_damage_pct`) | 6.5 | 8 | 9.5 | 11 | 12.5 |
| `split_arrow_count` | 1 | 1 | 2 | 2 | 3 |

Thông số cố định cho cả 5 cấp:

| Thông số | Giá trị |
|---|---:|
| Sát thương mỗi tia tách / tia chính (%) (`split_damage_multiplier`) | 35 |
| `split_range` | 360 |


### Thông số hiển thị và đồng bộ va chạm


Thông số cố định cho cả 5 cấp:

| Thông số | Giá trị |
|---|---:|
| `split_vfx_scale_multiplier` | 0.55 |


### Frame/asset qua AtlasRegistry

| Vai trò | Số ID | ID đầu | PNG đã đăng ký (nếu ánh xạ trực tiếp) |
|---|---:|---|---|
| `vfx_frames` | 1 | `hero_2_skill1_frame_4` | `res://assets/hero/hero_2/hero_2_skill1_animation.png` |

<!-- skill-stats-source hero_2_skill_3 f54752a434178d6a029e302269aa1a80c273c4aa5dafd16425a76f8d01690928 -->

## Skill 4 — Tam Tài Diệt Thế Tiễn

Khóa vị trí mục tiêu trong 2s. Telegraph bán kính 96px gây 4 nhịp cách 0,5s, mỗi nhịp 0,5% HP tối đa. Sau đó bắn tiễn chính và hai tiễn phụ; mỗi tiễn phụ có hệ số sát thương 50% tiễn chính. Đọc `side_delay`, `side_spacing` và các hệ số hiển thị theo cấp bên dưới.

### Chỉ số gameplay

| Thông số | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| Sát thương (% ATK) (`damage_pct`) | 130 | 140.5 | 152.5 | 163 | 175 |
| Tốc độ bay (% tốc độ di chuyển hero) (`speed_pct`) | 190 | 195 | 200 | 205 | 210 |
| Hồi chiêu (s) (`cooldown`) | 17 | 16 | 15 | 14 | 13 |
| Bán kính radius (px) (`radius`) | 108 | 118.5 | 129 | 141 | 151.5 |
| `side_delay` | 0.12 | 0.12 | 0.11 | 0.1 | 0.1 |
| `side_spacing` | 95 | 98 | 101 | 104 | 107 |

Thông số cố định cho cả 5 cấp:

| Thông số | Giá trị |
|---|---:|
| Range cơ sở (px) (`range`) | 896 |
| Số mục tiêu xuyên (`pierce`) | 999 |
| `charge_time` | 2 |
| `telegraph_radius` | 96 |
| Sát thương mỗi nhịp telegraph (% HP tối đa) (`telegraph_max_hp_pct`) | 0.5 |
| `telegraph_tick_interval` | 0.5 |


### Thông số hiển thị và đồng bộ va chạm

| Thông số | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| `vfx_scale` | 1.44 | 1.584 | 1.728 | 1.872 | 2.016 |

Thông số cố định cho cả 5 cấp:

| Thông số | Giá trị |
|---|---:|
| `vfx_alpha` | 0.8 |
| `telegraph_tick_count` | 4 |
| `telegraph_vfx_scale` | 0.56 |


### Frame/asset qua AtlasRegistry

| Vai trò | Số ID | ID đầu | PNG đã đăng ký (nếu ánh xạ trực tiếp) |
|---|---:|---|---|
| `vfx_frames` | 9 | `hero_2_skill4_frame_0` | `res://assets/hero/hero_2/hero_2_skill4_animation.png` |
| `telegraph_vfx_frames` | 9 | `creep_fire_rune_0` | Tra theo ID trong AtlasRegistry |

<!-- skill-stats-source hero_2_skill_4 3a552681e1fe4d697d05a42fb3a043c887a13e2dcc8b0cfd8288676c9a9ac78c -->

## Nguồn triển khai

- [SkillManager.gd](../../../client/src/managers/SkillManager.gd)
- [SkillValueService.gd](../../../client/src/services/SkillValueService.gd)
- [Projectile.gd](../../../client/src/combat/Projectile.gd)

## Changelog

| Version | Ngày | Thay đổi |
|---|---|---|
| 1.0.0 | 2026-10-24 | Tổng hợp đầy đủ config và hành vi sau các thay đổi trong phiên; tách thông số hiện tại khỏi thiết kế lịch sử. |
