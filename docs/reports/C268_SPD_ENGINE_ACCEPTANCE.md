## Current result ? C268 v1.1 common hero base (2026-11-05)
User clarified that EVERY hero starts at 100 SPD at Lv1. This resolves the earlier pending question and supersedes the initial per-hero APS carryover (145?195 SPD) described in historical sections below.
- server/data/heroes.json: all five base attack_speed values are 100. Existing growth factors unchanged: water/earth/metal 1.01, fire 1.012, wood 1.016488. All other source hero fields preserved.
- Persistent unbuffed SPD(L)=100*growth^(L-1). At Lv70: water/earth/metal 198.689, fire 227.749, wood 309.069 (rounded examples). Equipment/cards/consumables remain additional modifiers, so actual battle SPD can be higher than these values.
- normalize_c268_hero_base_spd_local.cjs applied an atomic, CAS-guarded, field-only update to the five live local hero base SPD fields. Backup: tmp/c268-base100-local/1793874287701. A second read-only run PASS confirms idempotence; all growth/other hero columns preserved. No runtime restart needed for this data-only update; clients must reload their authenticated snapshot/profile (re-login/new run).
- C268 server/client engine tests PASS including actual factory setup for all five heroes at 100 SPD and 1-second basic cooldown. Growth/canonical profile refresh tests PASS at Lv1/30/50/70, preserving user progression. C238's old wood 2x Lv70 SPD target is explicitly superseded; its other approved endpoints remain checked.
- Server Phap Tac fixture generation + Godot rating parity PASS with the new bases. Online-only admission and client static checks PASS. No per-skill flight activation, other-stat retune, production rollout or new balance/mobile-performance claim.
The remaining broad-regression limitations below are unchanged. Earlier 150-SPD UI artifacts are historical unit-format evidence, not the current default hero base.

# C268 canonical SPD engine ? scoped acceptance
Date: 2026-11-05. Factory/basic timing phase only; per-skill flight audits remain deferred.

## Delivered
- Shared client CombatSpeedService defines 100 SPD=1 attack/sec, inverse interval, explicit modifier composition and an unbound future SPD/100 travel primitive. No inherited 2-second subtraction formula or hidden 5 attacks/sec cap. Zero/negative/nonfinite SPD disables basics without setting an unrecoverable infinite attack timer.
- Player basics and client/server combat-power projection use the same physical rate. Percent cards/equipment remain percentages; flat gear spd/attack_speed remain points. The existing consumable's documented 25% cycle reduction still divides effective SPD by .75. Slow/domain multiply the rate.
- Enemy source catalogs remain explicitly APS; Enemy routes through an APS-to-SPD adapter, preserving its existing cadence/buffs/minimum behavior. This is a declared compatibility boundary, not number-magnitude inference.
- Hero seed bases converted [1.5,1.45,1.55,1.95,1.5] -> [150,145,155,195,150]. Growth multipliers and all other hero fields unchanged. Server canonicalHeroStates recomputes current_attribute from those hero rows, including attack_speed; stale stored derived stats are not trusted, and user level/EXP/ownership are preserved.
- New required progression.combat_speed metadata declares hero points, legacy enemy APS and skill_flight_enabled=false. Missing/wrong metadata or missing/invalid hero SPD rejects client bootstrap. Paired client/server publication is required.
- Saved hero run attributes include attack_speed_unit=spd_points. Old/unmarked/foreign stat payloads fail before Player mutations; Main rejects them before restoring wave/counters. No automatic x100 guess on user saves.
- Superseded C267 blanket projectile scaling, lead-speed modifications and additive/capped multiplier removed. SkillValueService base speed is unchanged. Projectile speed, hit-effect duration, phase intervals, damage, skill cooldowns, emission count and VFX layers remain untouched in this phase.
- Native Character Select and Battle Stats show SPD separately from attacks/sec. Admin hero edit/preview uses SPD; shared preview explicitly keeps enemy APS formatting when isHero=false.

