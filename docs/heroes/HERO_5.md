# Hero 5 — Vạn Tượng Quán Âm

Version: 1.0.5
Cập nhật: 2026-10-24

[Danh sách 5 hero](../HERO_SKILLS_CURRENT.md) · [Config skill nguồn](../../data/skills.json)

Tài liệu phản ánh **source hiện tại**, không xác nhận config đang chạy trên local/VPS. Giá trị là cơ sở trước buff trang bị, giảm hồi chiêu chung, phòng thủ và chí mạng. Gameplay vẫn cần snapshot server hợp lệ; không dùng tài liệu làm fallback.

Các cột Lv1–Lv5 là **cấp skill trong trận**. Level hero mở skill và level trong trận để chọn thẻ là hai điều kiện riêng. `speed_pct` là % tốc độ di chuyển của hero, ngoại trừ bonus tốc độ của nội tại Hero 1 Skill 4; `projectile_speed` là px/s cố định. Hệ số phần trăm dạng 0–1 được đổi sang % khi nhãn ghi (%); raw key giữ trong ngoặc để đối chiếu JSON.

| Slot | Skill | Level hero mở | Level trong trận | Loại |
|---|---|---:|---:|---|
| 1 | Hoàng Kim Chỉ | 1 | 1 | `buddha_gold_finger` / `active` |
| 2 | Lục Tự Đại Minh Ấn | 10 | 5 | `buddha_six_syllable` / `active` |
| 3 | Như Lai Thần Chưởng | 20 | 10 | `buddha_palm` / `active` |
| 4 | Vạn Trượng Kim Thân | 30 | 15 | `buddha_golden_body` / `active` |

## Skill 1 — Hoàng Kim Chỉ

Tia chính gây **60/75/85/100/120% ATK**, khi trúng nổ riêng **25/30/35/40/45% ATK**. Không còn chia hệ số tia chính thành 50% direct +50% nổ. Nếu cùng mục tiêu nhận đủ hai phần, tổng hệ số cơ sở là 85/105/120/140/165% ATK trước phòng thủ/buff. Số tia 1/1/2/2/3, bước góc 10°. Nổ dùng đúng `hero_5_skill1_effect1.png` (3×3, 9 frame), một lần trong 0,4s tại điểm trúng, alpha 0,7.

Kích thước tia hiển thị có hệ số bù **3,135×** từ manifest (C201), vì scale cũ áp lên ô400px chỉ còn27–35px. Bề rộng ô hiển thị mới khoảng86–111px theo cấp; damage, hitbox và kích thước nổ không đổi.

### Chỉ số gameplay

| Thông số | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| Sát thương tia trực tiếp (% ATK) (`damage_pct`) | 60 | 75 | 85 | 100 | 120 |
| Hồi chiêu (s) (`cooldown`) | 2 | 1.9 | 1.8 | 1.7 | 1.6 |
| Range cơ sở (px) (`range`) | 700 | 720 | 740 | 760 | 780 |
| Tốc độ bay (% tốc độ di chuyển hero) (`speed_pct`) | 240 | 250 | 260 | 270 | 280 |
| Số projectile (`projectile_count`) | 1 | 1 | 2 | 2 | 3 |
| Bán kính radius (px) (`radius`) | 24 | 26 | 28 | 30 | 32 |
| Bán kính nổ (px) (`aoe_radius`) | 45 | 50 | 60 | 70 | 80 |
| Sát thương nổ riêng (% ATK) (`explosion_damage_pct`) | 25 | 30 | 35 | 40 | 45 |
| Đẩy lùi (px) (`knockback_distance`) | 30 | 35 | 40 | 45 | 50 |

Thông số cố định cho cả 5 cấp:

| Thông số | Giá trị |
|---|---:|
| Số mục tiêu xuyên (`pierce`) | 0 |
| Bước góc quạt (độ) (`fan_angle`) | 10 |

### Hiệu ứng theo cấp

| Effect / thuộc tính | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| `knockback_light.distance` | 30 | 35 | 40 | 45 | 50 |
| `knockback_light.duration` | 0.15 | 0.15 | 0.15 | 0.15 | 0.15 |

Bảng effect giữ **giá trị JSON gốc**: `chance`/`slow_percent=0.2` nghĩa là 20%; `dps_pct=25` nghĩa là 25% ATK mỗi giây. `duration` tính bằng giây.

