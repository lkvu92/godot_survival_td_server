# C149 ? Campaign wave role unlocks
Version: 1.0.0 | Status: ACTIVE | Updated: 2026-10-21

## Changelog
| Version | Change |
|---|---|
| 1.0.0 | Gate regular rusher/tanker entries by wave number across all five campaign arcs while preserving every wave count and all non-ID configuration. |

## Contract
Applies to the fifty campaign stages whose arc order is1?5, all shared normal/epic/legend difficulties. Wave ordinal is the one-based waves array position used by WaveManager, not a parsed display name. Waves1?3 prohibit rusher and tanker; waves4?6 prohibit tanker; waves7+ retain existing composition. Forbidden entries are replaced one-for-one with the same arc grunt. Existing permitted ranged/grunt entries are retained. Boss entries and their placement, noncampaign/admin stages and all remaining fields remain untouched. No forced new rusher at4 or tanker at7; those are earliest allowed waves, not minimum-count requirements.

| Arc | Grunt replacement | Rusher | Tanker |
|---|---|---|---|
| arc_2 | flame_imp | magma_hound | lava_brute |
| arc_frozen_realm | snow_skeleton | frost_wolf | horn_cactus |
| arc_verdant_realm | spore_crawler | venom_spider | ent_protector |
| arc_iron_bastion | steam_automaton | clockwork_spider | shield_sentinel |
| arc_titan_realm | primordial_wraith | sand_stalker | granite_colossus |

## Authority, schema and interfaces
Only server/data/stages.json changes enemy_id values on forbidden regular entries. Keep entry count, total wave count, entry order, interval/start_delay, modifiers including EXP, skill references, stage metadata and difficulty data unchanged. The replacement creature retains its existing enemy definition and skills; do not normalize HP/ATK across species. No RPC or JSON schema change; existing authenticated published config is authoritative underC121, with no local gameplay fallback. Offline transform/check tool exports ROLES and applyWaveRoleRules(stages); --write explicitly writes the seed; --check is read-only and fails on violations. Client WaveManager already consumes shared stage waves for all three modes.

## Acceptance
Regression must verify actual fifty-stage/150-mode applicability, role gates, one-for-one preservation of count and every non-ID field, no changes at7+, bosses/noncampaign untouched and idempotence. Run client static and backend build checks. Publish/reseed remains separate from source changes.

## Verification
441 forbidden entry IDs replaced across all five arcs. An actual pre/post deep comparison checked883 waves and confirmed every non-enemy_id field and each per-wave total unchanged. Tests/test_campaign_wave_roles.cjs PASS:50 stages,150 difficulty combinations,2643 wave checks, synthetic field/count/EXP/timing preservation, boss/noncampaign exclusion and idempotence. Client static runner and backend npm run build/runtime packaging PASS. Gate score8.5/10. No live publication/reseed performed; no claim of player clear-rate testing.
