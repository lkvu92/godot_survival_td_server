# Thưởng xếp hạng tuần

Triển khai theo [C135](contracts/C135_WEEKLY_LEADERBOARD_REWARDS.md). Cấu hình trong `system.leaderboard_rewards`, kiểu `json`, qua bảng `remote_config_settings`; game chỉ dùng release đã publish. File mặc định: [leaderboard_rewards.json](../data/leaderboard_rewards.json).

## Quy tắc

- Ba hạng mục độc lập: Tu vi (`cultivation_realm`), Lịch duyệt (`campaign_stage`), Chiến lực (`combat_power`). Môn phái chưa tham gia.
- Tuần bắt đầu thứ Hai 00:00 UTC, tương đương 07:00 Việt Nam; thời điểm kết thúc thuộc tuần mới.
- Xếp theo điểm thành tích hiện có được server ghi nhận trong tuần. Không trừ hay reset cấp độ, chiến dịch hoặc lực chiến của nhân vật. Các bảng tích lũy hiện tại vẫn giữ riêng; dialog thưởng hiển thị hạng tuần.
- Cần đăng nhập/tải hồ sơ hoặc có cập nhật gameplay hợp lệ trong tuần. Backfill khi server khởi động không tự đưa tài khoản không hoạt động vào kỳ thưởng.
- Hòa điểm: thời điểm server ghi nhận mức điểm đó trong tuần sớm hơn đứng trước; nếu vẫn trùng, dùng ID tài khoản. Tải lại cùng điểm không đổi thời điểm này.
- Thưởng cộng dồn cả ba bảng. Không có EXP hoặc tăng chỉ số vĩnh viễn trực tiếp.
- Kết quả và phần thưởng được chốt cố định. Mảnh pháp bảo được chọn một loại khi chốt, toàn bộ số mảnh cùng loại; nhận lại yêu cầu không quay lại vật phẩm.
- Nhận trong 30 ngày từ giờ chốt theo mặc định. Thời gian bảo trì không kéo dài hạn. Tài khoản offline giữ quyền nhận; nhận trong dialog **Thưởng tuần** của từng tab.
- Sau liên kết tài khoản, giữ quyền thưởng của hồ sơ được chọn. Quyền chưa nhận của hồ sơ bị lưu trữ không chuyển sang; tài khoản đó bị chặn nhận tiếp. Thưởng đã nhận nằm trong tài nguyên của hồ sơ theo quy tắc chọn tiến trình hiện có.

## Bảng mặc định

Gem và Vàng áp dụng cho **mỗi bảng**. Vật phẩm chỉ thuộc hạng mục tương ứng.

| Hạng | Gem | Vàng | Tu vi: Bùa ngộ đạo | Lịch duyệt: Mảnh pháp bảo Hạ phẩm | Chiến lực: Bùa cường hóa |
|---|---:|---:|---:|---:|---:|
| 1 | 300 | 100.000 | 3 | 15 | 3 |
| 2 | 250 | 90.000 | 3 | 12 | 3 |
| 3 | 220 | 80.000 | 2 | 10 | 2 |
| 4 | 200 | 75.000 | 2 | 9 | 2 |
| 5 | 180 | 70.000 | 2 | 8 | 2 |
| 6 | 160 | 65.000 | 2 | 7 | 2 |
| 7 | 140 | 60.000 | 1 | 6 | 1 |
| 8 | 120 | 55.000 | 1 | 5 | 1 |
| 9 | 110 | 50.000 | 1 | 4 | 1 |
| 10 | 100 | 45.000 | 1 | 3 | 1 |
| 11–50 | 80 | 35.000 | 1 | 3 | 1 |
| 51–200 | 50 | 25.000 | 1 | 2 | 1 |
| 201–500 | 30 | 15.000 | 0 | 1 | 0 |

Top 1 cả ba bảng: 900 Gem, 300.000 Vàng, 3 Bùa ngộ đạo, 3 Bùa cường hóa, 15 mảnh Hạ phẩm cùng loại. Ngoài top 500 không có thưởng.

## Các trường Settings

| Trường | Ý nghĩa |
|---|---|
| `schema_version` | Bắt buộc bằng 1 |
| `enabled` | Boolean, mở/tắt tạo kỳ mới |
| `claim_days` | Hạn nhận kể từ cuối kỳ, số nguyên 1–90; mặc định 30 |
| `boards.<board_id>.enabled` | Mở/tắt hạng mục của kỳ mới |
| `boards.<board_id>.tiers` | Đủ 13 khoảng hạng liên tiếp, không trùng/khuyết: 1…10 riêng, 11–50, 51–200, 201–500 |
| `tiers[].from`, `to` | Hạng đầu/cuối, bao gồm cả hai đầu |
| `tiers[].rewards` | Danh sách 1–8 phần thưởng của khoảng hạng |
| `rewards[].type: resource` | `id` là `gems` hoặc `gold`; `amount` nguyên dương, tối đa 10.000.000 |
| `rewards[].type: item` | `id` tồn tại trong catalog; `amount` nguyên dương, tối đa 1.000 |
| `rewards[].type: random_item` | `pool` chứa 1–128 ID catalog hợp lệ; chọn một ID cho toàn bộ `amount`, tối đa 1.000 |

