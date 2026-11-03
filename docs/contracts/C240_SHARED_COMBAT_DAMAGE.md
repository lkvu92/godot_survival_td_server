# C240 Shared combat damage pipeline

Version: 1.0.1 | Status: ACTIVE | Updated: 2026-10-30

## Scope and authority
One reusable deterministic calculation kernel and one actor adapter for campaign, trial tower/Tam Ma Thap, arena/admin, tribulation/dot pha, enemy and boss casts, talismans, projectiles, area attacks and damage-over-time. Source-specific ATK coefficients, hit geometry, targeting, stage scaling and actor HP/shield/death lifecycle remain owned by their existing systems. No production deployment or player mutation is part of implementation. Gameplay coefficients/config come from the validated authenticated server snapshot; test fixtures are explicitly isolated. No client gameplay JSON fallback.

## Data schema and transport
Damage request: {raw_damage,attack_element,damage_type,skill_id,crit_damage_bonus,defense_ignore_pct,allow_crit,is_dot}. `attack_element` is explicit: neutral, metal, water, wood, fire, earth, or existing tribulation thunder. Empty/missing attack element normalizes to neutral, NEVER to caster element. Basic skill is neutral. Skills declare fixed `element` in server skills.json (existing game_skills.element column); legacy inline enemy/boss attack definitions are materialized with explicit element at config authoring/admission, and delayed components retain their own element. DoT retains the applying skill's element. Empty actor element means no defensive element. Thunder remains an explicit non-five-element damage family with neutral matchup, preserving existing tribulation semantics until a separate thunder design is approved.

Existing get_game_config {table:"all",app_version} includes skill.element, unchanged RPC schema. No new RPC/table or reward/profile field. Invalid declared skill element blocks bootstrap/cast; no inference from hero identity in the calculation kernel. Character element is defensive/skill eligibility data only.

## Interfaces
CombatDamageService.resolve(request, attacker_attributes, defender_attributes, attacker_profile, defender_profile, element_config, defender_mask, crit_roll) returns a result with damage, raw_after_modifiers, attack_element, is_crit, crit_multiplier, counter_pct, element_multiplier, effective_defense, defense_multiplier and modifier diagnostics. Pure kernel has no Node, scene, HP mutation or random calls; caller supplies an optional deterministic crit roll. Actor adapter collects current combat attributes and modifiers once and calls the kernel. CombatFormulaService remains the compatibility facade and delegates rather than duplicating math. Damage target APIs accept the same explicit element and DoT parameters across Player/TowerFighter/Enemy/TribulationBoss. Component payloads snapshot element at creation; they do not look up the actor's current element when they hit.

## Calculation and application order
1. Reject non-finite/negative input safely; zero input remains zero.
2. Sum outgoing additive damage bonuses once, then apply crit once (respect immunity and existing crit eligibility).
3. Apply skill-element vs defender-element-set matchup once from the authoritative server matrix (+30%,0%,-30%); defender picks safest owned element. No-element defender receives1.3 from five-element attacks; all-five receives1.0. Neutral attack has matchup1.0 and no elemental affinity/amplification/resistance bonuses. No attacker-element counter is added.
4. Keep existing additive affinity/amplification/element-resistance policy for elemental damage, floor and equipment caps. Apply hyperbolic DEF 100/(100+effective_defense), including defense-ignore once.
5. Apply existing persistent/DoT reductions and temporary elemental item resistance once, before actor-owned shields. True damage bypasses crit/element/DEF and these reductions; actor immunity/shields/death rules remain.
6. Actor applies immunity/dodge/shields, HP/death/signals with existing game-mode rules; formula is not re-run after a shield.

## Acceptance
Deterministic formula tests cover neutral basics for every hero element, fixed skill element on mismatched/multi-element casters, all defender masks, no double counter, crit, zero/invalid values, DEF ignore, true damage, affinity/resistance and DoT. Runtime parity covers real campaign Enemy/Player, TowerFighter and TribulationBoss, projectile/area/tick element propagation, expired sources, shield ordering and pooling/resume. Static inventory rejects missing attack-element forwarding in gameplay producers. Existing relevant gameplay/tower/tribulation suites, client/server static suites and backend build required. Preserve historical C239 benchmark files; mark them superseded for changed damage semantics. No assertion of calibrated win rates from parser/unit tests.

Acceptance evidence and known balance limitations: `docs/reports/C240_ACCEPTANCE.md`. Local element metadata verified; production is not published.

## Changelog
| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-30 | Shared deterministic damage pipeline, neutral basics, explicit fixed-element propagation and adapters across combat modes. |

Changelog 1.0.1 (2026-11-03): C252 moves client bulk parse/validation to worker, pure element-matrix validation and opt-out of live matchup prepare for admission only. Gameplay/default compilation and authority rules unchanged; desktop regressions PASS.
