# C144 acceptance evidence

Date: 2026-10-20. All fixtures are local/disposable; production data was not changed.

| Requirement | Evidence |
|---|---|
| Best S followed by current A preserves S and grants A | `test_stage_sweep.cjs` invokes actual ordinary settlement and verifies quantity 9 of base 10 and retained S |
| Normal S does not enable Epic/Legend | Actual preview/start eligibility functions reject the other modes |
| Strict HP boundaries | 90/80/70/60 percent and immediately-above values, invalid/out-of-range reports and defeat |
| Simultaneous combat/sweep has one winner | Both simulated atomic interleavings plus five actual concurrent HTTP races in disposable Nakama |
| All combat routes blocked | Campaign, boss, ruins, tower and admin stage IDs/modes enter the shared stage gate; tribulation start checked separately |
| Worker crash before/after commit | Compiled runtime with atomic versioned Storage fault injection, unchanged-before-commit and receipt-preserved-after-commit |
| Socket lost after commit | Notification exceptions do not undo receipts; status recovery returns committed inventory/EXP; native HTTP recovery without socket |
| Cancellation at deadline | 89,999/90,000/90,001/180,000 ms deterministic cutoff tests; PostgreSQL selects persisted cancellation before future next-due |
| Reserved resources protected | Actual resource wrapper refuses inventory ticket and stamina drains; stale-read CAS checked |
| Unlock after final/cancel | Normal completion, cancellation and explicitly blocked-session cancellation release reservations/activity |
| Bounded queued load | PostgreSQL selects at most 32 profiles, four-round catch-up cap, 750 ms soft deadline, retry exclusion, scope admission; three concurrent native worker RPCs grant exactly two receipts |

The native HTTP harness uses real Nakama Storage CAS, not a mocked
transaction. The crash-injection tests use a faithful atomic versioned mock
around the compiled production functions so the precise before/after-commit
failure point is controllable. PostgreSQL scheduling tests use real SQL in a
dedicated disposable schema. Bounded-load tests establish work limits and
correctness; they are not a production throughput/latency benchmark.

## Commands and results

- `npm run build` in `server/nakama`: PASS, including runtime packaging verification.
- `test_sweep_config.cjs`: PASS for publication rejection of malformed rules
  before release insertion. Missing rules also block campaign start before
  stamina debit and block client bootstrap.
- `powershell -ExecutionPolicy Bypass -File tests/run_static_tests.ps1` in
  `server`, with `SEED_TEST_PSQL` and disposable `SEED_TEST_PORT`: PASS,
  including C144, prior Node regressions, 24 Python tests, PostgreSQL worker,
  registry/weekly/seed regressions and first-clear progression.
- `node tests/test_multiserver_runtime.cjs` in `server`: PASS in disposable
  Docker Nakama/PostgreSQL, including the added C144 native concurrency checks.
- Client `tests/run_static_tests.ps1`: PASS.
- Godot headless `res://tests/TestSweepService.tscn`: PASS for character-context
  changes, mutation epochs, stale state versions, socket hint filtering,
  uncertain-start recovery and cancellation unlock.
- Godot editor import/parser: PASS with exit code zero.
- Godot headless `res://tests/TestSweepUI.tscn`: PASS with the production
  widget and deterministic transport fixtures. Checks filtered selectors,
  exact modes, owned heroes, quantity defaults, real inventory frames/icons,
  actual start/cancel button signals and disabled states, submitted payload,
  modal lifecycle, combat locks, stable random creep selection, final boss and
  real animation/background textures.

Gate score: 9/10. C144 is ACTIVE after the local implementation gates.

The optional retained client `-IncludeServerChecks` runner currently stops at
the pre-existing source-pattern assertion "Shared projectile damage must
reject dead, queued, and pooled enemies". C144 does not modify the projectile
implementation. This optional cross-repository assertion is recorded separately
from the passing standalone client static and C144 runtime checks.

## Deployment boundary

Implementation and local verification do not seed or deploy production.
Follow [Stage sweep operations](STAGE_SWEEP.md) for coordinated runtime/client,
catalog seed, system-config publication and worker rollout. The minimum client
version must require numeric HP reporting before accepting ordinary victory
settlements against the new backend.

## Restart regression (1.0.1)

An existing local deployment still had published release 1 without
`system.stage_sweep`, while the new client required it at bootstrap. Restart
initially inserted only draft defaults, so Loading correctly rejected the old
snapshot but could not recover by retrying. Startup now appends one immutable
additive release and inserts the missing campaign ticket, preserving unrelated
published settings and pending drafts. PostgreSQL migration tests verify
exactly-once execution, immutable history and custom-rule/catalog preservation.

Verified on the affected local stack: restart produced release 2; authenticated
bootstrap returned `ok` with sweep rules; Godot accepted that exact response
(`C144_LIVE_BOOTSTRAP_PASS`). All 30 player Storage rows retained the same
version fingerprint before/after migration. Client errors now identify invalid
configuration immediately rather than repeating a generic bootstrap retry.
