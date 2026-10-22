# C164 Tower mirror and manual controls

Version: 1.0.0
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
