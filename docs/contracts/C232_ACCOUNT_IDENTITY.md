# C232 — Verified email registration and account deletion

Version: 3.4.2 · Status: IN_PROGRESS · Updated: 2026-11-06

### Changelog 3.4.2 — web client base URL with /ttl

Optional `WEB_CLIENT_URL` is the HTTPS base URL for confirmation, receipt, restoration and policy links. Configure develop as `https://survival-td-web.truyen24h.workers.dev` and production as `https://lkvustudio.com/ttl`. It is distinct from `ACCOUNT_IDENTITY_PUBLIC_URL`, which remains the API origin and Origin-check authority. Mail action origin validation uses the validated web origin. When WEB_CLIENT_URL differs from API origin, known public confirmation/document GET/HEAD routes redirect there without setting a fragment; all POST/token/session rules remain unchanged. Without the variable, legacy API-host pages/links remain compatible. Configured values reject credentials, unsafe paths, query, fragments and insecure production HTTP. No schema/RPC changes or user mutation.

### Changelog 3.4.0 — giữ dữ liệu gameplay sau archive (2026-11-04)

Theo yêu cầu người dùng, archive không tự dọn gameplay, bao gồm thời gian chơi, nhân vật và tài sản. Tắt worker và chặn hàm SQL cleanup tự động kể cả khi cấu hình cũ bật; không lên lịch dọn mới. Hard delete user hoặc xóa server theo quy trình lifecycle riêng là các trường hợp được phép dọn dữ liệu tương ứng. Các đường đó và việc dọn toàn bộ bảng liên quan cần kiểm thử; không coi bản thay đổi này là đã xác minh cascade đầy đủ. Recovery checkpoint đã purge từ phiên bản cũ phải được xử lý riêng, không tự chạy lại hàm cleanup. Thời hạn lưu từng dataset và yêu cầu pháp lý vẫn cần rà soát. Thay đổi mã nguồn không tự cập nhật container hoặc SQL đã cài.


### Changelog 3.3.0 — email password reset (2026-11-04)

POST `/account/password-reset/request {email}` always returns a generic acknowledgement for valid email addresses. Only an active account with an existing password and verified matching email receives a 15-minute single-use link. POST `/account/password-reset/complete {token,password}` validates the new password, then locks the account and challenge, changes the bcrypt credential, revokes login generation, consumes all reset links, and marks the used challenge completed in one database transaction. A replay of the completed token acknowledges prior completion without applying another password; competing links cannot change it twice. Email scanners and GET never mutate. Account identity, verified email, password existence, deletion state, token expiry and archive gate are rechecked at commit. Google-only first password setup and administrator-approved deletion restoration remain separate. Missing network/config blocks the operation; never store plaintext passwords or tokens. Rate limits, encrypted mail outbox and token hashing follow C232. Scoped integration covers concurrency, retry, expiry, inactive accounts, session invalidation and SMTP/provider limits; production verification remains open.

### Changelog 3.2.0 — restoration requires administrator review (2026-11-04)

Fresh email/password or Google proof creates one pending restoration request per deletion job; it does not cancel deletion or enable login. The deletion receipt exposes restoration status without identity information. A privileged operator lists requests and approves or rejects with an auditable operator and case reference. Approval locks and rechecks the deletion job, deadline and current deleting-account state, then cancels deletion atomically; rejection leaves deletion unchanged. The existing deadline and archive policy remain in force: a request must be approved before the deadline, otherwise it expires. No public approval endpoint or offline fallback. This is a product policy, not a claimed legal mandate. Production and legal acceptance remain open.

### Changelog 3.1.0 — protected operations (2026-11-03)

