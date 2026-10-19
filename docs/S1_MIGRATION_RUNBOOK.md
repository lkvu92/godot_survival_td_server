# Migration toàn bộ tài khoản legacy sang S1

## Nhật ký cutover VPS — 2026-10-19

Theo xác nhận trực tiếp của người dùng: migrate và enable S1, không tạo thêm backup. Backup cũ `before-s1-ready.dump` vẫn được giữ; trước xử lý blocker, fingerprint nguồn khớp manifest backup cũ. Migration ban đầu bị chặn và rollback do collection `player_item_requests` chưa khai báo; đã sửa ownership repository/migration/Google transfer và test Docker cô lập trước khi triển khai bản vá tối thiểu vào runtime VPS.

Đã đóng 11 order chưa xác minh, không receipt/hash/reservation/ledger liên kết và 1 ad prepared chưa xác minh, đều quá TTL từ 17–18/10, thành expired; giữ bản gốc và ghi audit. Không bỏ qua delivery đã verified. Sau đó tạo plan/hash mới và chạy transaction SQL từ migration generator có guard (operator không tạo backup mới theo yêu cầu), thay vì giả mạo manifest backup cũ cho nguồn mới.

Kết quả lúc 15:27 UTC: 194 scoped Storage object, 7 ready character S1, 151 marker vật phẩm chống xử lý trùng; legacy nguyên trạng. Verify độc lập: source_unchanged=true, missing_characters=0, missing_or_changed=0. S1 được enable generation 1/revision 2, runtime flag multi-server đã bật; Nakama healthy và verifier chạy. Không chạy seed; không tạo s_test. Verify nguồn/đích chỉ phản ánh thời điểm cutover trước gameplay mới, không dùng để phủ nhận các thay đổi hợp lệ sau cutover.

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

## Seed sau migration (C143 v1.5)

Giữ workflow `bash deploy.sh deploy/start` và `bash deploy.sh seed`; không cần Node trên host (build runtime đã dùng Docker). CLI `seed_all.py` mới nạp toàn bộ file trước, gửi một RPC `table: bundle`, backend kiểm tra/compile rồi ghi toàn bộ catalog trong một transaction với advisory lock. File lỗi, reference lỗi, lỗi SQL hoặc readback đều không commit một phần catalog. Không fallback về seed từng request nếu runtime cũ chưa hỗ trợ bundle.

Deploy cả runtime mới, `seed_all.py` mới và `nakama/data/local.yml` mới cùng nhau: full seed encoded khoảng 1.7 MB hiện tại, nên cấu hình Nakama `socket.max_request_size_bytes: 8388608`. Reverse proxy có giới hạn riêng thì cũng cần cho phép request tương ứng, hoặc seed qua localhost như deploy hiện tại. Runtime/config cũ hoặc proxy chặn sẽ làm lệnh seed fail; không tự chia nhỏ rồi ghi dở dang.

Seed không tạo/mở/reset S1 hay thay generation; không ghi user/character/Storage, preference, ledger, receipt reservation, migration checkpoint hoặc published config release. Catalog/config dùng chung vẫn được cập nhật theo file seed: đây là thay đổi balance chủ động, không phải đảm bảo gameplay balance không đổi. Vì gameplay có đọc catalog trực tiếp, hãy đóng gameplay/writer hoặc thực hiện trong maintenance khi cập nhật balance; transaction nguyên tử không thay thế quy trình maintenance. Publish config vẫn là bước riêng khi yêu cầu `--publish`; publication lỗi không rollback catalog đã seed thành công.

Mặc định upsert, không prune hero. `--replace-all` không được xóa hero vắng catalog nếu đã có profile/hero Storage hoặc lịch sử giao dịch; trả lỗi và rollback lượt seed. Item legacy trước đây bị xóa bằng danh sách cứng nay được giữ để không gãy inventory/receipt cũ. Product vắng catalog chỉ bị deactivate nếu chủ động dùng replace-all; order reward/platform/target snapshot cũ không bị viết lại.

Đã test trên runtime Docker cô lập: full CLI seed hai lần sau migration, fingerprint dữ liệu S1/checkpoint không đổi; seed lặp với ledger/order/ad/VIP có sẵn không đổi; chèn lỗi SQL ở content config cuối lượt seed khiến toàn bộ catalog rollback; prune hero không an toàn bị từ chối. Chưa chạy seed này trên DB local đang chơi hoặc production.

## Kiểm thử

`node tests/test_s1_migration_cli.cjs` kiểm tra guard CLI. `node tests/test_multiserver_runtime.cjs` dựng PostgreSQL/Nakama cô lập, diễn tập offline migration/apply replay/verify cùng các test đa server và seed atomic. Chưa thay thế rehearsal trên bản sao dữ liệu production hoặc kiểm thử tải.
