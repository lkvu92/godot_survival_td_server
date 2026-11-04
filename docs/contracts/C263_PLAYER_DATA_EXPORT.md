# C263 — Tra cứu và trích xuất dữ liệu một người chơi

Version: 1.1.0 | Status: TESTED_SCOPED | Updated: 2026-11-04

## Bản triển khai local 1.1.0

RPC `admin_player_data_export {user_id}` kiểm tra CONFIG_ADMIN_USER_ID, xuất JSON schema 3 gồm account, characters, playtime, identity live, archived_identity, inventory, resources, payments và warnings. Giới hạn 10.000 dòng mỗi nhóm, vượt giới hạn trả lỗi thay vì cắt im lặng. Snapshot nhiều truy vấn, không nguyên tử. Danh tính archive qua endpoint nội bộ được bảo vệ bằng secret, giải mã tại identity service, kiểm tra digest/key/schema và chỉ whitelist subject được chỉ định. Lỗi đọc archive chặn xuất. Web `/dashboard/player-data` tải JSON, audit server ghi actor/subject. API dự kiến bên dưới là hướng phát triển; ZIP, lọc thời gian, job nền chưa được triển khai.

Kiểm thử local: `node server/tests/test_c263_export_local.cjs` đối soát fixture PostgreSQL với RPC thực cho inventory/resources/live identity/playtime/legacy payment nullable amount và archive identity; kiểm tra subject isolation, whitelist, admin/missing/invalid IDs. Test tạo dữ liệu riêng và dọn đúng các fixture. Unit test archive kiểm tra key thiếu, integrity và expired archive. Chưa xác nhận live Google financial synchronization hoặc nghiệm thu pháp lý/production.

## Phạm vi

Admin dùng user ID chỉ định để xem từng dataset và xuất dữ liệu theo khoảng thời gian. Không có phân quyền theo capability, quy trình hồ sơ công văn, duyệt nhiều cấp hoặc xuất hàng loạt trong giai đoạn này. Chỉ cung cấp dữ liệu có thật và báo rõ giới hạn. Không cung cấp credential, token, receipt thô hoặc payload nhạy cảm tùy ý. Chưa công bố production-ready khi chưa đạt tất cả các gate bên dưới.

## Phân quyền và audit

Bắt buộc kiểm tra admin bằng cơ chế `CONFIG_ADMIN_USER_ID` hiện có ở server; không lấy quyền từ request hoặc role browser. Kiểm tra lại quyền admin khi truy cập hoặc tải dữ liệu. Audit thao tác xem, xuất và tải, không ghi nội dung dữ liệu cá nhân hoặc payload nhạy cảm. Phân quyền chi tiết để giai đoạn sau.

## Nguồn dữ liệu

- `account`: users và trạng thái vòng đời. `identity`: profile được whitelist; archive mã hóa cần đường truy cập riêng.
- `playtime`: `compliance_playtime` theo user/game/ngày. `player_health_activity` chỉ giữ ngày hiện tại, không phải lịch sử phiên.
- `inventory`: snapshot theo nhân vật/server/generation. `asset_history`: chỉ các sự kiện đã ghi nhận, báo phạm vi chưa bao phủ.
- `payments`: order và purchase legacy, số tiền xác minh có thể null; không xuất token/hash/receipt/raw errors. Dữ liệu cũ bị xóa hoặc chưa ghi không thể tái tạo.
- Mỗi dataset trả `source`, `as_of`, `coverage`, `warnings`, `records`, `next_cursor`; không khẳng định snapshot đa nguồn là nguyên tử khi chưa bảo đảm.

Xem [kiểm kê nguồn](../C263_PLAYER_DATA_INVENTORY.md).

## API dự kiến

RPC qua proxy `admin_*`, dùng session, kiểm tra quyền server-side và account guard; online-only, không cache dữ liệu nhạy cảm. Validate và whitelist input/output. Lỗi `{success:false,reason}` không lộ SQL hoặc PII.

- `admin_player_data_list`: `{user_id,dataset,from,to_exclusive,limit,cursor}` → dataset như trên. UUID chuẩn, UTC ISO-8601, khoảng nửa mở, cursor ràng buộc filter và subject.
- `admin_player_export_create`: `{user_id,datasets,from,to_exclusive,format:"csv_zip",reason?,idempotency_key}` → `{success,job_id,status}`. Giới hạn một user và kích thước; idempotency ràng buộc actor và payload.
- `admin_player_export_get`, `admin_player_export_cancel`, `admin_player_export_download`: `{job_id}` → trạng thái hoặc file được bảo vệ; kiểm tra actor, trạng thái, expiry, quyền từng dataset và audit. Worker bất đồng bộ dùng lease/retry/idempotency; xóa file hết hạn, không public URL.
- `admin_player_data_audit_list`: `{cursor,limit}` → metadata audit không có payload cá nhân.

ZIP gồm CSV UTF-8 từng dataset và manifest JSON: schema version, user ID, filter, generated_at, source/as_of/coverage/warnings, row count, SHA-256 từng file. Ngăn CSV formula injection, bảo toàn int64/decimal dạng chuỗi. Ghi rõ dữ liệu đọc tại nhiều thời điểm; chỉ báo hoàn tất khi file và manifest đã xác minh.

## Retention và an toàn

Không đổi deadline hoặc tự xóa khi chưa có policy theo dataset được duyệt. C232 v3 local có gameplay cleanup sau ba tháng; đánh giá nghĩa vụ trước rollout production. Hold phải chặn mọi đường purge liên quan và được kiểm thử cạnh tranh, backup/restore. Không phát triển UI hold ở phạm vi này. MFA/reauth, secrets, mã hóa file, expiry, vị trí lưu và audit retention cần nghiệm thu theo môi trường.

## Gate nghiệm thu

Contract/registry/index; backend build; tests phân quyền, dataset, một user, cursor, audit fail-closed, dữ liệu thiếu, export/hash/formula injection, retry/expiry và tải trái quyền; retention/hold/purge concurrency; web lint/typecheck/build, CSRF, Zod, dark/light và UI; đối soát DB thật, backup/restore; legal và production acceptance. Không đánh dấu ACTIVE khi thiếu gate.

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.1 | 2026-11-04 | Dùng kiểm tra admin hiện có và user ID; hoãn phân quyền chi tiết. |
| 1.0.0 | 2026-11-04 | Contract ban đầu cho tra cứu và xuất một user, không workflow công văn. |