### Thông số hiển thị và đồng bộ va chạm

| Thông số | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| `vfx_scale` | 0.0686 | 0.0735 | 0.0784 | 0.0833 | 0.0882 |
| `explosion_vfx_scale` | 0.1225 | 0.14 | 0.1575 | 0.175 | 0.1925 |


### Frame/asset qua AtlasRegistry

| Vai trò | Số ID | ID đầu | PNG đã đăng ký (nếu ánh xạ trực tiếp) |
|---|---:|---|---|
| `vfx_frames` | 1 | `hero_5_skill1_projectile` | Tra theo ID trong AtlasRegistry |
| `explosion_vfx_frames` | 9 | `hero_5_skill1_effect1_0` | `res://assets/hero/hero_5/hero_5_skill1_effect1.png` |

<!-- skill-stats-source hero_5_skill_1 94dd91981c4141d390738b594b8193226fbd559f684a958aeb0def8b76b653a8 -->

## Skill 2 — Lục Tự Đại Minh Ấn

Đã chốt đủ 5 mốc: mỗi đợt cổ ngữ gây **25/30/35/40/45% ATK cộng 0,2/0,3/0,6/0,8/1% HP tối đa của mục tiêu**. `rune_hp_percent` lưu dạng tỷ lệ 0,002/0,003/0,006/0,008/0,01.

Tầng 1: trận xuất hiện tại tâm mục tiêu đã khóa, gây AOE ban đầu, phát animation một lượt trong 1s rồi giữ frame cuối tới đủ 2s, không loop/không fade frame giữ. Tầng 2: cổ ngữ xuất hiện tại **t=1s**, loop 1,5s; 3 nhịp sát thương tại **t=1,5/2/2,5s**. Cộng cả % ATK và % HP ở từng nhịp, không phải tổng của ba nhịp. Mỗi hit gây sát thương có 35% cơ hội choáng theo cấp. Không còn đặt burn 3s như phiên bản cũ.

### Chỉ số gameplay

| Thông số | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| Sát thương (% ATK) (`damage_pct`) | 70 | 85 | 100 | 115 | 130 |
| Hồi chiêu (s) (`cooldown`) | 6.5 | 6 | 5.5 | 5 | 4.5 |
| Range cơ sở (px) (`range`) | 720 | 740 | 760 | 780 | 800 |
| Bán kính radius (px) (`radius`) | 80 | 90 | 100 | 120 | 140 |
| Thời gian choáng (s) (`stun_duration`) | 0.1 | 0.125 | 0.15 | 0.175 | 0.2 |
| Mỗi nhịp cổ ngữ (% ATK) (`rune_damage_pct`) | 25 | 30 | 35 | 40 | 45 |
| Mỗi nhịp cổ ngữ (% HP tối đa) (`rune_hp_percent`) | 0.2 | 0.3 | 0.6 | 0.8 | 1 |

Thông số cố định cho cả 5 cấp:

| Thông số | Giá trị |
|---|---:|
| Tỷ lệ choáng (%) (`stun_chance`) | 35 |
| Thời gian tầng trận (s) (`formation_duration`) | 2 |
| Trễ xuất hiện cổ ngữ (s) (`rune_delay`) | 1 |
| Thời gian cổ ngữ (s) (`rune_duration`) | 1.5 |
| Khoảng cách nhịp cổ ngữ (s) (`rune_tick_interval`) | 0.5 |

### Hiệu ứng theo cấp

| Effect / thuộc tính | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| `holy_stun.chance` | 0.35 | 0.35 | 0.35 | 0.35 | 0.35 |
| `holy_stun.duration` | 0.1 | 0.125 | 0.15 | 0.175 | 0.2 |

Bảng effect giữ **giá trị JSON gốc**: `chance`/`slow_percent=0.2` nghĩa là 20%; `dps_pct=25` nghĩa là 25% ATK mỗi giây. `duration` tính bằng giây.

### Thông số hiển thị và đồng bộ va chạm

| Thông số | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| `vfx_scale` | 0.51429 | 0.57857 | 0.64286 | 0.77143 | 0.9 |

Thông số cố định cho cả 5 cấp:

| Thông số | Giá trị |
|---|---:|
| Thời gian chạy một lượt frame trận (s) (`formation_animation_duration`) | 1 |


