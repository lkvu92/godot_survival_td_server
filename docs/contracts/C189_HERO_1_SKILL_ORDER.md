# C189 Hero 1 skill order and independent unlock gates

Version: 1.0.1
Status: ACTIVE

## Schema and behavior

Only Hero 1 changes: hero_1_skill_3 is now the former skill 4 ice domain;
hero_1_skill_4 is now the former skill 3 projectile mastery. Swap full skill
behavior, stats, descriptions, icons, VFX/SFX references; preserve authored
asset filenames. Skill 3 hero_level_unlock=20, createria_unlock.level=10;
skill 4 hero_level_unlock=30, createria_unlock.level=15.
All four permanent requirements are 1/10/20/30; combat card levels 1/5/10/15.
Skill 2 is corrected to permanent level 10 and combat level 5.
Persistent hero level is separate from the combat level reset to 1 on entry.
Neither skill starts learned. Card acquisition requires both gates. Missing
or invalid permanent unlock metadata denies access instead of defaulting to 1.

## RPC, interfaces and snapshots

Existing seed_game_data skills rows and authenticated config payloads carry
these fields without new RPCs. Player startup, card choices and CharacterSelect
consume the same permanent gate. SkillManager mastery and domain lookups follow
new IDs; AtlasRegistry maps new IDs to the existing authored art. Tower new runs
use skill_unlock_version=5 and restricted DB catalogs; old tower drafts reject
RUN_RULES_CHANGED. Start fresh battles after seeding/publishing the new layout.
No live run/profile rewrite. Other heroes retain existing order and balance.

## Offline and presentation

C121: complete server snapshot/connection required; no local gameplay fallback.
Existing AtlasRegistry/UiSkin assets and GameEvents are reused.

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-24 | Swap Hero 1 skills 3/4; permanent gates 20/30 and combat gates 10/15; reject missing permanent metadata. |

Validation: backend build/postbuild, server/client static suites PASS. Godot
boundary matrix covers permanent 1/9/10/19/20/29/30 versus combat
1/4/5/9/10/14/15, startup and direct acquisition; invalid metadata denies access.
Multi-ray collision, tower battle/preparation and tower combat parity PASS.
Damage-curve assertions retain mastery damage under its new slot ID. Gate score
9/10. Read-only local DB inspection found old permanent gates 1/5/10/15,
not an automatic learned skill 3 at permanent Lv1. Missing metadata's old Lv1
default was removed. Live DB seed/config publish and deployment not performed.


## 1.0.1 mastery balance (2026-10-24)
Hero 1 skill 4 damage bonus: 12.5/15/17.5/20/22.5 percent; Skill 1 projectile
speed bonus: 15/20/25/30/35 percent. freeze_chance=0.30, freeze_duration=0.2,
freeze_damage_multiplier=0.25 at every level. Existing lotus AOE triggers on
hit and deals 25% of the main projectile damage; only freezing rolls chance,
per directly hit enemy. Other projectile users default to guaranteed freeze
unless configured otherwise. Projectile pooled reuse resets chance to 1.
No unlock/RPC changes; server seed remains authoritative, C121 applies.

| Version | Date | Change |
|---|---|---|
| 1.0.1 | 2026-10-24 | Mastery damage/speed curves, 30% freeze for 0.2s, 25% lotus damage. |
