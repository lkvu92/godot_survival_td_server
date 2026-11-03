# C259 — Tra cứu dấu vết tài sản

Version 0.1.0 · IMPLEMENTATION

Sửa lỗi khởi động: đăng ký RPC bằng named wrapper linkedRpc_admin_asset_trace; Nakama không nhận closure được trả trực tiếp từ accountGuardedRpc. Đã build và khởi động local thật, container healthy và healthcheck HTTP 200. Thêm kiểm tra packaging cho lỗi đăng ký này. Chưa coi API nghiệp vụ đã nghiệm thu đầy đủ.

RPC admin_asset_trace: chỉ CONFIG_ADMIN_USER_ID, kiểm tra server-side trước đọc DB. Request: user_id UUID, server_id, generation nguyên dương, source=item_request|mail_claim, cursor key mặc định rỗng, limit 1..30 mặc định 20. Response success, records gồm reference, at, fingerprint (request) hoặc source_type (mail), asset_changes, next_cursor. Dữ liệu cũ có thể thiếu asset_changes; không suy ra số dư quá khứ. Query theo account/collection/prefix key, sắp key và phân trang; không là thứ tự thời gian. Không trả raw payload hay dữ liệu nhận dạng. Không mutation hoặc offline fallback. API đọc dấu vết hiện có, không chứng minh đầy đủ ledger.
