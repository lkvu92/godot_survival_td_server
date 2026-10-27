# Kế hoạch xóa tài khoản — Thông Thiên Lộ

Ngày: 27/10/2026 · Cập nhật 28/10/2026: thiết kế đã được triển khai trong mã nguồn C232; [báo cáo kiểm tra](C232_ACCOUNT_IDENTITY_VALIDATION.md). Chưa bật production.

**Cập nhật quyết định:** xem [kế hoạch tổng thể](ACCOUNT_IDENTITY_AND_DELETION_PLAN.md). Xác minh email dùng link, không OTP; bước proof email khi xóa bên dưới được thay bằng link riêng gắn phiên/tài khoản và xác nhận cuối. Google vẫn xác thực lại, không gửi thêm link email.

## 1. Phạm vi và quyết định đề xuất

- Xóa tài khoản game cùng dữ liệu liên quan trên **tất cả server**, không chỉ nhân vật đang chọn. Không xóa tài khoản Google của người dùng.
- Có đường yêu cầu rõ ràng trong app và trang web ngoài app; hỗ trợ qua `admin@lkvustudio.com` khi không đăng nhập được.
- Đề xuất xác minh và xác nhận xong thì xử lý ngay bằng job bền vững, không áp dụng thời gian chờ nhiều ngày. Hộp thoại cần nói rõ thao tác không thể hoàn tác. Đây là lựa chọn sản phẩm đề xuất, không phải thời hạn pháp luật.
- Không tự động hoàn tiền, chuyển vật phẩm hay khôi phục quyền lợi sang tài khoản mới. Hiển thị tác động đến VIP/no-ads/nội dung mua; xác định sản phẩm có subscription đang hoạt động hay không trước khi viết hướng dẫn hủy.
- Không triển khai chức năng xóa riêng một nhân vật trong cùng đợt này.

## 2. Hiện trạng đã kiểm tra

- Backend đặt tại `nakama/data/modules/`, Docker cấu hình Nakama `3.24.2`; cần kiểm thử API/hook trên đúng phiên bản này.
- `account_link.ts`: bảng `player_login_sessions`, `account_link_state`, `account_link_intents`, `account_link_archives`, `account_link_server_tasks`; có khóa/lease điều phối RPC và chuyển quyền sở hữu khi liên kết tài khoản.
- `server_context.ts` và `character_repository.ts`: `player_characters`, `player_server_preferences`, storage theo tài khoản với key phân vùng server/generation. Xóa theo server đang chọn sẽ bỏ sót dữ liệu.
- Có hệ thống IAP, rewarded ads, callback SSV/RTDN, bảng xếp hạng và worker nền. Phải ngăn callback/job tái tạo dữ liệu sau xóa.
- Client có `AuthService.gd`, `NakamaClient.gd`, cơ chế generation/session và logout; `MainMenu.gd` có lối vào quyền riêng tư quảng cáo nhưng chưa tìm thấy luồng xóa tài khoản.
- Trang ngoài app đã có nguồn tại `public/delete-account/`, dùng email hỗ trợ; hiện chưa xuất bản.

## 3. Luồng người dùng

1. Menu tài khoản/cài đặt → **Xóa tài khoản**. Giữ lối vào dễ tìm; thêm liên kết hỗ trợ xóa tại màn hình đăng nhập cho người mất quyền truy cập.
2. Server trả bản tóm tắt: tài khoản, số server/nhân vật bị ảnh hưởng, quyền lợi mua còn hiệu lực và cảnh báo mất dữ liệu. Không đưa bí mật xác thực hoặc purchase token vào response.
3. Người dùng xác minh lại quyền sở hữu:
   - Google: lấy ID token mới, backend xác minh và đối chiếu đúng tài khoản hiện tại; không tạo hoặc liên kết tài khoản khác trong bước xác minh.
   - Email/mật khẩu: xác minh lại mật khẩu phía server; không lưu hoặc ghi log mật khẩu.
   - Chỉ đăng nhập thiết bị: không coi device ID là bằng chứng mới. MVP chuyển sang yêu cầu hỗ trợ xác minh thủ công; không ép liên kết Google để được yêu cầu xóa. Nếu bổ sung OTP sau này phải có dịch vụ gửi mail và chống lạm dụng thực tế.
