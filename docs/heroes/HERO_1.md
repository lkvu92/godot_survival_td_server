# Hero 1 — Băng Tuyết Thánh Nữ

Version: 1.0.0
Cập nhật: 2026-10-24

[Danh sách 5 hero](../HERO_SKILLS_CURRENT.md) · [Config skill nguồn](../../data/skills.json)

Tài liệu phản ánh **source hiện tại**, không xác nhận config đang chạy trên local/VPS. Giá trị là cơ sở trước buff trang bị, giảm hồi chiêu chung, phòng thủ và chí mạng. Gameplay vẫn cần snapshot server hợp lệ; không dùng tài liệu làm fallback.

Các cột Lv1–Lv5 là **cấp skill trong trận**. Level hero mở skill và level trong trận để chọn thẻ là hai điều kiện riêng. `speed_pct` là % tốc độ di chuyển của hero, ngoại trừ bonus tốc độ của nội tại Hero 1 Skill 4; `projectile_speed` là px/s cố định. Hệ số phần trăm dạng 0–1 được đổi sang % khi nhãn ghi (%); raw key giữ trong ngoặc để đối chiếu JSON.

| Slot | Skill | Level hero mở | Level trong trận | Loại |
|---|---|---:|---:|---|
| 1 | Băng Luân Song Hành | 1 | 1 | `projectile` / `active` |
| 2 | Thiên Băng Vẫn Thạch | 10 | 5 | `two_phase_aoe` / `active` |
| 3 | Cực Địa Băng Giới | 20 | 10 | `support_heal` / `passive` |
| 4 | Hàn Băng Thấu Thể | 30 | 15 | `support_heal` / `passive` |

## Skill 1 — Băng Luân Song Hành

Băng Luân Song Hành là projectile tuyến tính. Các tia chính theo cấp là 1/1/2/2/3; Hàn Băng Thấu Thể ở slot 4 mới là nội tại cường hóa tia. Không dùng lại mô tả cũ gọi nội tại là Skill 3.

### Chỉ số gameplay

| Thông số | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| Sát thương (% ATK) (`damage_pct`) | 97.5 | 103.5 | 111 | 120 | 130.5 |
| Tốc độ bay (% tốc độ di chuyển hero) (`speed_pct`) | 200 | 220 | 240 | 260 | 280 |
| Số tia chính (`strike_count`) | 1 | 1 | 2 | 2 | 3 |
| Số projectile (`projectile_count`) | 1 | 1 | 2 | 2 | 3 |
| Hồi chiêu (s) (`cooldown`) | 2 | 1.9 | 1.8 | 1.7 | 1.6 |
| `impact_aoe_vortex` | — | — | — | 1 | 1 |

Thông số cố định cho cả 5 cấp:

| Thông số | Giá trị |
|---|---:|
| Range cơ sở (px) (`range`) | 768 |
| Bán kính radius (px) (`radius`) | 22 |
| Số mục tiêu xuyên (`pierce`) | 0 |

### Hiệu ứng theo cấp

| Effect / thuộc tính | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| `slow.duration` | 2 | 2 | 2 | 2 | 2 |
| `slow.slow_percent` | 0.1 | 0.15 | 0.2 | 0.25 | 0.3 |

Bảng effect giữ **giá trị JSON gốc**: `chance`/`slow_percent=0.2` nghĩa là 20%; `dps_pct=25` nghĩa là 25% ATK mỗi giây. `duration` tính bằng giây.

### Thông số hiển thị và đồng bộ va chạm


Thông số cố định cho cả 5 cấp:

| Thông số | Giá trị |
|---|---:|
| `vfx_scale` | 0.406 |


### Frame/asset qua AtlasRegistry

| Vai trò | Số ID | ID đầu | PNG đã đăng ký (nếu ánh xạ trực tiếp) |
|---|---:|---|---|
| `vfx_frames` | 1 | `hero_1_skill1_frame_4` | `res://assets/hero/hero_1/hero_1_skill1_sprite.png` |

