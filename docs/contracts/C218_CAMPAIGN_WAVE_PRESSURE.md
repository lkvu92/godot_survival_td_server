# C218 Campaign wave pressure

Version: 1.0.0 | Status: ACTIVE | Updated: 2026-10-25

Applies to campaign arcs with order >=1, not training/admin/tower/tribulation.
Arc order 1 (arc_2/Hoa Gioi) stages 1..10 have 15,16,17,18,19,20,20,20,20,20
waves. All stages in arcs order >=2 have 20. Retain final boss encounter and
existing boss skill eligibility; insert regular waves before final encounter.

System Config key campaign_wave_pressure (version 1) has opening_wave_count=4,
opening_count_multiplier=0.85, growth_interval=4, hp_growth=0.05,
def_growth=0.05, skill_recovery_growth=0.05. Seed source is
data/campaign_wave_pressure.json; it must be seeded/published, not local fallback.
Opening regular-creep counts are reduced once in seed data using rounded wave
totals and proportional largest-remainder allocation. Boss counts are preserved.
Reallocate integer EXP to preserve the existing exact one-level-per-wave rule.
An idempotent versioned source migration prevents repeated count reduction.

For wave n, k=floor((n-1)/growth_interval). Keep authored per-wave combat stats;
add k*hp_growth times wave-1 HP and k*def_growth times wave-1 DEF. Resolve base
using enemy definition with the same enemy's wave-1 entry, otherwise first
regular entry's wave-1 modifiers. This adds pressure without replacing existing
authored ramps. Difficulty multipliers apply once to the resulting HP/DEF.
No added ATK, movement, attack speed, EXP or boss scaling. Skill recovery speed
multiplier=1+k*skill_recovery_growth; recurring skill cooldowns divide by it.
Initial cast delays, duration, one-shot behavior and basic attack timing remain.
Only newly queued creeps use that wave's factor; preserve it in saved modifiers
for backlog/pool/resume without compounding. Missing/invalid rules block campaign.

RPC shapes remain unchanged. Deploy runtime, seed catalog plus System setting,
then publish before running the client. No profile or production writes here.
Validate counts, idempotence, boss/roster/EXP, all boundary waves, preserved stats,
cooldowns/pooling/restore and unavailable-config gate; build runtime/static tests.

Validation: runtime build/packaging and complete client/server static suites
PASS. C218 client boundary/actual spawner/difficulty/cooldown/pool/resume/config
gate regression PASS. Campaign EXP real kill callbacks PASS: 50 stages,
150 modes, 2,955 wave clears and 57,099 kills. Server roster/EXP/idempotence
tests PASS. Existing wave timing assertions PASS (audio teardown warning).

Local development sync: tools/sync_campaign_pressure_local.cjs --apply applied
only 50 campaign stages' waves and the new System setting, with backup in
nakama/backups/C218-*.json. Published config v25. --verify confirms all 985 wave
entries and rules match source exactly, training/admin waves unchanged. The
script checks loopback Compose identity and refuses unrelated pending draft
changes before writing/publishing. No profiles or production data touched.
Other environments still require catalog/System seed and publish through the
normal deployment process. Gate score: 9/10.

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-25 | Four-wave opening relief and additive creep pressure; revised campaign lengths. |
