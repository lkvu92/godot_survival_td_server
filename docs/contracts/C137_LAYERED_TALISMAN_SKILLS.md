# C137 - Layered talisman skills 16, 26-30

Version: 1.0.0 | Status: ACTIVE | Updated: 2026-10-18

## Authority and schema
Six supplied four-layer asset sets replace placeholder projectile/area effects. Balance lives in server/data/skills.json and the authenticated database config. AtlasRegistry registers 24 component sheets/images; per-layer frames, pivots, scale, opacity and lifetime are referenced by server cast_config. No local gameplay fallback.

skill_type=layered_talisman; element=water/metal/earth/wood/fire; cast_config={behavior,layers:{component:{frames,duration,pivot,scale,layer,opacity,cycle,loop,hold}},...}; levels[].cast_config overrides level-specific damage_pct,range,radius and optional layer presentation. Existing ATK coefficients and cooldowns are preserved, except skill28 uses incoming-hit conversion instead of an attack coefficient. One field/lane per cast replaces the placeholder projectile_count progression.

## Phase behavior
| ID / element | Gameplay | Independent presentation |
|---|---|---|
| 16 / water | Sword at .18s:30% of configured damage in central radius28. Spikes at .32s:70% in radius100/110/120/130/140. Freeze .43s:3s, subject to resistance. | Descending sword, ground ellipse, upright spikes, one foot overlay per frozen target. |
| 26 / metal | Forward swept lane; one hit/enemy, 100% defense ignore, execute at <=15% remaining HP after slash, honoring invulnerability/shields. | Aerial sword, traveling crescent, ground rift, traveling flanking rays. |
| 27 / earth | Bell at viewport center; impact .28s, whole-map enemy damage and stasis .34s for2.5s subject to resistance. Hero/UI/projectiles keep running. | Translucent descending bell, formation, three staggered expanding rings, frozen dust. Enemies turn gray. |
| 28 / water | Following8s field; convert70% post-mitigation incoming damage to healing, remaining30% damages HP. Coalesce30% incoming damage into counter waves at most every.2s, eight radial lanes traveling200 units in.25s, once/enemy/wave. True counters never recursively reflect. | Following ground formation/fish aura loop; heal particles and outward counter blades only after actual absorption. |
| 29 / wood | Fixed target-centered vortex pulls1.2s with collision and control resistance. Mountain damage .35s. Bind .45s: permanent20% ATK and20% movement reduction, strongest wins without stacking. | Floating scroll, ground ellipse vortex, upright mountain, per-target vines until death/despawn. |
| 30 / fire | Axe .20s:30% true lane damage. Four pillars at15/38/62/85% lane length, .28/.36/.44/.52s:70% true damage once/enemy across the pillar group. | Diagonal axe/rift, upright pillars, ash with masked screen-space heat refraction. |

True damage bypasses DEF/element modifiers/crit but honors shields and invulnerability. Rifts, arrays, rings, dust, vines and ash never create unintended damage ticks. Damage ledgers include pool spawn_generation. Freeze target snapshots reject recycled identities. Permanent debuffs persist in Enemy.build_run_state/restore_run_state; pooling clears them and overlays.

## Interfaces and RPC
SkillManager._cast_layered_talisman merges root/level config, validates required fields before RPC/use consumption, snapshots target position/direction, and creates LayeredTalismanCast.setup(caster,skill,settings,target,direction). LayeredTalismanCast.valid_config blocks missing required balance/layers. The cast owns elapsed-time events, swept lane queries, damage ledgers and scoped reversal handling. Player.talisman_reversal converts incoming damage after mitigation. Enemy supplies permanent weakening, collision-safe pull, outgoing damage multiplier and explicit incoming attack-element override.

Existing validate_talisman_cast(run_id,cast_seq,skill_id) RPC and response remain unchanged. No new RPC or database migration. Existing server-authenticated use/durability/cooldown accounting remains in SkillManager.

## Rendering and lifecycle
TalismanLayer uses only AtlasRegistry frame access. Three-by-three sheets expose index0..8; static layers expose index0. Optional atlas inset3 removes baked grid borders from dust/ash. Ground components stay below bodies; sword/bell/spikes/pillars use contact pivots. Lane transforms undo the authored diagonal before stretching along the attack direction; upright pillars never rotate with the lane. Formation rotation is baked into its animation to preserve ground perspective. Heat shader phase follows the paused cast clock.

Paused tree freezes the cast; a long step resolves all crossed phase events once. Caster death/removal cancels pending attacks. Attached freeze overlays follow actual freeze_timer; vines survive the cast and restore with permanent reductions. Self-field cleanup never clears a newer replacement field.

## Validation (2026-10-18)
- PASS native TestLayeredTalismans: six casts, required-config guard, phase damage, low-FPS swept lanes, execution, freeze duration/cleanup, pool generations, full-map stasis/resistance, incoming conversion, traveling true counters, recursion guard, permanent ATK/speed effects and snapshots, true-damage shields, four pillar events, caster death and pause.
- PASS client run_static_tests.ps1 and test_talisman_cast_families_static.ps1.
- PASS existing elemental combat runtime with authoritative progression fixture injected by the test harness.
- PASS server test_layered_talisman_config.cjs: six skill records, all five levels, element consistency and layer/damage budgets.
- PASS npm run build and verify_runtime packaging.
- PASS PostgreSQL seed integrity: complete catalog seed/readback, config roundtrips, rollback and publication checks on disposable localhost database; database stopped afterward.
- PASS Godot OpenGL assembled preview, including heat shader; output client/temp/c137-layered-preview.png. Preview scene uses shorter lanes only to fit six review cells; live gameplay uses server range.
- Full server static runner is blocked by pre-existing missing tests/test_new_profile_inventory.cjs. Scoped C137 tests pass; this unrelated fixture remains outside this change.
- Gate score: 8.5/10. Remaining manual acceptance: full battle on target mobile devices (visibility/performance).

## Run tests
From client: Godot --headless --path . --log-file temp/c137-runtime.log --scene res://tests/TestLayeredTalismans.tscn -- <absolute-server-data-directory>
From client: powershell -ExecutionPolicy Bypass -File tests/run_static_tests.ps1
From server: node tests/test_layered_talisman_config.cjs
From server/nakama: npm run build
Preview: Godot --path client --rendering-method gl_compatibility --scene res://tests/PreviewLayeredTalismans.tscn -- <absolute-server-data-directory>

## Rollout
Build/export the changed Godot client. Upsert skills/items/talismans using the existing full seed command (server/nakama: python3 seed_all.py), then reconnect the client to reload authenticated config. Do not use --content-only for these catalog tables. Server runtime/RPC code is unchanged; restarting alone cannot apply JSON seed edits. No push/deploy was performed.

## Changelog
| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-18 | Six layered talisman behaviors, independent phase damage, authoritative seed config, previews and runtime verification. |
