# C271 Durable Google Play delivery recovery

Version: 1.0.0 | Status: IN_PROGRESS | Updated: 2026-11-06

Runtime, verifier recovery loop and web admin deployed to production on 2026-11-06. Technical checks passed; exact Pub/Sub Push identity/configuration and a real Google purchase/RTDN acceptance are still pending. See [operations](../PAYMENT_DELIVERY_OPERATIONS.md) and [deployment evidence](../reports/C271_DEPLOYMENT.md). IN_PROGRESS records these remaining dependencies, not an unimplemented worker.

## Authority and guarantees

Extends C104/C143/C147. Client, RTDN, worker and admin recovery use the existing verified fulfillment path, original immutable reward/VIP snapshots and original account/server/generation. Each token has one reservation, purchase grant and mail identity. Storage effects and create-only markers commit atomically; SQL completion/no-ads/VIP are repaired idempotently. Callback receipt is at-least-once; effects must be at-most-once with eventual retry while delivery remains possible. No offline grants, arbitrary admin rewards, money refund endpoint or new client authority. Existing APK claim/consume remains compatible.

## Durable job

`payment_delivery_jobs`: token_hash TEXT PRIMARY KEY; encrypted_token TEXT (AES-256-GCM versioned envelope, verifier-only key); package_name; product_id; expected_order_id/expected_user_id (optional intake constraints); purchase_order_id nullable; payment_state UNKNOWN/PENDING/PURCHASED/CANCELED/VOIDED; status queued/processing/retry/delivered/complete/blocked/review; attempts; revision BIGINT; lease_until TIMESTAMPTZ; lease_id TEXT; next_attempt_at; delivery_completed_at; finalized_at; last_error (bounded reason code only); created_at/updated_at. Ciphertext, raw receipt and Google tokens never appear in admin/player responses/logs. Encryption key must exist before intake; encrypted payload persists before external verification. Hash mismatch or changed intake binding is rejected. Unknown Google binding is reviewed, not assigned to the current character. Terminal/review jobs retain identity; admin can requeue only eligible review/retry jobs with an existing recoverable token after server checks.

`payment_delivery_audit`: immutable actor, action, order_id, token_hash, reason, job_revision, created_at; no tokens/receipt. Token envelope rotation requires preserving old keys until jobs are reencrypted/completed; do not silently change the key.

## Internal RPC and trust boundary

`google_play_delivery` accepts HTTP-key requests with verifier secret and **no user session**. Actions:

- enqueue `{token_hash,encrypted_token,package_name,product_id?,expected_order_id?,expected_user_id?}`: create/reuse same durable job, no grant, no lease reset on duplicates.
- lease `{worker_id,limit<=20}`: atomically lease due queued/retry/delivered or expired processing jobs using SKIP LOCKED, new fencing lease_id, attempts increment. Return ciphertext only to this trusted bridge.
- apply `{token_hash,lease_id,verified:{state,package_name,product_id,order_id,user_id,transaction_id,quantity,test_purchase}}`: reject stale leases, wrong binding/quantity, void tombstones and unsupported test/owner contexts. PENDING retries without granting; CANCELED/VOIDED blocks and records revocation through existing path. PURCHASED binds authoritative order and executes existing fulfillment inside account/server admission. Local expiry alone cannot authorize a grant: verified original expired orders require reviewed recovery. Delivered jobs finalize only after all expected storage/ledger components are present. Failure to access the original target queues review/retry; never redirect.
- finalized `{token_hash,lease_id}` only after Google acknowledge/consume success or authoritative already-finalized state; delivery must be complete. Job stays retryable after acknowledgement transport loss.
- retry `{token_hash,lease_id,reason}` records bounded non-sensitive code, backoff; stale updates are rejected. Credential/binding/unsupported data problems require review, transient provider/target errors retry.

Worker gets Google purchase state via productsv2 (one product, quantity=1 only), obtains original profile/account IDs, and queries v1 product state before finalization. Consume consumable / acknowledge non-consumable only after durable delivery; retry independently without another grant. Do not acknowledge only to avoid auto-refund. RTDN validates expected service-account email, email_verified, audience and package; writes durable job before returning success. One-time PURCHASED/CANCELED and voided notifications are hints to query Google. Partial-quantity refunds go to review rather than revoke all rights blindly.

## Admin API/UI

`admin_order_recovery_get {order_id}` -> `{success,data:{payment_state,delivery_state,finalization_state,can_retry,reason,job_status,attempts,last_error}}`.
`admin_order_fulfill {order_id,reason}` -> `{success,data:{success,message}}`: authenticated config admin; trimmed reason >=5, audit; enqueue/requeue the same job, never accept quantity/token/reward overrides or bypass verification. Missing token, already-delivered, live lease, revoked, wrong scope or inconsistent markers yields blocked/review and no duplicate reward. A delivered-but-unfinalized job can retry finalization only. Legacy fulfilled orders without full markers are review-only, never replayed blindly. Errors do not optimistically mark fulfilled in UI.

Order list/get adds a redacted `recovery` summary. Labels use plain Vietnamese; superseded is a duplicate linked to the original order. Remove the unsupported mark-void/money-refund UI/service. Expose mail-versus-claim state independently of Google paid state. The admin action queues work; it does not promise immediate delivery. Four UI states, abortable services, Zod schemas, RHF/Zod reason form and ConfirmDialog apply. Missing financial metadata remains unknown; no invented revenue or settlement claim.

## Admission and deployment

New checkout flag is unchanged; paid receipt recovery must remain available when new checkout is disabled. Background worker checks account deletion/archive, original character and server fences; it must not impersonate a login or bypass reset/maintenance. Internal job lease fences status updates; stable marker/CAS/unique purchase constraints fence effects even when workers overlap. A startup/restart does not delete job/marker/lease history. Transient in-flight account/server counters require supervised cleanup only after old process is stopped and requests drained; never reset arbitrary live counters during RPC execution.

Rollout: additive schema first via runtime init; backup runtime/verifier/config before installing matched versions; configure persistent verifier encryption key and exact Pub/Sub identity; enable delivery loop only after trusted endpoint/schema availability. Preserve historic grants and paid orders; do not replay them from statuses. Do not activate finance sync or publish legal policy as part of this change. If Cloud/Play permission/config is unavailable, report the precise remaining dependency; fail closed rather than accept arbitrary push identities. Rollback stops recovery intake/worker first, retains all durable jobs/markers and restores compatible binaries without undoing delivered rewards.

## Acceptance

Test native PostgreSQL leases/fencing/replay, real runtime fulfillment and durable restart, pre/post Storage/SQL faults, parallel client/admin/worker, disabled checkout with paid recovery, original-target fencing, mail claim replay, expired/orphan/merged/revoked/multi-quantity review, encryption/tampering/identity/package, Google PENDING/no grant, provider timeout, ack loss/retry and admin authorization. Use isolated fake Google fixtures; state live Google evidence separately. Required static/build and web lint/typecheck/browser checks must pass. No claim of full production payment acceptance from mock provider tests alone.

## Changelog

|Version|Date|Change|
|---|---|---|
|1.0.0|2026-11-06|Durable encrypted purchase jobs, shared fenced recovery/finalization, authenticated RTDN and server-decided admin continuation.|