## Local rollout
`node server/tools/install_c268_local.cjs --apply` performed an atomic CAS-guarded migration in the explicitly named loopback survival_td_local stack. Backup: tmp/c268-local/1793862069358/{before,after}.json. It multiplies live hero base APS x100 only when the unit marker is absent; re-running verifies without scaling again. Only hero attributes.attack_speed and progression unit metadata changed; all other live attributes/config fields preserved. Old C267 config removed.
Local Nakama restarted to load the rebuilt combat-power engine. Local readback verifies canonical metadata/values and disabled skill flight. No production rollout, user inventory/profile migration or leaderboard backfill. Anonymous config RPC smoke was rejected by account guard; no authenticated live-client admission claim is made. The explicit remote-shaped fixture is separately validated by the real Godot admission code.

## Verification
PASS:
- TestCombatSpeedEngine: 80/100/120/150/800/1.5 points, inverse intervals, no magnitude guessing/cap, invalid/zero guards, percent support, gear points, consumable/slow/domain composition, actual 100-SPD basic cadence, resume rejection and unmodified hero5 projectile/impact factory fields.
- server test_combat_speed_engine.cjs: seed units/growth, pure rate, gear projection and basic CP.
- test_hero_growth_balance.cjs: Lv1/30/50/70, stale derived attack_speed re-resolved, user progression preserved.
- TestOnlineOnly with explicit tmp/c268-online-snapshot.json: full admission, missing/invalid units rejected, recovery/online-only guards.
- TestAdditiveCombatBonuses, TestBattleStats (desktop/mobile layouts), TestCombatFocus, TestCampaignFocusInput and TestAutoSkillRotation.
- test_than_luan.cjs + TestThanLuan: server/Godot rating parity fixtures and existing damage/effect/UI checks.
- test_shared_combat_damage.cjs, client static checks, backend npm run build + runtime packaging.
- Web five hero editor/schema/curve/render/format tests; TypeScript typecheck; targeted ESLint on changed character files.
- Character Select skill refresh and rendered unit label; rendered Battle Stats unit/rate separation. Screenshots: client/docs/reports/C268_character_spd.png and C268_battle_spd.png. No overlap/clipped SPD text observed at the rendered fixture viewport.

Open checks:
- Full server static stops at known test_daily_pack_entitlements.cjs:60 (error instead of success), also observed before C268.
- TestConsumableUse hits a native Godot 4.6.3 signal-11 crash at ScrollBarUI._sync_navigation:465 in headless and rendered runs. Its UI suite is not accepted; unchanged cycle-reduction behavior is covered by C268's isolated engine test. ScrollBarUI was not modified.
- No physical Android, long-session timing/balance, production deployment or authenticated full campaign playtest. No claim that old wave balance or combat-power leaderboard values are still calibrated after correcting basic frequency.

Core mechanics checks pass; global regression acceptance remains open. Contract remains IN_PROGRESS because the mandatory broad regression gate is not fully green. Next phase: audit each hero/skill's flight carrier, visual carrier, arrival event and unchanged impact layers before enabling SPD flight scaling.

## Fast-basic report follow-up
Real Player physics callback probe (after startup settling, 2.1 wall seconds/case, no buffs, spy at damage emission) recorded:
- 100 SPD x1: 0.996 attacks/wall-sec; x3: 3.000.
- 150 SPD x1: 1.500; x3: 4.286 (4.5 theoretical).
- 600 SPD x1: 5.455; x3: 15.001 (6/18 theoretical).
The existing reset-to-duration timer loses fractional physics-step time, so high rates round downward; no faster-than-allowed or duplicate emission was observed. No scheduler or balance changes were made from this probe. First startup-contaminated run was discarded and the final JSON contains the settled run.
Raw client evidence: docs/reports/C268_BASIC_CADENCE.json; reproduction: TestBasicCadenceProbe.tscn.
Current hero seed bases are 145?195 SPD (not 100), preserving old authored per-hero base APS on conversion. At Lv70 the unbuffed derived bases are roughly 298/330/308/603/298 SPD. User clarification is pending on whether all heroes should instead START at 100 SPD, versus only sharing the universal reference of 100 SPD=1 attack/sec. Do not infer a hero/stat reset from the absence of an answer; no such retune was applied. Hero/SPD/time-scale details for the reported live session were also requested.
