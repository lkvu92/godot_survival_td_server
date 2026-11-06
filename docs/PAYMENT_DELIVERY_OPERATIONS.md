# Vận hành giao dịch Google Play — C271

Hợp đồng: [C271](contracts/C271_PAYMENT_DELIVERY_RECOVERY.md). Quyền lợi luôn lấy từ snapshot và account/server/generation của đơn gốc. Admin không nhập lại vật phẩm, số lượng hoặc token để cấp bù.

## Quyết định xử lý

| Bằng chứng | Xử lý |
|---|---|
| Google PENDING hoặc chưa xác minh | Không giao; chờ Google hoặc retry xác minh |
| PURCHASED, có đơn gốc hợp lệ, chưa giao | Worker giao theo snapshot một lần |
| Đã có mail/marker, SQL/VIP chưa hoàn tất | Giữ mail cũ; sửa phần còn thiếu bằng cùng token |
| Đã giao, chưa acknowledge/consume | Chỉ hoàn tất với Google; không giao lại |
| Đã gửi mail, người chơi chưa nhận | Hướng dẫn nhận thư; không cấp thêm pack |
| Thiếu token, sai chủ/đích, đơn hết hạn, marker mâu thuẫn | Đối soát; không dựa vào status để cấp tay |
| Google hủy/void | Chặn giao mới; đối soát thu hồi theo luồng hiện có |

Nút **Tiếp tục giao** chỉ xếp hàng xác minh đơn gốc khi backend trả `can_retry=true`. Bắt buộc lý do hỗ trợ; backend lưu audit. Đây không phải thao tác hoàn tiền. Không tuyên bố cơ chế thu hồi hiện tại lấy lại được mọi vật phẩm đã tiêu; C271 không triển khai chính sách hoàn tiền hoặc tự động thu hồi toàn bộ gói đã dùng.

## Cấu hình và triển khai

1. Sao lưu DB, runtime đang chạy, image verifier và cấu hình bí mật. Không chạy seed catalog hoặc replay lịch sử từ trạng thái `fulfilled`.
2. Build/kiểm thử runtime và verifier cùng phiên bản. Runtime init thêm `payment_delivery_jobs` và `payment_delivery_audit`; giữ nguyên dữ liệu và các marker cũ.
3. Tạo `PURCHASE_RECOVERY_ENCRYPTION_KEY` một lần bằng 32 byte ngẫu nhiên, base64. Lưu trong secret manager/env riêng chỉ verifier đọc; sao lưu bảo mật cùng quy trình DB. Không ghi key/token vào log hoặc Git.
4. Cài runtime trước; kiểm tra RPC nội bộ từ chối thiếu secret và request có user session. Cài verifier sau với cùng bridge secret và HTTP key hiện tại. Bật `PURCHASE_RECOVERY_ENABLED=true` khi schema/RPC đã sẵn sàng.
5. RTDN cần Pub/Sub Push tới HTTPS `/google-play/rtdn`, audience đúng URL cấu hình, **đúng** `GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL`, token có `email_verified=true`, package đúng `GOOGLE_PLAY_PACKAGE_NAME`. Service account Push khác với tài khoản dùng đọc Google Play; không suy đoán hai email giống nhau. Bật notifications trong Play Console, gửi test notification và kiểm tra đã ghi job thực trước khi công bố khôi phục độc lập với client.
6. Cài web admin sau runtime. Đối chiếu các trục Google/giao/quyền lợi cuối; không biến lỗi RPC thành thành công.

Worker lease 120 giây, chạy mỗi 10 giây, tối đa 5 job/batch; retry có backoff tối đa 1 giờ. Sau restart, lease hết hạn được lấy lại; marker/CAS/unique constraints giữ danh tính grant. Google acknowledge/consume chỉ sau bằng chứng giao bền vững, gồm ledger và VIP khi snapshot yêu cầu. Đơn đã giao đủ có thể hoàn tất Google khi server bảo trì; đơn cần sửa quyền lợi vẫn phải qua admission của server gốc.

Nếu receipt chưa từng tới verifier và RTDN chưa được cấu hình, restart không thể tự tạo lại token. Người chơi phải đồng bộ giao dịch qua client, hoặc hoàn tất RTDN. Đây là điều kiện bắt buộc để bảo đảm phục hồi khi app không quay lại.

## Theo dõi và rollback

Chỉ truy vấn tổng hợp `status,payment_state,attempts,last_error,created_at,next_attempt_at`; không xuất `encrypted_token`. Cảnh báo job PURCHASED chưa giao/xác nhận, job review, bridge/provider retry và backlog gần hạn acknowledge của Google. Không coi health HTTP 200 là đã nghiệm thu thanh toán.

Rollback: dừng worker/intake trước, khôi phục runtime/image/config đã sao lưu; giữ bảng jobs/audit/marker và mọi quyền lợi đã giao. Không xóa job để làm lại. Key không được đổi tùy tiện: envelope v1 chưa hỗ trợ nhiều key ID; muốn xoay phải có công cụ reencrypt được kiểm chứng trong maintenance, giữ key cũ đến khi hoàn tất. Không reset bộ đếm account/server đang chạy; nếu tiến trình chết để lại counter, chỉ đối soát sau khi tiến trình cũ dừng và request đã drain.

## Kiểm thử

`node tests/test_payment_delivery_runtime.cjs` tạo PostgreSQL/Nakama riêng, fake dữ liệu Google qua bridge tin cậy. Bao phủ delivery thật, SIGKILL/restart sau delivery, lease fencing, Google pending/hủy/sai owner/quantity/expired, admin queue/audit, replay song song, nhận mail, lỗi SQL sau Storage và sửa VIP. Không gọi Google thật và không chứng minh mọi thời điểm SIGKILL.

`node --test services/monetization-verifier/test/purchase_recovery.test.js` kiểm tra mã hóa, danh tính Push, package, pending, thứ tự giao trước acknowledge/consume và mất phản hồi. Kịch bản mua Google sandbox/RTDN end-to-end cần được ghi riêng trước khi tuyên bố nghiệm thu toàn bộ production.
