# Campaign sweep operations (C144)

Sweep runs on Nakama and the existing PostgreSQL database. No Redis is required.
On startup, C144 runs an additive migration after config tables are ready. If the
latest published snapshot lacks `system.stage_sweep`, it appends one immutable
release copied from that snapshot with the validated v1 sweep defaults and app
version floor `1.1.0`. It never publishes pending draft settings or modifies an
older release. Existing custom published sweep rules and existing ticket item
definitions are preserved. The campaign ticket is inserted only when missing.
An advisory transaction lock and release-table lock serialize concurrent startup
migrations and publication. Player profiles, inventories and other game rows
are not changed by this migration.
The Compose `sweep-worker` service invokes the runtime HTTP-key protected
`sweep_tick` RPC once per second. The same script can run on the host with
`python -B nakama/sweep_tick.py`, or use `--once` for diagnostics. Supply
`NAKAMA_URL` and `NAKAMA_HTTP_KEY` in its environment, never command-line logs.
Use one deployment method; multiple workers are safe but usually unnecessary.

## Storage and scheduling

The player profile embeds the authoritative session in `sweep`; inventory,
hero EXP, profile resources, receipts and progress commit atomically using
Nakama Storage version preconditions. Scheduling is indexed directly over
active profile sessions, so a crash between Storage commit and a separate
enqueue operation cannot lose a job. `sweep_worker_claims` contains only
expendable leases/retry metadata. Do not use these claims as reward receipts.

Each tick examines at most 32 due profiles, with a 750 ms soft work budget and
at most four catch-up rounds per profile. A database call already in progress
can exceed that soft budget. Claim expiry is 15 seconds; failed jobs back off
from five to 60 seconds. The Python transport timeout is ten seconds and its
connection-error backoff is capped at 30 seconds. Repeated retries remain
visible in logs and claims; they do not silently discard an entitled round.

In multi-server mode, discovery requires a ready character on an open server
at its current generation. Processing enters the same server lifecycle lease
and scoped Storage adapter as player RPCs. Maintenance pauses settlement;
when reopened, due rounds catch up in bounded batches. A server generation
reset never transfers a previous-generation sweep into a new character.

Notifications are hints after commit. A disconnected client recovers from
`get_sweep_status`; animation completion and socket delivery never grant
rewards. While a sweep is active, all combat entry RPCs reject entry. The
client restores the lock from server state when reconnecting.

## Release sequence

1. Build runtime and run C144, existing progression, consumable, lifecycle,
   multi-server and PostgreSQL regression checks.
2. Roll out runtime and `sweep-worker` together. Restarting Nakama automatically
   adds missing sweep rules to a new published release and inserts the missing
   campaign ticket; no manual publish or full data reseed is required to upgrade
   an existing database. The migration raises the minimum and latest version
   floors to `1.1.0` without lowering a higher published version. Victorious settlement now
   requires an explicit numeric `objective_hp_ratio`, which older clients do
   not send. Do not leave old clients admitted against the new settlement API.
   Client bootstrap and campaign start both reject missing/invalid sweep rules
   before gameplay or stamina debit.
3. Startup also installs the partial
   due-time index and worker-claim table. On a large production Storage table,
   pre-create the index concurrently during a maintenance rollout rather than
   paying its initial build cost during runtime startup.
4. Roll out the client with the Home widget and combat navigation guards.
5. Review the published feature configuration, test one eligible stage/mode, cancellation, reconnect
   and worker restart with a test character, then monitor queue delay.

Existing custom published sweep rules are preserved on restart, including a
disabled feature. For those custom releases, review the minimum client version
explicitly and keep it at least `1.1.0`. To stage a disabled rollout, publish
valid custom rules with `enabled=false` before the runtime rollout. Ordinary
grading and ticket rewards still require the complete rules while sweep starts
are disabled.

Optional catalog/config changes use the existing admin workflow. After building,
generate reviewable settings from the compiled server defaults:

```powershell
node nakama/build_stage_sweep_settings.cjs stage-sweep-settings.local.json
python -B nakama/seed_all.py --settings stage-sweep-settings.local.json
```

These optional commands are not needed to repair a missing published sweep
setting on restart. The second command seeds the versioned catalogs (including the new campaign
ticket and fixed stage quantities) and the draft settings using the existing
environment credentials. It does not publish. Review all active settings and
publish through the existing admin workflow, or add `--publish` with the
appropriate `NAKAMA_CONFIG_ADMIN_TOKEN`. The generator refuses to overwrite an
existing output file. Set `enabled=false` in the generated JSON for a staged
rollout; ordinary grading/ticket rewards still require the complete published
`system.stage_sweep` rules even when new sweep starts are disabled.

Disabling new sweep starts must not disable settlement or cancellation for
existing sessions. Stopping the worker pauses automatic delivery; resuming it
recovers committed sessions without resetting their original due times.

## Diagnostics

Worker JSON logs contain scanned, claimed, processed, failed and elapsed_ms.
These are per-tick counts, not reward totals. Inspect pending work and retry
metadata with a read-only database query:

```sql
SELECT p.user_id, p.key,
       p.value->'sweep'->>'session_id' AS session_id,
       p.value->'sweep'->>'status' AS status,
       p.value->'sweep'->>'next_due_at_ms' AS due_at_ms,
       c.attempts, c.retry_at, c.lease_until
FROM storage p
LEFT JOIN sweep_worker_claims c ON c.user_id=p.user_id AND c.storage_key=p.key
WHERE p.collection='player_profiles'
  AND p.value->'sweep'->>'status' IN ('running','cancelling')
ORDER BY (p.value->'sweep'->>'next_due_at_ms')::BIGINT;
```

Never repair a player by editing only inventory or deleting the activity
lock. Use the authenticated cancellation path or diagnose the full atomic
session state first. A lease can expire naturally after worker failure.

## Combat HP authority

The current campaign loses when the player hero dies; it has no separate
defended-base actor. Consequently grading uses the current hero's remaining
HP fraction. Ordinary combat currently executes on the client: bounded,
run-bound HP reports prevent malformed values and stale-run settlement, but
cannot prove that an altered client played honestly. Full anti-cheat requires
server combat simulation or verifiable combat evidence and is not implied by
server-side reward calculation.
