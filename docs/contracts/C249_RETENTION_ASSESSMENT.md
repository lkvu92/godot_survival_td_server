# C249 — B6 retention assessment, phase 1

Version 1.2.0; Status IN_PROGRESS.

This phase adds a read-only, local operator report. It does not change identity deletion, identify when a person stopped service, enforce retention, create legal holds, delete data or claim compliance. The report uses aggregate counts only, under a repeatable-read read-only PostgreSQL transaction, and checks that it reads the same published config version throughout. No personal data, identifiers, raw receipts or secrets are output.

`system.retention_assessment` schema: `{schema_version:1,revision:positive_integer,enabled:boolean,minimum_calendar_months:1..120,trigger:"explicit_service_stop",legal_reviewed:boolean}`. The values are versioned through remote config; absent/invalid/disabled config is a hard stop, with no fallback. `minimum_calendar_months` is an assessment baseline, not automatic deletion authorization. `legal_reviewed=false` requires REVIEW_REQUIRED. A service-stop event, records with legal hold and backup expiry are not implemented; the tool must explicitly mark their status unknown and never infer eligibility from inactivity or a deletion job. No PII export, policy mutation or purge operation is provided.

SQL checks only explicitly defined aggregate evidence: count current activated profiles and queued/soft_deleted/purge_pending/cancelled/processing/retrying/manual_review/completed account-identity deletion jobs, and completed jobs without a current account-owned activation profile. Such absence is an investigation signal, not proof a valid profile existed or that law was breached. C232 v2 now gates operational cleanup with its own account_deletion policy, deadline and encrypted archive. The aggregate report does not inspect archive validity or certify that gate, and must not infer legal eligibility from completed jobs. No statement of regulatory compliance is permitted until legal basis, deletion requests, lawful retention, archive/backup and restore handling are resolved and tested.

CLI `node tools/retention_assessment.cjs --local` connects only to the predefined local Docker PostgreSQL; no arbitrary URL or production endpoint. It prints aggregate JSON and runs no SQL mutation. This does not replace production audits or manual legal decisions. Source baseline is the official published decree; applicable amendments and relationship with privacy/deletion rights remain for review.

Changelog 1.0.0: safe initial inventory and policy-driven aggregate assessment.

Changelog 1.1.0 (02/11/2026): recognize C232 v2 state buckets, correct historical immediate-deletion limitation. Report remains read-only and REVIEW_REQUIRED.

Changelog1.2.0: enumerate v3 archive_failed/archived/gameplay_purged/gameplay_review in aggregate buckets. Report remains read-only/REVIEW_REQUIRED and does not validate v3 archive/legal eligibility.
