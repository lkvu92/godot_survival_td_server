# System Settings: cấu hình quảng cáo nhận thưởng

Phần thưởng xếp hạng tuần được cấu hình ở `system.leaderboard_rewards`: xem [hướng dẫn thưởng tuần](WEEKLY_LEADERBOARD_REWARDS.md) để chỉnh ba hạng mục, 13 nhóm hạng, hạn nhận và lịch chốt.

Cập nhật: 2026-10-18. Tham chiếu [C134](contracts/C134_RESULT_AD_SYSTEM_CONFIG.md) và [hướng dẫn seed/publish](SEEDING.md).

## Nơi chỉnh cấu hình

Trong bảng `remote_config_settings`, dùng một dòng có `module=system`, `key=rewarded_ads`, `value_type=json`, `is_active=true`. Cột `value` chứa toàn bộ JSON bên dưới. Đây là bản nháp; game đọc bản đã publish trong `remote_config_releases.snapshot.system.rewarded_ads`.

`server/data/rewarded_ads.json` là mẫu mặc định có version. Chỉnh file này hoặc dòng legacy `game_content_configs/rewarded_ads` không tự thay đổi cấu hình đang chạy. Khi sửa một placement, giữ đầy đủ các placement còn lại vì giá trị JSON được thay toàn bộ.

## Giá trị mặc định

| Placement | Chức năng | `amount` | Giới hạn |
|---|---|---:|---|
| `stage_reward_x2_ad` | Nhân thưởng khi thắng | 2 (hệ số x2) | `daily_limit: 5` |
| `stamina_dialog_ad` | Nhận thể lực | 5 thể lực/lượt | `daily_limit: 3` |
| `daily_mission_talisman_fragment_ad` | Nhiệm vụ quảng cáo nhận mảnh pháp bảo | 1 mảnh khi hoàn tất nhiệm vụ | `daily_limit: 3` |
| `talisman_enhance_charm_ad` | Bùa cường hóa | 1 bùa/lượt | `daily_limit: 1` |
| `element_enlightenment_charm_ad` | Bùa ngộ đạo | 1 bùa/lượt | `daily_limit: 1` |
| `card_reroll_ad` | Đổi lựa chọn thẻ | 1 lần/lượt | `run_limit: 3` |
| `combat_revive_ad` | Hồi sinh bằng ads | 1 lần/lượt | `run_limit: 1` |

```json
{
  "schema_version": 2,
  "placements": {
    "stamina_dialog_ad": {"type": "stamina", "amount": 5, "daily_limit": 3},
    "daily_mission_talisman_fragment_ad": {"type": "daily_fragment", "amount": 1, "daily_limit": 3},
    "card_reroll_ad": {"type": "card_reroll", "amount": 1, "run_limit": 3},
    "combat_revive_ad": {"type": "combat_revive", "amount": 1, "run_limit": 1},
    "stage_reward_x2_ad": {"type": "stage_reward_x2", "amount": 2, "daily_limit": 5},
    "talisman_enhance_charm_ad": {"type": "item", "amount": 1, "item_id": "talisman_enhance_charm", "daily_limit": 1},
    "element_enlightenment_charm_ad": {"type": "item", "amount": 1, "item_id": "element_enlightenment_charm", "daily_limit": 1}
  },
  "daily_mission": {"completion_count": 3, "fragment_quality": "low"}
}
```

## Ý nghĩa và quy tắc

- `schema_version` phải là `2`. Giữ nguyên ID placement và `type` tương ứng.
- `amount` là số nguyên dương. Riêng `stage_reward_x2_ad` là hệ số tổng thưởng, từ 2 đến 10; reroll và hồi sinh bắt buộc bằng 1.
- `daily_limit` là số lượt mỗi tài khoản, mỗi placement, mỗi ngày UTC; nhận lại lượt lúc 00:00 UTC (07:00 Việt Nam). Giá trị từ 0 đến 1000; 0 chặn nhận mới.
- `run_limit` là số lượt trong một trận, từ 0 đến 100; 0 chặn nhận mới. Đây không phải giới hạn theo ngày.
- Có thể thêm `enabled: false` vào placement để tắt. Bỏ trường này tương đương bật, nhưng vẫn chịu cờ quảng cáo chung và điều kiện nhận thưởng.
- `item_id` bắt buộc với `type: item`, phải trỏ đến vật phẩm hợp lệ trong catalog.
- `daily_mission.completion_count` là số lượt cần xem để hoàn tất nhiệm vụ mảnh, phải là số nguyên dương và không vượt `daily_limit` khi giới hạn lớn hơn 0. `fragment_quality: low` chọn mảnh Hạ phẩm. Nhiệm vụ chỉ thưởng một lần/ngày; tăng giới hạn không tạo thêm một vòng nhiệm vụ.
- Alias `main_menu_stamina` dùng chung cấu hình và quota với `stamina_dialog_ad`.

