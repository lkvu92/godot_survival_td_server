# C232 validation and deployment status

Updated: 2026-10-28. Implementation is in source; production enforcement remains disabled pending configuration/release. Contract stays IN_PROGRESS because the full server suite has an unrelated Hero EXP failure and live delivery/device acceptance remain outstanding. The earlier stamina test mismatch was resolved under C134 v1.0.2.

## Implemented

- Gmail SMTP service, TLS required, App Password in private env, encrypted/redacted outbox and durable rate limits. Production/local Compose profiles and private runtime config generator wired; SMTP password never enters Nakama runtime/client.
- No-OTP email links; no address reservation; bounded simultaneous valid registration links, cooldown and expiry, serialized creation and orphan reconciliation. Direct Nakama email create/link/update bypasses blocked when enabled.
- Legacy verification requires current login generation plus password; mailbox-only registration does not claim an existing account. Google login/proof validates allowed audience and stable subject; Gmail/Workspace email authority is checked separately from generic Google sign-in.
- Client registration requests only email, shows resend countdown; identity status admitted before server selection. Profile dialog has verification/deletion/support; login has support and saved deletion receipt lookup.
- Durable all-server deletion, lease draining, retries/manual review, recorded Nakama deletion, alias cleanup, late callback fencing and receipt recovery. Browser confirmation GET has no mutation, tokens in fragment, status receipt works after logout.

## Deletion data inventory

| Data | Handling |
|---|---|
| Nakama user, devices/providers, storage, notifications/social data, native leaderboard records | Official recorded account deletion; tested user-owned storage and leaderboard removal. |
| All character/server generations and server preference | Custom SQL cleanup before official deletion, not restricted to selected server. |
| Weekly scores/awards, sweeps, mailbox/inventory/profile/run storage | Custom score/award/worker rows removed; account storage removed by Nakama; workers use active-account leases. |
| Link intents, archives/snapshots, server link tasks, archived loser aliases | References and snapshots removed; archived alias users recorded-deleted; surviving unrelated accounts preserved. |
| Entitlements, VIP credits, daily ad/fragment claims, ad reward sessions, financial inbox | Removed; account state/job prevents late callbacks recreating data. |
| Custom purchase/order/reservation records | Minimal replay hashes/transaction references under system owner; reward payloads, target scope and identity removed; FK relationships preserved. |
| Native purchase/subscription validation | Provider payloads redacted; official deletion reassigns native purchase history to system user, retaining anti-replay identity. |
| Lifecycle plan manifests and operator audit actors | User-owned manifest entries removed and actor anonymized; active server lifecycle operations block acceptance until resolved. |
| Verification challenges/outbox | User challenges removed during cleanup; delivery content redacted after send/expiry; expired challenge rows purged after one day. |
| Deletion ledger, receipt/confirmation hashes and account-link tombstones | Restricted minimum for retry/status/backup restore. Operator must define justified retention; never re-expose player progress from backups. |

## Completed checks

- Backend `npm run build` and runtime packaging: PASS on Nakama 3.24.2.
- Isolated real PostgreSQL/Nakama integration: PASS. A/B links race → one account; within-window resend and after-expiry registration; scanner GET no consumption; wrong password/purpose; old session generation rejects legacy verification; direct registration/link/delete bypasses denied.
- Deletion integration: PASS for two servers, archived alias, unrelated user preserved, active lease drain/retry, native leaderboard, custom receipt FK, native purchase payload redaction/system reassignment, late SSV callback, duplicate confirmation receipt recovery, mocked Google subject mismatch/success.
- Security tests: PASS for token encryption/tamper, email/header injection, HTTPS/secret validation and Google third-party-email authority boundaries.
- Existing account-password and single-login regressions: PASS after loading the new runtime module in fixtures. Real PostgreSQL server-registry/weekly lifecycle regression: PASS, including repeatable DDL and atomic server operations.
- Python regressions: 47 PASS.
- Client static suite: PASS. Godot 4.6.3 headless editor import/parser: PASS; isolated Godot identity-dialog smoke: PASS (real identity RPC before server selection, device-only support and UiSkin).
- Production and local Docker Compose resolution: PASS; independent keys match service/runtime; SMTP secrets isolated. Docker image build: PASS. Dependency audit: zero known vulnerabilities at verification time.
- Follow-up C134 v1.0.2: daily-pack tests now consistently enforce storage cap 200 (including legacy rewards), with natural regeneration target 30. Both daily-pack suites and client static checks PASS. The full server runner proceeds further and stops at the unrelated `test_hero_exp_test.cjs:46`, actual 1000 vs expected 0; hero EXP behavior was not changed by this fix.

## Live configuration limits

### Mail design follow-up — C232 v1.1.0

The former plain-text-only messages are replaced by three purpose-specific jade/gold HTML templates plus plain-text alternatives. Matching confirmation-page colors, distinct deletion warning, Outlook VML CTA, actual expiry in GMT+7, copyable fallback URL, preheader and automatic-message headers are implemented. No external images/fonts/scripts or tracking pixels are sent.

Preview: [desktop/mobile gallery](account_mail_preview/index.html). Browser CDP screenshots verified all three emails at 760px and 375px with no horizontal overflow; the deletion confirmation page loads the correct heading and destructive button at both widths. Automated mail-template tests verify authored contrast >=4.5:1, HTML/text parity, safe URL escaping/allowlisting and shared web/mail palette. Integration tests use the actual HTML renderer through the outbox and all pass; Docker image builds successfully.

These are browser and automated checks, not actual Gmail/Outlook/dark-mode inbox acceptance. No live email was sent for this visual update. The existing SMTP authentication issue remains a separate release prerequisite.

The existing ignored `.env` and `.env.local` now include missing identity/SMTP keys without overwriting user-provided values. Independent bridge and encryption keys were generated. Public Google WEB client ID was copied from the project into empty allowed-audience entries. `ACCOUNT_IDENTITY_ENABLED` remains false.

At verification, local SMTP values were present, but Gmail SMTP verification returned **EAUTH 535**. No mail was sent. Confirm the Gmail/Workspace login in `SMTP_USER`, use an authorized Google App Password in `SMTP_PASSWORD`, and configure `SMTP_FROM` as that account or a permitted alias. Production `.env` SMTP fields still need filling. Credentials were not printed or committed. `src/verify-smtp.js` repeats the same TLS/auth check without sending mail.

Before release: correct SMTP auth and verify delivery to an operator-owned mailbox; configure HTTPS `/account/` reverse proxy and deny public internal routes; regenerate private runtime config; start identity profile; perform real Android Google account-selection/reauthentication smoke. Integration tests inject mail/Google clients and therefore do not prove Gmail inbox delivery or Android Google UI behavior.

Privacy policy/deletion instructions and source links were updated locally. No production DB, real player account, AdMob/Play console or public hosting was changed by implementation/testing.

## 2026-10-28: C232 1.2.1 link-state and duplicate email fixes

All 11 Node tests passed with C232_INTEGRATION=true against isolated PostgreSQL/Nakama. Added valid/used/expired/wrong-purpose/stale-session link checks, initial hidden-form browser test, and registered-email HTTP 409 assertion. Gmail provider proof succeeds independently after the same address receives ACCOUNT_EXISTS from email registration. Local account-identity rebuilt and health HTTP 200; production unchanged.
