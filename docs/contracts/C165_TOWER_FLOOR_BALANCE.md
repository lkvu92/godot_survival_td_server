# C165 Tower floor balance

Version: 1.1.0
Status: ACTIVE

## Contract

trial_tower config adds base_stat_multiplier=0.7; step remains0.1. Status floors
publish round4(base + (floor-1)*step), from0.7 through2.6. start snapshots this
factor with existing bare same-level demon attributes and rule version4; prepare
rejects older versions. Add speed_increase_per_floor=0.05; status and start publish
speed_multiplier=round4(base+(floor-1)*speed_step), 0.70..1.65. Client applies stat
factor to HP/ATK/DEF, speed factor to attack_speed and inverse speed factor to
skill_cooldown_mul, then existing level20 growth/cards/caps.
Hero and all other modes unchanged; no shared formula change, profile migration,
reward/ticket/difficulty edit or HP multiplier. Missing base fails closed.
Local-only scoped tower sync, no production deployment.

## Validation

v1.1.0: all20 speed factors and native Nakama challenge, runtime build and client
floor/CD/UI regressions pass. Server-wide static suite fails on unrelated store
catalog expected23/actual33; preserved. Local tower-only config/runtime sync passed;
production untouched. Gate score:8/10.

Passed all20 exact status coefficients, isolated native Nakama challenge/rules,
backend build, both static suites and client tower stat/CD/growth/UI regression.
Only local tower config seeded/runtime restarted, production untouched.
Gate score:9/10.

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.1.0 | 2026-10-22 | Separate 5 percentage-point speed/CD curve and version4 snapshots. |
| 1.0.0 | 2026-10-22 | Authoritative 70%..260% tower floor coefficients, rules v3. |