Ví dụ: muốn nhận 10 thể lực/lượt, tối đa 4 lượt/ngày, đổi `stamina_dialog_ad.amount` thành 10 và `daily_limit` thành 4. Muốn x2 thưởng tối đa 8 lượt/ngày, chỉ đổi `stage_reward_x2_ad.daily_limit` thành 8.

Phần x2 áp dụng EXP, Gold và vật phẩm đã được server chốt cho trận thắng đủ điều kiện; không quay lại loot. Chỉ nhận một lần cho trận thắng vừa kết thúc. Thua và Diễn Võ Trường không được nhận. Hủy/xem ads thất bại không cấp thưởng; gửi lại cùng phiên không nhân thưởng thêm. Tài khoản miễn quảng cáo vẫn chịu quota và điều kiện của server.

Thiếu hoặc sai cấu hình sẽ chặn nhận thưởng; không dùng giá trị gameplay dự phòng ở client. Nút, số lượt và lượng thưởng trên UI đọc cùng cấu hình đã publish. `system.ads_enabled` là cờ chung; cấu hình placement không tự bật SDK, SSV hay quyền miễn quảng cáo. Cấu hình AdMob và thông tin bí mật thuộc phần thiết lập môi trường riêng.

## Lưu nháp và publish

1. Triển khai runtime hỗ trợ C134 trước khi sử dụng schema này. Với môi trường cũ, tạo bản vá bằng `node nakama/build_rewarded_system_patch.cjs > temp/rewarded-system.sql` từ thư mục server, kiểm tra rồi áp dụng vào đúng database. Bản vá giữ các giá trị đã tùy chỉnh, thêm trường mặc định còn thiếu và không sửa dữ liệu người chơi. Chạy lại bản vá không phải thao tác reset mặc định.
2. Sửa dòng System Settings hoặc stage bằng CLI bên dưới. Kiểm tra toàn bộ bản nháp đang active trước khi publish: một release chứa tất cả các setting active, không chỉ dòng vừa sửa.
3. Publish bằng tài khoản được cấu hình trong `CONFIG_ADMIN_USER_ID`. Dùng app version được release hiện tại chấp nhận.
4. Reconnect/resume client để tải release mới. Kiểm tra số lượt, lượng thưởng, trường hợp hết lượt và nhận trùng. Chỉnh giới hạn không xóa các lượt đã dùng trong ngày/trận.

Để stage bằng CLI, tạo file settings dạng mảng. Mỗi dòng có `module`, `key`, `value_type`, `value`; với kiểu `json`, `value` là chuỗi JSON đã serialize. Có thể tạo file đúng định dạng từ mẫu, sau đó sửa giá trị theo nhu cầu:

```bash
# Chạy tại thư mục server; không ghi đè file settings đang dùng nếu chưa lưu lại.
node -e 'const fs=require("fs");const cfg=require("./data/rewarded_ads.json");fs.writeFileSync("rewarded-settings.local.json",JSON.stringify([{module:"system",key:"rewarded_ads",value_type:"json",value:JSON.stringify(cfg)}],null,2))'
cd nakama
python3 seed_all.py --settings-only --settings ../rewarded-settings.local.json

# Sau khi kiểm tra draft và thiết lập NAKAMA_CONFIG_ADMIN_TOKEN:
python3 seed_all.py --settings-only --settings ../rewarded-settings.local.json --publish --app-version 1.0.0
```

Các biến kết nối và quyền gọi seed/publish được mô tả trong [SEEDING.md](SEEDING.md). Dùng `--settings-only` cho thay đổi này để không seed lại catalog. Muốn khôi phục giá trị trước đó, stage lại JSON đã lưu rồi publish release mới; không sửa trực tiếp snapshot của release cũ.

## Khi cấu hình chưa có hiệu lực

| Hiện tượng | Kiểm tra |
|---|---|
| Sửa rồi UI vẫn hiện giá trị cũ | Đã publish chưa; client đã tải release mới chưa; có đang sửa dòng legacy không? |
| Publish bị từ chối | Schema 2, kiểu dữ liệu, `amount`, giới hạn, `type`, `item_id`, số lượt hoàn tất nhiệm vụ. |
| Nút x2 không hiện hoặc bị khóa | Kết quả settlement thắng đủ điều kiện, kết nối, quota, đã nhận chưa, cấu hình placement và cờ quảng cáo chung. |
| Miễn quảng cáo vẫn hết lượt | Đây là hành vi đúng: miễn xem quảng cáo không bỏ giới hạn thưởng. |
| Sửa file seed nhưng game không đổi | File chỉ là đầu vào; cần stage System setting và publish release. |
