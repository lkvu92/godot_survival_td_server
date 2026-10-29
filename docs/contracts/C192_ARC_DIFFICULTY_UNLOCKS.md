# C192 Arc-wide campaign difficulty unlocks

Version: 1.1.0
Status: ACTIVE

## Schema and eligibility

Campaign arc admission requires both level_min and Normal completion of every
stage in the preceding campaign arc by sort_order (excluding training arc_0).
The first campaign arc requires only level_min. Stale grants cannot bypass this
predicate. Locked arcs remain selectable for viewing both requirements.

Existing profile.completed_stage_levels [{stage_id,level_id}] remains authoritative.
For a campaign arc, Epic requires Normal wins on every configured Normal stage
in that same arc. Legend requires Epic wins on every such stage, and a complete
Normal clear. No grade/S requirement. Global feature gates remain user Lv10/22.
Other arcs' wins do not contribute. Training arc_0 and admin sandbox keep their
existing exceptions; ordinary stage and stamina/ownership restrictions remain.

## RPC and storage

No new payloads/interfaces. start_stage and campaign sweep preview/start enforce
arc eligibility independently of stale unlocked_levels. Completing the last
prerequisite stage reconciles all stage modes in that arc. load_player_profile
repairs stale per-stage Epic/Legend grants via CAS and the server catalog; no
completion history is removed. Client computes the same UI predicate from the
authenticated catalog and completion snapshot; it cannot grant rewards/unlocks.
Pending accepted battles/sweeps keep their existing snapshot; new admissions
use the new predicate. Normal next-stage/next-arc progression remains unchanged.

## Presentation and offline

Arc catalog names and lore use cultivation-world prose for all eight regions.
ArcSelect keeps unlock requirements outside the scrolling lore area.

Existing mode stars reflect availability; no new assets/signals. Missing catalog
or incomplete prerequisite list denies advanced modes. C121 online-only, no local
configuration or gameplay fallback.

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.1.0 | 2026-10-29 | Require minimum level AND full previous Normal arc clear; show locked arc requirements. |
| 1.0.0 | 2026-10-24 | Unlock difficulties per fully cleared arc, replace per-stage mode grants and guard new admissions. |

Validation: backend build/postbuild and server/client static suites PASS.
Server regression covers missing middle/boss-only clears, final completion
unlocking all modes in one arc, arc isolation, legacy string/per-stage grants,
idempotent repair, real start denial without stamina/write, sweep denial and
missing config. Client parity verifies the same arc predicates and retained
user Lv10/22 feature gates. Gate score 9/10. No runtime deployment performed.