Giữ đủ ba board và toàn bộ JSON khi lưu: một dòng setting được thay toàn bộ. Mặc định pool Lịch duyệt có 15 loại mảnh Hạ phẩm. Không tự thay `type`, ID bùa hoặc pool nếu chỉ muốn chỉnh số lượng.

Cấu hình và `config_version` được khóa khi tạo kỳ. Sửa rồi publish giữa tuần áp dụng cho kỳ tiếp theo, bao gồm tắt thưởng và đổi hạn nhận. Phần thưởng đã chốt không thay đổi khi cấu hình mới được publish. Thiếu hoặc sai cấu hình không tạo kỳ mới và không ghi điểm mới; server vẫn có thể hoàn tất kỳ cũ và cho nhận các thưởng đã chốt. Không có gameplay fallback tại client.

## Triển khai và vận hành

1. Build/deploy runtime hỗ trợ C135. Khởi động tạo thêm bảng và hàm SQL, không reset người chơi hay leaderboard hiện có.
2. Tạo file draft UTF-8 từ thư mục server:

   ```bash
   node nakama/build_weekly_leaderboard_settings.cjs temp/weekly-settings.json
   ```

   Sửa trường `value` của dòng `system.leaderboard_rewards` hoặc chỉnh trong System Settings. File sinh từ mẫu mặc định; cần giữ bản cấu hình đã tùy chỉnh trước khi thay thế.
3. Theo [SEEDING.md](SEEDING.md), stage rồi publish bằng admin:

   ```bash
   cd nakama
   python3 seed_all.py --settings-only --settings ../temp/weekly-settings.json
   python3 seed_all.py --settings-only --settings ../temp/weekly-settings.json --publish --app-version 1.0.0
   ```

   Dùng app version được release hiện tại cho phép. Publish bao gồm tất cả setting active đang nháp, không chỉ thưởng tuần.
4. Thiết lập tác vụ chạy mỗi phút trên máy chủ:

   ```bash
   python3 -B nakama/weekly_leaderboard_tick.py
   ```

   Môi trường cần `NAKAMA_URL` và `NAKAMA_HTTP_KEY` đang dùng của server. Không đưa key vào dòng lệnh, git hoặc log. Có sẵn mẫu [systemd service](../nakama/scheduler/weekly-leaderboard.service) và [timer](../nakama/scheduler/weekly-leaderboard.timer). Điều chỉnh đường dẫn checkout trước khi cài. File `/etc/survival-td/weekly-leaderboard.env` chứa hai biến trên và chỉ tài khoản vận hành đọc được. Sau khi cài hai unit vào `/etc/systemd/system`, chạy `systemctl daemon-reload` và `systemctl enable --now weekly-leaderboard.timer`.
5. Kiểm tra `systemctl list-timers weekly-leaderboard.timer`, log service và nút **Thưởng tuần** trên client. Tick đầu tiên tạo kỳ hiện tại; kỳ triển khai đầu là tuần chưa đầy đủ và không truy thưởng các tuần trước đó.

RPC `weekly_leaderboard_tick` dùng HTTP key của Nakama hoặc session `CONFIG_ADMIN_USER_ID`; session người chơi thường bị từ chối. RPC không nhận ngày chốt, điểm hay cấu hình từ request. Job chạy lại sau lỗi hoặc nhiều instance cùng tick không tạo thưởng trùng. Nếu scheduler tạm dừng, lần sync hồ sơ/xem thưởng kế tiếp cũng chốt các kỳ đã kết thúc từ điểm được lưu, không lấy tiến trình mới để dựng lại thứ hạng quá khứ.

Các bảng vận hành:

- `weekly_leaderboard_periods`: thời gian, trạng thái, phiên bản và JSON cấu hình của kỳ.
- `weekly_leaderboard_scores`: điểm được server ghi nhận của người hoạt động trong kỳ.
- `weekly_leaderboard_awards`: thứ hạng và bộ thưởng đã chốt, hạn nhận.
- Storage `weekly_leaderboard_claims`: dấu đã nhận; lưu nguyên tử cùng tài nguyên và inventory. Đây là nguồn xác định đã nhận, không suy ra từ việc dòng award tồn tại.

Không xóa marker để phát lại thưởng. Khi cần bù lỗi, tạo luồng bù có mã giao dịch riêng. Khôi phục cấu hình bằng stage/publish release mới, giữ nguyên snapshot các kỳ cũ.

## Kiểm thử local

```bash
cd nakama
npm run build
cd ..
node tests/test_weekly_leaderboard_config.cjs
python3 -B -m unittest discover -s tests -p test_weekly_scheduler.py
# Chỉ database PostgreSQL dùng thử: đặt SEED_TEST_PSQL và SEED_TEST_PORT.
node tests/test_weekly_leaderboard.cjs
```

Godot: chạy scene `res://tests/TestWeeklyLeaderboard.tscn` để kiểm tra cuộn desktop/mobile, countdown và các trạng thái nhận thưởng. Bộ kiểm thử SQL tạo schema riêng và dọn sau khi chạy; không trỏ vào database thật.
