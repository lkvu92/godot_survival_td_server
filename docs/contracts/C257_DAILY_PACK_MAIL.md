# C257 — Thưởng gói ngày qua hộp thư

Version 0.2.1 · IMPLEMENTED / SCOPED TEST · 05/11/2026

Lượt nhận gói ngày tạo thư và đánh dấu ngày nhận trong cùng batch Storage. Tiền và vật phẩm thành đính kèm. Thể lực đổi theo mệnh giá 15 và 5; 20 thành một bình mỗi loại, phần dư làm tròn lên 5. Nhận thư cộng thưởng một lần. Không nhận offline. Lỗi batch không tạo thư hoặc đánh dấu ngày thành công. API claim trả mail_id và rewards; không còn trả profile/inventory đã cộng thưởng.

## Regression qua thư
`test_daily_pack_entitlements.cjs` dùng các hàm mailbox thực cùng Storage mock có key riêng cho từng thư/ledger và kiểm tra CAS nguyên tử:
- Mua gói chỉ kích hoạt quyền lợi; nhận gói ngày chỉ tạo thư, chưa cộng tiền/vật phẩm/thể lực trực tiếp.
- Đủ 30 lượt nhận cho mỗi gói, ranh giới ngày/hết hạn, không bù ngày bỏ lỡ và hai gói cùng tồn tại.
- Đính kèm giữ snapshot đã mua. Thể lực hiện hành 15/30 và legacy 20 thành bình 15/5; nhận thư chỉ thêm bình, không tự dùng bình.
- Lỗi CAS khi gửi thư không đánh dấu ngày; lỗi CAS khi nhận thư không cộng thưởng hoặc đánh dấu thư đã nhận.
- Replay nhận gói hoặc nhận thư không phát trùng. Snapshot cũ và đơn thanh toán cũ không bị viết lại.

`test_consumable_store.cjs` kiểm tra catalog ban đầu còn nguyên và có thêm `energy_elixir_low`, hiệu ứng hồi đúng 5 thể lực phục vụ C257.

Kiểm chứng 05/11/2026: `node server/tests/test_daily_pack_entitlements.cjs`, `node server/tests/test_mailbox_runtime.cjs`, `node server/tests/test_consumable_store.cjs` và toàn bộ `server/tests/run_static_tests.ps1` PASS. Chỉ sửa test/tài liệu, không thay đổi logic cấp thưởng hoặc dữ liệu người chơi trong lần cập nhật này.

Phạm vi vận hành trước đây chưa được mở rộng bởi sửa regression này: chưa chứng nhận riêng luồng gói ngày qua Nakama thật/Godot; item Hạ cần có trong snapshot đã publish; API/dashboard truy vết D2 không được nghiệm thu trong thay đổi test này.

## Changelog
- 0.2.1 — 05/11/2026: chuyển test entitlement sang phát/nhận thư thực, kiểm tra đúng một lần và CAS; cập nhật test catalog bình 5 thể lực; suite server tổng PASS.
- 0.2.0 — triển khai claim qua thư, quy đổi theo 15/5.
- 0.1.0 — contract dự thảo.
