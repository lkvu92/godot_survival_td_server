extends SceneTree

class Dummy extends Node2D:
	var hp := 10000.0
	var dead := false
	var hits: Array[float] = []
	func take_damage(amount: float, _source: Node, _kind: String = "normal", _crit: float = 0.0, _ignore: float = 0.0) -> void:
		hits.append(amount)
	func apply_status_effect(_effect: Dictionary, _source: Node) -> void:
		pass

func _initialize() -> void:
	call_deferred("run")

func run() -> void:
	var runtime := root.get_node("CombatRuntime")
	var caster := Dummy.new()
	root.add_child(caster)
	runtime.register_actor(caster, "heroes")
	var manager := preload("res://src/managers/SkillManager.gd").new()
	root.add_child(manager)
	var catalog: Array = JSON.parse_string(FileAccess.get_file_as_string(OS.get_cmdline_user_args()[0]))
	var skill: Dictionary
	for row: Dictionary in catalog:
		if row.id == "hero_4_skill_2": skill = row
	assert(not skill.is_empty())
	for level: Dictionary in skill.levels:
		var opts: Dictionary = manager._build_projectile_options(skill, level, Vector2.RIGHT, 700.0, "boomerang")
		assert(is_equal_approx(opts.damage_min_range_multiplier, 0.3))
	var actors: Array[Dummy] = []
	for x in [0.0, 175.0, 350.0, 525.0, 700.0, 750.0]:
		var actor := Dummy.new()
		root.add_child(actor)
		actor.position = Vector2(x, 0)
		runtime.register_actor(actor, "enemies")
		actors.append(actor)
	var off := Dummy.new()
	root.add_child(off)
	off.position = Vector2(350, 100)
	runtime.register_actor(off, "enemies")
	var projectile := preload("res://scenes/projectiles/Projectile.tscn").instantiate() as Projectile
	root.add_child(projectile)
	projectile.set_physics_process(false)
	projectile.setup(caster, actors[0], 100.0, 2000.0, 5.0, 0, null,
		{"skill_id":"hero_4_skill_2", "travel_mode":"boomerang", "direction":Vector2.RIGHT, "max_distance":700.0, "damage_min_range_multiplier":0.3})
	projectile._process_boomerang_movement(1.0)
	assert(is_equal_approx(projectile.global_position.x, 700.0), "No endpoint overshoot on large frame")
	assert(projectile.boomerang_returning and not projectile.released)
	var expected := [100.0, 82.5, 65.0, 47.5, 30.0]
	for index in range(5):
		assert(actors[index].hits.size() == 1, "Every creep on outgoing segment is hit exactly once")
		assert(is_equal_approx(actors[index].hits[0], expected[index]), "Exact per-target spatial falloff")
	assert(actors[5].hits.is_empty() and off.hits.is_empty(), "No hits beyond range or off line")
	# Moving the caster sideways must not alter snapshotted damage distances.
	caster.position = Vector2(0, 1)
	projectile._process_boomerang_movement(1.0)
	for index in range(5):
		assert(actors[index].hits.size() == 2, "Return segment, including final source segment, hits once")
		assert(is_equal_approx(actors[index].hits[1], expected[index]), "Same spatial curve on return")
	assert(projectile.released and off.hits.is_empty())
	var reset := preload("res://scenes/projectiles/Projectile.tscn").instantiate() as Projectile
	root.add_child(reset)
	reset.set_physics_process(false)
	reset.setup(caster, null, 100.0, 100.0, 0.0, 0, null, {"damage_min_range_multiplier":0.3})
	reset.setup(caster, null, 100.0, 100.0)
	assert(is_equal_approx(reset.damage_min_range_multiplier, 1.0), "Reuse cannot leak falloff to other skills")
	print("PASS Hero4 Skill2: five-level config, all swept targets, linear100/82.5/65/47.5/30%, return leg, no endpoint overshoot/off-line hits, pool isolation")
	quit(0)
