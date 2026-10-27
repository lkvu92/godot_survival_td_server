# C232 — Verified email registration and account deletion

Version: 1.2.2 · Status: IN_PROGRESS · Updated: 2026-10-28

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
| 1.2.2 | 2026-10-28 | Login account-support/deletion and receipt buttons reuse the same UiSkin server-select action asset as login/register, with readable sizing. |
| 1.2.1 | 2026-10-28 | Validate links before showing credentials; explicit existing-email conflict; preserve Gmail OAuth proof path. |
| 1.2.0 | 2026-10-28 | Automatic identity profile selection, shared safe configuration validation and health/SMTP checks in local/VPS deployment scripts. |
| 1.1.0 | 2026-10-28 | Jade/gold transactional HTML + text templates, real expiry, three purposes, accessible contrast and matching confirmation page. |
| 1.0.0 | 2026-10-27 | Initial contract: Gmail SMTP confirmation links, account gates and deletion integration. |

Implementation note (2026-10-28): schema includes creation_intent and confirmation_hash. Pending registration data is purged one day after expiry; internal orphan markers reconcile after one hour. Email deletion retries recover the same receipt using a keyed hash, Google deletion uses a caller-generated random request_key. Cleanup keeps minimal anonymized orders/reservations to satisfy FK/replay requirements, removes archived aliases and redacts lifecycle manifests. Completed deletion records remain for restore protection.

## Link validation and duplicate registration (1.2.1)

Before displaying credentials, the browser calls POST /account/link/status {token,purpose}. This read-only check rejects consumed, expired, wrong-purpose and identity-generation-invalidated challenges without consuming valid links. Errors hide the form; network failure never enables it. Completion still rechecks authority to handle races. Existing registered email returns HTTP 409 with code ACCOUNT_EXISTS, including during resend cooldown. Public responses expose email existence as requested; request rate limits remain enforced.

Gmail OAuth is independent of email registration conflicts: internal provider proof never checks registration availability or issues confirmation mail. Existing provider subject authentication remains unchanged. Regression run: all 11 Node tests passed, including real isolated PostgreSQL/Nakama integration and a Gmail proof request after ACCOUNT_EXISTS. Updated local identity container health: HTTP 200. No production deployment or real email delivery in this validation.
