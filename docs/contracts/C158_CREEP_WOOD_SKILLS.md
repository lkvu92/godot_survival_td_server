# C158 — Arc 3 wood creep skills

- Version: `1.0.0`
- Status: `ACTIVE`
- Updated: `2026-10-21`

## Authoritative skill data

- `spore_crawler`, `thorn_spitter`, `venom_spider`: `tia_doc` (`wood_bolt`), 100% ATK on impact plus 10% caster ATK poison DPS.
- `ent_protector`: `day_leo_hut_mau` (`wood_vine`), 100% ATK, root for 3s, 10% caster ATK poison DPS, and 20% direct-damage life steal.
- `ancient_treant`, `poison_hydra`: `van_doc_xich_dang` (`wood_swamp`), 4s AOE poison pool, vapor, four 50% thorn strikes at 2s, four 10% bursts, and 2% maximum-HP poison per second.
- `poison_hydra`: `u_hon_phe_cot` (`wood_soul`), four homing 75% skulls after 4s; each impact has a 25% AOE burst, direct poison, and a 2s 2%-maximum-HP corrosion pool.

`poison_percent` is a harmful timed dot with `hp_percent_per_sec`; it remains independent from stacking ordinary `poison`.

## Changelog

- `1.0.0` (2026-10-21): Added Arc 3 wood creep skill data and percent-HP poison status.
