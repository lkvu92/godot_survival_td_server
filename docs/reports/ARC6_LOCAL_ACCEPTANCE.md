# Arc 6 local verification — 2026-10-26

Contract: [C221](../contracts/C221_ARC6_NGU_TO_QUY_KHU.md). Implementation plan: [Ngũ Tố Quy Khư](../ARC6_NGU_TO_QUY_KHU_PLAN.md).

## Verified in this continuation

- Backend `npm run build`: PASS, including runtime packaging verification.
- Catalog regeneration check: PASS, zero differing files; seed `60261026`.
- Catalog tests: PASS; 10 stages, 200 waves, 30 difficulty rows, 15 creep variants and two bosses. The 2,544 independently rolled slots contain metal 521, water 498, wood 493, fire 531 and earth 501.
- Backend integration: PASS for mixed-element rewards, legacy reward parity, difficulty exclusions, completion tickets and progression reconciliation.
- Campaign EXP, pressure, pressure-engine and opening-relief regressions: PASS across all six arcs.
- Godot `TestArc6Campaign.tscn`: PASS, 698 frames and 135 actual actor spawns; stats, elements, pressure, difficulty, resume, boss and config gates. Engine shutdown still reports leaked ObjectDB instances and three resources in use; functional assertions pass, but clean shutdown is not established.
- Local Nakama restarted after backend build. Selective verification: PASS, config version 30, zero differences, matching mounted build, `restart_needed=false`, no player writes. Existing local release already contains Arc 6; this continuation did not publish another config release.

## Balance evidence

The existing full matrix remains 449/450 successful full runs, using five heroes and three seeds across 30 stage/difficulty combinations. This is a reference-loadout check, not a population win-rate estimate. Reference tier levels start at 40/45/47 and increase with stage to at most 50; they must not be presented as 450 successful Lv.35 runs. Lv.35 remains the catalog calibration baseline.

The one failed lane was rerun without changing balance: `stage_6_10`, Legend, `hero_2`, seed 222, level 50, kite policy. It again ends in `hero_died`. Evidence: [boss recheck](ARC6_FINAL_BOSS_RECHECK.json). The full reference matrix is preserved in [ARC6_RUNTIME_FINAL_REFERENCE.json](ARC6_RUNTIME_FINAL_REFERENCE.json). This lane satisfies the previously documented minimum two successful seeds per hero, but its repeated failure remains visible for balance review.

## Outstanding acceptance work

The user confirmed the stamina ad reward change from +5 to +15. Canonical `data/rewarded_ads.json` now matches bootstrap and System documentation; C134 regression passes. Full server static checks now reach `test_daily_pack_entitlements.cjs:69`, which expects 330 stamina while runtime returns the configured storage cap of 200. That separate cap mismatch is unresolved.

C221 remains `IN_PROGRESS`. Gate 4 is not complete: resolve the separate daily-pack stamina-cap mismatch, rerun the full static suite, review the repeated final-boss failure and inspect interactive UI/telegraph quality before assigning a final acceptance score. No production deployment was performed.
