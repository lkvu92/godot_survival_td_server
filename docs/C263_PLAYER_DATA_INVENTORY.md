# C263 — Kiểm kê nguồn trích xuất

Trạng thái: IN_PROGRESS, đọc mã nguồn ngày 04/11/2026; chưa đối soát dữ liệu production.

| Dataset | Nguồn hiện xác định | Giới hạn cần xử lý |
|---|---|---|
| account | `users`, `account_identity_deletions` | User bị archive có tombstone; phải phân biệt trạng thái hiện tại và lịch sử; không xuất credential. |
| identity | Nakama storage `player_compliance_profiles/profile` | Profile live có thể bị archive; identity archive được mã hóa, không mặc định giải mã hoặc đọc raw. Kiểm kê từng trường và quyền trước khi hỗ trợ. |
| playtime | `compliance_playtime` theo user/game/day | Đơn vị giây, có lease; cần xử lý lease trong ngày đang chạy và xác định coverage. Cleanup C232 có thể xóa. |
| activity | `player_health_activity` | Khóa chính chỉ user_id; heartbeat cập nhật `day`, vì vậy bảng chỉ lưu ngày hiện tại, không phải lịch sử các ngày. |
| inventory | `player_characters`; storage `player_inventory/items`, key theo server/generation | Là snapshot hiện tại; phải xử lý legacy và biến thể key, không suy ra lịch sử. Cleanup có thể xóa. |
| asset_history | `player_item_requests`, `player_mail_deliveries` và các nguồn ledger khác | Chỉ bao phủ một số đường thay đổi; chưa có ledger đầy đủ cho mọi lần tiêu/nhận. |
| payments | `monetization_purchase_orders`, `monetization_purchases`, `payment_financial_records`, `payment_financial_snapshots` | Amount verified có thể null; purchase legacy có thể thiếu order. Không xuất purchase token hash, receipt, failure_reason, provider raw. Không dùng giá catalog làm giá lịch sử. |

C232 v3.4 đã thay đổi mã để vô hiệu hóa cleanup gameplay theo lịch sau archive; migration SQL cần được áp dụng cùng service mới. Các bản trước có thể xóa `compliance_playtime`, `player_health_activity`, `player_characters` và storage theo subject. Dữ liệu đã bị xóa không tự khôi phục. Không kết luận retention đầy đủ từ test local; đánh giá legal và deployment trước khi vận hành.

Migration audit chuẩn bị tại `server/tools/sql/c263_player_data_access.sql`, chưa áp dụng, chưa có RPC/UI. Sử dụng quyền admin hiện có; phân quyền chi tiết để sau. Audit độc lập cần triển khai theo môi trường.