4. Hiện phạm vi tất cả server, tác động đến mua hàng và checkbox xác nhận; nhập `XOA` rồi bấm **Xóa vĩnh viễn**. Chuỗi xác nhận chỉ chống bấm nhầm, không thay thế xác minh.
5. Server ghi nhận job bền vững, trả mã yêu cầu. Client ngừng gameplay, đóng realtime, xóa token và state riêng của tài khoản, về đăng nhập. Hiển thị “Đã tiếp nhận yêu cầu xóa” khi job chưa hoàn tất; chỉ nói “Đã xóa” sau trạng thái hoàn tất.
6. Mất mạng không được xem là thành công. Nếu mất response sau khi server nhận, kiểm tra lại mã yêu cầu, không tạo job trùng; không cho tiếp tục mutation khi tài khoản đang xóa.

## 4. Contract và API đề xuất

Trước code: tạo contract mới với ID còn trống, SemVer/changelog; cập nhật registry/index theo quy trình repo. Định nghĩa schema, lỗi, UI và online-only. Không chiếm trước ID khi chưa đối soát registry tại thời điểm triển khai.

| RPC | Nội dung |
|---|---|
| `get_account_deletion_preview` | Auth bắt buộc, lấy chủ thể từ `ctx.userId`; trả phạm vi và phương thức xác minh được phép. |
| `prepare_account_deletion` | Kiểm tra proof mới; tạo ticket ngắn hạn, một lần, gắn user/session generation và version bản tóm tắt. |
| `confirm_account_deletion` | Nhận ticket + request ID + xác nhận phạm vi; tiêu thụ ticket atomically, tạo job duy nhất và khóa tài khoản. |

Không nhận user ID do client chọn để quyết định tài khoản bị xóa. Ticket lưu dạng hash, hết hạn cấu hình (đề xuất 5 phút), bị vô hiệu khi đổi mật khẩu/liên kết/session generation. Không log proof/ticket/mật khẩu. Giới hạn tốc độ và số lần sai theo tài khoản/IP với chính sách phù hợp.

Trạng thái nội bộ: `queued → processing → completed`, lỗi tạm thời → `retrying`, lỗi cần can thiệp → `manual_review`. Không được coi việc khóa đăng nhập là đã hoàn tất xóa dữ liệu.

Vì phiên game bị thu hồi, biên nhận cần cách tra cứu độc lập: capability ngẫu nhiên entropy cao, lưu hash phía server, có hạn, response chỉ gồm trạng thái tổng quát không có PII; hoặc hỗ trợ tra cứu qua email đã xác minh. Chốt một phương án trong contract, không tạo endpoint cho phép dò user ID/email.

## 5. Xử lý backend và dữ liệu

1. Lập ma trận đầy đủ từ migration/schema/code: bảng, storage collection, owner/reference, dữ liệu nhúng JSON, cleanup strategy, ngoại lệ và thời hạn. Các tên bảng nêu trong tài liệu này là đầu mối kiểm kê, không phải danh sách đầy đủ.
2. Khóa theo account và phối hợp cơ chế account-link lease hiện có; chờ/drain request đang chạy. Chặn login/refresh/mutation, link/unlink/merge và worker của tài khoản khi job được nhận. Kiểm tra endpoint Nakama trực tiếp và hook trước xóa để không bỏ qua workflow.
3. Tạo snapshot ID cần dọn (không snapshot toàn bộ PII), bao gồm mọi server/generation và alias tài khoản cũ sau merge. Không xóa dữ liệu tài khoản khác chỉ vì có quan hệ merge; xác định provenance/quyền sở hữu hiện tại.
4. Dọn storage sở hữu bởi user, nhân vật, preference, run đang chơi, inventory, mail, reward/session, intent/ticket; xử lý dữ liệu do system sở hữu có chứa user ID và bảng SQL riêng. Dọn cả leaderboard theo character owner ID nếu không phải account UUID, index/cache/notification liên quan.
5. Với IAP/SSV/RTDN: giữ tối thiểu dấu vết chống replay và hồ sơ có căn cứ lưu giữ; xóa/khử nhận dạng dữ liệu không cần thiết, xác định thời hạn và quyền truy cập. Callback đến muộn không cấp lại đồ hoặc tạo account/storage mới. Không mặc định giữ tất cả dữ liệu thanh toán mãi mãi.
6. Gọi API xóa account được hỗ trợ bởi Nakama, dự kiến `nk.accountDeleteId(userId, true)` sau khi đối soát signature và hành vi trên 3.24.2; không dùng SQL DELETE trực tiếp thay thế cơ chế Nakama. Kiểm tra chính xác cascade storage/session/leaderboard/IAP thay vì giả định.
7. Job/audit cần tồn tại độc lập với storage của tài khoản bị xóa; đánh dấu từng bước để retry an toàn. Nếu crash giữa SQL cleanup và Nakama delete, tiếp tục từ checkpoint. Account không còn tồn tại được coi là bước đã hoàn tất, không làm cả job thất bại.
8. Đối soát không còn dữ liệu ngoài các ngoại lệ đã công bố, đánh dấu hoàn tất và gửi thông báo nếu có kênh đã xác minh. Audit tối thiểu, không chứa credentials/đống PII; định nghĩa vòng đời cho audit và deletion tombstone.
9. Runbook backup restore: áp lại recorded deletion/tombstone trước khi mở truy cập, tránh khôi phục người đã yêu cầu xóa. Backup retention phải có lịch thực tế rồi cập nhật policy tương ứng.