C250 bổ sung restore gate cho auth/native/RPC và dịch vụ identity, keyring tương thích snapshot cũ, rotation có CAS, quyền DB theo chức năng, expiry có approval/hold/deadline và backup/restore đối chiếu checkpoint độc lập. Đã TESTED_SCOPED trên DB cô lập và triển khai local; expiry mặc định tắt. Runtime/identity local healthy, catalog config 71 xác thực 70 stages/1385 waves. Production IAM/MFA/offsite/expiry backup/RPO-RTO và Android/email thật còn mở. Thông tin “chưa có code/test backup, RBAC, expiry” trong các phiên bản lịch sử bên dưới được thay bằng kết quả scoped này; không đồng nghĩa production đã nghiệm thu. Runbook: `server/docs/ARCHIVE_RECOVERY_RUNBOOK.md` từ workspace.

## v3 — archive lifecycle core đã triển khai local

**v3.0.1 core IMPLEMENTED_LOCAL / TESTED_SCOPED; production/legal acceptance còn mở.** Confirmation → soft_deleted 14 ngày với reservation và fresh-proof restore → sau deadline archive transaction/saga commit: credentials bị thu hồi, reservation email/phone/provider và suất giám hộ được giải phóng, không còn đường restore → sau 3 tháng lịch từ archived_at, daily worker dọn gameplay theo stable user_id. Giữ user tối thiểu và billing/transaction theo dataset policy riêng; không giữ credential gốc hoặc raw PII vô hạn. Không accountDeleteId cascade khi các dataset cần giữ còn tồn tại.

Schema2 policy, archive_pending/failed/archived và dataset purge checkpoints, scoped hold, migration v2/legacy, backup ledger và status projection được định nghĩa tại [thiết kế kỹ thuật](../ACCOUNT_ARCHIVE_LIFECYCLE.md). Business policy chuẩn tại [B6 policy](../../../client/docs/standards/g2-registration/implementation/retention/B6/archive-policy.md). Secret không nằm trong policy; config thiếu/sai không được giải phóng danh tính hoặc purge. Receipt chỉ đọc trạng thái; archive completion khác gameplay deletion. Chỉ phát release sau acceptance/evidence v3; evidence v2.0 không chứng minh giai đoạn giữ gameplay 3 tháng.

Changelog 3.0.0 (2026-11-02, DESIGN): business-approved14-day restore period, identity release on archive commit,3-calendar-month gameplay retention, minimal user and separate financial retention. Core implementation tested on isolated Nakama/PostgreSQL and deployed locally; production acceptance pending.

### Changelog3.0.1 — implementation

Schema2 policy validated/snapshotted, native3.24.2 SQL adapter atomically archives/detaches/releases; no accountDeleteId. User tombstone and finance retained while gameplay is cleaned after3 calendar months by a daily persistent scheduler. Raw native storage/account/provider hooks and RPC guards reject deleted/archived/stale sessions. Snapshot/archive notices use encrypted outbox; key ID required; scoped host hold/retry has audit. Checkpoints are single-account DB transactions with rollback/retry, not a distributed API saga. No new reservation table: canonical profiles/bindings enforce ownership until atomic detach. Pending v2 jobs require review; destructive legacy worker disabled.

Archive creation trigger is confirmed_deletion with baseline6-month retention, not approved universal legal service-stop logic. No automatic identity/financial expiry, production RBAC/key recovery/backup drill or live Android/SMTP acceptance. Contract remains IN_PROGRESS for these items. See phase-v3 evidence in client registration docs.

## Baseline v2.0 đang chạy local — không phải hành vi đích v3

## Soft deletion v2 (supersedes immediate-deletion behavior below)

Confirmation with fresh ownership proof commits `soft_deleted`, `soft_deleted_at`, `restore_until` and a snapshot of `system.account_deletion`; initial policy is 14 days. Sessions are invalidated and account-link guards block mutations. Canonical users/email/google subject and activation phone profiles remain intact, reserving identity and guardian quota. No accountDeleteId before deadline. GET/email scanners never mutate. Notification email says pending deletion with exact deadline, not completed.

