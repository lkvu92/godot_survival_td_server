extends RefCounted

const SETTING_KEY := "auto_card_pick"

static func unlocked() -> bool:
	return UserContext.has_user() and UserContext.get_vip_level() >= 4

static func enabled() -> bool:
	return unlocked() and bool(SaveManager.get_setting(SETTING_KEY, false))

static func can_pick() -> bool:
	return enabled() and NK.is_online and DataRegistry.is_ready() and not SaveManager.settings_scope.is_empty()

static func best_index(offers: Array, levels: Dictionary = {}) -> int:
	var best := -1
	var best_rank := 999
	var best_value := -INF
	for index in range(offers.size()):
		if not offers[index] is Dictionary:
			continue
		var choice: Dictionary = offers[index]
		var kind := str(choice.get("type", ""))
		if kind not in ["skill_new", "skill_upgrade", "support"]:
			continue
		var rank := 0
		var value := 0.0
		if kind in ["skill_new", "skill_upgrade"]:
			value = float(levels.get(str(choice.get("skill_id", "")), 0)) + 1.0
		else:
			var effect: Dictionary = choice.get("effect", {})
			var stat := str(effect.get("stat", effect.get("type", "")))
			var order := ["atk", "cooldown_reduction", "effect_accuracy", "deep_wound_reduction", "def", "attack_speed", "harmful_effect_resistance", "control_duration_reduction", "healing_received_bonus", "heal_percent"]
			var position := order.find(stat)
			rank = position + 1 if position >= 0 else 99
			value = float(effect.get("value", 0.0))
		if rank < best_rank or (rank == best_rank and value > best_value):
			best = index
			best_rank = rank
			best_value = value
	return best
