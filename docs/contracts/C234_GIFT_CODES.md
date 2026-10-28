# C234 Gift codes

Version: 1.1.0 | Status: ACTIVE | Updated: 2026-10-28

## Scope and delivery plan

1. Contract and registry, then backend, management CLI, client dialog, validation.
2. Server-authoritative codes; authenticated current account and admitted character required. No offline fallback or client rewards/configuration.
3. Profile opens GiftCodeDialog, using UiDialog/UiSkin and AtlasRegistry gift_banner. Input, inline status, one Nhận button, Enter submit, busy lock and stale-context protection.

## Schema

Server-only Nakama Storage `gift_codes` (system owner) stores code, enabled, starts_at_ms, expires_at_ms (exclusive), allowed_servers (empty=all), max_uses (null=unlimited), used_count, rewards, mail_title, mail_body, mail_claim_days, revision. All dates are UTC milliseconds; CLI accepts ISO dates with explicit timezone. Each code is redeemable once per account across servers and generations. Server eligibility refers to the current admitted server.

`gift_code_redemptions` is account-owned and private; immutable code key records request_id, server_id, generation, mail_ids, redeemed_at_ms. `gift_code_attempts` is account-owned and private; enforces 10 attempts/minute. `gift_code_audit` records administrator, reason, revision, operation and timestamp. Never expose code lists/config to player bootstrap. Administrative edits use expected revision; rewards and mail lifetime are immutable after first redemption. No hard delete or resetting counters.

Quota CAS, account redemption marker, all mail rows and mail delivery markers commit in ONE base Storage transaction. Any conflict rolls back everything. Bounded retries re-read the state, so last-slot contention cannot over-issue. Mail IDs derive from code + account + chunk. Rewards are resolved once per committed redemption. Tester rewards are split into <=32 attachment chunks; all chunks commit together. Redeemed markers outlive mail purge. Same request_id replay returns existing success even if code later expires; another request receives ALREADY_USED. Client retains the request ID only while retrying that code/context. Archived linked-account claims also block redemption on the surviving account.

## RPC

`gift_code_redeem` request: `{code, request_id, server_id, generation, config_version}`. Server admission/version gates follow mailbox. Response: `{success:true, mail_ids:[], replayed:boolean}` or `{success:false, code, message}`.

Errors: INVALID_CODE, DISABLED, NOT_STARTED, EXPIRED, ALREADY_USED, EXHAUSTED, WRONG_SERVER, RATE_LIMITED, INVALID_REQUEST, UNAVAILABLE; existing authentication/admission/config gates remain authoritative. Client displays inline Vietnamese messages, never grants local inventory. Success invalidates MailService summary.

`gift_code_admin` requires CONFIG_ADMIN_USER_ID/current login and account guard; bypasses character admission like mail_admin. Actions: upsert (definition, expected_revision, reason), list (cursor/limit), history (code/cursor/limit). Server validates all IDs/amounts, dates, server IDs and random pools. Configuration/audit committed atomically. Admin response includes revision/counters. List/history are private.

`operator_gift_codes` offers the same actions for deployment tooling, using Nakama HTTP-key authentication AND the private CONFIG_PUBLISH_TOKEN as `publish_token`. It rejects any game-session userId, missing/incorrect/short operator credentials and malformed payloads before Storage access. Audit actor is `operator:deploy`; no game-account impersonation. CLI `--operator-config` reads the private runtime configuration, never logs credentials, and uses this endpoint without a game session. Quotas, revisions, reward locks and all definition validation are identical to the admin endpoint. Activation preserves existing redemption history and publishes only the explicitly supplied private definitions.

## Initial campaigns

| Template | Proposed code | Rewards |
|---|---|---|
| Tân thủ | TANTHU | healing_elixir x20, shield_elixir x10, energy_elixir x10, gold x5000, gems x50 |
| Khai mở | KHAIMOSERVER | 20 random rune_*_high drawn independently from five elements; talisman_enhance_charm x1; element_enlightenment_charm x1; talisman_fragment_1 x15; campaign_sweep_ticket x20; revive_talisman x1 |
| Tester | generated with crypto.randomBytes(24), 192 random bits | every fragment/other item in server/data/items.json x1000; complete talismans (category=talisman) x1 each; split mail chunks |

Templates contain no tester secret. Management CLI builds tester rewards from the canonical item catalog, outputs a private untracked file and publishes only on explicit publish invocation. Activation window, enabled flag, server whitelist and quota are set by administrator; templates are disabled until configured/published. Default draft window: 30 days, unlimited global uses, mail claim 30 days. Do not put tester plaintext in docs, source, client or logs. Tester code remains once per account; optional account whitelist is outside v1.

## Interfaces

GiftCodeService.redeem(code) -> Dictionary; retains a request ID on network uncertainty, resets on resolved outcome/context change. GiftCodeDialog._submit() awaits it and displays inline status. MailService.invalidate() refreshes mailbox badge. Banner resolves through AtlasRegistry.get_ui_texture("gift_banner").

## Validation

Build backend; fault-injection runtime tests for atomic rollback, last-slot contention, replay, per-account scope, mail split, server isolation, boundaries, invalid input, admin auth/revision and rate limit. Client parser/static checks, UI input/busy/errors/success/context tests and visual render at desktop/mobile sizes. ACTIVE only after required gates pass; deployment and live campaign publication reported separately.

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.1.0 | 2026-10-28 | Add separate deploy-operator giftcode management and activate the existing private campaigns on local develop. |
| 1.0.0 | 2026-10-28 | Initial giftcode contract, campaign templates, atomic mail redemption and Profile dialog. |

## Acceptance

Implementation gates passed 2026-10-28. See server `docs/reports/C234_GIFT_CODES_VALIDATION.md` for evidence and live deployment/device acceptance limits. Campaign publication remains an operator action.
