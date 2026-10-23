# Quản lý mở chức năng và mail progression

C176 — cấu hình ở System Config; module thực thi `nakama/data/modules/feature_unlocks.ts`.
Client API tour: `../client/docs/FEATURE_TOURS.md`.

## Mốc hiện tại

| ID | Level | Trạng thái |
|---|---:|---|
| checkin | 2 | Đã tích hợp; vẫn phụ thuộc chiến dịch điểm danh hoạt động |
| daily_quests | 3 | Planned: chưa có screen nhiệm vụ hàng ngày |
| shop | 5 | Huyền Thiên Các |
| leaderboard | 9 | Bảng xếp hạng và phần thưởng tuần |
| stage_epic | 10 | Thêm điều kiện cấp, giữ nguyên điều kiện tiến độ từng stage |
| sweep | 15 | Càn quét chiến dịch; càn quét tháp còn cần trial_tower |
| elements | 20 | Linh căn |
| stage_legend | 22 | Thêm điều kiện cấp, giữ nguyên điều kiện tiến độ từng stage |
| talisman | 25 | Pháp bảo: chế tạo/trang bị/nâng cấp |
| trial_tower | 30 | Thí luyện |
| laws | 35 | Planned: chưa có screen Pháp tắc |
| guild_war | Chưa đặt | Planned: Tông môn chi chiến |
| ancient_battlefield | Chưa đặt | Planned: Chiến trường thượng cổ |
| multiverse | Chưa đặt | Planned: Vạn giới chư thiên |

Mốc được hiểu theo số cuối người dùng sửa: Càn quét 15, Linh căn 20.
Planned có enabled=false; không gửi mail hoặc tour nói chức năng đã mở.

## Cấu hình và phát hành

Nguồn seed: `data/feature_unlocks.json` và `data/realm_milestones.json`.
Draft/published runtime: `system.feature_unlocks`, `system.realm_milestones`.
Default bootstrap trong mã được kiểm tra bằng test phải khớp seed JSON.

```json
{
  "schema_version": 1,
  "features": {
    "checkin": {
      "required_user_level": 2,
      "enabled": true,
      "release_status": "released",
      "display_name": "Điểm danh hàng ngày",
      "description": "Nhận quà điểm danh khi sự kiện hoạt động.",
      "tour_id": "checkin_v1",
      "tour_mode": "dismiss_any",
      "mail_title": "Đã khai mở: Điểm danh hàng ngày",
      "mail_body": "Chúc mừng đạo hữu đạt cấp {level}!"
    }
  }
}
```

Đây là ví dụ một entry; snapshot thực tế phải có đủ các feature ID đã đăng ký.
Validator chặn thiếu entry, level sai kiểu/ngoài 1–50, bật planned, trùng tour ID,
mode không hợp lệ, nội dung mail sai và thiếu bất kỳ mail mốc 10/20/30/40/50.
Feature planned chưa có mốc dùng required_user_level=null.

Tạo file settings để review, không kết nối server:

```powershell
node nakama/build_feature_unlock_settings.cjs feature-settings.json
```

File xuất là mảng remote-settings, tương thích công cụ seed hiện tại:

```powershell
python nakama/seed_all.py --settings-only --settings feature-settings.json
```

Seed chỉ sửa draft. Dùng quy trình publish có xác thực hiện có sau khi kiểm tra
toàn bộ draft, gồm stage_sweep, tower_sweep, rewarded_ads và các setting liên quan.
Không ghi đè snapshot active bằng script SQL hoặc tự thay cấu hình production.
Build/restart runtime trước, seed/publish config đầy đủ, kiểm tra active config,
rồi phát hành client. Nên đặt min_app_version phù hợp với bản client hỗ trợ C176.
Client mới chặn bootstrap khi active config thiếu hai key này.
Code ở workspace chưa được deploy và chưa gửi mail production.

Chỉnh level qua System Config không cần hardcode lại client. Thay display text,
level hay config version không gửi lại mail. tour_id mới có thể tạo một tour mới
cho cùng quyền; chỉ đổi khi thực sự muốn giới thiệu lại.
Thêm feature ID hoàn toàn mới cần đăng ký vào FEATURE_IDS, validator client,
guard RPC, entry UI và mapping target, không thể tự khai báo scene tùy ý từ server.

## Quyền và lưu trữ

Profile nhân vật:

```json
{
  "feature_unlocks": {
    "schema_version": 1,
    "unlocked": {"checkin": 1792700000000},
    "completed_tours": ["checkin_v1"]
  }
}
```

Scope sử dụng characterRuntime hiện tại: account/server/generation; legacy account
vẫn được hỗ trợ. Các trường này chỉ server ghi, không nhận từ generic profile save.
Đủ level có thể truy cập; lần reconcile kế tiếp ghi quyền đã mở. Quyền đã ghi nhận
được giữ khi tăng ngưỡng cấu hình; enabled=false vẫn tạm chặn quyền sử dụng.
Không sửa/xóa vật phẩm hay tháo trang bị đã có khi áp dụng giới hạn mới.

