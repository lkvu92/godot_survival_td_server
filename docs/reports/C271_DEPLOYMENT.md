# C271 deployment — 2026-11-06

Production runtime, verifier and web admin deployed. External Google acceptance remains open; contract stays IN_PROGRESS.

## Installed

- Additive `payment_delivery_jobs` / `payment_delivery_audit`; shared original-order fulfillment with encrypted durable receipt intake and fenced leases.
- Worker enabled with persistent verifier-only AES key. Delivery proof includes original ledger/scope, Storage marker, mail delivery marker and required VIP credit. Existing APK claim/consume remains supported.
- Web version `a314319b-f032-4164-8e35-38a7c71d3656`; admin recovery queues the original job and records a reason. No manual refund/mark-void action.

## Evidence

- Runtime build/packaging and full `tests/run_static_tests.ps1`: PASS.
- Verifier tests: 11 PASS (6 recovery, 5 existing SSV); syntax checks PASS.
- Isolated PostgreSQL 16 / Nakama 3.24.2 native harness: PASS. Includes real delivery, SIGKILL/restart after delivery, expired lease fencing, maintenance finalization, invalid state/binding review, queued admin audit, concurrent reapply/claim, Storage-committed/SQL-failed repair and VIP repair.
- Fulfillment interruption emulator: 36 combinations PASS. These are sequential injected faults; the native SIGKILL test covers a post-delivery checkpoint, not every instruction boundary.
- Web lint/typecheck/production Workers build PASS. Workers browser harness: 6 pages, reason validation, one queue request, no optimistic fulfilled state, server-decided eligibility, light/dark screenshots and error handling PASS. Backend is isolated fixture; zero real payment mutations.
- Production read-only checks: Nakama/verifier healthy; recovery loop enabled without retry warnings; publisher SDK supports productsv2. Admin order list returns redacted recovery summary and blocks historic receiptless retries. Counts: 66 orders, 51 fulfilled, 0 jobs, 0 recovery audit records. No historical replay or financial-sync activation.
- Public payment JavaScript asset HTTP 200; SHA-256 matches the deployed local build.

## Backup / rollback

Private backup: `/opt/backups/c271-payment-delivery-20261106T091127Z` (DB custom dump, previous runtime/config, verifier inspect/image and recovery key). Previous image tag: `survival-td-monetization-verifier:c271-before-20261106T091127Z`; installed image tag: `survival-td-monetization-verifier:c271-20261106T091127Z`.

Stop recovery before rollback; restore matched previous runtime/image/config with scoped service restarts. Preserve jobs, audit, markers and already delivered rewards. Do not restore the entire old database over live purchases merely to roll back code. Keep the encryption key and encrypted jobs together; see the operations guide for rotation limits.

## Remaining external acceptance

Update: the user selected Push identity `nakama-play-billing@survival-td.iam.gserviceaccount.com` in the subscription creation form. This identity is now configured on the production verifier; its existing encryption key was preserved. Subscription creation/IAM, Play topic connection and authenticated test delivery still require verification. The paragraph below records the original deployment gap.

OIDC readiness check, 2026-11-06: minted a real Google-signed ID token using that service account, for audience `https://api.lkvustudio.com/google-play/rtdn`. Google SDK independently verified the signature/audience and verified-email claims. Posting a wrapped RTDN `testNotification` through the public HTTPS endpoint returned 204 with no reward or purchase enqueue. Missing bearer, malformed bearer and a real Google-signed token for a different audience were rejected (current shared error handler returns 503). Existing identity unit tests also reject wrong email/unverified email. No JWT/private credential was printed or persisted. This proves the public proxy preserves the bearer token and the deployed endpoint accepts valid Google OIDC; it does not prove Pub/Sub IAM/topic wiring or a live purchase delivery.

Observability follow-up: the user's first Console send could not be positively confirmed from VPS logs: no recent verifier errors, but successful callbacks were not logged and this proxy route has `access_log off`. Added a sanitized `google_play_rtdn_accepted` event after authenticated processing/persistence, with notification type and queued boolean only. No JWT, receipt, payload, email or private key is logged. A new Console send is required to correlate actual delivery; absence of an error log alone is not success evidence.

Console test confirmed: after the user resent, production verifier logged `google_play_rtdn_accepted`, `notification_type=test`, `queued=false` at **2026-11-06 10:27:22 UTC (17:27:22 Asia/Ho_Chi_Minh)**. This confirms the authenticated RTDN test reached the deployed handler and was accepted without queuing a purchase or granting rewards. Actual purchase/recovery/acknowledgement end-to-end acceptance remains separate.

`GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL` is absent. The deployed Google API credential cannot list Pub/Sub subscriptions (403), so the Push authentication identity has not been inferred. RTDN rejects missing/wrong verified identity. Configure the actual subscription, audience/package and Play notification topic; exercise a real test notification and sandbox PURCHASED with app closed, restart and acknowledge/consume.

Until that is done, autonomous recovery applies to receipts already persisted by verifier intake. If Google charged but neither client intake nor RTDN delivered the token, the worker cannot discover it from an internal order status. Player synchronization is still required for that gap. These checks do not establish live Google end-to-end payment acceptance or complete refund clawback for spent items.