### Frame/asset qua AtlasRegistry

| Vai trò | Số ID | ID đầu | PNG đã đăng ký (nếu ánh xạ trực tiếp) |
|---|---:|---|---|
| `vfx_frames` | 9 | `hero_5_skill2_sprite_0` | `res://assets/hero/hero_5/hero_5_skill2_sprite.png` |
| `rune_vfx_frames` | 9 | `hero_5_skill2_effect1_0` | `res://assets/hero/hero_5/hero_5_skill2_effect1.png` |

<!-- skill-stats-source hero_5_skill_2 1f9e357ed24b528494612f27d52ad77c5eb88fd90ad985628312eaf77032c195 -->

## Skill 3 — Như Lai Thần Chưởng

Tầng 1: chưởng rơi sau 0,35s, artwork tăng **100% (2×)** ở mọi cấp theo C202; bán kính/damage không đổi, không loop; bán kính 70/75/80/85/90px, sprite đã giảm theo cùng tỷ lệ, gây 100/110/120/130/140% ATK. Tầng 2 bắt đầu ngay lúc impact: đất nứt không loop trong 1s, kiểm tra mục tiêu trong AOE tại hai nhịp impact +0,5/+1s; tổng đốt là 0,5/0,6/0,7/0,8/1% HP tối đa. Không còn hit phụ 35% sát thương chưởng. Tầng 3 cũng bắt đầu lúc impact: 1/2/2/3/3 sóng, cách 0,2s; mọi sóng cùng bán kính cuối 100/110/120/130/140px, lan theo vành khuyên, **không gây AOE toàn vùng ngay lập tức**. Mỗi sóng đánh một lần/mục tiêu với 30/40/50/60/70% ATK và 20% choáng 0,1/0,15/0,2/0,25/0,3s. Sóng không còn gây % HP.

### Chỉ số gameplay

| Thông số | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| Sát thương (% ATK) (`damage_pct`) | 100 | 110 | 120 | 130 | 140 |
| Hồi chiêu (s) (`cooldown`) | 11 | 10 | 9 | 8 | 7 |
| Bán kính radius (px) (`radius`) | 140 | 150 | 160 | 170 | 180 |
| Thời gian choáng (s) (`stun_duration`) | 0.1 | 0.15 | 0.2 | 0.25 | 0.3 |
| Số sóng (`wave_count`) | 1 | 2 | 2 | 3 | 3 |
| Tổng đốt đất nứt trong 1s (% HP tối đa) (`crack_burn_hp_percent`) | 0.5 | 0.6 | 0.7 | 0.8 | 1 |
| Bán kính sóng (px) (`wave_radius`) | 200 | 220 | 240 | 260 | 280 |
| Sát thương mỗi sóng (% ATK) (`wave_damage_pct`) | 30 | 40 | 50 | 60 | 70 |

Thông số cố định cho cả 5 cấp:

| Thông số | Giá trị |
|---|---:|
| Range cơ sở (px) (`range`) | 1920 |
| Độ trễ chạm đất (s) (`impact_delay`) | 0.35 |
| Độ cao rơi (px) (`above_height`) | 400 |
| `wave_expand_duration` | 0.55 |
| Thời gian đất nứt (s) (`crack_duration`) | 1 |
| Khoảng cách nhịp đất nứt (s) (`crack_tick_interval`) | 0.5 |
| Tỷ lệ choáng mỗi sóng (%) (`wave_stun_chance`) | 20 |
| Khoảng cách giữa sóng (s) (`wave_interval`) | 0.2 |


### Thông số hiển thị và đồng bộ va chạm

| Thông số | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| `vfx_scale` | 0.4312 | 0.462 | 0.4928 | 0.5236 | 0.5544 |
| `crack_vfx_scale` | 0.728 | 0.8064 | 0.896 | 0.9856 | 1.0976 |
| `wave_vfx_scale` | 0.896 | 0.9856 | 1.0752 | 1.176 | 1.288 |

Thông số cố định cho cả 5 cấp:

| Thông số | Giá trị |
|---|---:|
| `wave_ring_width` | 48 | 48 | 48 | 48 | 48 |
| `wave_collision_padding` | 32 | 32 | 32 | 32 | 32 |
| `wave_tick_count` | 12 |


### Frame/asset qua AtlasRegistry

