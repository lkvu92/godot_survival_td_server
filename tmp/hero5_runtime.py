from pathlib import Path
p=Path(__file__).resolve().parents[2]/'client/src/managers/SkillManager.gd'
s=p.read_text(encoding='utf-8')
start=s.index('\tvar radius: float =',s.index('func _cast_buddha_six_syllable('))
end=s.index('\nfunc _cast_buddha_palm(',start)
s=s[:start]+'''	var radius := float(SkillValueServiceScript.get_fixed(level_data, "radius", 80.0))
	var layers := SkillLayerPlanScript.six_syllable(skill, level_data, impact_center)
	var scale_value := float(SkillValueServiceScript.get_fixed(level_data, "vfx_scale", 0.55))
	var formation_duration := float(SkillValueServiceScript.get_fixed(level_data, "formation_duration", 2.0))
	var formation := _spawn_skill_vfx(layers[0].frames, impact_center, Vector2.ONE * scale_value, Vector2.ONE * scale_value, formation_duration, 0.0, 0.9, 3, false, float(SkillValueServiceScript.get_fixed(level_data, "formation_animation_duration", 1.0)))
	if formation != null:
		formation.hold_last_frame = true
	var effects := [{"id": "holy_stun", "chance": float(SkillValueServiceScript.get_fixed(level_data, "stun_chance", 0.35)), "duration": float(SkillValueServiceScript.get_fixed(level_data, "stun_duration", 0.1))}]
	_damage_buddha_area(impact_center, radius, SkillValueServiceScript.get_damage(player, level_data), 0.0, effects)
	_after(float(SkillValueServiceScript.get_fixed(level_data, "rune_delay", 1.0))).timeout.connect(_start_buddha_runes.bind(skill, level_data, impact_center, effects))
	return true

func _start_buddha_runes(skill: Dictionary, level_data: Dictionary, center: Vector2, effects: Array) -> void:
	if not is_instance_valid(player):
		return
	var duration := float(SkillValueServiceScript.get_fixed(level_data, "rune_duration", 1.5))
	var interval := maxf(float(SkillValueServiceScript.get_fixed(level_data, "rune_tick_interval", 0.5)), 0.01)
	var scale_value := float(SkillValueServiceScript.get_fixed(level_data, "vfx_scale", 0.55))
	_spawn_skill_vfx(_get_named_vfx_frames(skill, level_data, "rune_vfx_frames", []), center, Vector2.ONE * scale_value, Vector2.ONE * scale_value, duration, 0.0, 0.95, 30, true, 0.75)
	var radius := float(SkillValueServiceScript.get_fixed(level_data, "radius", 80.0))
	var damage := _damage_from_percent(float(SkillValueServiceScript.get_fixed(level_data, "rune_damage_pct", 25.0)))
	var hp_percent := float(SkillValueServiceScript.get_fixed(level_data, "rune_hp_percent", 0.0))
	for tick in range(1, maxi(roundi(duration / interval), 1) + 1):
		_after(interval * tick).timeout.connect(_damage_buddha_area.bind(center, radius, damage, hp_percent, effects))

func _damage_buddha_area(center: Vector2, radius: float, damage: float, hp_percent: float, effects: Array) -> void:
	if not is_instance_valid(player):
		return
	for enemy in CombatRuntime.in_radius(player, center, radius):
		if not is_instance_valid(enemy) or enemy.global_position.distance_to(center) > radius:
			continue
		var enemy_max_hp := float(enemy.get("max_hp")) if enemy.get("max_hp") != null else 0.0
		if enemy.has_method("take_damage"):
			enemy.take_damage(damage + enemy_max_hp * hp_percent, player)
		for effect in effects:
			if effect is Dictionary and randf() < clampf(float(effect.get("chance", 1.0)), 0.0, 1.0):
				EffectServiceScript.apply_effects(enemy, [effect], player)
''' + s[end:]
start=s.index('\tvar stun_dur:',s.index('func _resolve_buddha_palm_impact('))
end=s.index('\nfunc _cast_buddha_golden_body(',start)
s=s[:start]+'''	var crack_scale := float(SkillValueServiceScript.get_fixed(level_data, "crack_vfx_scale", 0.80))
	_damage_enemies_in_radius(center, radius, damage, [])
	var crack_duration := float(SkillValueServiceScript.get_fixed(level_data, "crack_duration", 1.0))
	_spawn_skill_vfx(crack_frames, center, Vector2.ONE * crack_scale, Vector2.ONE * crack_scale, crack_duration, 0.0, 0.85, 3)
	var crack_interval := maxf(float(SkillValueServiceScript.get_fixed(level_data, "crack_tick_interval", 0.5)), 0.01)
	var burn_percent := float(SkillValueServiceScript.get_fixed(level_data, "crack_burn_hp_percent", 0.005))
	var crack_ticks := maxi(roundi(crack_duration / crack_interval), 1)
	for tick in range(1, crack_ticks + 1):
		_after(crack_interval * tick).timeout.connect(_damage_buddha_area.bind(center, radius, 0.0, burn_percent / crack_ticks, []))
	var wave_count := int(SkillValueServiceScript.get_fixed(level_data, "wave_count", 1))
	var wave_radius := float(SkillValueServiceScript.get_fixed(level_data, "wave_radius", 100.0))
	var wave_damage := _damage_from_percent(float(SkillValueServiceScript.get_fixed(level_data, "wave_damage_pct", 30.0)))
	var wave_scale := float(SkillValueServiceScript.get_fixed(level_data, "wave_vfx_scale", 0.56))
	for index in range(wave_count):
		var delay := index * float(SkillValueServiceScript.get_fixed(level_data, "wave_interval", 0.2))
		if index == 0:
			_spawn_buddha_wave(center, wave_radius, wave_scale, wave_damage, wave_frames, index, "expanding_ring_aoe", level_data)
		else:
			_after(delay).timeout.connect(_spawn_buddha_wave.bind(center, wave_radius, wave_scale, wave_damage, wave_frames, index, "expanding_ring_aoe", level_data))

func _spawn_buddha_wave(center: Vector2, base_radius: float, wave_scale: float, wave_damage: float, wave_frames: Array, _wave_idx: int, wave_aoe_type: String, level_data: Dictionary) -> void:
	if not is_instance_valid(player) or wave_aoe_type != "expanding_ring_aoe":
		return
	var duration := maxf(float(SkillValueServiceScript.get_fixed(level_data, "wave_expand_duration", 0.55)), 0.05)
	var ring_width := maxf(float(SkillValueServiceScript.get_fixed(level_data, "wave_ring_width", 24.0)), 1.0)
	var padding := maxf(float(SkillValueServiceScript.get_fixed(level_data, "wave_collision_padding", 16.0)), 0.0)
	var ticks := maxi(int(SkillValueServiceScript.get_fixed(level_data, "wave_tick_count", 12)), 1)
	var effects := [{"id": "holy_stun", "chance": float(SkillValueServiceScript.get_fixed(level_data, "wave_stun_chance", 0.2)), "duration": float(SkillValueServiceScript.get_fixed(level_data, "stun_duration", 0.1))}]
	_spawn_expanding_ring_aoe(center, base_radius, duration, ring_width, padding, ticks, wave_damage, 0.0, effects, wave_frames, Vector2.ONE * wave_scale * 0.5, Vector2.ONE * wave_scale * 1.1)
''' + s[end:]
# Limit this replacement to the ring helper, whose previous effect application
# ignored chance. Other callers keep their existing behavior.
start=s.index('func _damage_enemies_on_expanding_ring('); end=s.index('\nfunc _cast_heal(',start)
block=s[start:end].replace('\t\tEffectServiceScript.apply_effects(enemy, effects, player)','\t\tfor effect in effects:\n\t\t\tif effect is Dictionary and randf() < clampf(float(effect.get("chance", 1.0)), 0.0, 1.0):\n\t\t\t\tEffectServiceScript.apply_effects(enemy, [effect], player)')
s=s[:start]+block+s[end:]
p.write_text(s,encoding='utf-8')
