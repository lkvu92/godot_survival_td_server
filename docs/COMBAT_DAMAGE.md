# Shared combat damage — C240

Campaign, Tâm Ma Tháp, arena/admin and đột phá use `CombatDamageService.gd` through the actor adapter `CombatFormulaService.gd`. Reuse this path in every new mode.

## Apply a hit

```gdscript
target.take_damage(raw_atk_times_skill_coefficient, caster, "normal", 0.0, 0.0, skill_element, false)
```

The common receiver protocol is `(amount, source, damage_type, crit_damage_bonus, defense_ignore_pct, attack_element, is_dot)`. `raw` excludes crit, elemental matchup, DEF and final reductions. Basic attacks explicitly use `"neutral"`. Resolve a skill's fixed element from `SkillValueService.get_element(...)`; never substitute the actor's element. Snapshot the element into projectiles, timed areas and DoT effects at creation. DoT ticks pass `is_dot=true` and retain their element even after the source dies.

Do not pre-apply outgoing bonuses, counters, crit or DEF. The adapter gathers current actor attributes/profiles and supplies one crit roll. Actors keep immunity, dodge, shields, HP, reflect and death lifecycle. A mode may decide targeting and skill coefficients without reimplementing damage math.

## Deterministic simulation

Call `CombatDamageService.resolve(request, attacker_attributes, defender_attributes, attacker_profile, defender_profile, element_config, defender_mask, crit_roll)` with dictionaries and a supplied roll. This returns damage plus diagnostics without mutating actors or drawing randomness. Required elemental config comes from the validated server snapshot. Missing/invalid matrices reject elemental damage; there is no local balance fallback.

Order: raw × outgoing additive bonuses → crit → one elemental modifier → `100/(100+DEF_after_ignore)` → minimum normal damage → persistent/DoT/item reductions → actor shields/HP. True damage bypasses these formula modifiers; actor immunity and shields still apply. Nonfinite/negative/zero input cannot produce positive damage.

Neutral damage receives no elemental affinity, amplification, resistance or counter modifier. For elemental skills, the defender's safest owned element determines the counter; the attacker actor's elements add no second counter. The cached 32×32 lookup uses `progression.element_combat.matchup_modifier_pct`, preserving the server's actual pair relations. No-element defenders take 1.3 from five-element attacks; all-five defenders use 1.0. Existing thunder hazards remain explicit thunder with neutral five-element matchup.

## Data and verification

Every `game_skills` row declares a fixed `element`; basic is neutral. Inline legacy enemy/boss casts declare element too; Wraith's authored component elements remain distinct. Changing boss element does not recolor skills automatically. Neutral skills are universally eligible; elemental skills filter by owned elements.

`server/tools/sync_damage_elements_local.cjs` supports check/apply/verify for the guarded local stack only, with before/after backups and field-level compare-and-swap. It updates element metadata, never coefficients or player state. Production publication requires its existing release workflow.

Run `server/tools/test_shared_combat_damage.cjs --godot=<console executable>` for formula, mode parity, boss and talisman runtime regressions. The server static suite inventories damage producers and fixed-element seed metadata. See [acceptance](reports/C240_ACCEPTANCE.md) and [contract](contracts/C240_SHARED_COMBAT_DAMAGE.md).
