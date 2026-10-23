# C161 Trial Tower Challenge

Version: 1.3.0
Status: ACTIVE

## RPC and storage

### Persistent skill eligibility v1.3.0

Supersedes unlock-all preparation: query only selected hero.skill_pool members,
filter hero_level_unlock by the owned hero's persistent level, plus existing
in-run level <=20 gate. Store skill_unlock_version=1 with the restricted catalog.
Both client picks and AI draw solely from that same snapshot. Level 20 battle
progression cannot unlock permanent skills; supports fill remaining 19 choices.
prepare rejects old unlock-all runs with RUN_RULES_CHANGED, including replays.
New run is required after changing eligibility rules; abandon remains allowed.

### World arena v1.2.0

trial_tower.arena={world_size:[1800,3200],edge_margin:96,spawn_gap:720} is
validated and snapshotted into new runs. World dimensions must be finite,
at least 720x1280 and at most 10000 per axis; margin positive and less than
one-quarter shortest axis; spawn gap positive and fits playable height. Missing
config rejects start with CONFIG_INVALID. No ticket/reward/progression changes.
Client owns presentation camera and uses the issued fixed shared bounds.

### Preparation v1.1.0 (supersedes copied entry skills)

start returns phase=preparing, combat_level=20, upgrade_count=19, countdown_sec=5,
one starting skill at level 1 and a snapshotted draft catalog from DB/config.
Temporary tower skill access is independent of persistent unlocks, hero-only,
with max levels and in-run prerequisite rules. No permanent progression writes.
prepare_trial_tower accepts run_id and exactly 19 catalog IDs; validate sequential
skill levels/prerequisites. AI independently draws three distinct legal choices
per step and prioritizes SKILL, ATK, cooldown, DEF, SPD, max HP; random tie breaks.
Both receive normal in-run growth to level 20 on client. Effects/AI are server
owned; no client stats accepted. CAS saves player/demon picks, phase=countdown
and combat_started_at_ms=now+5000. Identical retry returns same run/timestamp;
different picks reject. Finish win/loss rejects before preparation/countdown;
minimum win duration uses combat_started_at_ms, not scene entry. Abandon remains
valid during preparation. Client freezes all combat until countdown completes.

Authenticated/version/context gated `start_trial_tower` accepts integer floor
1..20, owned hero_id, request_id. Read status first for daily ticket migration.
Allow only floor<=highest_cleared+1. No ticket/stamina charge. Reuse ordinary
player_stage_runs/active so campaign/sweep/tribulation mutual exclusion and
talisman cast authorization remain in force. Snapshot hero attributes/eligible
hero skill levels and config rules; never accept client combat stats. Start is
idempotent for a request ID; another live combat returns COMBAT_ACTIVE.

`finish_trial_tower` accepts run_id, result win/loss/abandon and terminal HP for
win/loss. Validate matching tower run, active status, expiry, >=3s elapsed for
wins and HP consistency. Win advances at most the next floor. CAS atomically
writes private tower state, run status and clears matching profile.activity.
Replay returns the same settled result; changed result rejects. No floor rewards
are granted while reward schema is undefined. Standard talisman cast consumption
remains server-owned; this mode adds no per-battle durability fee.

Frenzy defaults in server/data/trial_tower.json: 90s, increasing ATK and resistance,
resistance capped below immunity. Client simulates ordinary combat; validation
is run/result validation, not authoritative combat replay. Interrupted runs may
be abandoned without client HP; expired runs cannot award a win.

## Changelog

1.3.0 validation: native tower RPC tests cover hero unlock pools at permanent
levels 1/10/20/30, rejection of forged locked skills, AI limited to the same pool,
stale-rule rejection and safe abandon. Runtime build and status unit tests PASS.
Local runtime synced; production unchanged.

1.2.0 validation: runtime build/postbuild, status tests and isolated native tower
RPC tests PASS; issued run carries the exact seeded arena geometry. Tower-only
local seed/runtime sync PASS. Production unchanged.

1.1.0 validation: runtime build/postbuild, status unit tests and isolated native
Nakama tower tests PASS, including invalid/over-max drafts, preparation-gated
settlement, duplicate/changed confirmation, countdown and post-combat timing.
Local-only runtime/config synced; no production deployment.

Validation: runtime build/postbuild pass; isolated native Nakama tower challenge
test passes for start/replay, locked floors, ownership, timing/HP rejection,
settlement/replay and abandonment. Existing tower status tests pass. Local-only
runtime and config synced; no production deployment.

| Version | Date | Change |
|---|---|---|
| 1.3.0 | 2026-10-22 | Enforce actual persistent skill unlocks for both player and demon builds. |
| 1.2.0 | 2026-10-22 | Validate and snapshot fixed large-world tower arena geometry. |
| 1.1.0 | 2026-10-22 | Validate level-20 drafts, independent priority AI and countdown combat timestamp. |
| 1.0.0 | 2026-10-22 | Issue tower runs and settle progression atomically. |