Feature runtime bổ sung reconcile vào transaction ghi player_profiles/main,
bao gồm kết quả chiến dịch, đột phá, mail EXP và worker càn quét. Profile load
đồng bộ lại để bắt các thay đổi cấu hình hoặc sự kiện bỏ lỡ. Sweep reservation,
mail arc và feature mail vẫn giữ cùng transaction Storage với version CAS.

Lỗi cấu hình: FEATURE_CONFIG_INVALID; chưa cấp: FEATURE_LOCKED kèm feature_id,
required_user_level/current_user_level; chưa phát hành: FEATURE_UNAVAILABLE.
Không có local gameplay fallback.

Guard nằm sau admission account/server, trước handler RPC: điểm danh/status/claim,
store_purchase, purchase_hero, talisman buy_material/buy_fragment (shop), các action
pháp bảo khác (talisman, trừ reroll_talent), upgrade_element, leaderboard reads/weekly
claims, tạo stage Epic/Legend và tạo/preview/options càn quét, khởi tạo Thí luyện.
Chế độ tháp cần thêm trial_tower. Kết thúc/cancel hoạt động đã nhận và hiệu ứng
pháp bảo đang trang bị tiếp tục dùng được để không làm kẹt settlement.
Quyền Epic/Legend không tự mở độ khó trên mọi stage.

## Mail và chống gửi trùng

Feature mới: source_id=`feature_unlocked:<feature_id>`.
Đột phá: source_id=`realm_breakthrough:<10|20|30|40|50>`.
category=system, sender_name=Thiên Đạo Truyền Thư, không đính kèm quà, không hết hạn.
Tiêu đề/nội dung lấy từ config; mail mở chức năng thay `{level}` bằng mốc cấu hình.

Profile + mail + ledger được ghi cùng batch; CAS hoặc lỗi lưu hủy toàn bộ.
Chỉ push sau commit. Lỗi socket không làm mất mail đã ghi.
Ledger C147 giữ sau khi xóa/purge mail, nên không tái gửi.
Feature mail và arc_opened có ID riêng; cùng lần tăng cấp có thể có cả hai.

Mail đột phá dựa trên breakthrough.history có level thành công, không dựa riêng
vào level hiện tại. Đầy EXP/bắt đầu độ kiếp/thất bại không tạo thư chúc mừng.
Nội dung mỗi mốc có lời ngỏ riêng; Lv50 chỉ gợi mở Vạn giới, không hứa map đã phát hành.

## Tour ACK và client

Mọi response version-gated có profile đã khởi tạo đều có thể mang feature_unlocks
ở top level. NakamaClient cập nhật bản in-memory sau hàng rào account/context hiện có.
`complete_feature_tour {tour_id}` xác thực quyền, lưu completed_tours bằng CAS,
trả `{success, feature_unlocks}`; retry idempotent và không cấp quà.
Client giữ ACK thất bại trong hàng đợi phiên hiện tại và retry; nếu app đóng trước
ACK thành công, tour vẫn pending và sẽ chạy lại ở Home.

Client dùng FeatureUnlockService cho nhãn “Mở ở Lv.X”, chặn navigation/direct scene,
phân biệt khóa điểm danh hợp lệ với lỗi bootstrap, và xếp pending theo level.
Home không tự grant, không lưu trạng thái gameplay xuống user://.

## Migration

User cũ không có feature_unlocks: mở đủ tính năng đã phát hành theo level và gửi
mỗi mail một lần; các tour đã đủ điều kiện được baseline hoàn thành để tránh dồn
hướng dẫn cũ. User mới có schema từ lần tạo profile nên unlock sau đó có pending tour.
Khi bật chức năng planned sau này, user cũ đủ cấp cũng nhận mail và pending tour.
Mail đột phá cũ chỉ backfill mốc có bằng chứng trong history.

## Kiểm thử và giới hạn

`npm run build` trong nakama; `tests/run_static_tests.ps1` ở cả hai repo.
Server runner gồm test_feature_unlocks.cjs, toàn bộ JS regressions và 44 Python tests.
C176 kiểm tra seed/default parity, schema, mọi ngưỡng, tăng nhiều level, quyền cũ,
rollback/CAS, mail idempotent sau xóa, năm mốc đột phá, planned bật sau, ACK và scope.
Client có TestFeatureTour/TestFeatureUnlocks; xem docs client để chạy fixture ngoại vi.

Đã xác nhận bằng fake Storage có CAS/atomic fault injection và Godot 4.6.3
headless/OpenGL desktop. Docker daemon chưa chạy trong phiên triển khai này;
chưa xác nhận Nakama/PostgreSQL thật, production hoặc thiết bị di động.

## Local readiness follow-up

Local config v4 is now seeded/published; native Nakama/PostgreSQL smoke passed.
See [local readiness report](reports/C176_LOCAL_READINESS.md). The earlier Docker
limitation describes the initial implementation session; mobile checks remain pending.