Public restoration request by email is generic/rate-limited; new single-use restore link plus current password is required. Google restoration uses a fresh ID token bound to the retained provider subject. Receipt grants status lookup only. Restore transaction locks job/account state and checks server NOW()<restore_until and soft_deleted; worker uses the same job lock and disallows restore once purge is authorized. Cancelled requests no longer block gameplay; history and receipts remain, new requests get new IDs. No identity merging or reassignment occurs on restore.

After deadline, service prepares encrypted retention archives for the verified activation profiles of the owner and aliases, using separate ACCOUNT_RETENTION_KEY. It records archive receipt/deadline and hard authorization only with valid policy/key and drained leases. Runtime rechecks deadline, version, authorization and hold before cleanup. Missing policy/key/legacy job => deferred/manual review, never immediate deletion. Archive content is inaccessible to public endpoints and is not automatically purged until a separately approved retention process. Backup expiry/restore drills remain incomplete; operational deletion must not claim physical erasure of every copy.

Policy: `{schema_version:1,revision,enabled,soft_delete_days:14,retention_calendar_months:6,operational_purge_enabled:true}`; constraints validated, no fallback on missing config. Post-acceptance deadlines are immutable snapshots. Schema adds v2 job timestamps/policy/archive authorization/hold, encrypted retention archive and notification outbox. `/account/restoration/request {email}`; `/account/action/complete {purpose:restore_account,token,password}`; `/account/restoration/google {id_token}`; `/account/deletion/status {receipt}` returns status, deadline and restore eligibility without PII. Support tooling follows the same policy, no immediate bypass.

Changelog 2.0.0: 14-day soft delete, identity reservation via canonical rows, proof-based restore and retention-gated operational purge. Local rollout/test evidence completed for scoped flow; production acceptance remains open.

## Behavior

Email registration requires an emailed single-use HTTPS link before setting a password/creating a Nakama user. Google sign-in retains provider authentication without additional email. Pending requests never reserve email; up to five valid registration links may coexist, each for 15 minutes. Resend cooldown 60s, five sends/hour/address plus hashed-IP limits. Successful creation invalidates remaining registration links. Email uniqueness plus serialized per-email creation prevents concurrent accounts or credential overwrite. Existing accounts are never claimed/reset through registration links.

Legacy email accounts log in to a restricted verification path with current credentials. Email confirmation is bound to that login generation; email ownership alone cannot take over an existing account. Google proof uses verified ID tokens, allowed audiences and stable provider subject, not matching email strings. Session replacement, email/link changes and deletion invalidate stale proofs. Device-only users retain a manual support request path.

## Components / schema

`account-identity` Node service owns encrypted mail outbox, SHA-256 challenges, persistent rate buckets and HTTP confirmation UI. PostgreSQL tables `account_identity_verifications(user_id,email,verified_at,source)`, `account_identity_challenges(id,token_hash,purpose,email,user_id,generation,expires_at,consumed_at,created_at)`, `account_identity_outbox(challenge_id,payload,status,attempts,next_attempt_at,lease_until)`, `account_identity_rates(bucket,count,expires_at)`, `account_identity_deletions(id,user_id,status,receipt_hash,attempts,updated_at)` and creation intents tracked by challenge plus a protected internal custom identifier, reconciled and unlinked after verification; verification row keeps creation_intent for safe retry. No password/token plaintext in DB/logs. Outbox token encrypted AES-256-GCM with env key, redacted after send/expiry.

Creation API uses a process-independent PostgreSQL advisory lock by email; runtime creation uses an internal intent marker and only sets verification for the account it actually created. Crash retry can reconcile that marker, never a preexisting unrelated user. No client session returned by browser completion.

## HTTP interfaces

