# C240 shared combat damage acceptance

Date: 2026-10-30. Version: 1.0.0. Technical acceptance: PASS. Balance calibration: REVIEW_REQUIRED.

## Delivered

One deterministic `CombatDamageService` owns damage math. `CombatFormulaService` gathers actor data and delegates. Campaign Player/Enemy, TowerFighter, TribulationBoss, hero and boss skills, arena/admin opponents, projectiles, areas, talismans and DoT now use the same calculation protocol. Basic attacks are neutral; fixed skill/component elements are captured and forwarded, with no extra attacker-element counter. Actor immunity, dodge, shields and death remain actor lifecycle responsibilities.

The authoritative server matrix replaces the pilot's separate hardcoded relations. The 32x32 lookup is prepared at bootstrap and reused. Existing coefficients and approved C238 hero growth were not retuned. The shared atlas remains a pilot executor catalog; this change normalizes legacy skill element metadata and damage routing, not every legacy skill executor into that atlas.

## Evidence

- Shared formula/runtime scene: **611 checks PASS**. Includes all 32 defender masks against neutral and five fixed skill elements, crit, true damage, DEF ignore, affinity/reductions, zero/nonfinite input, invalid configuration, real actor parity, expired-source DoT, snapshot element and shield ordering.
- Runtime regression runner: **16/16 scenes PASS**, no script errors, runtime errors, timeouts or cleanup warnings. Covers element math, additive modifiers, tower parity/battle, tribulation, source/status lifetime, Arc 7, creep/Wraith/Tiger/Vermilion casts and three talisman suites. Machine-readable [runtime results](C240_RUNTIME_REGRESSION.json).
- C239 growth/spawn/atlas regression: **1,097 checks PASS** after server-matrix integration.
- Static inventory: **62 fixed-element skills, 99 enemy definitions, 54 explicit impact paths**; validates seed rejection and shared-kernel routing. Client and server static suites PASS; backend build and runtime packaging PASS. Optional disposable-PostgreSQL suites remain unconfigured; no schema migration was introduced.
- Campaign smoke: **10/10 technically valid runs**, all five heroes at Lv60, normal, seed239, baseline/pilot, mortal kite play with ordinary card offers and a 20-wave target. Each lane had 3 clears and 2 hero deaths; no runtime errors or timeouts. Pilot max compile time 29.296ms. See server `docs/reports/C240_CAMPAIGN_SMOKE.json`. This single-seed smoke and accelerated headless timing do not certify balance or mobile performance.
- Local metadata synchronization: **129 rows updated**, then verify reported **0 differences**. Only skill/inline-cast element fields changed; before/after backups are under workspace `tmp/c240-local-elements/`. No production publication or player-state mutation.

## Test maintenance and limitations

Old test receivers were brought to the seven-argument damage protocol. Coefficient-budget fixtures explicitly use all-five defense to isolate their coefficient assertions from the intended no-element 1.3 modifier. Proc-routing tests pin their test-only chance rather than fail randomly. Wraith's ordinary-creep test now explicitly creates a nonboss variant because the current catalog row is a boss; its movement fixture declares its arena bounds. A VIP fixture now uses a stable persisted creation timestamp instead of a moving Date.now value that could fall after the RPC's captured time.

The tribulation suite retains formula, hazard, milestone and no-baseline-one-shot checks, but separately reports **11 historical balance observations**. Approved C238 HP growth no longer matches its older Hero2 thin-HP band, and several existing movement speeds narrowly miss the old fixed 120px escape assumption. Those targets were not silently satisfied by changing gameplay stats. Tribulation balance requires a separate calibration pass; passing technical integration does not declare these old targets met.

Historical C239 benchmark JSON remains unchanged and does not validate the current global damage semantics. Production must receive fixed skill metadata before publishing this client because invalid/missing skill elements now block config admission. Existing thunder damage remains an explicit non-five-element family pending a separate design decision.

## Gate review

Contract/schema/interfaces: PASS. Kernel and data integration: PASS. Existing presentation/signal/lifecycle integration: PASS, no new visual assets. Functional/static/build regressions: PASS. Technical gate score: **9/10**; remaining work is balance calibration and the separately scoped production release. Usage and extension rules are in [COMBAT_DAMAGE.md](../COMBAT_DAMAGE.md) and both repositories' mirrored Agent rules.
