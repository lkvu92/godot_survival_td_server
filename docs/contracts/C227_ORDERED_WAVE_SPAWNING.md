# C227 — Ordered campaign wave spawning

Version: 1.0.0 | Status: IN_PROGRESS | Updated: 2026-10-27

## Changelog
| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-27 | Four-wave batches; server-authored tanker/ranger/fast/boss formation with overlapping queues and fair scheduling. |

## Data and authority
Campaign stage wave entries add `spawn_role: tanker|ranger|fast|boss` and `formation_lead_seconds: number >= 0`. Roles are authored explicitly from enemy identity/attack type, not inferred from speed by the client. Lead defaults in this catalog are tanker 0, ranger 2.5, fast 1.5, boss 2 gameplay seconds. A present role waits its own lead after the first successful spawn of the preceding present role in the same wave. Authored start_delay remains a separate lower bound. Missing roles are skipped. Counts, interval, rewards and combat stats stay unchanged. Old entries without role retain legacy eligibility; no client gameplay JSON fallback is introduced.

## Interfaces and scheduling
WaveManager.get_spawn_batch_size(): 1 + floor((wave-1)/4), capped as before. Existing batch gap/jitter remain unchanged. _tick_spawners(delta) releases role queues after actual successful spawns; queues overlap, without waiting for all units of a role. New roles receive first-spawn priority, then ready queues rotate fairly within each batch. Only queues that actually spawned reset interval timers. Failed spawns do not release followers. First-spawn/release/lead state is stored in existing active_spawners save data. Overflow queues retain their originating wave identity. Capacity 45 and no hitch catch-up remain unchanged.

## RPC and offline rule
No new RPC or request/response: existing authenticated stage catalog bootstrap transports wave entry dictionaries unchanged. Missing/invalid online bootstrap blocks gameplay under C121. No mutation of player records and no local fallback.

## Integration and acceptance
No UI/assets/signals change. Exercise four-wave boundaries, role order, overlapping queues, absent roles, actual lead spacing, interval fairness, failed spawns, capacity, save/resume and overflow isolation. Run both repository static suites and Godot scheduler/timing tests. Seed publication/deployment and campaign win-rate calibration are separate from this implementation; do not claim live deployment or calibrated pass rates.

## Verification ? 2026-10-27
- Godot 4.6.3 TestSpawnCadence PASS: four-wave batches, ordering/actual leads, overlapping queues, missing roles, failed spawn, timer fairness, capacity, save/resume and overflow isolation.
- TestWaveTiming PASS; existing teardown ObjectDB/resource leak diagnostics remain.
- Client standalone static suite PASS. Nakama npm run build and runtime packaging PASS.
- Server C227 metadata, campaign EXP, wave pressure, pressure engine and opening relief regressions PASS.
- 6,663 campaign entries annotated; stripping the two new metadata fields reproduces the original stage seed exactly. No stat/count/EXP/reward/start_delay/interval edits.
- Arc6 generator merge preserves formation metadata. Existing recommendation measurements must be rerun under the new scheduler before claiming calibrated power/pass rates.
- Full server static suite BLOCKED by test_arc6_catalog.cjs: current stage_6_01 Normal recommendation 13978 differs from generated 4045. Reproduced using pre-change HEAD stage seed; no unrelated recommendation overwrite performed. Gate 4 is incomplete; contract remains IN_PROGRESS.
- Presentation gate N/A: no assets/UI changes; existing wave signals retained. Implementation review score 8.5/10, conditional on resolving the existing full-suite blocker and later combat calibration.
- No server seed/publication/deployment performed. Rollout requires both the updated client and a published authenticated stage catalog containing the metadata; older catalogs retain legacy entry eligibility.