- `POST /account/registration/request {email}` → `{success,message}` (HTTP 409 ACCOUNT_EXISTS for registered email; pending email remains unreserved).
- `GET /account/confirm` → static no-mutation HTML, token in fragment.
- `POST /account/registration/complete {token,username,password}` → `{success,message}`.
- `POST /account/action/request {purpose}` + Bearer Nakama session → verification/deletion email to account email; no client-selected target user.
- `POST /account/action/complete {token,password,confirmation}` → verify legacy with current password and session binding; deletion also requires `confirmation:"XOA"` and current password (link + account proof), returns receipt.
- `POST /account/deletion/google {id_token,confirmation}` + Bearer session → fresh Google proof bound to user plus random request_key, returns recoverable receipt.
- `POST /account/deletion/status {receipt}` → minimal job status, no PII.
- `POST /account/support/...`: no public auto-delete endpoint; manual support must verify and use controlled operator tooling.

Internal Nakama RPC `account_identity_bridge` requires both HTTP key and separate high-entropy `ACCOUNT_IDENTITY_SECRET`, supports create/reconcile, authenticate-session context, password proof, job execution and creation reconciliation. Private Google-proof endpoints verify allowed audience, subject and email authority before Google login/password setup; no extra mail for Gmail Google sign-in. Runtime never accepts client `vars.verified` as authority. User-facing `account_identity_status` and `account_identity_request` enable limited verification UI; all gameplay RPCs reject unverified email/deleting users. Direct create/link/update email and client direct delete blocked by hooks. Login `create=false` allowed only as restricted credential proof for legacy users.

## Deletion

Durable job acquires account-link state exclusively after active leases drain, blocks callbacks/mutations, removes all server-scoped data and custom SQL rows, removes identifying archive snapshots, minimizes purchase records to replay hashes/system owner, calls `accountDeleteId(userId,true)` and retries safely. Completion follows cleanup, never merely account disable. Failure stays blocked/manual review, no unverified fallback. Tombstones retained to reapply deletions after restore; no arbitrary promise of backup or financial retention duration. Receipt is random, hashed, no lookup by email.

## Security / environment

Secrets: `ACCOUNT_IDENTITY_SECRET`, `ACCOUNT_IDENTITY_OUTBOX_KEY` (64 hex), `SMTP_PASSWORD` (Gmail App Password); `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, STARTTLS mandatory, `SMTP_USER`, `SMTP_FROM`, `SMTP_REPLY_TO=admin@lkvustudio.com`. Domain/public URL allowlisted; Gmail sender must match account/authorized alias. Service does not trust X-Forwarded-For by default. HTTPS public, private Docker RPC. Env/runtime generator passes only bridge secret to Nakama, never SMTP password. No credentials committed, local `.env` ignored. Service refuses missing/weak keys or unsafe production URL.

Offline: registration/verification/deletion fail closed, no local account or rewards. Mail provider failure remains retryable, never silently skips verification. GET links do not consume tokens; POST validation, origin checks, body limit, no-store/no-referrer/CSP, no third-party assets. UI uses UiSkin; no new bitmap assets.

## Transactional mail presentation (1.1.0)

Registration, legacy email verification and account-deletion requests use distinct Vietnamese HTML + plain-text messages from the same renderer. Palette: deep jade `#103D34`, jade CTA `#176B51`, antique gold `#D9BD79`, ivory `#FAF8F0`, ink `#173C34`. Styling follows the game's jade/gold visual language without copying client UI textures into email. Main text, links, footer and CTA must meet 4.5:1 contrast in authored colors. Destructive actions use an explicit warning and a dedicated final browser confirmation; email CTA is “Xem yêu cầu xóa”, never instant deletion.

HTML uses a 600px presentation-table layout, inline essential CSS, system-font fallbacks, mobile sizing, visible fallback URL, preheader, Outlook VML button fallback, no external images/fonts/scripts/forms/tracking pixels. It must remain understandable with media queries or images disabled. Plain-text carries the same action, actual expiry and support information. Show actual link expiry (GMT+7), not a new lifetime starting at delivery. Email URL must match the configured HTTPS account origin/path/purpose and contain no user/password/session data beyond the single-use confirmation token.

