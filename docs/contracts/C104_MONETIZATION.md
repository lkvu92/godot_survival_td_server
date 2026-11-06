# C104 — Monetization recovery and SSV bridge

Version: 1.13.0 | Status: IN_PROGRESS | Updated: 2026-11-06

Canonical feature contract: [client C104](../../../client/docs/contracts/C104_MONETIZATION.md).

2026-11-06: [C271](C271_PAYMENT_DELIVERY_RECOVERY.md) adds durable backend recovery/finalization and supersedes client-only recovery guarantees. Existing client claim and consume remain compatible; no new client reward authority.

## Scope

The verifier validates Google's SSV signature and its configured ad unit before
acknowledging a Console setup probe with empty custom_data and user_id. Such a
probe does not call Nakama or grant rewards. Real callbacks retain required
session/user/transaction validation and existing admob_ssv_confirm payload.
Reject forged signatures, wrong ad units, malformed or conflicting metadata.
Operational logs contain event/reason only, never complete URLs, signatures,
receipts, tokens, user identifiers or verifier credentials.

Client 1.12.0 re-queries pending purchases on resume/while retryable, processes
the full receipt batch and uses existing resolve/claim RPCs. Server ownership,
idempotency and online-only reward authority remain unchanged. No SQL schema,
catalog, reward or new public RPC. No offline grants.

## Verification

Exercise valid signed probe/no grant, valid reward callback, tampering, wrong
unit, absent session/user/transaction, conflicting user fields, and old SSV
signature format. Run verifier tests/syntax checks, client regressions and
physical-device recovery. Deployment evidence must state actual callback/grant
results; local signatures generated in tests do not prove Google traffic.

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.13.0 | 2026-11-06 | C271 adds encrypted receipt intake, durable worker recovery and delivery-before-finalization; live RTDN acceptance remains pending. |
| 1.12.0 | 2026-11-04 | Signed setup probe without grant; sanitized verifier diagnostics and pending recovery integration. |
