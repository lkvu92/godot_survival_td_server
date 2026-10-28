# C164 Tower mirror and manual controls

Version: 1.1.0
Status: ACTIVE

## Contract

start_trial_tower preserves hero attributes including equipment. Add server-owned
demon_attributes from the same stored persistent hero attributes before equipment;
hero_element_profile {affinities,levels} from profile.element_affinities/elements;
demon_element_profile clones affinities with every supported root level zero.
skill_unlock_version becomes 2; prepare rejects older run rules. No profile data
mutation/migration, permanent stat change, shared formula or other mode changes.
Client applies floor bonus only after equipment exclusion; demon has no talisman
skill or passive. Client manual controls and 70% camera do not change coefficients.
Authenticated server remains authoritative, no offline gameplay fallback.

## Validation

Build and static suite passed. Isolated native Nakama test verifies root level 10
versus zero, equal affinities and hero-only +500 ATK/+50 DEF/+2000 HP from gear;
run replay, rules-version rejection and no profile migration. Local runtime
restarted with tower-only config sync. No production deployment. Client combat,
manual controls, camera and rendered preview validated. Gate score: 9/10.

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-22 | Explicit tower-only mirror stat/root snapshots, run rules v2. |

## Element training cycle (1.1.0)

Tower is combat training. Server assigns water, fire, earth, wood, metal by (floor-1)%5, independent of selected hero. Existing demon visuals, bare attributes, affinity magnitudes, zero roots, scaling, rewards and progress stay unchanged. Swap affinity values between hero and floor elements so elemental strength follows the opponent element without increasing stats. Server run adds demon_element, demon_skill_levels and demon_draft_catalog; AI drafts 19 upgrades from its own catalog using existing rules. Hero draft unchanged. Status floors expose demon_element. Missing cycle/catalog blocks entry; no offline fallback. Old preparing snapshots reject with RUN_RULES_CHANGED. RPC requests unchanged.

| 1.1.0 | 2026-10-28 | Replace mirror skills with deterministic five-element combat training; retain demon artwork and stat scaling. |

Validation 1.1.0: backend build, client static and complete server static suite PASS. Element-cycle regression PASS across every hero and 30 floors, including independent AI draft and preserved bare stats/scaling. Godot battle/world/preparation/resize/balance/control assertions PASS; process exits 1 with existing missing ui_progress_fill_1m_400_30.png.png texture from the current asset tree. Gate score 9/10.
