# C250 — Vận hành archive và khôi phục

03/11/2026 · TESTED_SCOPED trên PostgreSQL 16/Nakama 3.24.2 cô lập. Chưa nghiệm thu hạ tầng production.

## Chính sách và phân quyền

Luồng C232 giữ nguyên: soft delete 14 ngày, sau đó archive và giải phóng định danh; gameplay được dọn sau 3 tháng lịch. Thời hạn ciphertext nhận từ policy đã chụp tại thời điểm xử lý. Không suy thời hạn lưu billing từ thời hạn gameplay.

`system.account_archive_operations` quản lý `enabled`, `revision`, `batch_size` (1–200), `identity_expiry.enabled`, `approval_reference`, `approved_by`, `effective_at`. Mặc định tắt. Thiếu cấu hình, chưa có phê duyệt hiệu lực, chưa dọn gameplay, chưa đến hạn hoặc có hold đều không được xóa ciphertext. Xóa ciphertext không xóa user tối thiểu, billing, transaction hoặc audit. Lifecycle bản backup phải có chính sách riêng; xóa trên DB không đồng nghĩa xóa mọi backup.

DBA áp dụng `services/account-identity/archive-permissions.sql` sau schema. Các nhóm NOLOGIN: `c250_archive_reader` chỉ đọc tổng hợp; `c250_archive_hold` quản lý hold/retry; `c250_archive_rotation` đọc ciphertext và xoay khóa; `c250_archive_expiry` chỉ đọc danh sách đủ điều kiện và gọi hàm expiry; `c250_archive_restore` dành cho workbench khôi phục. Cấp membership cho login DB riêng, không cấp login dùng chung. Actor audit lấy từ `session_user`. Script không tự tạo mật khẩu hay cấp quyền production. Superuser vẫn là quyền gốc tin cậy; IAM/MFA và quản lý quyền host cần nghiệm thu riêng.

## Khóa và thao tác

Khóa hiện hành: `ACCOUNT_RETENTION_KEY` và `ACCOUNT_RETENTION_KEY_ID`. Keyring cũ: `ACCOUNT_RETENTION_KEYS_JSON` là JSON ánh xạ ID sang khóa 64 ký tự hex, chỉ đưa vào secret store. Không ghi khóa vào ticket, log hoặc bằng chứng. Không thay cùng một ID bằng khóa khác.

Chạy CLI bằng DB login được cấp nhóm tương ứng, qua các biến PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD trong môi trường riêng:

```powershell
node services/account-identity/src/archive-operator.js --action=rotate --job=<job-id> --confirm=<job-id> --target-key-id=<new-key-id> --case=<approved-case>
node services/account-identity/src/archive-operator.js --action=expire --job=<job-id> --confirm=<job-id> --case=<approved-case>
```

Đối chiếu tên tham số bằng mã CLI trước thao tác. Rotation kiểm tra khóa cũ, digest, AES-GCM và CAS; giữ nguyên chủ sở hữu/thời hạn. Chỉ bỏ khóa cũ sau khi kiểm kê không còn pending snapshot/ciphertext cần khóa và đã duyệt khả năng phục hồi backup. Không thực hiện rotation hoặc expiry thử trên hồ sơ người chơi.

## Backup và checkpoint

Workbench chạy trên host tin cậy có source đầy đủ, Node 22 và công cụ PostgreSQL 16. Docker image dịch vụ không cài pg_dump/pg_restore. Cấu hình `PG_DUMP_PATH`, `PG_RESTORE_PATH` nếu công cụ không nằm trong PATH; thư mục làm việc là server.

Secret riêng: `ACCOUNT_RECOVERY_BACKUP_KEY`, `ACCOUNT_RECOVERY_SIGNING_KEY` (mỗi khóa 64 hex, độc lập với nhau và khóa dịch vụ); `ACCOUNT_RECOVERY_ARTIFACT_DIR` là thư mục tuyệt đối được giới hạn quyền host. Không đặt khóa trong cùng nơi lưu backup. Chế độ file Unix không chứng minh Windows ACL đã đúng.