<!-- skill-stats-source hero_1_skill_1 3a54929aa2de404880bed1d914e26269b20cec8a3edaf00e81cb4760d793257a -->

## Skill 2 — Thiên Băng Vẫn Thạch

Băng thạch rơi trong 0,35s, tầm chọn mục tiêu 600px. Tia phụ gây **40% sát thương chính**, tốc độ 540px/s; mỗi tia làm chậm 30% trong 2s, áp dụng từ cấp có tia phụ (Lv2). Bốn tia ở Lv5 hiện dùng xoay vòng ba spawn offset cấu hình, nên tia thứ tư dùng lại offset đầu. Không có sát thương pha hai (`second_damage_pct=0`).

### Chỉ số gameplay

| Thông số | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| Sát thương (% ATK) (`damage_pct`) | 65 | 75 | 85 | 95 | 105 |
| Bán kính radius (px) (`radius`) | 100 | 120 | 140 | 160 | 180 |
| Hồi chiêu (s) (`cooldown`) | 6 | 5.6 | 5.2 | 4.8 | 4.2 |
| Số tia băng phụ (`flank_bolts`) | 0 | 1 | 2 | 3 | 4 |
| `flank_slow` | — | — | — | — | 0.3 |

Thông số cố định cho cả 5 cấp:

| Thông số | Giá trị |
|---|---:|
| Range cơ sở (px) (`range`) | 600 |
| Độ trễ chạm đất (s) (`impact_delay`) | 0.35 |
| Độ cao rơi (px) (`above_height`) | 360 |
| Sát thương pha phụ (% ATK) (`second_damage_pct`) | 0 |


### Thông số hiển thị và đồng bộ va chạm

| Thông số | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| `vfx_scale` | 0.38 | 0.494 | 0.6422 | 0.8349 | 1.0854 |
| `phase_a_vfx_scale` | 0.38 | 0.494 | 0.6422 | 0.8349 | 1.0854 |


### Frame/asset qua AtlasRegistry

| Vai trò | Số ID | ID đầu | PNG đã đăng ký (nếu ánh xạ trực tiếp) |
|---|---:|---|---|
| `vfx_frames` | 1 | `hero_1_skill2_frame_0` | `res://assets/hero/hero_1/hero_1_skill2_sprite.png` |
| `flank_bolt_config.vfx_frames` | 9 | `hero_1_skill2_effect_frame_0` | `res://assets/hero/hero_1/hero_1_skill2_effect_sprite.png` |

<!-- skill-stats-source hero_1_skill_2 1992e2a48394532d1096fba2d3076a878df5383c996bf9cf386be31a630bbdac -->

## Skill 3 — Cực Địa Băng Giới

Skill hỗ trợ, **không gây sát thương trực tiếp**. Mỗi lần tạo vùng mới đều thu hồi vùng và modifier cũ của chính caster; vùng của caster khác không bị xóa. Giảm tốc độ di chuyển tăng tuyến tính từ biên 10% tới tâm 50%; choáng lúc tạo vùng là 50% trong 0,1s. Cả 5 cấp có chỉ số riêng như bảng dưới.

### Chỉ số gameplay

| Thông số | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| Hồi chiêu (s) (`cooldown`) | 15 | 14.5 | 14 | 13.5 | 13 |
| Thời gian băng giới (s) (`domain_duration`) | 6 | 7 | 8 | 9 | 10 |
| Bán kính băng giới (px) (`domain_radius`) | 240 | 250 | 260 | 270 | 280 |
| Giảm tốc độ đánh quái (%) (`attack_speed_slow`) | 20 | 22.5 | 25 | 27.5 | 30 |
| Giảm giáp quái (%) (`def_reduction`) | 15 | 17.5 | 20 | 22.5 | 25 |

Thông số cố định cho cả 5 cấp:

