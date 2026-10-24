# C180 — Hero 1: Cực Địa Băng Giới, các tầng hiển thị

Status: ACTIVE
Version: 1.0.2
Updated: 2026-10-24

Thông số hiện hành: [Hero 1](../heroes/HERO_1.md), [mục lục 5 hero](../HERO_SKILLS_CURRENT.md).
Sau C189, băng giới là **hero_1_skill_3**, không phải slot 4. Tên asset
hero_1_skill4_* được giữ lại để tương thích artwork, không quyết định slot skill.

## Dữ liệu và cơ chế

Đây là skill hỗ trợ, `damage_pct=0`, không gây sát thương trực tiếp.
Mở theo hero Lv20, chọn trong trận từ Lv10.

| Thông số | Lv1 | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---:|---:|---:|---:|---:|
| Hồi chiêu (s) | 15 | 14.5 | 14 | 13.5 | 13 |
| Tồn tại (s) | 6 | 7 | 8 | 9 | 10 |
| Bán kính (px) | 240 | 250 | 260 | 270 | 280 |
| Giảm tốc đánh quái (%) | 20 | 22.5 | 25 | 27.5 | 30 |
| Giảm giáp quái (%) | 15 | 17.5 | 20 | 22.5 | 25 |

Range chọn mục tiêu 768px; chậm di chuyển 10% ở biên tới 50% tại tâm;
lúc tạo vùng có 50% cơ hội choáng mục tiêu 0,1s. Tạo vùng mới dọn vùng,
visual và modifier cũ **cùng caster**, không ảnh hưởng caster khác.
Vùng được quét ở 10Hz; modifier rời vùng/được dọn phải được thu hồi.

## Các tầng hiển thị qua AtlasRegistry

| Tầng | Asset | Hành vi |
|---|---|---|
| 1 | hero_1_skill4_1.png | Beam 3×3, 9 frame; giáng một lần từ phía trên. |
| 2 | hero_1_skill4_2.png | Băng vệt 3×3, 9 frame; phát một lần, giữ trạng thái rồi fade. |
| 3 | hero_1_skill4_3.png | Băng ấn 3×3, 9 frame; loop ở tâm vùng. |
| 4 | hero_1_skill4_4.png | Tile seamless 128×128, source scale0.5; chỉ shader lặp và mask tròn theo bán kính. |

Ba sheet lớn dùng ô400×400. Không để TextureRect tự tile thêm ngoài shader.
Không có RPC mới; snapshot cấu hình server là bắt buộc theo C121,
không có fallback gameplay JSON phía client. UiSkin/signals không đổi.

## Changelog

| Version | Ngày | Thay đổi |
|---|---|---|
| 1.0.2 | 2026-10-24 | Đồng bộ mô tả hiện hành, slot3 và bảng theo cấp; liên kết trang Hero1. |
| 1.0.1 | 2026-10-24 | Đường cong hỗ trợ theo cấp, không damage, thay vùng theo owner. |
| 1.0.0 | 2026-10-23 | Phiên bản lịch sử có field10s/CD15s và slot4 trước C189. |