| Vai trò | Số ID | ID đầu | PNG đã đăng ký (nếu ánh xạ trực tiếp) |
|---|---:|---|---|
| `vfx_frames` | 9 | `hero_5_skill3_sprite_0` | `res://assets/hero/hero_5/hero_5_skill3_sprite.png` |
| `crack_vfx_frames` | 9 | `hero_5_skill3_effect1_0` | `res://assets/hero/hero_5/hero_5_skill3_effect1.png` |
| `wave_vfx_frames` | 9 | `hero_5_skill3_effect2_0` | `res://assets/hero/hero_5/hero_5_skill3_effect2.png` |

<!-- skill-stats-source hero_5_skill_3 58fecc35a19d4ce4aa7e5a0a14af001cb4ad1b1bd56edd1a92c22f4822fb029f -->


C203: toàn bộ scale và phạm vi Skill 3 tăng gấp đôi so với C202; hệ số hiển thị chưởng 2× của C202 tiếp tục áp dụng.


C203 v1.1.0: size hiệu ứng cả ba tầng giảm20% so với bản x2; phạm vi sát thương giữ nguyên.

## Skill 4 — Vạn Trượng Kim Thân

Tầng 1: ảnh kim thân dùng `hero_5_skill4_sprite.png`, cố định tại điểm tung chiêu trong 2s, không loop, không đi theo hero. Xóa debuff có hại khi cast; miễn nhiễm trạng thái có hại và **không chịu sát thương cùng trong 0,5s đầu**. Sau 0,5s không còn giảm 50% sát thương như logic cũ.

Tầng 2: quyền dùng `hero_5_skill4_effect1.png`, xuất từ **vị trí hero hiện tại mỗi lần phát**, cách nhau 0,2s, chọn ngẫu nhiên mục tiêu còn sống trong bán kính 700/730/760/790/820px từ hero. Số quyền 12/14/16/18/20 nên burst dài hơn ảnh kim thân: quyền cuối xuất ở 2,2/2,6/3,0/3,4/3,8s. Sát thương 40/40/50/55/60% ATK; trong cùng cast, hit **thực sự** đầu tiên lên mỗi mục tiêu đủ lực, hit sau còn 50%. Quyền bay hụt không tăng count hay làm giảm quyền tiếp theo.

Tầng 3: size ấn ban đầu giảm **30% (0,7×)** ở mọi cấp theo C202; vẫn tăng5% mỗi hit nối tiếp trên base mới. Khi trúng tạo ấn ở tâm mục tiêu bằng `hero_5_skill4_effect2.png`, đi theo mục tiêu. Count tổng và count liên tiếp riêng từng caster; hai hit cách nhau ≤0,5s mới nối chuỗi. Ba hit liên tiếp trong ≤1s gây một lần choáng 0,5s cho chuỗi; hit thứ tư/thứ năm không tăng thời gian choáng. Mỗi hit nối tiếp sau hit đầu tăng size ấn thêm 5% (hit 2: +5%, hit 3: +10%). Ngắt >0,5s nhưng ≤1s chỉ ngắt chuỗi, còn count tổng; ngắt >1s reset cả hai và ẩn ấn. Pool generation mới không kế thừa count/sát thương giảm của actor cũ. Không còn bonus tăng damage theo ấn hay range theo kích thước map.

### Chỉ số gameplay

| Thông số | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| Sát thương (% ATK) (`damage_pct`) | 40 | 40 | 50 | 55 | 60 |
| Hồi chiêu (s) (`cooldown`) | 14 | 13.1 | 12.2 | 11.3 | 10 |
| Số quyền (`punch_count`) | 12 | 14 | 16 | 18 | 20 |
| Bán kính tìm mục tiêu từ hero (px) (`target_radius`) | 700 | 730 | 760 | 790 | 820 |

Thông số cố định cho cả 5 cấp:

