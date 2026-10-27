# C156 — Campaign mode stat multipliers

- Version: `1.1.0`
- Status: `ACTIVE`
- Updated: `2026-10-27`

## Rule

Campaign difficulty applies the following multiplier to every spawned enemy's HP, ATK, and DEF, including bosses:

| Mode | HP | ATK | DEF |
|---|---:|---:|---:|
| Normal | ×1.00 | ×1.00 | ×1.00 |
| Epic | ×1.25 | ×1.25 | ×1.25 |
| Legend | ×1.50 | ×1.50 | ×1.50 |

Stage-level movement modifiers remain pacing-only and are applied separately. Legacy stage-level HP and ATK multipliers are retained for configuration compatibility but do not override this combat rule.

## Changelog

- `1.1.0` (2026-10-27): Normalize the requested difficulty ladder to `1.00 / 1.25 / 1.50`; Legend no longer compounds Epic's 1.25 multiplier.
- `1.0.0` (2026-10-21): Server contract for the shared campaign mode stat table.
