# C237 Arc7 integration acceptance

Status: implemented; local Nakama release 47. Contract v1.4.0, gate score 9/10.

## Delivered

10 stages × 20 waves, 30 difficulty rows, 35 regular and 10 boss element variants. Seed 70261029 materializes independent five-element choices; retry/resume never rerolls. Fixed Lv60 attribute reference. Exact campaign EXP budget and ordered formation preserved. Stage 5 ends with Bạch Hổ; stage 10 with Chu Tước. Each boss has exactly four skills including its basic. No unrelated profile writes.

Arc7Cast implements C01–C07/B01–B04/Z01–Z04: telegraph locks at release, swept projectile/dash contact, one-hit radial front, three sequential projectiles/falling markers, safe annular fire domain, selective root immunity and one-time permanent bloodline. Control/death/pool generation cancels owned casts; JSON state restores fired events, missiles and zone progress without replaying damage. Actual bounded displacement implements roar knockback. Bootstrap validates Arc7 before stage admission. Nullable seed extensions retain collision radius and reference level through DB processing.

AtlasRegistry registers 45 animation sheets, 45 aliases and 30 VFX sheets using native cells. Small 512-square sheets normalize to the same 512-unit frame presentation; Chu Tước attack retains its rectangular native cells. Repaired lion attack/run sheets are selected. Forest background 572×1024 and sweep minimap 512×170 are connected. `ARC7_PREVIEW.png` is the Godot-rendered roster/environment preview.

## Evidence

- `ARC7_RUNTIME_ACCEPTANCE.json`: 240/240 clean mortal Godot runs, all ten stages × three modes × five heroes. Three seeds at stages 1/5/10, one at remaining stages. Neutral element matchups, kite movement, ordinary offered cards; no equipment, affinity or Thần Luân. Final roar displacement rerun replaces stage5 seed237 results. No immortality or guaranteed-skill offers.
- CP recommendation 102737 is the maximum reference CP among the five Lv60 heroes in this tested fixture. It is a conservative tested reference, not a searched minimum.
- Maximum observed incoming single hit in the main matrix: hero2 roughly 982 HP against roughly 4913 max HP; no one-shot in the tested fixture. Hero4 can receive more than its HP over a whole run through regeneration; telemetry separates healing.
- Boss duration is hero-dependent: initial calibration showed Chu Tước about 7–48 seconds across five heroes, Bạch Hổ about 4–26 seconds before its HP was increased from 100000 to 170000. Final per-case timings are in acceptance JSON. The aspirational 45–75 seconds is not a universal guarantee; existing hero DPS differences remain.
- Godot `TestArc7Campaign`: native frames, stats × pressure/difficulty, all attacks, hit budgets, locked rain, moving roar front, bootstrap missing-variant rejection, bloodline/root selection, JSON resume, pool reset and final-wave completion PASS.
- `test_arc7_catalog.cjs`, `test_arc7_backend.cjs`: deterministic/idempotent catalog, exact EXP, variants, loot, unlock/reconciliation and settlement PASS.
- `test_arc7_seed_sql.cjs`: actual compiled atomic seed and PostgreSQL roundtrip in disposable schema PASS; all 200 waves and 45 attributes/skill definitions retain parity.
- Backend build/runtime packaging, standalone client static checks and server static checks PASS. Existing Arc6 generator now replaces rows in place to preserve catalog ordering after adding Arc7.
- Local selective sync backed up affected config, preserved unrelated config and profiles, published v47 and verified zero differences. Nakama local restarted onto matching compiled runtime. No production deployment.

## Remaining limits

The legacy client `-IncludeServerChecks` suite stops at its unrelated Hero5 Skill1 range assertion (expects 768–896, current data is 700–780). No Hero5 balance was altered. This is explicitly excluded from the Arc7 gate, whose dedicated runtime/backend tests pass. Production online play and device performance are not inferred from local/headless results. Neutral benchmark does not estimate every elemental affinity/equipment build or population win rate.

The previous `arc7_bg.jpg` was already deleted in the user's working tree when implementation began; that deletion was preserved. New forest art is used by Arc7. Existing unrelated workspace changes were retained.
