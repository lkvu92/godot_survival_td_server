# Kế hoạch tổng thể: xác minh email, đăng nhập Google và xóa tài khoản

Ngày: 27/10/2026 · Cập nhật 28/10/2026: đã triển khai mã nguồn theo C232; xem [kết quả kiểm tra và cấu hình còn thiếu](C232_ACCOUNT_IDENTITY_VALIDATION.md). Chưa bật production; Gmail SMTP local đang trả EAUTH 535.

Tài liệu này là kế hoạch điều phối hiện hành. `ACCOUNT_DELETION_PLAN.md` tiếp tục mô tả cleanup/job; phần xác minh email khi xóa được thay bằng link theo quyết định dưới đây. Không dùng OTP.

## 1. Quyết định đã thống nhất

| Trường hợp | Hành vi |
|---|---|
| Đăng ký bằng email, kể cả tự nhập `@gmail.com` | Bắt buộc xác nhận qua link gửi tới hộp thư trước khi tạo tài khoản chính thức. |
| Đăng nhập bằng nút Google | Không gửi link email bổ sung. Backend xác thực Google token và chủ thể Google. |
| Đăng nhập email sau khi đã xác minh | Email + mật khẩu như hiện tại, không gửi link mỗi lần đăng nhập. |
| Xóa account bằng phương thức email | Phiên đăng nhập hợp lệ + link xác nhận xóa mới, sau đó bấm “Xóa vĩnh viễn”. |
| Xóa account bằng phương thức Google | Phiên hợp lệ + xác thực Google lại + đối chiếu cùng account + xác nhận xóa. |
| Account chỉ dùng thiết bị/mất quyền truy cập | Đường yêu cầu hỗ trợ tại `admin@lkvustudio.com`, xác minh thủ công; không coi email mới nhập/device ID là đủ bằng chứng. |

Xóa toàn bộ account game trên mọi server. Không xóa Google account, không tự hoàn tiền, không tự chuyển quyền lợi sang account mới. Link email không phải cơ chế đăng nhập không mật khẩu trong phạm vi đợt này.

## 2. Hiện trạng và thành phần cần thay đổi

- `client/src/services/AuthService.gd::register_email()` đang gọi `authenticate_email_async(..., true)` và đăng nhập ngay. Phải thay bằng yêu cầu gửi link; không gọi tạo account trước khi xác minh.
- `server/nakama/data/modules/account_link.ts` đã có before/after auth, session generation, kiểm tra Google proof và account-link lease. Tích hợp thêm guard trong chuỗi hook hiện có, không ghi đè làm mất single-login/password-setup.
- `main.ts` đăng ký email/Google hook và RPC; Docker đang cấu hình Nakama 3.24.2. Kiểm thử trên đúng phiên bản, không giả định tính năng chỉ có ở bản mới.
- `server/services/monetization-verifier/` là service riêng cho thanh toán/quảng cáo. Đề xuất thêm `server/services/account-identity/`, không trộn nhiệm vụ xác minh tài khoản vào verifier hiện tại.
- Chưa thấy service gửi email trong nguồn đã kiểm tra. Địa chỉ liên hệ `admin@lkvustudio.com` không đồng nghĩa đã có SMTP/API có thể gửi thư.
- Public policy/delete-account hiện là static HTML; trang xác nhận có thao tác cần service HTTPS hoạt động thật, không chỉ sửa HTML.

## 3. Đăng ký email mới

1. App nhập email → `POST /account/registration/request`. Chưa hỏi/lưu mật khẩu ở giai đoạn này. Response chung để hạn chế dò email tồn tại.
2. Backend normalize theo quy tắc nhất quán với Nakama; không tự gộp Gmail theo dấu chấm hoặc bỏ phần `+tag`. Giới hạn kích thước/định dạng, áp rate limit và ghi yêu cầu pending có TTL.
3. Mail worker gửi link HTTPS tới chính email pending. Email nêu tên game, mục đích, hạn link và hướng dẫn bỏ qua nếu không yêu cầu.
4. GET link chỉ mở trang, không tạo user và không tiêu thụ token. Người nhận chủ động nhập tên đăng nhập, mật khẩu và xác nhận trên trang web.
5. POST hoàn tất: kiểm tra token/purpose/TTL, consume atomically, tạo account bằng API Nakama được hỗ trợ và ghi bằng chứng xác minh. Mật khẩu chỉ đi qua HTTPS trong request xử lý, không vào pending/outbox/log/analytics.
6. Trang thông báo đăng ký hoàn tất → quay lại app đăng nhập email + mật khẩu bằng `create=false`. MVP không cấp session game trên URL, không cần deep link.
7. Nếu tên đã dùng, cho sửa và thử lại; chỉ tiêu thụ token theo cơ chế có thể phục hồi khi tạo account thất bại, không để mất link vì lỗi tạm thời.