| Thông số | Giá trị |
|---|---:|
| Sát thương hit lặp / hit đầu (%) (`same_target_damage_multiplier`) | 50 |
| Thời gian ảnh kim thân (s) (`golden_duration`) | 2 |
| Tăng size mỗi hit nối tiếp (%) (`stack_size_bonus`) | 5 |
| Thời gian choáng (s) (`stun_duration`) | 0.5 |
| Miễn nhiễm và bất bại đầu chiêu (s) (`protection_duration`) | 0.5 |
| Khoảng cách giữa quyền (s) (`punch_interval`) | 0.2 |
| Khoảng cách tối đa của 2 hit liên tiếp (s) (`mark_pair_window`) | 0.5 |
| Cửa sổ 3 hit gây choáng (s) (`mark_stun_window`) | 1 |
| Ngắt quá thời gian này reset count (s) (`mark_reset_gap`) | 1 |
| Số hit liên tiếp để choáng (`mark_stun_hits`) | 3 |


### Thông số hiển thị và đồng bộ va chạm

| Thông số | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| `vfx_scale` | 0.975 | 1.014 | 1.053 | 1.092 | 1.17 |
| `punch_vfx_scale` | 0.175 | 0.18 | 0.19 | 0.2 | 0.21 |
| `explosion_vfx_scale` | 0.4 | 0.42 | 0.44 | 0.46 | 0.5 |


### Frame/asset qua AtlasRegistry

| Vai trò | Số ID | ID đầu | PNG đã đăng ký (nếu ánh xạ trực tiếp) |
|---|---:|---|---|
| `vfx_frames` | 9 | `hero_5_skill4_sprite_0` | `res://assets/hero/hero_5/hero_5_skill4_sprite.png` |
| `punch_vfx_frames` | 9 | `hero_5_skill4_effect1_0` | `res://assets/hero/hero_5/hero_5_skill4_effect1.png` |
| `explosion_vfx_frames` | 9 | `hero_5_skill4_effect2_0` | `res://assets/hero/hero_5/hero_5_skill4_effect2.png` |

<!-- skill-stats-source hero_5_skill_4 1de3e01711c63a717c5db370115d29e590a49cd37e58110503894bed7e6df3c3 -->

## Chuẩn hóa asset — C199

Mọi animation Hero5 đang dùng được ràng buộc bằng
`hero_skill_vfx_roles` trong manifest AtlasRegistry; frame cũ trong metadata
server không đổi asset của các vai trò này. Riêng nổ Skill1 luôn dùng
`hero_5_skill4_effect1.png`; quyền Skill4 cũng dùng sheet này theo yêu cầu.

Mười sheet `*_sprite`/`*_effect*` có lưới **3×3, 9 ô400×400px**. Một số
PNG nguồn đang cao1134/1212/1224/1266px; registry chuẩn hóa texture hiển thị
về1200×1200 trước cắt ô, giữ nguyên PNG gốc và alpha. Cache một lần/sheet,
chuẩn bị trong loading của tower và dọn cùng scope khi rời trận.
Các file `*_projectile.png` dùng làm icon vẫn là ảnh đầy đủ, không cắt icon
thành chín ô. Chi tiết: [C199](../contracts/C199_HERO5_ASSET_GRID.md).

## Nguồn triển khai

- [SkillManager.gd](../../../client/src/managers/SkillManager.gd)
- [SkillValueService.gd](../../../client/src/services/SkillValueService.gd)
- [Projectile.gd](../../../client/src/combat/Projectile.gd)
- [BuddhaMark.gd](../../../client/src/combat/BuddhaMark.gd)

## Changelog

| Version | Ngày | Thay đổi |
|---|---|---|
| 1.0.5 | 2026-10-24 | C203: Skill 3 tăng gấp đôi scale và phạm vi hiện tại. |
| 1.0.4 | 2026-10-24 | Chưởng tầng1 tăng100%, ấn ký ban đầu giảm30% theo C202. |
| 1.0.3 | 2026-10-24 | Bù scale hiển thị tia Skill1 sau chuẩn hóa400px. |
| 1.0.2 | 2026-10-24 | Ràng buộc đúng PNG nổ Skill1 và chuẩn hóa animation3×3/400px qua AtlasRegistry. |
| 1.0.1 | 2026-10-24 | Chốt đủ năm mốc % HP mỗi đợt cổ ngữ. |
| 1.0.0 | 2026-10-24 | Tổng hợp đầy đủ config và hành vi sau các thay đổi trong phiên; tách thông số hiện tại khỏi thiết kế lịch sử. |

C199 v1.1.0: chưởng tầng 2 Skill 4 dùng hero_5_skill4_effect1.png, chạy 9 frame một lần rồi giữ frame cuối khi bay.