Confirmation web page uses corresponding jade/ivory colors with keyboard focus, labeled fields, status/error/success states, and explicit destructive confirmation. Non-mutating GET, one-time token scope, SMTP, database schema, RPC interfaces and no-offline-fallback rules are unchanged. Renderer preview artifacts contain dummy links only and are generated locally; actual Gmail/Outlook/dark-mode acceptance remains a separate inbox/device check.

## Deployment integration (1.2.0)

`deploylocal.ps1` and `deploy.sh` automatically activate Compose profile `identity` when the resolved Nakama environment has `ACCOUNT_IDENTITY_ENABLED=true`. An enabled service must pass secret/mail/public-URL preflight before restart; only variable names are printed on failure. Both deployments regenerate runtime secrets, start/recreate Nakama to load them, build/start identity, wait for its health endpoint and verify SMTP TLS/auth without sending a message. Disabled configurations preserve the legacy stack and do not require mail credentials. Stop/status/logs include the identity profile so existing containers remain manageable even if the flag changes. Seed/publish options retain their existing behavior; no implicit account mutation or mail delivery is added to deploy checks. No RPC/schema/gameplay changes in this increment.

## Validation

Meaningful integration tests on PostgreSQL/Nakama 3.24.2 and mock SMTP: A/B email race, expiration/resend/quotas, direct endpoint bypass, scanner GET, wrong-purpose replay, orphan reconciliation, legacy credential conflicts, Google subject/freshness, multi-server deletion with late payment/ad callbacks and crash retries. Build backend; parse Godot; run repository static checks and report unrelated baseline failures. Production release requires actual Gmail App Password, allowed OAuth audiences and HTTPS reverse proxy; local implementation never claims mail delivery without credentials.

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.2.3 | 2026-10-28 | VPS identity deployment command without seeding; explicit warning for disabled identity and production configuration instructions. |
| 1.2.2 | 2026-10-28 | Login account-support/deletion and receipt buttons reuse the same UiSkin server-select action asset as login/register, with readable sizing. |
| 1.2.1 | 2026-10-28 | Validate links before showing credentials; explicit existing-email conflict; preserve Gmail OAuth proof path. |
| 1.2.0 | 2026-10-28 | Automatic identity profile selection, shared safe configuration validation and health/SMTP checks in local/VPS deployment scripts. |
| 1.1.0 | 2026-10-28 | Jade/gold transactional HTML + text templates, real expiry, three purposes, accessible contrast and matching confirmation page. |
| 1.0.0 | 2026-10-27 | Initial contract: Gmail SMTP confirmation links, account gates and deletion integration. |

Implementation note (2026-10-28): schema includes creation_intent and confirmation_hash. Pending registration data is purged one day after expiry; internal orphan markers reconcile after one hour. Email deletion retries recover the same receipt using a keyed hash, Google deletion uses a caller-generated random request_key. Cleanup keeps minimal anonymized orders/reservations to satisfy FK/replay requirements, removes archived aliases and redacts lifecycle manifests. Completed deletion records remain for restore protection.

## Link validation and duplicate registration (1.2.1)

Before displaying credentials, the browser calls POST /account/link/status {token,purpose}. This read-only check rejects consumed, expired, wrong-purpose and identity-generation-invalidated challenges without consuming valid links. Errors hide the form; network failure never enables it. Completion still rechecks authority to handle races. Existing registered email returns HTTP 409 with code ACCOUNT_EXISTS, including during resend cooldown. Public responses expose email existence as requested; request rate limits remain enforced.

Gmail OAuth is independent of email registration conflicts: internal provider proof never checks registration availability or issues confirmation mail. Existing provider subject authentication remains unchanged. Regression run: all 11 Node tests passed, including real isolated PostgreSQL/Nakama integration and a Gmail proof request after ACCOUNT_EXISTS. Updated local identity container health: HTTP 200. No production deployment or real email delivery in this validation.
