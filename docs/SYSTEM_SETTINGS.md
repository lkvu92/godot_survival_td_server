# System Settings: quảng cáo nhận thưởng và thể lực

Phần thưởng xếp hạng tuần được cấu hình ở `system.leaderboard_rewards`: xem [hướng dẫn thưởng tuần](WEEKLY_LEADERBOARD_REWARDS.md) để chỉnh ba hạng mục, 13 nhóm hạng, hạn nhận và lịch chốt.

Cập nhật: 2026-10-18. Tham chiếu [C134](contracts/C134_RESULT_AD_SYSTEM_CONFIG.md) và [hướng dẫn seed/publish](SEEDING.md).

## Chỉ mục đầy đủ System Config

Backend seed các key dưới `remote_config_releases.snapshot.system` sau đây. Bảng này là mục lục vận hành; các cấu trúc lớn có tài liệu chi tiết riêng.

| Key | Kiểu | Default | Runtime / tài liệu chi tiết |
|---|---|---|---|
| `campaign_wave_pressure` | json | `{version:1, opening_wave_count:4, opening_count_multiplier:0.85, growth_interval:4, hp_growth:0.05, def_growth:0.05, skill_recovery_growth:0.05}` | Áp lực wave campaign; [C218](contracts/C218_CAMPAIGN_WAVE_PRESSURE.md). |
| `feature_unlocks` | json | `FEATURE_DEFAULTS` | Mốc mở tính năng; [FEATURE_UNLOCKS](FEATURE_UNLOCKS.md). |
| `realm_milestones` | json | `REALM_MILESTONE_DEFAULTS` | Mốc cảnh giới/tour; [FEATURE_UNLOCKS](FEATURE_UNLOCKS.md). |
| `stage_sweep` | json | `SWEEP_DEFAULTS` | Càn quét campaign; [STAGE_SWEEP](STAGE_SWEEP.md). |
| `tower_sweep` | json | `TOWER_SWEEP_DEFAULTS` | Càn quét Tháp Thí Luyện; [C167](contracts/C167_TOWER_SWEEP.md). |
| `min_app_version` | string | `"1.0.0"` | Ép cập nhật bắt buộc khi app thấp hơn giá trị này. |
| `latest_app_version` | string | `"1.0.0"` | Thông báo cập nhật mềm khi app thấp hơn giá trị này nhưng vẫn đạt `min_app_version`. |
| `supported_languages` | json array | `["vi","en"]` | Danh sách locale client được server publish. |
| `default_language` | string | `"vi"` | Locale mặc định khi client chưa có lựa chọn hợp lệ. |
| `stamina_regen_interval_sec` | int | `300` | Chu kỳ hồi thể lực; xem mục Cấu hình thể lực bên dưới. |
| `stamina_regen_amount` | int | `1` | Lượng hồi thể lực mỗi tick. |
| `stamina_max` | int | `30` | Mức đầy của hồi tự nhiên/refill level-up. |
| `stamina_storage_max` | int | `200` | Trần thể lực tích trữ. |
| `stamina_ad_reward` | int | `15` | Thưởng thể lực quảng cáo. |
| `stamina_purchase_amount` | int | `15` | Thưởng thể lực mỗi lần mua bằng Ngọc. |
| `stamina_purchase_prices` | json array | `[30,40,50,60,70]` | Giá mua theo thứ tự trong ngày; độ dài mảng là quota. |
| `ads_enabled` | bool | `false` | Cờ bật/tắt quảng cáo toàn cục; fail-closed. |
| `ads_interval_sec` | int | `120` | Khoảng cách tối thiểu giữa các quảng cáo interstitial, tính bằng giây. |
| `payment_enabled` | bool | `false` | Cờ bật/tắt tạo/xác nhận luồng thanh toán; fail-closed. |
| `leaderboard_rewards` | json | schema v1, enabled | Thưởng leaderboard tuần; [WEEKLY_LEADERBOARD_REWARDS](WEEKLY_LEADERBOARD_REWARDS.md). |
| `rewarded_ads` | json | schema v2 | Placement reward ads/quota; xem mục Giá trị mặc định quảng cáo. |

`min_app_version` và `latest_app_version` phải có định dạng `major.minor.patch`, đồng thời `min_app_version` không được lớn hơn `latest_app_version`. Khi thêm hay sửa bất kỳ key nào, stage toàn bộ draft hợp lệ rồi publish release mới; server chỉ đọc snapshot đã publish.

## Nơi chỉnh cấu hình

Trong bảng `remote_config_settings`, dùng một dòng có `module=system`, `key=rewarded_ads`, `value_type=json`, `is_active=true`. Cột `value` chứa toàn bộ JSON bên dưới. Đây là bản nháp; game đọc bản đã publish trong `remote_config_releases.snapshot.system.rewarded_ads`.

`server/data/rewarded_ads.json` là mẫu mặc định có version. Chỉnh file này hoặc dòng legacy `game_content_configs/rewarded_ads` không tự thay đổi cấu hình đang chạy. Khi sửa một placement, giữ đầy đủ các placement còn lại vì giá trị JSON được thay toàn bộ.

## Cấu hình thể lực

Các key dưới đây là các dòng riêng trong `remote_config_settings` với `module=system` và là nguồn sự thật cho server lẫn client sau khi release được publish:

