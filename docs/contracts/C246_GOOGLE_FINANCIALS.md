# C246 Google verified financial records
Version 1.0.0; Status IN_PROGRESS. B1/B2 extension.

Verifier worker obtains Orders API data using trusted stored Google order ID, never client prices. Internal google_play_financial_sync RPC (HTTP key + verifier secret, no authenticated player sessions) actions batch/record/error; policy system.payment_financials controls enabled, batch_size, retry_seconds, resync_seconds, lookback_days. Default disabled until credentials/permissions approved. Batch includes only fulfilled Android nonmock orders with known transaction IDs; failure retries/backfill via stored IDs, not tokens. Does not grant/refund money or rewards.

DB first verified financial record keeps currency/original_amount/tax immutable; append-only sanitized snapshots retain provider state, event time, cumulative processed refunds and normalized event list. Exact NUMERIC(30,9), no float money. Repeat snapshot hash deduplicated, out-of-order snapshot does not replace newer provider timestamp. No buyer address, purchase token, receipt or developer revenue exported/stored by this feature. Full refund snapshot uses original total as cumulative refund (do not add partial and full twice); pending partial refunds excluded. Original amount/currency conflict requires review, never silently overwrite.

B2 owner-bound history joins first verified amount + latest snapshot refund and shows source/status; missing metadata remains null. B1 reports financial metadata gaps in its window, not financial settlement. Background sync disabled policy means no external Orders API calls. Access failure does not revoke paid entitlement, data stays unknown/pending for retry. Future permission validation/live Google proof remains separate from fixtures.

Source: https://developers.google.com/android-publisher/api-ref/rest/v3/orders and /orders/get (Google API semantics checked 2026-11-02). Changelog 1.0.0 initial exact financial persistence, retry worker, history and audit extension.