Không hứa một transaction bao trùm SQL tùy chỉnh, Nakama API và hệ thống ngoài. Dùng job có checkpoint, retry/idempotency và hàng đợi xử lý lỗi; chỉ báo hoàn tất sau đối soát.

## 6. Website, hỗ trợ và tài liệu

- Giữ trang công khai Việt–Anh với email `admin@lkvustudio.com`, không buộc cài game lại. Quy trình support tạo cùng loại deletion job sau xác minh, không chạy SQL thủ công rời rạc.
- Thao tác support/admin cần quyền riêng, audit và đối chiếu chủ tài khoản; không chấp nhận ảnh chụp/tên nhân vật đơn lẻ làm bằng chứng đủ.
- Cập nhật privacy policy theo cách thực sự đã triển khai: dữ liệu bị xóa, ngoại lệ, lịch lưu giữ/thời gian xử lý khi được chốt; không viết trước cam kết chưa có khả năng thực hiện.
- Xuất bản HTTPS, xác minh đường dẫn không cần đăng nhập; khai báo link xóa trong Play Console và policy URL trong AdMob/Play. Website static hiện tại chỉ nhận yêu cầu qua email, không phải form đã kết nối backend.

## 7. Thứ tự triển khai và nghiệm thu

| Đợt | Kết quả cần đạt |
|---|---|
| 1 — Docs | Contract/registry/index, ma trận dữ liệu và chính sách retention; thiết kế UI/proof/job/error rõ ràng. |
| 2 — Backend | Migration, ticket/proof, account gate, job + worker + cleanup, công cụ support và backup runbook; build runtime sạch. |
| 3 — Client | Service/API, dialog theo UiSkin, xác minh Google/password, hỗ trợ device-only, xóa phiên/state và xử lý kết quả mạng không rõ ràng. |
| 4 — Staging | Test end-to-end tài khoản tổng hợp nhiều server, receipt/callback giả lập và crash/retry; không thử xóa account production của người thật. |
| 5 — Release | Cập nhật policy/site và Play declaration, triển khai backend tương thích trước client; giám sát job fail và thời gian hoàn tất. |

Các ca nghiệm thu bắt buộc: sai/hết hạn/replay ticket; proof của account khác; client giả user ID; gọi trực tiếp API xóa; bấm hai lần; timeout sau commit; 2 thiết bị; phiên cũ sau xóa; link/merge/battle/IAP/SSV chạy đồng thời; account có nhiều server/generation; callback đến sau xóa; retry sau từng checkpoint; backup restore; tài khoản device-only; website gửi yêu cầu khi đã gỡ game. Xác nhận đăng nhập lại không phục hồi dữ liệu cũ; hành vi tạo account mới phải rõ ràng, không tự động chuyển receipt cũ thành thưởng mới.

Chạy backend build và static tests theo AGENTS; ghi rõ lỗi tồn tại từ trước nếu có. Nghiệm thu trên DB test với truy vấn đối soát trước/sau theo ma trận dữ liệu, không chỉ dựa vào UI thông báo thành công.

## 8. Nguồn tham khảo

- [Google Play — Account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en): đường yêu cầu trong app và web; hỗ trợ yêu cầu ngoài app, công bố ngoại lệ lưu giữ. Đường trong app có thể dẫn đến web theo chính sách; phương án này đề xuất trải nghiệm tích hợp để thuận tiện.
- [Nakama TypeScript runtime reference](https://heroiclabs.com/docs/nakama/server-framework/typescript-runtime/function-reference/): đối soát API account deletion với runtime đang cài.
- [Nakama console — recorded deletion](https://heroiclabs.com/docs/nakama/getting-started/console/): deletion record/tombstone phục vụ xử lý khi restore backup.
- [Nakama purchase validation](https://heroiclabs.com/docs/nakama/concepts/iap-validation/): hành vi purchase khi xóa account cần đối soát trong test, giữ chống receipt replay.