| Key | Kiểu | Mặc định | Ý nghĩa |
|---|---|---:|---|
| `stamina_max` | int | 30 | Mức thể lực đầy cho hồi tự nhiên và refill khi lên cấp. |
| `stamina_storage_max` | int | 200 | Trần thể lực có thể lưu từ mọi nguồn cộng. Phải lớn hơn hoặc bằng `stamina_max`. |
| `stamina_ad_reward` | int | 15 | Thể lực nhận từ placement `stamina_dialog_ad`. |
| `stamina_purchase_amount` | int | 15 | Thể lực nhận cho mỗi lần mua bằng Ngọc. |
| `stamina_purchase_prices` | json array | `[30,40,50,60,70]` | Giá Ngọc từng lần mua trong ngày; độ dài mảng là quota mua/ngày. |
| `stamina_regen_amount` | int | 1 | Lượng hồi tự nhiên mỗi tick. |
| `stamina_regen_interval_sec` | int | 300 | Chu kỳ hồi tự nhiên tính bằng giây. |

Quy tắc runtime:

- Hồi tự nhiên chỉ tăng đến `stamina_max`; stamina đang trữ cao hơn mức này không bị giảm.
- Mọi nguồn cộng stamina (mua Ngọc, quảng cáo, vật phẩm, check-in, event, IAP/daily pack) bị clamp tại `stamina_storage_max`.
- Cấu hình chuẩn hiện tại là **200** cho trần tích trữ: đang có 195 và nhận thêm 10 thì thành 200; đang có 200 thì không tích lũy thêm. Áp dụng cả snapshot gói mua cũ; lượng thưởng gốc không đổi. Mức hồi tự nhiên vẫn là **30**.
- Khi user lên ít nhất một cấp, stamina được nâng lên tối thiểu `stamina_max`; số đang trữ cao hơn vẫn được giữ nguyên.
- Không publish nếu giá trị không phải số nguyên hợp lệ, storage thấp hơn max, giá/quota mua rỗng, hoặc giá mua không dương.

Ví dụ staging 5 key kinh tế stamina:

```json
[
  {"module":"system","key":"stamina_max","value_type":"int","value":"30"},
  {"module":"system","key":"stamina_storage_max","value_type":"int","value":"200"},
  {"module":"system","key":"stamina_ad_reward","value_type":"int","value":"15"},
  {"module":"system","key":"stamina_purchase_amount","value_type":"int","value":"15"},
  {"module":"system","key":"stamina_purchase_prices","value_type":"json","value":"[30,40,50,60,70]"}
]
```

## Giá trị mặc định quảng cáo

| Placement | Chức năng | `amount` | Giới hạn |
|---|---|---:|---|
| `stage_reward_x2_ad` | Nhân thưởng khi thắng | 2 (hệ số x2) | `daily_limit: 5` |
| `stamina_dialog_ad` | Nhận thể lực | +15/lượt (`system.stamina_ad_reward`) | `daily_limit: 3` |
| `daily_mission_talisman_fragment_ad` | Nhiệm vụ quảng cáo nhận mảnh pháp bảo | 1 mảnh khi hoàn tất nhiệm vụ | `daily_limit: 3` |
| `talisman_enhance_charm_ad` | Bùa cường hóa | 1 bùa/lượt | `daily_limit: 1` |
| `element_enlightenment_charm_ad` | Bùa ngộ đạo | 1 bùa/lượt | `daily_limit: 1` |
| `card_reroll_ad` | Đổi lựa chọn thẻ | 1 lần/lượt | `run_limit: 3` |
| `combat_revive_ad` | Hồi sinh bằng ads | 1 lần/lượt | `run_limit: 1` |

```json
{
  "schema_version": 2,
  "placements": {
    "stamina_dialog_ad": {"type": "stamina", "amount": 15, "daily_limit": 3},
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
- `amount` là số nguyên dương. Riêng `stamina_dialog_ad` dùng `system.stamina_ad_reward` khi cấp thưởng; trường `amount` giữ đồng bộ để tương thích snapshot/UI cũ. `stage_reward_x2_ad` là hệ số tổng thưởng, từ 2 đến 10; reroll và hồi sinh bắt buộc bằng 1.
- `daily_limit` là số lượt mỗi tài khoản, mỗi placement, mỗi ngày UTC; nhận lại lượt lúc 00:00 UTC (07:00 Việt Nam). Giá trị từ 0 đến 1000; 0 chặn nhận mới.
- `run_limit` là số lượt trong một trận, từ 0 đến 100; 0 chặn nhận mới. Đây không phải giới hạn theo ngày.
- Có thể thêm `enabled: false` vào placement để tắt. Bỏ trường này tương đương bật, nhưng vẫn chịu cờ quảng cáo chung và điều kiện nhận thưởng.
- `item_id` bắt buộc với `type: item`, phải trỏ đến vật phẩm hợp lệ trong catalog.
- `daily_mission.completion_count` là số lượt cần xem để hoàn tất nhiệm vụ mảnh, phải là số nguyên dương và không vượt `daily_limit` khi giới hạn lớn hơn 0. `fragment_quality: low` chọn mảnh Hạ phẩm. Nhiệm vụ chỉ thưởng một lần/ngày; tăng giới hạn không tạo thêm một vòng nhiệm vụ.
- Alias `main_menu_stamina` dùng chung cấu hình và quota với `stamina_dialog_ad`.

Ví dụ: muốn nhận 10 thể lực/lượt, tối đa 4 lượt/ngày, đổi `system.stamina_ad_reward` thành 10 và `stamina_dialog_ad.daily_limit` thành 4. Muốn x2 thưởng tối đa 8 lượt/ngày, chỉ đổi `stage_reward_x2_ad.daily_limit` thành 8.

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
