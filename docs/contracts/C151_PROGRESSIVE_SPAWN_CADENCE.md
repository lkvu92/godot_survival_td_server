# C151 ? Progressive campaign spawn cadence
Version: 1.0.0 | Status: ACTIVE | Updated: 2026-10-21

## Changelog
| Version | Change |
|---|---|
| 1.0.0 | Slow opening batch cadence without changing stage counts, EXP, enemy stats or existing batch size progression. |

## Behavior
Existing batch size1+floor((wave-1)/2), capped by current lane/batch limit, stays unchanged. Shared campaign WaveManager adds wave-phase delays to the existing minimum_inter_spawn_delay0.40s: +0.80s at waves1?3,+0.55s at4?6,+0.30s at7?10,+0 thereafter. Existing jitter0.20s stays. Default batch gaps are1.20?1.40s,0.95?1.15s,0.70?0.90s,0.40?0.60s respectively. Times are gameplay seconds and follow Engine.time_scale; at1.5x opening gaps are0.80?0.93 real seconds. First batch can spawn immediately after the configured entry delay, later batches wait their full cadence; no hitch catch-up bursts.

## Interfaces and authority
WaveManager.get_spawn_batch_delay() returns the deterministic minimum gap for current wave. _tick_spawners adds jitter only after successful spawning. Keep per-entry interval/start_delay gates,45-alive limit, original batch caps and saved next_spawn_delay behavior. Existing exports remain valid. No stage or enemy seed fields, EXP progression, server RPC or JSON schema change; client scheduling is existing WaveManager behavior, not a local fallback for authoritative content. C121 remote-only bootstrap remains mandatory. All campaign arcs/modes share this scheduling. No server restart or reseed changes this client code; distribute updated client to use it.

## Acceptance
Godot tests exercise actual scheduler: early-wave spacing, progressive late-wave acceleration, unchanged batches, actor cap, delayed entry readiness and queue count preservation. Existing timing regression/static checks must remain green. No claim of universal mobile FPS or measured complete-stage duration.

## Verification
TestSpawnCadence PASS in Godot headless(exit0,no warnings):25-wave batch progression,phase boundaries,actual early/late queue timing,jitter,start delays,45-alive cap,queue counts,saved delay and no hitch catch-up bursts. TestWaveTiming PASS(exit0,existing teardown resource warnings remain). Client standalone static checks PASS. Gate score8.5/10. No stage data/EXP edited and no server seed/deploy performed; client update is required.
