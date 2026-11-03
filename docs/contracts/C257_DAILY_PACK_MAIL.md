# C257 — Thưởng gói ngày qua hộp thư

Version 0.2.0 · IMPLEMENTED / SCOPED TEST · 03/11/2026

Lượt nhận gói ngày tạo thư và đánh dấu ngày nhận trong cùng batch Storage. Tiền và vật phẩm thành đính kèm. Thể lực đổi theo mệnh giá 15 và 5; 20 thành một bình mỗi loại, phần dư làm tròn lên 5. Nhận thư cộng thưởng một lần. Không nhận offline. Lỗi batch không tạo thư hoặc đánh dấu ngày thành công. API claim trả mail_id và rewards; không còn trả profile/inventory đã cộng thưởng.

Kiểm thử: `npm run build` và `node server/tests/test_mailbox_runtime.cjs` PASS (VM, mô phỏng batch). `test_daily_pack_entitlements.cjs` chưa được chuyển từ kỳ vọng phát trực tiếp, đang FAIL. Chưa triển khai local, item Hạ cần seed và publish; chưa kiểm thử Nakama thật hoặc Godot. Chưa hoàn thành API/dashboard truy vết D2.

Changelog: 0.2.0 — triển khai claim qua thư, quy đổi theo 15/5; 0.1.0 — contract dự thảo.
