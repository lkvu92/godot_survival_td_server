# C204 Law aura battle entry

Version: 1.3.0
Status: ACTIVE

## Schema and interfaces
GameState.begin_server_run(run_id, talisman_snapshot={}, than_luan_snapshot={})
atomically copies both authenticated server snapshots. Repeated initialization
at CharacterSelect must carry the same response aura rather than clear it.
UserContext and admin sandbox entry pass the returned than_luan_snapshot.
Missing/empty aura remains empty: no profile or local gameplay fallback.
No RPC/server schema or balance changes. Player renders its frozen run aura
through existing AtlasRegistry DynamicAura and respects show_effect preference.
Remove CharacterSelect avatar aura creation/binding. Dedicated Law preview and
other unrelated UI remain unchanged; UiSkin and signals unchanged.

## Acceptance
Regression covers repeated entry copying, input alias isolation, empty/new-run
reset and visible Player aura from server snapshot. Run aura and static suites.

## Changelog
| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-24 | Preserve Law snapshot into battle and remove hero-select aura. |

Validation: TestThanLuan PASS including repeated entry, copied server snapshot, empty-run reset and no hero-select binding. Both static suites PASS. Gate score9/10.

## Revision1.1.0 mode coverage
TrialTower passes authenticated run.than_luan_snapshot to GameState. Server tower attributes already include thanLuanStats, and talismanCreateStageRun already supplies the aura snapshot. Player.apply_combat_loadout merges its frozen snapshot.stats before passives: absolute reduction fields replace rather than stack, preserving Law during admin creep-test stat rebuilds and repeated loadouts. Empty snapshots add nothing, inner demon remains without player Law. Breakthrough uses its server encounter snapshot. No RPC changes or local config fallback.

| 1.1.0 | 2026-10-24 | Preserve frozen Law stats through loadout rebuilds and tower entry. |

Validation1.1.0: TestThanLuan PASS including all three frozen reduction fields after bare/repeated loadout, breakthrough snapshot and visibility checks. Client/server static suites PASS. Broader TestTowerCombatParity blocked by its older deterministic Hero1 freeze expectation (current freeze is30% chance); this suite is not reported PASS. Gate score8/10 for scoped Law change.

## Revision1.2.0 actual world rendering
Player Law aura uses z_index1 above the opaque default-z0 map and below hero sprite z5. Remove the HUD Law status text (details remain in BattleStatsDialog). Tier outer and middle rings animate their nine registered sheet frames; static center remains single-frame. Preserve preference, frozen stats and separate tower demon aura. No RPC/balance changes or local fallback.

| 1.2.0 | 2026-10-24 | Fix aura hidden behind map; remove text substitute and animate ring sheets. |

Validation1.2.0: TestThanLuan render-order assertion and TestBattleStats PASS; client/server static suites PASS. Gate score8/10. Gameplay screenshot not captured.

## Revision1.3.0 avatar scope
Remove Law aura from all navigation/profile/hero-selection avatars: Home, ProfileDialog, TrialTower selection and CharacterSelect. Remove ThanLuanService.bind_ui and attach_to_portrait APIs to prevent accidental automatic avatar bindings. World Player retains frozen server-run aura; tower demon retains independent aura. The dedicated ThanLuanScreen explicit cosmetic preview remains available, independent of avatars. No stat, RPC, server schema, entitlement or online-only changes.

| 1.3.0 | 2026-10-24 | Remove all automatic avatar Law effects and their service attachment APIs. |

Validation1.3.0: TestThanLuan PASS including all four avatar screens, removed service APIs and preserved gameplay aura/stat checks; both static suites PASS. Gate score9/10.
