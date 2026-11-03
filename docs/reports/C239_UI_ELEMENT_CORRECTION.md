# C239 v1.4.1 UI and early-arc correction

The previous v1.4 rollout incorrectly moved the creep element icon away from the original HP bar and enabled dual-element spawning in Arc 1. This correction implements the user's requested layout and progression rules.

- Creep HP geometry and dynamic position remain unchanged. The primary element sprite is restored as an HP-bar child at `(-19, 2.5)`. Each extra icon is 32px to the LEFT of the preceding icon, on the same baseline. HP visibility settings retain their original behavior.
- Boss world HP/icon strip remains hidden. The primary HUD element remains in the original badge. Additional owned elements appear in one centered row immediately below the boss HP bar. The HUD cache now responds to element-mask changes as well as the primary element.
- Arc 1 creeps have exactly one element. The authoring generator preserves the exact pre-migration code policy: 70% arc element and 30% authored species element. All current Arc 1 species are authored as fire, so the effective result is fire-only; it is not a new 70%/7.5% distribution.
- Campaign-order checks reject multi-element configurations for Arcs 1-5. WaveManager derives campaign order from the authoritative arc catalog. Arc 6+ may use multi-element entries.

## Evidence

The updated Arc 1 runtime test covers 10 stages × 3 difficulties, compiling 10,860 individuals including 10,851 ordinary creeps. It reports zero dual-element creeps and all 10,851 primary elements as fire. Server authoring/EXP tests, client/server static suites and rendered HUD assertions pass.

[Restored Arc 1 layout](../../../client/docs/reports/C239_ARC1_UI/arc1-restored.png) uses the authenticated local configuration. [Multi-element layout test](../../../client/docs/reports/C239_ARC1_UI/multi-layout-restored.png) uses a controlled Arc 7 rendering fixture to exercise leftward creep icons and four secondary boss elements; it does not alter local Arc 7 waves or their spawn policy.

Local Arc 1 was reapplied and authenticated `get_game_config` readback verified all ten stages / 185 waves. The previous local state is backed up under workspace `tmp/c239-arc1-local/1793353962488/before.json`. No production publication or balance tuning is part of this correction.