Account creation và identity DB không nhất thiết là một transaction: dùng intent idempotent + trạng thái `pending/creating/completed/failed`, checkpoint và reconciler. User đã được tạo nhưng chưa ghi verification sẽ bị gate chặn cho tới khi reconcile thành công. Không tạo lại với mật khẩu mới khi retry intent cũ; không “nhận vơ” account đã tồn tại do race Google/email.

### 3.1. Hai người yêu cầu đăng ký cùng email

Email pending không thuộc về người gửi yêu cầu và không được giữ chỗ. TTL 15 phút là hạn của từng link, không phải thời gian khóa địa chỉ email.

| Tình huống | Hành vi bắt buộc |
|---|---|
| A yêu cầu, chưa xác minh; B yêu cầu cùng email trong 15 phút | Cho tiếp nhận yêu cầu B theo rate limit; không trả lỗi email đã đăng ký chỉ vì có pending A. Chỉ gửi link đến cùng hộp thư đó. |
| B yêu cầu sau khi link A hết 15 phút | Cho yêu cầu link mới; pending/link hết hạn không ngăn đăng ký. |
| Yêu cầu B đang trong cooldown hoặc vượt hạn gửi | Trả trạng thái chung và thời gian thử lại phù hợp, không cấp quyền ưu tiên cho A hoặc giữ chỗ email. Link hợp lệ đã gửi vẫn dùng được. |
| Nhiều link còn hạn cho cùng email | Cho cùng tồn tại trong giới hạn đề xuất tối đa 5 link chưa dùng; yêu cầu mới không tự vô hiệu link cũ. Hết quota thì không phát thêm link, không đẩy bỏ link đang hợp lệ; dọn link hết hạn để giải phóng quota. |
| Một link được hoàn tất hợp lệ | Tạo duy nhất một account, ghi verification và vô hiệu mọi link đăng ký còn lại của email khi creation được xác nhận thành công. |
| Email đã có account hoàn tất | Không tạo account thứ hai và không đổi mật khẩu bằng link đăng ký; hướng dẫn đăng nhập qua thông báo phù hợp, public request vẫn tránh lộ tồn tại account. |

Mỗi link đăng ký gắn với email và purpose, không mang mật khẩu/tên người chơi do bên yêu cầu khai trước. Người nhận link tự đặt credential ở bước hoàn tất. B không có quyền truy cập hộp thư sẽ không hoàn tất được dù gửi yêu cầu trước hay sau A.

Race handling: khóa/claim theo canonical email và ràng buộc uniqueness account, không chỉ theo từng token. Chỉ một intent được chuyển sang `creating`; các intent cạnh tranh không được tạo user, ghi đè credential hoặc vô hiệu intent đang xử lý. Nếu creation treo/crash, reconciler tiếp tục hoặc giải phóng claim theo kết quả thực tế; không giữ email vĩnh viễn. Trong thời gian xử lý chưa rõ kết quả, trả trạng thái retry thay vì cho intent khác tạo tiếp. Sau thành công, request thua có thể báo đã hoàn tất/đề nghị đăng nhập khi đủ bằng chứng, không trả session hoặc dữ liệu account mới cho bên yêu cầu khác.

## 4. Google, email và liên kết danh tính

- Dùng Google `sub`/provider ID làm khóa chủ thể; không dùng email làm khóa merge. Kiểm tra chữ ký, issuer, audience allowlist, expiry và nonce nếu luồng có phát nonce. Chỉ decode JWT là không đủ.
- Đăng nhập Google không cần thêm thư xác nhận. Việc coi địa chỉ email cụ thể là đã xác minh cần claims/độ tin cậy phù hợp; không tự gán `verified=true` chỉ vì account có Google ID.
- Google dùng email ngoài Gmail/Workspace không mặc nhiên chứng minh quyền sở hữu hiện tại của hộp thư bên thứ ba cho mọi hành động. Khi cần xác minh email độc lập/thiết lập email credential mới, kiểm tra claims và chính sách provider; gửi link khi chưa đủ căn cứ.
- Xác thực Google lại khi xóa phải có credential mới theo giới hạn freshness đã chốt; không chỉ tái sử dụng ID token cache còn hạn. Đối chiếu đúng provider/account, không cho nhầm Google dẫn tới xóa account khác.
- Khi email đang có account mà Google đăng nhập cùng địa chỉ: giữ workflow liên kết/conflict hiện hữu, yêu cầu proof phù hợp cho các phía. Không auto-merge theo chuỗi email.
- Đổi/link email và setup mật khẩu phải đi qua cùng chính sách verification. Vô hiệu token theo identity revision khi email/password/provider đổi; không để link cũ áp dụng cho danh tính mới.

