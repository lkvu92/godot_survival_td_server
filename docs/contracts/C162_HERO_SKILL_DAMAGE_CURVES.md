# C162 Hero skill damage curves

Version: 1.0.0
Status: ACTIVE

## Balance and authority

Change the authoritative game_skills seed source server/data/skills.json for all
five heroes. For each selected ATK-based damage curve with old level-1 base B,
new(L) = round(B * 1.30 + (old(L) - B) * 0.30, 4).
This raises the first skill level 30% and retains 30% of the old absolute
level-up increment; higher levels remain useful but less front-loaded in upgrades.
Apply to active damage_pct, second_damage_pct, final_damage_pct,
needle_damage_pct; hero_1_skill_3 offensive damage bonus; hero_2_skill_3
burn_total_damage_pct; hero_4 poison dps_pct in skill 1/3 level effects.
Zero-only components remain zero. Exclude unused passive damage fields,
crit bonuses, HP-percent damage, direct/explosion/split multipliers, absolute
minimum damage, cooldowns, range, projectile/sequence counts, effects/utility,
hero/enemy/equipment stats, basic attacks and talismans.

Descriptions must reflect resolved numeric damage coefficients, not old prose.
No schema or RPC changes. Applies to campaign/tower/admin tests through the same
authenticated skill snapshot; no client balance copies or offline fallback.
Mechanical patch tool prints an apply_patch diff; it never writes source files.
Tests retain original affected curves and check every transformed value, unchanged
excluded fields and reduced level-5 coefficient/DPS potential at fixed ATK.
Projectile counts/cooldown improvements remain; no promise of a particular TTK.

## Deployment

Local-only sync helper verifies the named survival_td_local container and loopback
port, seeds only the 20 existing hero skill rows, reads back their levels through
read-only local PostgreSQL query and compares to the source. No replacement/pruning, no profile
writes, no full-catalog seed or production deployment. New authenticated config
load is required; already running battles retain their loaded snapshot.

## Validation

Passed curve regression (18 skills, 22 ATK curves, two poison curves), unchanged
excluded catalog hash, Godot tower combat parity/diagnostic trace, tower battle
and automatic skill rotation, and client static checks. Local sync verified all
20 hero rows against PostgreSQL; non-hero rows unchanged. Production untouched.
Gate score: 9/10; live gameplay balance still requires player feedback.

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-22 | Stronger first skill level with flattened subsequent damage growth. |
