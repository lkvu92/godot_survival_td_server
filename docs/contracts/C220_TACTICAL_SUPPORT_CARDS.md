# C220 Tactical support cards and status accuracy

Version: 1.0.1
Status: ACTIVE
Updated: 2026-10-26

## Design and balance

Add five support families with exactly three tiers (common/rare/legendary), using existing campaign level gates 1/11/16 and tier weights 70/20/10. Tower drafts at combat level 20 expose all three authored tiers:

| Family | Vietnamese name | Tier values | Role |
|---|---|---|---|
| deep_wound | Vết Thương Sâu | 10/20/30% healing reduction | Counter sustain; direct damaging hits apply a 4-second debuff, base chance 100% |
| effect_accuracy | Tinh Chuẩn | 10/15/20% relative status accuracy | Improve a skill's authored proc chance |
| effect_resistance | Tịnh Tâm | 10/15/20 percentage points | Resist hostile status application |
| control_tenacity | Kiên Định | 10/20/30% control duration reduction | Reduce control lifetime, separate from proc resistance |
| healing_power | Dưỡng Sinh | 10/20/30% healing received bonus | Strengthen healing, including regeneration |

New families keep only their strongest selected tier per run. Equal/weaker offers are excluded and rejected. Taking a higher tier adds only the difference, retaining unrelated stat sources. Existing ATK/DEF/speed/cooldown/heal card behavior is unchanged. Wound refreshes duration and keeps the strongest active reduction; sources do not add reductions. It can be cleansed and expires normally. Healing: requested * (1 + healing_received_bonus) * (1 - active_wound_reduction). Revive/initial HP and max-HP changes are not healing. No heal can resurrect a dead actor.

## Probability contract

All existing harmful statuses resolve exactly one roll at target application:

`P = clamp(base_chance + base_chance * source.effect_accuracy - target.harmful_effect_resistance, 0, 1)`

Example: 30% base, 20% accuracy, 10% resistance = 26%. Accuracy is relative to base, not flat percentage points. Zero base remains zero. Missing chance means 100%. No minimum 5% and no second independent resistance roll. Immunity/purify and boss-specific full immunity remain hard gates. Existing boss duration/potency resistance remains separate from this probability stat. Beneficial effects use only their authored chance. Move proc rolls from projectile/cast callers into Player/Enemy/TowerFighter entrypoints to prevent double rolling. Stochastic selection of which action to cast is not a status proc.

## Schema and interfaces

Server `cards.json` rows retain existing schema. New effects: `{type:"tactical_stat", stat:"effect_accuracy"|"harmful_effect_resistance"|"control_duration_reduction"|"healing_received_bonus"|"deep_wound_reduction", value:number, duration?:4, chance?:1}`; wound requires duration/chance. Tier and family determine eligibility. `effects.json` adds `deep_wound`, harmful debuff, replace_stronger, duration=4, healing_reduction=0.1, ui_icon_id="deep_wound", bound to supplemental atlas frame 19.

Client: `EffectService.status_probability(base,accuracy,resistance)`, `status_lands(effect,source,target)`, `healing_multiplier(actor)`, `apply_damage_support(target,source,damage_type)`; `Player.apply_tactical_support(effect)`. Metadata tracks selected support values for the run; it is cleared when setting up a new actor and included in the existing run-state snapshot/restore as tactical_support_values.

Tower `preparation.supports` adds the same 15 authored variants; issued `draft_catalog` includes family/tier/rarity/effect. `prepare_trial_tower` request remains `{run_id,picks:[id...]}`; response remains `{success,run}`. Server legality tracks strongest family values independently of skill levels, rejects equal/weaker repeats and uses the same rule for demon picks. Client draft mirrors that rule, showing authored descriptions/rarity and applying confirmed picks through the shared modifier method. Old issued snapshots without these cards remain valid. Config stays server authoritative; client has no local JSON fallback. Seed/publication is a separate operation; source edits alone do not change live servers.

## Presentation and verification

Card icons retain the existing AtlasRegistry art. Wound displays a timed status icon with its server-authored name; C112 v1.6.0 binds it to a unique supplemental icon, preserving the original atlas. Battle stats expose accuracy, healing bonus and control duration reduction. Tests must cover exact probability arithmetic, endpoints, actor entrypoints, projectile single-roll plumbing, immunity, all healing routes, wound strongest/expiry/cleanse, tier upgrades, remote validation and tower authoritative legality. Run client/server static checks and backend build; record any environment or existing failures explicitly.

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-26 | Five three-tier tactical families, shared status probability and healing reduction. |

## Verification 2026-10-26

- Backend `npm run build` and runtime artifact verification PASS.
- `server/tests/test_tactical_support.cjs` PASS: five families x three tiers, campaign/tower value parity, invalid stat rejection, real prepare RPC rejects duplicates/downgrades without writes, valid upgrades and immutable replay.
- Both repository static suites PASS, with the new server tactical regression included.
- `TestTacticalSupport` PASS: complete/partial remote config validation, exact 26% arithmetic, deterministic RNG replay on Player/Enemy/TowerFighter and real projectile, knockback, immunity aliases, strongest tier, run snapshot/resume, wound refresh/expiry/cleanse, direct damage, healing bonuses and both player/enemy regeneration.
- Full `TestTrialTowerBattle`, `TestAdditiveCombatBonuses`, `TestBattleStats`, boss immunity, `TestArc5BossSkills` and `TestCreepFireSkills` PASS. Legacy cast fake now resolves target-side probability, has an explicit isolated arena and matches the current damage signature; skull damage assertion uses current authoritative 35% direct + 15% explosion data. Proc frequencies pass 20,000-sample statistical checks.
- Local gate score 9/10. Existing environment certificate-store warning remains; physical-device visuals/play balance are not yet accepted. No local DB seed, release activation or production deployment performed.

| 1.0.1 | 2026-10-26 | Separate ui_icon_id metadata from gameplay aliases; use the unique C112 supplemental wound icon instead of bleeding artwork. |