## 5. Tài khoản email cũ chưa xác minh

- Migration ghi trạng thái rõ: `verified`, `legacy_unverified`, nguồn bằng chứng và mốc xác minh. Không đánh dấu tất cả account cũ là verified.
- Không phá login hàng loạt khi chưa có phương án hỗ trợ. Đề xuất cho account cũ đăng nhập bằng credential hiện tại vào màn hình xác minh hạn chế; chặn gameplay/mutation nhạy cảm cho tới xác minh, không auto-login vào trận.
- Gửi link cho account cũ phải gắn với phiên đã xác thực, user ID và identity revision; hoàn tất yêu cầu cả bằng chứng phiên khởi tạo hoặc đăng nhập lại credential hiện tại. Chỉ sở hữu hộp thư không được tự động đổi mật khẩu/chiếm account legacy đang tồn tại.
- Người sở hữu email nhưng không có credential account cũ: chuyển hỗ trợ xử lý xung đột; không dùng đăng ký mới hoặc nút resend làm reset password ngầm.
- Đối soát account Google/password hiện hữu: chỉ xác nhận dựa trên bằng chứng hợp lệ đã có, không suy diễn từ đuôi email.
- Nếu chính sách chuyển đổi gây user kẹt, hỗ trợ xác minh/giải quyết trước; không có fallback cho qua chưa xác minh. Chốt thông báo và lộ trình phát hành trước khi bật gate production.

## 6. Link xác nhận và gửi thư

Đề xuất mặc định: token CSPRNG ít nhất 32 byte, TTL 15 phút; cooldown gửi lại 60 giây, tối đa 5 email/giờ/địa chỉ cùng giới hạn account/IP/toàn hệ thống (điều chỉnh theo thực tế). Riêng `register_email`, áp dụng nhiều link còn hiệu lực có giới hạn theo mục 3.1; gửi lại không vô hiệu link trước. Với purpose nhạy cảm khác, quy tắc thay thế link phải gắn đúng account/session/revision và chốt trong contract, không áp dụng cơ chế đăng ký một cách máy móc. Không khóa cứng account chỉ vì người khác spam yêu cầu.

