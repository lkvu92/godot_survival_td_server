# C104 — Monetization recovery and SSV bridge

Version: 1.13.2 | Status: IN_PROGRESS | Updated: 2026-11-07

Canonical feature contract: [client C104](../../../client/docs/contracts/C104_MONETIZATION.md).

2026-11-06: [C271](C271_PAYMENT_DELIVERY_RECOVERY.md) adds durable backend recovery/finalization and supersedes client-only recovery guarantees. Existing client claim and consume remain compatible; no new client reward authority.

## Scope

The verifier validates Google's SSV signature before acknowledging a Console
setup probe with empty custom_data and user_id, regardless of the signed probe's
ad unit. Such a
probe does not call Nakama or grant rewards. Real callbacks retain required
session/user/transaction validation and existing admob_ssv_confirm payload.
Reject forged signatures, wrong ad units, malformed or conflicting metadata.
Operational logs contain event/reason only, never complete URLs, signatures,
receipts, tokens, user identifiers or verifier credentials.

Client 1.12.0 re-queries pending purchases on resume/while retryable, processes
the full receipt batch and uses existing resolve/claim RPCs. Server ownership,
idempotency and online-only reward authority remain unchanged. No SQL schema,
catalog, reward or new public RPC. No offline grants.

## Signed content encoding

Match the Google Java URI.getQuery reference: percent-decode the signed query
prefix once as UTF-8 before ECDSA SHA-256 verification. Preserve parameter order
and literal plus signs; do not form-decode or reserialize. Parse metadata from
the original query with URLSearchParams. Malformed encoding is rejected.
Android real callback evidence: raw verification false, decoded verification
true using the current Google public key. Strict SSV remains mandatory.

## Verification

Exercise valid signed probe/no grant, valid reward callback, tampering, wrong
unit, absent session/user/transaction, conflicting user fields, and old SSV
signature format. Run verifier tests/syntax checks, client regressions and
physical-device recovery. Deployment evidence must state actual callback/grant
results; local signatures generated in tests do not prove Google traffic.

2026-11-06 native local acceptance: tests/test_admob_reward_callback_runtime.cjs
uses actual isolated PostgreSQL/Nakama with multi-server enabled. Direct grant
adds 15 stamina once. Signed fixture HTTP callbacks preserve user/session and
grant one low fragment only on daily action three. Wrong unit/signature/user,
wrong owner, replay, callback reward overrides and cross-server/account effects
are checked. 2026-11-07 real callback arrived; signed-content decoding fixed and deployed from local source. New device view automatically granted stamina 149 -> 164. Other Android crash/placement acceptance remains open. See
docs/reports/ADMOB_SSV_MISSING_CALLBACK_20261106.md.

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.13.2 | 2026-11-07 | Match Google URI.getQuery percent-decoding before signature verification; real Android callback regression. |
| 1.13.1 | 2026-11-06 | Signed empty Console probes may use a different ad unit; no-grant probe branch precedes reward unit allowlist. Real rewards retain strict unit validation. |
| 1.13.0 | 2026-11-06 | C271 adds encrypted receipt intake, durable worker recovery and delivery-before-finalization; live RTDN acceptance remains pending. |
| 1.12.0 | 2026-11-04 | Signed setup probe without grant; sanitized verifier diagnostics and pending recovery integration. |
