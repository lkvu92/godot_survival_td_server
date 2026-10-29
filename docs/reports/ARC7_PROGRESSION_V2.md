# Arc7 campaign progression revision

Date: 2026-10-29. C237 1.5.0.

Local-only selective publication completed as config release 50, with backup
nakama/backups/C237-arc7-1793264975813.json and unrelated-config hash checks.
No player writes or production changes. Runtime build restart is separately
reported by the sync tool and was not performed for this catalog-only update.

## Implementation

Arc7 imports Arc6 CORE directly, preserving all 20 role/count rows. Boss waves
contain one boss and six escorts. Shared formation and EXP allocation utilities
run after roster generation. Speed multiplier is .75; difficulty and pressure
remain runtime-owned and are never pre-multiplied into the catalog.

Base HP/ATK/DEF preserve species ratios within each role and normalize against
Arc6 role medians times median Hero five-level growth, from reference 55 to 60.
Boss source is Wraith, with its .45 ATK budget included once before normalization.
Wave curves run 9.25 to 11.90 at stage 1 and 11.50 to 15.50 at stage 10.

## Validation and limits

Deterministic/idempotent catalog, 200-wave count/EXP/formation audit, actual
compiled backend regression, real PostgreSQL seed roundtrip and Godot Arc7
integration pass. Backend build/runtime packaging pass.

Mortal runtime audit: five heroes Lv60, no equipment/affinity/ThanLuan, ordinary
offered cards, kite movement, stages 1/5/10, all three modes, three seeds.
135 cases: 67 wins and 68 real deaths. Normal passes are 12/15, 10/15, 9/15;
Epic 8/15, 6/15, 6/15; Legend 6/15, 6/15, 4/15.
These are observed baseline clear rates, not universal clear guarantees.
Do not treat maximum tested base power as minimum recommended power.

Arc6 stage 10 Normal control at Lv60, seed 240: heroes 1/3/5 win, heroes 2/4
die. This small control does not establish statistically matched boundary
difficulty across all seeds. Boss-specific TTK and per-source damage remain in
the raw reports; no claim of finalized per-hero tuning is made.

Historical ARC7_RUNTIME_ACCEPTANCE.json is explicitly invalidated for balance.
Current raw evidence: ARC7_PROGRESSION_V2_RUNTIME.json and ARC6_BOUNDARY_LV60.json.
Full server static suite stops at the pre-existing Arc6 unlock test mock, which
expects the old cross-arc unlock behavior and lacks the new eligibility query.
Arc7's own backend regression now checks Lv61 eligibility and below-level denial.
