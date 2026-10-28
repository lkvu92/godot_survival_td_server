# Skill hero — thông số source hiện tại

Version: 1.1.0
Cập nhật: 2026-10-29

Đây là điểm vào tài liệu kỹ năng hiện hành của **cả 5 hero**. Các bảng được
đối chiếu từ server/data/skills.json và hành vi client, thay thế thông số cũ
trong snapshot 2026-10-13 hoặc bảng thiết kế lịch sử nếu có mâu thuẫn.
Tài liệu không phải gameplay config và không chứng minh bản local/VPS đã publish.

| Hero | Tài liệu | Các thay đổi hiện hành |
|---|---|---|
| 1 — Băng Tuyết Thánh Nữ | [Hero 1](heroes/HERO_1.md) | Slot 3 băng giới hỗ trợ; slot 4 cường hóa Skill 1; tia băng phụ 40%, đóng băng 30%/0,2s, nổ phụ 25%. |
| 2 — Liệt Diễm Tiễn Tôn | [Hero 2](heroes/HERO_2.md) | Bước góc 10°; Chu Tước radius 100–160px, cast range 700px khác tầm bay 1024px. |
| 3 — Vô Cực Kiếm Tôn | [Hero 3](heroes/HERO_3.md) | Kiếm Phiến 320px/s cố định; chuỗi kiếm mới cách 0,1s; Thất Tinh Trận thêm tốc độ di chuyển. |
| 4 — U Ảnh Độc Tôn | [Hero 4](heroes/HERO_4.md) | Mốc damage/độc mới, giới hạn bẫy theo hero; xoáy 2,5s/5 nhịp, độc kim cộng ATK và cap 5.000 DPS. |
| 5 — Vạn Tượng Quán Âm | [Hero 5](heroes/HERO_5.md) | Tia/nổ riêng, cổ ngữ trễ, chưởng/đất nứt/sóng lan; kim thân đứng yên, bảo vệ 0,5s, ấn ký tính từ hit thật. |

[Chỉ số hero và mô phỏng Lv1/50/70 — cân bằng vòng 2](HERO_STATS_CURRENT.md).

## Cách đọc và quyền dữ liệu

- Lv1–Lv5 trong bảng là cấp skill; level hero mở skill khác level trong trận để chọn thẻ.
- Level hero mở skill của cả 5 hero là 1/10/20/30. Level trong trận là 1/5/10/15,
  **riêng Hero 4 Skill 4 hiện còn Lv10 theo config**; tài liệu không tự sửa gate.
- Damage % ATK, damage % HP, bonus chí mạng dạng cộng vào hệ số và độc DPS
  là các đại lượng khác nhau. Các số là cơ sở trước buff, DEF/crit và giảm hồi chiêu.
- `speed_pct` thường phụ thuộc tốc độ hero; Hero 3 Skill 1 dùng `projectile_speed=320px/s`.
- `cast_range` là tầm chọn mục tiêu để xuất skill; `range`/`needle_range` có thể là tầm bay.
- Dữ liệu balance thuộc Nakama DB; seed JSON ở server là đầu vào phiên bản hóa.
  Client chỉ có manifest hiển thị. C121 yêu cầu auth/config snapshot đầy đủ,
  không có local gameplay/reward/profile fallback.

## Hero 5 Skill 2 — đã chốt đủ năm cấp

Mỗi đợt cổ ngữ gây **25/30/35/40/45% ATK +0,2/0,3/0,6/0,8/1% HP tối đa**
của mục tiêu. Có ba đợt tại1,5/2/2,5s; đây là hệ số mỗi đợt, không phải tổng.
Config lưu `rune_hp_percent=0.002/0.003/0.006/0.008/0.01`.
Không còn mốc % HP chờ chốt. Việc seed/publish server là thao tác riêng.

## Timeline dễ nhầm

| Skill | Timeline hiện tại |
|---|---|
| Hero 4 Skill 4 | Xoáy 0–2,5s; damage tại 0/0,5/1/1,5/2s; kim từ 0,5s, cách 0,1s. |
| Hero 5 Skill 2 | Trận 0–2s; cổ ngữ 1–2,5s; damage cổ ngữ tại 1,5/2/2,5s. |
| Hero 5 Skill 3 | Impact 0,35s; crack tới 1,35s; sóng bắt đầu từ impact, cách 0,2s và lan theo vành khuyên. |
| Hero 5 Skill 4 | Ảnh kim thân 0–2s cố định; bảo vệ 0–0,5s; quyền xuất mỗi 0,2s, quyền cuối ở 2,2–3,8s tùy cấp. |

## Contract triển khai liên quan

- [C162 — các đường cong damage và override](contracts/C162_HERO_SKILL_DAMAGE_CURVES.md).
- [C180 — băng giới Hero 1](contracts/C180_HERO_1_ICE_DOMAIN_LAYERS.md).
- [C189 — thứ tự skill/gate và nội tại Hero 1](contracts/C189_HERO_1_SKILL_ORDER.md).
- [C187 — góc Hero 2](contracts/C187_HERO_2_SKILL1_SPREAD.md), [C188 — Chu Tước](contracts/C188_HERO_2_PHOENIX_RANGE.md).
- [C195 — Hero 3](contracts/C195_HERO3_SKILL_REBALANCE.md).
- [C196 — Hero 4](contracts/C196_HERO4_SKILL_REBALANCE.md).
- [C197 — Hero 5 và mục chưa chốt](contracts/C197_HERO5_SKILL_REBALANCE.md).
- [C198 — hợp nhất tài liệu hiện hành](contracts/C198_HERO_SKILL_DOCS_CURRENT.md).

Hero5: [C199 — asset3×3/400px](contracts/C199_HERO5_ASSET_GRID.md) chuẩn hóa texture animation và ràng buộc đúng PNG nổ Skill1; icon giữ ảnh đầy đủ.

## Changelog

| Version | Ngày | Thay đổi |
|---|---|---|
| 1.0.2 | 2026-10-24 | Đồng bộ chuẩn grid và asset nổ Hero5. |
| 1.0.1 | 2026-10-24 | Hoàn tất phần % HP tầng cổ ngữ Hero5. |
| 1.0.0 | 2026-10-24 | Hợp nhất thông số, cơ chế, asset và các mục chờ chốt của 5 hero theo source hiện tại. |
