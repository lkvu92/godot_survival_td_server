extends Node

@onready var root: Window = get_tree().root

class Caster extends Player:
	func _ready() -> void:
		attributes = {"atk": 100.0, "move_speed": 330.0}
		set_physics_process(false)

class Probe extends SkillManager:
	var dummy: Node2D
	var ground: SkillVfx
	func _get_targets_in_range(_distance: float, _limit: int) -> Array:
		return [dummy]
	func _vortex_tick(_center: Vector2, _radius: float, _damage: float, _effects: Array) -> void:
		pass
	func _spawn_skill_vfx(frames: Array, position_value: Vector2, first_scale: Vector2, last_scale: Vector2, duration_value: float, spin: float = 0.0, alpha: float = 1.0, layer: int = 65, loop: bool = false, animation: float = 0.0) -> SkillVfx:
		ground = super._spawn_skill_vfx(frames, position_value, first_scale, last_scale, duration_value, spin, alpha, layer, loop, animation)
		return ground

func _ready() -> void:
	_run.call_deferred()

func _run() -> void:
	var catalog_path := ProjectSettings.globalize_path("res://").path_join("../server/data/skills.json")
	var skills: Array = JSON.parse_string(FileAccess.get_file_as_string(catalog_path))
	var skill: Dictionary
	for row: Dictionary in skills:
		if row.id == "hero_4_skill_4": skill = row
	var caster := Caster.new()
	caster.z_index = 5
	root.add_child(caster)
	var target := Node2D.new()
	root.add_child(target)
	var manager := Probe.new()
	manager.player = caster
	manager.dummy = target
	manager.projectile_scene = PackedScene.new()
	root.add_child(manager)
	for entry: Dictionary in skill.levels:
		assert(manager._cast_poison_vortex(skill, entry))
		assert(manager.ground != null and manager.ground.visible)
		assert(manager.ground.z_as_relative == false)
		assert(manager.ground.z_index == 4 and manager.ground.z_index < caster.z_index)
	print("PASS C196 v1.3: all five primary vortex levels render below hero, absolute Z=4")
	get_tree().quit()
