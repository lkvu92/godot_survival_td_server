# C261 - Boss attack and movement speed reduction

Version: 1.0.0 | Status: IN_PROGRESS | Updated: 2026-11-04

All boss species across all five elements use attack_speed multiplied by 0.70 and move_speed multiplied by 0.60 relative to the current catalog. Apply to per-species element baselines, boss linear base and growth, shared boss baseline, and legacy boss definitions. Keep HP, ATK, DEF, rewards, skills, cooldowns, non-boss stats and stage schedules unchanged. Stage-selected element remains authoritative; buffs and debuffs still apply normally to the reduced base. Server catalog/DB remains authoritative; no local gameplay fallback, new RPC, or player-data mutation.

A guarded one-time migration reads the current live draft, backs up the complete draft and runtime projection, validates every changed value and projection, checks draft revision, and applies atomically with audited boss rows. It updates the local live draft projection without publishing unrelated pre-existing draft edits as a release. Repeat execution must fail closed. Local rollout only unless production is separately requested. Validate all five elements per boss, legacy coverage, non-boss invariance, projection and database readback; report exact counts and verification limitations.

## Local result

Applied to local runtime `draft:431`: 13 boss species, 65 species/element baselines, 20 legacy bosses and five shared element baselines. Authenticated configuration and DB readback confirm the ratios and unchanged non-boss catalog data. C239 runtime 1,191 checks, C259 PostgreSQL integration 75 checks, client static and Nakama build PASS. Full server static suite remains blocked by the pre-existing gift-code test missing `talismanItemQuantity`; no production rollout or physical-device balance evaluation. See [report](../../../client/docs/reports/C261_BOSS_SPEED_REDUCTION.md).

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-11-04 | Reduce boss attack speed 30% and movement speed 40% across all elements. |