```powershell
node services/account-identity/src/archive-recovery-cli.js --action=backup --name=<unique-backup-name>
node services/account-identity/src/archive-recovery-cli.js --action=ledger --name=<unique-current-ledger-name>
```

Backup dùng pg_export_snapshot để dump và ledger cùng snapshot, AES-256-GCM qua bộ nhớ, không tạo file dump plaintext. Ledger có HMAC độc lập và fingerprint định danh/tài chính. Lưu checkpoint digest mới nhất ở nguồn độc lập không bị rollback cùng DB/backup. HMAC hợp lệ không chứng minh ledger là bản mới nhất. Sau các thay đổi cần bảo toàn phải có checkpoint mới và khả năng phục hồi dữ liệu/WAL tương ứng. Công cụ hiện giới hạn buffer 128 MiB; cần giải pháp streaming đã kiểm thử trước khi dùng dữ liệu lớn.

## Khôi phục và điều kiện mở phục vụ

Đóng traffic và writer từ hạ tầng **trước khi import**; snapshot cũ có thể chứa cờ ready/runtime cũ. Chỉ dùng DB đích mới có tiền tố `c250_restore_`; CLI từ chối ghi đè DB hiện hữu hoặc phục hồi trực tiếp DB người chơi. DB login restore cần quyền tạo DB/áp schema ngoài membership restore; chỉ cấp trong môi trường staging cô lập.

```powershell
node services/account-identity/src/archive-recovery-cli.js --action=restore --name=<case-name> --database=c250_restore_<case> --confirm=c250_restore_<case> --backup=<name.backup.enc> --ledger=<latest.ledger.enc> --checkpoint=<independently-pinned-latest-digest>
```

CLI áp schema hiện hành, đóng restore gate rồi đối chiếu ledger. Replay theo user ID, thu hồi credential/session/proof cũ, giữ trạng thái archive/expiry, dọn gameplay đã xóa và giữ liên kết tài chính. Không ghép chủ tài khoản theo email. Thiếu chủ mới, khác password/định danh/tài chính, job lạ, flow legacy không hỗ trợ hoặc xung đột hold giữ `blocked`; cần phục hồi dữ liệu còn thiếu/đánh giá thủ công rồi kiểm chứng lại. Không tự sửa ledger cho khớp backup.

`ready` chỉ là kết quả đối chiếu trong workbench; CLI luôn trả `traffic_opened:false`. Còn phải kiểm tra dữ liệu, cấu hình, audit, khóa, quyền và kế hoạch chuyển traffic có người phụ trách. Runtime hiện hành chặn auth, native APIs và RPC khi gate blocked. Không thử đóng gate trên DB đang phục vụ để diễn tập.

## Bằng chứng và phần còn mở

Test: `C250_INTEGRATION=true node --test services/account-identity/test/archive-operations.integration.js`; chạy tuần tự sau suite C232 để tránh dùng chung fixture. Bằng chứng: `client/docs/standards/g2-registration/evidence/retention/B6/operations/integration-results.json` (đường dẫn từ workspace).

Production còn cần backup offsite/immutable, lịch/expiry backup được phê duyệt, escrow và recovery khóa, IAM/MFA/thu hồi quyền, RPO/RTO thực đo và diễn tập dữ liệu đủ kích thước. Android/email thật vẫn pending. Không dùng kết quả local để tuyên bố hệ thống đã đáp ứng đầy đủ quy định.

## C250 2.0 — đối chiếu quyền riêng tư

Ledger mới chứa số dòng và HMAC fingerprint toàn bộ `privacy_consent`; không chứa bản rõ lựa chọn trong fingerprint. Chênh lệch trả `privacy_mismatches=1`, gate tiếp tục `blocked`: phục hồi dữ liệu hoặc WAL đến checkpoint hiện tại rồi đối chiếu lại. Không chỉnh thủ công fingerprint để mở gate và không suy ra consent hiện tại từ backup cũ. Ledger trước 2.0 không có fingerprint bị từ chối; phải tạo ledger mới ở nguồn tin cậy trước khi chuyển phiên bản. Đây là cơ chế phát hiện và chặn, chưa có cơ chế phục hồi tự động các event bị thiếu.
