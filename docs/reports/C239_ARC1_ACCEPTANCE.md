> Superseded UI/element policy: v1.4.1 restores the original creep anchor, leftward extra icons and single-element Arc 1. See C239_UI_ELEMENT_CORRECTION.md. The 10% dual-element Arc 1 evidence below is historical and no longer describes local configuration.

# C239 v1.4 — Arc 1 local migration

Technical status: PASS. Balance is deferred by user instruction.

All ten order-1 stages of `arc_2` are installed on local Nakama: `stage_flame_frontier`, `stage_2_02` through `stage_2_10`. This is 185 authored waves, not the unrelated `stage_1_XX` IDs. Six species have explicit independent base attributes and per-level growth. Tank HP/DEF growth exceeds the fighter's; ranger ATK growth exceeds the fighter's. No hero attributes, arc power references or legacy combat multipliers enter v2 stat generation.

Each ordinary creep rolls a uniformly random primary five-element and independently has 10% probability of one distinct secondary element. The compiler chooses an explicitly authored per-element atlas loadout before spawning. Native skills keep their own element, effects and geometry; changing actor element never recolors a skill. Bosses retain fire meteor/formation/passive loadouts and an explicit neutral basic skill. Normal/epic/legend change creature and skill levels. Stage IDs, count, timing, formation, EXP, unlocks, loot and recommended power are preserved.

## Verified evidence

- Mechanism test: **28,289 checks PASS**, 10,860 compiled individuals across all 10 stages × 3 modes. Real Enemy/WaveManager spawn, native basic activation, cooldown non-duplication, descriptor-based resume, rejection of injected saved modifiers, element preservation and pool cleanup are exercised. UI checks include reversed primary/secondary order on actor reuse.
- 1,128 of 10,851 creep descriptors were dual-element (**10.395%**); all five primary elements occurred. This is a probability per spawn, not an exact quota in each wave.
- Authenticated local `get_game_config`: **10 migrated stages, 185 waves**, valid schema and complete growth/atlas. The rendering scene successfully passed the production `DataRegistry.reload_from_remote` validator using that response. An isolated local acceptance account/character was created; existing player data was not modified.
- Full-wave technical smoke: **30/30 PASS**, **555 wave completions**, covering all authored stage lengths and all difficulties. Hero5 Lv60 was invulnerable in this test to isolate completion/lifecycle; these runs are explicitly not win-rate or balance evidence.
- Combat regressions: **17/17 scenes PASS**, including **611 shared-damage checks** and **1,401 native-atlas checks**, specialized creep/boss casts, status lifetime, tower, tribulation and talismans. Client/server static suites and backend build/packaging PASS.
- [Machine-readable summary](C239_ARC1_RUNTIME.json) contains per-stage results, element counts, regression outcomes and source hashes.

## UI proof

The screenshot renders the real `Main`, HUD, pooled Enemy and Player scenes from the authenticated local configuration. Four real dual-element creep descriptors and the final dragon boss are placed and paused to inspect the row layout; this is a controlled UI capture, not a claim of their natural simultaneous spawn timing. Element icons are 32px apart on the same row, use AtlasRegistry assets, and remain visible when HP-strip settings hide the HP bar. Boss element is also visible.

[Gameplay and inline dual-element icons](../../../client/docs/reports/C239_ARC1_UI/dual-elements-gameplay.png).

## Local delivery and maintenance

- Canonical authoring: `server/data/c239_arc1_migration.json`; regenerate/check with `server/tools/arc1_levelled_catalog.cjs`.
- Installation: `node server/tools/install_c239_arc1_local.cjs`; verify with `--verify`. Targets only the loopback-bound `survival_td_local` stack and updates Arc 1 wave entries/stage rules plus the shared enemy framework. Existing legacy seed waves remain reference inputs until the separately authorized production migration.
- Original local rows are backed up under workspace `tmp/c239-arc1-local/1793352523101/before.json`. The transaction committed successfully; an initial output-buffer limit prevented the first post-readback, then the limit was corrected and exact readback verification passed. The original backup remains intact.
- Local Nakama was restarted to load the updated runtime. The server EXP cap now sums explicit v2 `entry.exp`, preserving the original total and avoiding legacy enemy-ID fallback.
- Authenticated verification tool: `server/tools/verify_c239_arc1_local_rpc.cjs`. Full-wave runner: `server/tools/test_arc1_levelled_campaign.cjs`. Mechanism scene: `res://tests/TestArc1Levelled.tscn`; UI scene: `res://tests/CaptureArc1Levelled.tscn`.

The campaign harness was corrected to recognize completion at 15–18 authored waves rather than only checkpoint waves. Initial runner timeouts from that assumption are not gameplay failures; the corrected complete 30-case run is the acceptance evidence.

Production has not been published. This report certifies Arc 1's local technical migration, not balance or migration of other arcs. Technical gate score: 9/10; balance and broader rollout remain separate work.
