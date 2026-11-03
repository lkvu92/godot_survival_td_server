# C239 creep/boss atlas migration

165 deduplicated native skills, 305 equipped references across 99 enemies, plus 15 existing pilot skills. Five authored levels each; current enemy bindings select level 1. Native adapters preserve current cast and passive behavior; skill damage coefficients grow 10% per level. Ice-named attacks use water, correcting inherited actor elements and changing matchup damage in affected legacy encounters. Legacy loadouts are retained even if their actor element differs; v2 stage authoring enforces fixed-element eligibility. Pet/hero native-executor adapters and broad stage migration remain separate work.

Server seed and runtime config validators reject invalid references and native executors. The client resolves native bindings from the authoritative progression snapshot. Enemy fields are generated compatibility projections. Source: `server/data/creep_boss_skill_atlas.json`; regenerate via `node server/tools/creep_boss_skill_atlas.cjs --apply`.

Verification: native atlas runtime 1,395+ checks, C239 framework 1,202 checks; server/client static suites and backend build PASS. Specialized cast regression results are available under workspace `tmp/c239-atlas-final2`. Full balance calibration and production publication were not performed.