| Thông số | Giá trị |
|---|---:|
| Sát thương (% ATK) (`damage_pct`) | 0 |
| Tầm chọn mục tiêu băng giới (px) (`domain_cast_range`) | 768 |
| Chậm di chuyển ở biên (%) (`domain_slow_edge`) | 10 |
| Chậm di chuyển tại tâm (%) (`domain_slow_center`) | 50 |
| Tỷ lệ choáng lúc tạo vùng (%) (`impact_stun_chance`) | 50 |
| Thời gian choáng lúc tạo vùng (s) (`impact_stun_duration`) | 0.1 |


### Frame/asset qua AtlasRegistry

| Vai trò | Số ID | ID đầu | PNG đã đăng ký (nếu ánh xạ trực tiếp) |
|---|---:|---|---|
| `vfx_frames` | 4 | `hero_1_skill4_beam` | `res://assets/hero/hero_1/hero_1_skill4_1.png` |

<!-- skill-stats-source hero_1_skill_3 66697e8469007536d128a51798d230455fe69e6981c7d65c647fc7cd51f12938 -->

## Skill 4 — Hàn Băng Thấu Thể

cooldown=1 của nội tại là metadata, không phải một đợt gây damage mỗi giây. Nội tại cường hóa Skill 1: `damage_pct` là **bonus sát thương**, `speed_pct` là **bonus tốc độ bay**, không phải tốc độ bay độc lập. Tăng sát thương 12,5/15/17,5/20/22,5%; tốc độ bay +15/20/25/30/35%. Mỗi mục tiêu trúng có 30% cơ hội đóng băng 0,2s. Nổ phụ bán kính 48px gây 25% sát thương tia chính; nổ không phụ thuộc việc proc đóng băng. Giữ xuyên 999, tia cộng thêm và suy giảm theo khoảng bay như config.

Yêu cầu thêm: đã học `hero_1_skill_1`.

### Chỉ số gameplay

| Thông số | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| Tăng sát thương Skill 1 (%) (`damage_pct`) | 12.5 | 15 | 17.5 | 20 | 22.5 |
| Tăng tốc độ bay Skill 1 (%) (`speed_pct`) | 15 | 20 | 25 | 30 | 35 |
| Mức giảm mỗi chặng 20% tầm bay (%) (`damage_falloff_per_20_pct`) | 20 | 17.5 | 15 | 12.5 | 10 |
| Tia cộng thêm cho Skill 1 (`extra_beams`) | — | — | 1 | 1 | 2 |

Thông số cố định cho cả 5 cấp:

| Thông số | Giá trị |
|---|---:|
| Hồi chiêu (s) (`cooldown`) | 1 |
| Số mục tiêu xuyên (`pierce`) | 999 |
| Thời gian đóng băng (s) (`freeze_duration`) | 0.2 |
| Sàn sát thương trực tiếp (`minimum_damage`) | 100 |
| Tỷ lệ đóng băng (%) (`freeze_chance`) | 30 |
| Nổ phụ / sát thương tia chính (%) (`freeze_damage_multiplier`) | 25 |


### Frame/asset qua AtlasRegistry

| Vai trò | Số ID | ID đầu | PNG đã đăng ký (nếu ánh xạ trực tiếp) |
|---|---:|---|---|
| `vfx_frames` | 9 | `hero_1_skill3_effect_frame_0` | `res://assets/hero/hero_1/hero_1_skill3_effect_sprite.png` |

<!-- skill-stats-source hero_1_skill_4 47f9e0cddb282c3fb1b87ff691e09f5e181d6e2a24019dde781aa02c37020145 -->

## Nguồn triển khai

- [SkillManager.gd](../../../client/src/managers/SkillManager.gd)
- [SkillValueService.gd](../../../client/src/services/SkillValueService.gd)
- [Projectile.gd](../../../client/src/combat/Projectile.gd)

## Changelog

| Version | Ngày | Thay đổi |
|---|---|---|
| 1.0.0 | 2026-10-24 | Tổng hợp đầy đủ config và hành vi sau các thay đổi trong phiên; tách thông số hiện tại khỏi thiết kế lịch sử. |
