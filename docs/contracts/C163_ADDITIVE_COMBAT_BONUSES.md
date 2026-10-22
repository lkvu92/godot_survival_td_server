# C163 Additive combat bonuses

Version: 1.0.0
Status: ACTIVE

## Contract

Shared client Player combat modifiers use battle-entry stats plus native in-run
growth, excluding cards/passives/flat buffs, as a base. Percentages sum on that
base (100 ATK + nine 10% cards = 190). Applies identically to campaign,
tribulation and both tower fighters. Percentage passive upgrades replace earlier bonus.
No server RPC/schema or persistent growth changes; server continues owning card,
skill, equipment and floor coefficients. No profile migration or seeding needed.
Permanent progression, crit/element/DEF formulas and floor difficulty unchanged.
No local gameplay catalog/fallback. See client C163 for runtime/reset rules.

## Validation

Server static checks pass. Client additive/tower/rotation/arena regression tests
pass; see client C163 for full coverage and external tribulation snapshot limit.
No backend code, catalog, RPC, profile or production changes. Gate score: 8/10.

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-22 | Base-relative combat modifiers across all gameplay modes. |
