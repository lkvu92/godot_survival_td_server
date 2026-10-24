from pathlib import Path
p=Path(__file__).resolve().parents[2]/'client/src/managers/SkillManager.gd';s=p.read_text(encoding='utf-8')
s=s.replace('player.activate_golden_body(golden_dur)','player.activate_golden_body(float(SkillValueServiceScript.get_fixed(level_data, "protection_duration", 0.5)))',1)
s=s.replace('var punch_interval: float = golden_dur / float(maxi(punch_count, 1))','var punch_interval: float = float(SkillValueServiceScript.get_fixed(level_data, "punch_interval", 0.2))',1)
s=s.replace('var map_radius: float = maxf(viewport_size.x, viewport_size.y) * map_coverage','var map_radius: float = float(SkillValueServiceScript.get_fixed(level_data, "target_radius", 700.0))',1)
s=s.replace('\tvar viewport_size := CombatViewport.skill_world_rect(player).size\n\tvar map_coverage: float = clampf(float(SkillValueServiceScript.get_fixed(level_data, "map_coverage", 0.6666667)), 0.0, 1.0)\n','',1)
start=s.index('\t# Tầng 3 calculation based on existing stacks on target:');end=s.index('\nfunc _setup_talisman_skill()',start)
s=s[:start]+'''	var repeat_multiplier := float(SkillValueServiceScript.get_fixed(level_data, "same_target_damage_multiplier", 0.5))
	var options := {
		"skill_id": "hero_5_skill_4_punch",
		"vfx_frames": punch_frames,
		"vfx_scale": float(SkillValueServiceScript.get_fixed(level_data, "punch_vfx_scale", 0.175)),
		"travel_mode": "arc",
		"arc_end_position": target_position,
		"arc_control_position": arc_control_position,
		"max_distance": map_radius * 1.2,
		"hit_damage_resolver": _golden_punch_damage.bind(hits_by_target, repeat_multiplier),
		"on_hit_callback": _golden_punch_mark.bind(skill, level_data)
	}
	_spawn_projectile(origin, chosen_target, base_damage, speed, 20.0, 0, options)

func _golden_punch_damage(target: Node, base_damage: float, hits: Dictionary, repeat_multiplier: float) -> float:
	var generation := int(target.get("spawn_generation")) if target.get("spawn_generation") != null else -1
	var key := "%s:%s" % [target.get_instance_id(), generation]
	var previous := int(hits.get(key, 0))
	hits[key] = previous + 1
	return base_damage if previous == 0 else base_damage * clampf(repeat_multiplier, 0.0, 1.0)

func _golden_punch_mark(target: Node, _impact: Vector2, skill: Dictionary, level_data: Dictionary) -> void:
	if not is_instance_valid(player) or not is_instance_valid(target) or bool(target.get("dead")):
		return
	var mark_name := "BuddhaMark_%s" % player.get_instance_id()
	var mark := target.get_node_or_null(NodePath(mark_name)) as BuddhaMark
	if mark != null and (mark.is_queued_for_deletion() or not mark.matches(player)):
		target.remove_child(mark)
		mark.queue_free()
		mark = null
	if mark == null:
		mark = preload("res://src/combat/BuddhaMark.gd").new() as BuddhaMark
		mark.name = mark_name
		target.add_child(mark)
		mark.setup(player, _get_named_vfx_frames(skill, level_data, "explosion_vfx_frames", []), SkillValueServiceScript.get_stats(level_data))
	mark.register_hit()
''' + s[end:]
p.write_text(s,encoding='utf-8')
