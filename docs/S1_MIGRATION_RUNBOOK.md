# Migration toàn bộ tài khoản legacy sang S1

Script: `node tools/migrate_s1.cjs`. Mặc định là **plan**, không tự bật multi-server, không chạy khi startup. Script dùng được với local/staging/production; việc cung cấp script không đồng nghĩa đã chạy migration production.

## Điều kiện

### VPS chỉ có Docker, không có Node

Dùng `bash tools/migrate_s1.sh`: Node và PostgreSQL clients chạy trong image tooling, **không cài Node lên VPS**. Cần Docker, Bash và quyền đọc DB. Image hiện dùng PostgreSQL 16, phù hợp stack repo; kiểm tra version trước khi dùng với DB khác. Build lần đầu cần Internet để tải image/package. Không mount volume DB vào tool; tool chỉ dùng network của container PostgreSQL được chỉ định.

```bash
mkdir -m 700 /root/s1-backups
# pgpass: 127.0.0.1:5432:nakama:postgres:PASSWORD ; chmod 600 file này.
export S1_PGPASSFILE=/root/.pgpass
bash tools/migrate_s1.sh nakama-postgres /root/s1-backups --environment production --mode plan
```

Sau backup/rehearsal và dừng toàn bộ writer (giữ PostgreSQL chạy), lấy TARGET/HASH từ plan trên đúng DB:

```bash
bash tools/migrate_s1.sh nakama-postgres /root/s1-backups --environment production --mode backup --runtime-stopped --ack-production --confirm-target 'CLUSTER_ID/nakama' --backup /backup/before-s1.dump
bash tools/migrate_s1.sh nakama-postgres /root/s1-backups --environment production --mode apply --runtime-stopped --ack-production --confirm-target 'CLUSTER_ID/nakama' --plan-hash 'HASH' --backup /backup/before-s1.dump --report /backup/s1-report.json
bash tools/migrate_s1.sh nakama-postgres /root/s1-backups --environment production --mode verify
```

`/backup/...` trong container tương ứng `/root/s1-backups/...` trên VPS. Thay `nakama-postgres` bằng tên container DB thật; có thể thêm `--user`, `--database`, `--port`. Không tự động stop/start service, tạo S1 hoặc bật feature. Vẫn phải đáp ứng toàn bộ điều kiện bên dưới. Các ví dụ chỉ là hướng dẫn, chưa được chạy trên VPS.

- PostgreSQL/Nakama schema mới đã khởi tạo, thử trên bản sao production trước. Cần quyền đọc `pg_control_system()` để xác nhận cluster (thường dùng tài khoản DBA).
- Tạo registry `s001`, generation 1, status disabled, config_version hợp lệ bằng admin create. Không có dữ liệu S1 sẵn; không tạo `s_test` trong migration production.
- Dừng tất cả Nakama node, scheduler, monetization verifier và writer bên ngoài. Đóng ingress trong toàn bộ cutover; cờ `--runtime-stopped` là xác nhận của operator, không phải bằng chứng tự động.
- Không có active run hoặc pending financial delivery. Xử lý bằng nghiệp vụ trước, không xóa ledger hay sửa trạng thái để vượt guard.
- Cài `psql`, `pg_dump`, `pg_restore` tương thích DB. Dùng `PGPASSFILE` (hoặc cơ chế xác thực DBA), không đưa mật khẩu vào CLI/report. Remote production yêu cầu cấu hình TLS, ví dụ `PGSSLMODE=verify-full` và CA phù hợp.
- Backup chứa dữ liệu cá nhân/credentials: lưu ngoài Git, giới hạn ACL, mã hóa theo quy trình vận hành. `pg_restore --list` chỉ xác minh cấu trúc archive; phải diễn tập restore riêng trước cutover production.

## Chạy

Chạy tại `server/`. Ví dụ dưới dùng biến PowerShell; Linux dùng biến shell tương ứng. Thay host/database/environment bằng đích thật. Không dùng lệnh ví dụ để bật production tự động.

```powershell
$migrationArgs = @('--environment','production','--host','DB_HOST','--port','5432','--database','nakama','--user','DBA_USER')
node tools/migrate_s1.cjs @migrationArgs --mode plan
```

Ghi lại `cluster_id/database` làm TARGET, `manifest_hash` làm HASH. Hash bao gồm cluster/database, nguồn Storage, registry, tài chính, weekly và lifetime BXH. Sau khi dừng writer, plan lại nếu hash thay đổi.

```powershell
node tools/migrate_s1.cjs @migrationArgs --mode backup --runtime-stopped --ack-production --confirm-target 'CLUSTER_ID/nakama' --backup 'D:\secure-backups\before-s1.dump'
node tools/migrate_s1.cjs @migrationArgs --mode apply --runtime-stopped --ack-production --confirm-target 'CLUSTER_ID/nakama' --plan-hash 'HASH' --backup 'D:\secure-backups\before-s1.dump' --report 'D:\secure-backups\s1-apply-report.json'
node tools/migrate_s1.cjs @migrationArgs --mode verify
```

Linux dùng absolute path như `/secure-backups/before-s1.dump`. Có thể chỉ định `--psql`, `--pg-dump`, `--pg-restore` nếu executable không trong PATH. Local/staging dùng environment tương ứng, không cần `--ack-production`. Backup tạo sidecar `.manifest.json` chứa SHA256 archive, target và source hash; apply từ chối archive thay đổi, target sai hoặc source hash cũ. Không ghi đè backup/report đã tồn tại.

## Phạm vi và kết quả

- Không đổi UUID, email, Google identity, account/password; không clone account. Shared compliance/settings/no-ads giữ nguyên.
- Copy các collection progression đã khai báo sang `s001:g1:*`, giữ value/version/create_time, copy claim marker và lịch sử weekly/lifetime BXH. Collection player chưa biết ownership làm migration dừng.
- User đã có legacy profile được tạo character S1 ready; user chưa có profile chỉ có preference S1, character được khởi tạo chuẩn khi vào server lần đầu. Archived account không được hồi sinh thành character mới.
- Backfill đích S1 cho order/purchase/ad/quota legacy; không tạo giao dịch/grant mới. Ledger/dedupe giữ nguyên.
- Một transaction + checkpoint: lỗi rollback toàn bộ migration; retry cùng hash không nhân đôi. Dữ liệu legacy được giữ để đối soát, không phải bản rollback dùng được sau khi phát sinh ghi mới.
- Verify kiểm tra dữ liệu Storage, ready character và fingerprint nguồn sau migration; thất bại trả exit code khác 0. Chỉ verify trước khi mở gameplay; dữ liệu đích sẽ khác nguồn sau khi chơi.

Giữ ingress đóng đến khi verify và kiểm tra thủ công profile/VIP/BXH/claim đạt. Bật feature và enable S1 là bước vận hành riêng, không nằm trong script. Không bật lại legacy sau khi S1 đã có giao dịch/tiến trình mới. Nếu cần rollback sau cutover: dừng writer, backup hiện trạng, đối soát thay đổi và thực hiện quy trình restore đã diễn tập; không tự xóa namespace để quay lại.

## Kiểm thử

`node tests/test_s1_migration_cli.cjs` kiểm tra guard CLI. `node tests/test_multiserver_runtime.cjs` dựng PostgreSQL/Nakama cô lập, diễn tập offline migration/apply replay/verify cùng các test đa server. Chưa thay thế rehearsal trên bản sao dữ liệu production hoặc kiểm thử tải.
