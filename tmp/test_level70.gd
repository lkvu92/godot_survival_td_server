extends SceneTree

func _initialize() -> void:
	_run.call_deferred()

func _run() -> void:
	var context = root.get_node("UserContext")
	assert(context.MAX_USER_LEVEL == 70 and context.MAX_HERO_LEVEL == 70)
	for level in [59, 69]:
		assert(context.is_breakthrough_milestone(level))
	var balance = load("res://src/tribulation/TribulationBalance.gd")
	var config = JSON.parse_string(FileAccess.get_file_as_string("E:/LKVU/survival_td_godot/server/data/tribulation_config.json"))
	assert(balance.validate(config))
	for level in [59, 69]:
		for wave in range(1, 10):
			var stats = balance.boss_stats(config, level, wave)
			assert(stats.hp > 0 and stats.atk > 0 and stats.def >= 0)
	var atlas = root.get_node("AtlasRegistry")
	for pair in [[60, 6], [70, 7]]:
		assert(atlas.get_avatar_frame(pair[0]) == atlas.get_ui_texture("avatar_frame_%d" % pair[1]))
		assert(atlas.get_rank_frame(pair[0]) == atlas.get_ui_texture("rank_frame_%d" % pair[1]))
	print("PASS C225 client caps, new breakthrough gates, seven-profile config, boss stats and level 60/70 avatar/rank assets")
	quit()
