# C154 — Unified Defense Curve

- Version: `1.0.0`
- Status: `ACTIVE`
- Updated: `2026-10-21`

## Rule

All live damage and permanent combat-power projection use one defense curve after defense ignore:

```text
effective_defense = max(0, defender_defense × (1 - defense_ignore_pct))
defense_multiplier = 100 / (100 + effective_defense)
final_damage = max(1, raw_damage × crit_multiplier × elemental_multiplier × defense_multiplier)
```

Hero levels, creep and boss attributes, talismans, and temporary defense effects all feed the same curve. Defense has diminishing returns and never grants complete immunity.

## Scope

- `CombatFormulaService` applies the curve to ordinary combat and tribulation damage.
- Godot and Nakama combat-power calculations mirror the same survival value, including talisman defense.
- Existing `element_combat.defense_divisor` data is retained for configuration compatibility; it no longer controls damage reduction.

## Changelog

- `1.0.0` (2026-10-21): Unified live damage, tribulation, and combat-power defense handling.
