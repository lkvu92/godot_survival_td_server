# C105 User, Hero & Run Experience Progression

Version: 1.2.0 | Status: ACTIVE | Updated: 2026-10-17

## Schema and behavior

User thresholds equal five times Hero thresholds. Existing levels and banked EXP remain intact; thresholds are recalculated by existing progression settlement. Breakthrough gates remain in force.

`player_profiles/main.completed_stage_levels` stores `{stage_id, level_id}` pairs. A winning run whose pair is absent receives twice the rounded stage/difficulty EXP, for both User and the selected Hero. Defeat and repeat clears receive ordinary EXP. Previously completed pairs are not eligible retroactively.

## RPC and interfaces

`award_stage_progression` retains its request (`stage_id`, `difficulty_id`, `hero_id`, `base_exp`, `run_id`, `won`, `killed_enemies`). Response adds `first_clear: boolean` and `first_clear_bonus_exp: integer`; `exp_awarded` includes the bonus. The bonus is the ordinary rounded EXP, not a separate inventory reward. Existing profile, hero, loot and resources fields remain.

Completion, EXP, inventory and active run settlement use one version-checked storage transaction. Replayed or concurrent settlements cannot award the bonus twice. Clients display server totals and the included bonus through `stage_result_stats`; no local awards or offline fallback are permitted.

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.2.0 | 2026-10-17 | User ratio x5; first winning stage/difficulty clear grants x2 EXP and UI bonus breakdown. |
