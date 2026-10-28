# Vận hành giftcode (C234)

## Trạng thái local hiện tại

Đã kích hoạt TANTHU, KHAIMOSERVER và mã tester đã sinh trên Nakama develop `http://127.0.0.1:7350` lúc **28/10/2026 16:21:24 +07:00**; hết hạn **27/11/2026 16:21:24 +07:00**. Áp dụng tất cả game server trong môi trường local, không giới hạn tổng lượt, mỗi tài khoản một lần mỗi mã. Giữ nguyên mã tester và số lượng đã chốt: mảnh/item khác x1000, pháp bảo hoàn chỉnh x1. File private draft đã cập nhật enabled=true và expected_revision=1 sau khi đối soát server.

Chưa kích hoạt trên production. Giftcode hiện publish bằng CLI riêng; lệnh deploy seed chưa tự publish các mã này.

## Tạo và kích hoạt

Chạy từ server repo:

```powershell
node tools/gift_codes.cjs draft --servers s001 --start 2026-10-28T00:00:00+07:00 --end 2026-11-28T00:00:00+07:00
```

File mặc định `.tmp-giftcodes/campaigns.private.json` được gitignore. Có đủ TANTHU, KHAIMOSERVER và một mã TEST_ với 192 bit ngẫu nhiên mật mã. Đọc mã tester trực tiếp trong file này; không đưa file vào client, Git hay tài liệu công khai. Lệnh không ghi đè file cũ để tránh mất mã đã phát hành.

Sửa từng definition: `enabled: true`, `allowed_servers` (rỗng = tất cả), `starts_at_ms`, `expires_at_ms`, `max_uses` (null = không giới hạn tổng lượt), `mail_claim_days`. Mỗi tài khoản chỉ dùng mỗi mã một lần trên toàn bộ server. Thư đến nhân vật đang chơi; reset server không cho đổi lại mã cũ.

Gán JWT phiên đăng nhập quản trị vào biến môi trường `GIFT_ADMIN_TOKEN`; user ID phải trùng `CONFIG_ADMIN_USER_ID` của Nakama. Không dùng HTTP key/public client để quản trị.

```powershell
node tools/gift_codes.cjs publish --file .tmp-giftcodes/campaigns.private.json --url http://127.0.0.1:7350
node tools/gift_codes.cjs list --url http://127.0.0.1:7350
node tools/gift_codes.cjs history --code TANTHU --url http://127.0.0.1:7350
```

Remote URL phải là HTTPS. `list` và `history` trả `next_cursor`; dùng `--cursor` để xem tiếp. List chứa mã riêng tư, chỉ dùng trong phiên quản trị.

Nếu không có phiên đăng nhập admin, dùng credential operator riêng của deploy trong runtime config đã sinh. Không dùng hoặc tạo JWT giả cho tài khoản game:

```powershell
node tools/gift_codes.cjs publish --file .tmp-giftcodes/campaigns.private.json --operator-config nakama/runtime.local.secret.yml --url http://127.0.0.1:7350
node tools/gift_codes.cjs list --operator-config nakama/runtime.local.secret.yml --url http://127.0.0.1:7350
```

RPC `operator_gift_codes` yêu cầu cả HTTP key và CONFIG_PUBLISH_TOKEN, từ chối game session, ghi audit actor `operator:deploy`. Runtime mới phải được build và Nakama restart để đăng ký RPC. File private config/credential không được đưa lên Git hoặc in ra log. Production dùng private runtime config tương ứng trên máy chủ; không gửi credential local sang production.

## Sửa, khóa, gia hạn

Lấy definition/revision mới nhất từ list. Tạo file JSON chứa mảng request `{action:"upsert", expected_revision:N, reason:"Lý do", definition:{...}}`, rồi publish. Đặt `enabled:false` để khóa; tăng `expires_at_ms` để gia hạn; chỉnh `max_uses` để tăng hạn mức. Không được hạ hạn mức dưới số đã đổi. Không sửa rewards hoặc hạn nhận thư sau khi có người đổi. Counter được giữ nguyên; mọi thay đổi có audit riêng tư. Nếu revision conflict, tải lại dữ liệu trước khi sửa.

Publish nhiều entry chạy tuần tự: nếu một entry lỗi, các entry trước vẫn đã lưu. Dùng list để đối soát; không publish lại cả file với revision cũ. Không có tự kích hoạt, tự seed hoặc tự triển khai production.

## Quà và nhận thư

Tân thủ: 20 Hồi Xuân Đan, 10 Hộ Thuẫn Đan, 10 Thể Lực Đan, 5.000 vàng, 50 gem. Khai mở: 20 Phù Văn Linh ngẫu nhiên 5 hệ, 1 Cường Hóa Phù, 1 Ngộ Đạo Phù, 15 mảnh Thanh Phong Kiếm, 20 vé càn quét chiến dịch, 1 Hồi Sinh Phù.

Tester: mỗi loại mảnh pháp bảo và item khác x1000; mỗi loại pháp bảo hoàn chỉnh (category=talisman) chỉ x1, theo catalog lúc tạo draft. Mỗi thư tối đa 32 loại. Giới hạn túi 2000 ô vẫn áp dụng; cần dọn túi nếu đã đầy. Các thư và lượt đổi được tạo nguyên tử; túi đầy không làm mất quà trong thư. Tăng `mail_claim_days` trước khi phát hành nếu cần thời gian test dài hơn.

RPC và quy tắc chi tiết: [C234](contracts/C234_GIFT_CODES.md).
