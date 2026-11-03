# C244 Payment reconciliation report

Version 1.1.0; Status IN_PROGRESS; Scope B1 technical audit only.

C246 extension: report also counts eligible orders missing financial metadata and returns exact decimal-string totals grouped by currency using first verified amount/latest refund snapshot. No cross-currency addition or settlement claim. Deploy additive financial tables first. Changelog 1.1.0: metadata gaps and currency totals.

Read-only local operator CLI tools/payment_reconciliation.cjs --local. It reads published system.payment_reconciliation policy and executes a REPEATABLE READ READ ONLY PostgreSQL transaction. No grants, refunds, repair or reseeding. No external payment-provider calls. Output: schema_version, generated_at, config_version, policy_revision, counts by anomaly and status CLEAN/REVIEW_REQUIRED. No tokens, emails, phone numbers, account IDs or raw receipt payloads exported.

Policy schema 1: revision positive integer; lookback_days 1..365; pending_grace_seconds 60..604800; delivery_grace_seconds 60..604800. SQL numeric values validated before interpolation. Missing/invalid policy fails with CONFIG_REQUIRED, no implicit fallback. Report checks overdue pending/validated orders, fulfilled orders without a purchase ledger row, purchase rows without their order, duplicate nonempty token hashes, void tombstones with nonvoided purchase rows. Review items are signals, not proof of payment loss/fraud; unresolved historical rows require operator investigation.

Existing Google receipt verification, webhook and fulfillment state machines are unchanged. This is internal reconciliation, not Google Play financial settlement or proof that a payment channel meets all legal criteria. Requires separate approved partner/settlement evidence before closing B1.

Changelog 1.0.0: configurable read-only report, anomaly tests and B1 evidence.
