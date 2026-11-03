# C250 — Protected archive operations and recovery

Version 2.0.0 · TESTED_SCOPED · 2026-11-03.

Scope: isolated/local hardening for C232 archive expiry, key rotation, database-authorized operations and encrypted backup/restore reconciliation. No production restore, production expiry enablement, real email or Android acceptance. User declined live-device/email testing; keep those pending.

## Interfaces and authority

Server operations module exposes `rotateArchive(db,jobId,keyring,targetKeyId,caseRef)`, `expireArchive(db,jobId,caseRef)`, `exportLedger(db,signingKey,inTransaction=false)`, `reconcileLedger(db,signedLedger,signingKey,expectedCheckpoint)` and a read-only recovery assessment. CLI has explicit target/case and uses database identities, not USERNAME for authorization. No public HTTP archive read or restore endpoint. Keys/secrets never appear in audit/evidence. Expired ciphertext cannot be recovered from active DB; backups follow a separately approved lifecycle.

`system.account_archive_operations` schema1: enabled, revision; identity_expiry {enabled, approval_reference, approved_by, effective_at}; batch_size. Seed disabled. Archive expiry requires the current explicitly approved policy, retained deadline passed, completed gameplay cleanup and no applicable hold; it clears ciphertext/key reference and records expiry/audit while retaining minimal user, billing/transactions and deletion ledger. Missing/invalid/disabled policy never authorizes destruction.

Keyring: current key+ID remain compatible; optional private ACCOUNT_RETENTION_KEYS_JSON maps key IDs to independent64-hex keys. Rotation decrypts/validates old content and digest before resealing, uses CAS and DB audit, and preserves retain_until/ownership. Missing old key or tampered ciphertext fails without writes. Old keys may be removed only after no remaining ciphertext or pending snapshot needs them and recovery coverage is reviewed.

Database NOLOGIN roles separate summary reader, hold manager, key rotation manager and expiry worker. Security-definer mutation functions use restricted search_path, session_user membership, row locks and immutable audit actor. Public roles cannot select ciphertext or execute mutation functions. Superuser remains a trusted root; host IAM/MFA and production role assignment require separate acceptance.

## Backup/restore boundary

Backups and current recovery ledgers are AES-256-GCM encrypted; ledger also has independent HMAC authentication/version/checkpoint metadata. Dumps flow through memory/pipes, not plaintext artifact files. Test only explicitly named disposable DBs/containers; refuse the player DB as a restore target. Restore gate blocks auth/native/RPC mutations until reconciliation with the latest protected ledger, including irreversible subject state, scoped holds, current identity ownership and financial fingerprints. A stale backup missing a newly registered owner or changed financial data stays blocked; do not synthesize new users or transfer identities from email matches. Current data/WAL/checkpoint recovery is required before opening.

Replay uses stable subject IDs, strips resurrected archived credentials and gameplay, preserves financial ownership and archive retention/expiry facts, and never enables old restore proofs. Corrupt/wrong-key/stale/incomplete ledger cannot open the gate. Backup infrastructure must keep traffic closed while importing because an old snapshot can contain an old ready flag/runtime; the new runtime and ledger must be applied before serving requests.

## Acceptance

Actual pg_dump/pg_restore drill in isolated PostgreSQL/Nakama; encrypted artifact authentication failure tests; missing new identity and changed financial data remain blocked; complete checkpoint can reconcile without resurrection; old/expired ciphertext stays unavailable. Unauthorized DB login role tests for read/hold/rotate/expiry, hold/retain bounds, rotation digest/CAS and audit preservation. Evidence aggregates only. Production RPO/RTO/offsite immutability/key escrow/IAM/MFA and live device/email remain open until real evidence exists.

Changelog1.0.0: planned controlled operations and recovery contract, no claim of completed production acceptance.

Validation 2026-11-03: real isolated PostgreSQL/Nakama integration PASS, C232 16/16 PASS, server static PASS. Runbook: [ARCHIVE_RECOVERY_RUNBOOK](../ARCHIVE_RECOVERY_RUNBOOK.md). Production acceptance remains open.

## 2.0.0 — privacy checkpoint

The signed ledger now includes the count and keyed fingerprint of all `privacy_consent` storage rows, including state and receipts. A missing or malformed fingerprint rejects the ledger; a restored database with a different fingerprint remains blocked, including when an old grant predates a withdrawal. This is a comparison gate, not a reconstruction of missing consent events. Restore current data or WAL, then reconcile against the independently pinned latest ledger. Pre-2.0 ledgers are deliberately incompatible and cannot unlock the gate; capture a new ledger under controlled conditions before adopting this runtime. Traffic must remain closed during restore and while running an older runtime.