- Purpose tách biệt: `register_email`, `verify_legacy_email`, `change_email`, `delete_account`; token mục đích này không dùng cho mục đích khác. `password_reset` để đợt riêng, không xuất hiện như chức năng đã có.
- Lưu hash token, scope/account/intent, revision, issued/expiry/consumed/revoked; quyền đọc chỉ backend. Không lưu token thô trong bảng challenge.
- Mail outbox cần nội dung gửi lại: giữ token thô chỉ ở payload được mã hóa với TTL ngắn, khóa ngoài DB; xóa/redact sau gửi/hết hạn. Không ghi token trong log, error tracker hoặc webhook. Reconciler không sinh ra link đã bị vô hiệu rồi gửi nhầm.
- HTTPS, domain cấu hình cố định/allowlist, không lấy Host tùy ý để dựng URL. Ưu tiên token trong fragment rồi POST từ trang; nếu phải dùng query phải redact log mọi tầng. Không tải script/analytics/font bên thứ ba trên trang chứa token. Dùng `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, CSP và chống CSRF/login-session confusion phù hợp.
- GET/HEAD/prefetch/email scanner không tiêu thụ token. POST xác nhận phải kiểm tra đầy đủ; mở link xem trước không chứng minh user đã chủ động chấp thuận xóa.
- Cần provider transactional email bằng API hoặc SMTP; chọn theo dịch vụ thực tế đang dùng, không giả định nhà cung cấp. Sender đề xuất `no-reply@lkvustudio.com`, Reply-To `admin@lkvustudio.com`; sender là đề xuất, chưa xác nhận tồn tại.
- Cấu hình domain SPF/DKIM, DMARC theo nhà cung cấp, bounce/suppression, retry/backoff, timeout, delivery monitoring. Không gửi thư đăng ký vào danh sách marketing.

## 7. Service, endpoint và quyền nội bộ

| Endpoint đề xuất | Quyền và hành vi |
|---|---|
| `POST /account/registration/request` | Public có rate limit, enqueue email, response chung. |
| `GET /account/confirm` | Trang hiển thị, không mutation. |
| `POST /account/registration/complete` | Token purpose registration + mật khẩu/tên, idempotent, không trả session trong URL. |
| `POST /account/email-verification/request` | Session Nakama hợp lệ, đúng account legacy, rate limit. |
| `POST /account/email-verification/complete` | Token + proof phiên/account đúng, không tạo account khác. |
| `POST /account/deletion/request` | Phiên hợp lệ, phát link cho email đã xác minh hoặc bắt đầu Google reauth. |
| `POST /account/deletion/confirm` | Proof đúng purpose + xác nhận cuối + request ID; tạo deletion job. |
| `GET /account/deletion/status` | Biên nhận entropy cao, response tối thiểu; không tra cứu bằng email/user ID. |

Tên và ranh giới HTTP/RPC chốt trong contract. Public browser chỉ gọi account-identity; service gọi RPC nội bộ authenticated bằng credential riêng giới hạn quyền. Không nhúng Nakama HTTP key/admin key/email API key vào client hoặc website; Nakama server key nhúng app không phải bí mật có thể dùng làm bằng chứng verification.

Email auth hooks phải chặn đường `create=true` chưa qua intent, đồng thời guard login/refresh/bootstrap/mutation cho account chưa verified hoặc đang xóa. Guard LinkEmail/UpdateAccount/Google setup/merge và client self-delete endpoint theo cùng policy. Kiểm chứng internal runtime API có gọi hooks hay không trên 3.24.2; không thiết kế bypass bằng client-controlled `vars.verified=true`.

Đảm bảo single-login generation chỉ được đổi khi login chủ động: thao tác backend xác minh không vô tình đá phiên hoặc tạo session chơi game mới.

## 8. Xóa tài khoản

- Menu account → lấy preview mọi server/quyền lợi → xác minh Google lại hoặc gửi link email → trang cảnh báo → nhập `XOA`, bấm “Xóa vĩnh viễn”. Không xóa ngay khi mở email.
- Email deletion request do phiên khởi tạo; link gắn account/session revision, phải phối hợp xác nhận của phiên hoặc đăng nhập lại credential ở bước cuối. Người không đăng nhập được dùng kênh support riêng, không nới gate này bằng email mới nhập.
- Sau xác nhận, backend nhận job bền vững, khóa account theo cơ chế lease và chặn request/callback/worker mới. Client đóng realtime, clear token/state, về login. Chỉ báo hoàn tất khi cleanup đã đối soát.
- Cleanup/account deletion/retry/backup restore theo `ACCOUNT_DELETION_PLAN.md`: mọi server/generation, SQL riêng, storage system-owned, leaderboard theo owner thực tế, archive/alias sau merge; không xóa nhầm người có liên hệ lịch sử.
- IAP/SSV/RTDN đến muộn không tạo lại account hoặc thưởng. Chỉ giữ record chống replay/nghĩa vụ có căn cứ, tối thiểu hóa và công bố retention. Phân biệt xóa account với cancel subscription/refund; rà soát sản phẩm hiện có trước khi hiển thị hướng dẫn.
- Dùng recorded deletion của Nakama sau khi test API/cascade thực tế. Job tồn tại độc lập, có checkpoint/retry/manual review. Restore backup phải áp lại tombstone trước mở dịch vụ.

## 9. Docs, giao diện và migration

Đầu tiên tạo contract chính thức có ID còn trống, version/changelog, schema/API/error/online-only; cập nhật registry và index theo AGENTS. Kế hoạch này chưa thay thế contract triển khai.

Giao diện theo UiSkin: đăng ký email, màn hình “Kiểm tra hộp thư”, resend/countdown, trạng thái đã xác minh, hết hạn/link cũ, lỗi mail, tài khoản legacy cần xác minh, Google conflict, confirm/delete progress. Không hiển thị “Đã gửi” nếu chưa tiếp nhận được yêu cầu; queued không có nghĩa đã vào inbox. Không cần deep link ở MVP, hỗ trợ bấm link trên máy khác.

Policy hiện tại phải bổ sung provider gửi mail, metadata gửi/delivery, purpose và retention thực tế; không công bố tính năng chưa release. Publish cả policy/deletion page cùng service confirm trên HTTPS, nhập URL thật vào Play/AdMob. Email support vẫn hoạt động khi user đã gỡ game.

Migration additive + feature flag riêng cho registration/legacy gate/deletion. Không giữ cờ fallback cho phép tạo email account chưa verified. Khi mail/provider lỗi, trả retry/support; không tự bỏ qua xác minh. Client cũ được hướng dẫn cập nhật khi gọi đăng ký cũ; tránh chặn login account đã hợp lệ.

## 10. Thứ tự thực hiện và điều kiện hoàn tất

| Giai đoạn | Deliverable và nghiệm thu |
|---|---|
| 1. Contract + kiểm kê | Chốt state machine, data map, legacy/conflict, API/error, retention và UI. |
| 2. Hạ tầng mail | Provider/sender/domain, TLS/DNS, sandbox test delivery/bounce/retry; không cần gửi email người thật để test. |
| 3. Identity backend | Migration, challenge/outbox, account-identity, hooks/gates, Google proof; build trên runtime 3.24.2. |
| 4. Client + web | Đăng ký mới, legacy verification, confirm pages, account menu và support; không lộ key/token. |
| 5. Deletion | Job/cleanup/admin support/callback guard, client logout, đối soát và restore runbook. |
| 6. Staging | E2E, security/concurrency/failure tests, bộ static/build cần thiết; báo riêng lỗi có sẵn. |
| 7. Release | Backend additive trước, client tương thích, canary/metrics rồi bật enforcement; policy và console declaration đồng bộ. |

Test trọng tâm:

- API đăng ký trực tiếp, link/update email, self-delete và client forged vars không vượt verification.
- Link sai/hết hạn/đã dùng/sai purpose, resend/replay, hai POST đồng thời, GET scanner/prefetch.
- A/B cùng email trong và sau 15 phút: không giữ chỗ email; cooldown/quota không vô hiệu link hợp lệ; hai link hoàn tất đồng thời chỉ một account/credential được tạo; link còn lại không đổi được mật khẩu. Test crash ở trạng thái `creating`, reconcile và giải phóng claim khi thất bại, không để pending khóa email vĩnh viễn.
- Email không tồn tại/đã có/legacy/Google cùng email không lộ danh tính hoặc chiếm account.
- Google token sai aud/iss/sub, token cache cũ, nhầm account; không phá single-login generation.
- Crash giữa consume/create/verification, mail gửi trùng, callback provider sai chữ ký, mất mạng sau commit, password/token không vào logs.
- Dùng browser/thiết bị khác, email legacy không có credential, support device-only, client cũ.
- Xóa nhiều server, hai thiết bị, merge/IAP/SSV đồng thời, callback sau xóa, receipt replay, retry và backup restore.

Metrics không chứa PII/token: số request/sent/bounce/verified/expired, lỗi tạo account/reconcile, gate failures, deletion backlog/completion/retry. Có alert cho provider lỗi, job kẹt, mail abuse và registration orphan. Rollback về maintenance/retry khi cần, không mở lại đường bỏ qua xác minh; không tái tạo account đã xóa.

## 11. Thông tin cần chốt ở bước hạ tầng

Chưa cần để duyệt thiết kế; cần trước khi gửi mail thật:

- Nhà cung cấp SMTP/API đang dùng, quyền cấu hình DNS `lkvustudio.com`, sender được phép gửi.
- Host public cho confirm pages/service (đề xuất cùng `api.lkvustudio.com` với route riêng; xác nhận reverse proxy/TLS trước triển khai).
- Lịch retention/log/backup và người xử lý hỗ trợ/xung đột/deletion job lỗi.
- Ngưỡng rate limit thực tế, chính sách rollout legacy và thông báo cho người chơi.

## 12. Tham khảo

- [Nakama auth hooks](https://heroiclabs.com/docs/nakama/server-framework/introduction/hooks/): tích hợp trước/sau auth, đối soát signature theo bản đang chạy.
- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect): xác minh ID token, dùng `sub` thay email làm khóa danh tính.
- [Google server-side verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token): kiểm tra authority của email, đặc biệt địa chỉ ngoài Gmail/Workspace.
- [OWASP token flow guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html): áp dụng nguyên tắc token an toàn, TTL/single-use, chống enumeration/referrer leakage; không triển khai password reset trong đợt này.
- [Google Play account deletion](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en): đường trong app và web, dữ liệu liên quan và ngoại lệ lưu giữ.
