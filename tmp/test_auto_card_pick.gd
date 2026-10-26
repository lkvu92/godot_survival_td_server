extends Node

const Policy := preload("res://src/services/CardAutoPick.gd")
var errors: Array[String] = []

class Provider extends CardManager:
	var levels := {"high":3, "low":1}
	var selected: Array = []
	var accept := true
	var next_offer: Array = []
	func _ready() -> void:
		pass
	func setup_tower() -> void:
		pass
	func choose_card(choice: Dictionary) -> bool:
		selected.append(choice)
		if accept:
			is_showing_choices = false
			pending_choices_count = 0
			if not next_offer.is_empty():
				pending_choices_count = 1
				call_deferred("offer_next")
		return accept
	func offer_next() -> void:
		var offered := next_offer
		next_offer = []
		pending_choices_count = 0
		is_showing_choices = true
		GameEvents.card_choices_ready.emit(offered)

func check(ok: bool, message: String) -> void:
	if not ok:
		errors.append(message)
		push_error(message)

func support(stat: String, value: float) -> Dictionary:
	return {"type":"support", "title":stat, "effect":{"type":"cooldown_reduction" if stat == "cooldown_reduction" else "stat_percent", "stat":stat, "value":value}}

func pref(value: bool) -> void:
	SaveManager.save_data = {"settings":{"users":{"c223_test":{"auto_card_pick":value}}}}

func wait_pick() -> void:
	await get_tree().process_frame
	await get_tree().process_frame
	await get_tree().create_timer(0.7, true, false, true).timeout

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	call_deferred("run")

func run() -> void:
	var original_user := UserContext.current_user.duplicate(true)
	var original_save := SaveManager.save_data.duplicate(true)
	var original_scope := SaveManager.settings_scope
	var original_online := NK.is_online
	var original_ready: bool = DataRegistry._remote_ready
	UserContext.current_user = {"id":"c223", "vip":4}
	SaveManager.settings_scope = "c223_test"
	NK.is_online = true
	DataRegistry._remote_ready = true
	pref(true)
	var low := {"type":"skill_upgrade", "skill_id":"low", "title":"Low"}
	var high := {"type":"skill_upgrade", "skill_id":"high", "title":"High"}
	check(Policy.best_index([support("atk",0.2),low,high],{"high":3,"low":1}) == 2, "Highest resulting skill level wins over support")
	var order := ["atk","cooldown_reduction","effect_accuracy","deep_wound_reduction","def","attack_speed","harmful_effect_resistance","control_duration_reduction","healing_received_bonus","heal_percent"]
	for index in range(order.size()-1):
		check(Policy.best_index([support(order[index+1],1),support(order[index],0.1)]) == 1, "Family priority " + order[index])
	check(Policy.best_index([support("atk",0.1),support("atk",0.2)]) == 1, "Stronger tier within family")
	check(Policy.best_index([low,low]) == 0 and Policy.best_index([]) == -1, "Stable ties and empty offers")
	var provider := Provider.new()
	add_child(provider)
	var hud := preload("res://scenes/ui/HUD.tscn").instantiate()
	var overlay = hud.get_node("CardChoiceOverlay")
	hud.remove_child(overlay)
	hud.free()
	overlay.choice_provider = provider
	add_child(overlay)
	var mode: Button = overlay.card_vbox.get_node("CardPickMode")
	check(mode.visible and mode.icon != null, "VIP4 toggle has AtlasRegistry icon")
	provider.is_showing_choices = true
	overlay._on_card_choices_ready([low,high,support("atk",0.2)])
	await wait_pick()
	check(provider.selected.size() == 1 and provider.selected[0] == high and not overlay.visible, "Dialog auto-selects exactly one through provider")
	# Manual mode leaves the offer open.
	pref(false)
	overlay._on_card_choices_ready([low])
	await wait_pick()
	check(provider.selected.size() == 1 and overlay.visible, "Manual mode never auto-selects")
	pref(true)
	UserContext.current_user.vip = 3
	UserContext.vip_changed.emit()
	overlay._on_card_choices_ready([low])
	await wait_pick()
	check(not mode.visible and provider.selected.size() == 1, "VIP3 hidden and blocked despite saved auto preference")
	UserContext.current_user.vip = 4
	UserContext.vip_changed.emit()
	# A human pick invalidates the pending auto timer.
	overlay._on_card_choices_ready([low,high])
	overlay._on_card_pressed(0)
	await wait_pick()
	check(provider.selected.size() == 2 and provider.selected[-1] == low, "Manual click cancels pending automated selection")
	overlay._on_card_choices_ready([low])
	NK.is_online = false
	await wait_pick()
	check(provider.selected.size() == 2, "Disconnect blocks selection")
	NK.is_online = true
	overlay._on_card_choices_ready([low])
	SaveManager.settings_scope = "different_scope"
	await wait_pick()
	check(provider.selected.size() == 2, "Account/server scope switch invalidates timer")
	SaveManager.settings_scope = "c223_test"
	overlay._on_card_choices_ready([low])
	overlay._on_card_choices_failed("fixture failure")
	await wait_pick()
	check(provider.selected.size() == 2, "Failed offers never auto-select")
	# Rapid replacement of the offer must pick only the latest offer.
	overlay._on_card_choices_ready([low])
	overlay._on_card_choices_ready([high])
	await wait_pick()
	check(provider.selected.size() == 3 and provider.selected[-1] == high, "Stale offer is cancelled")
	# Existing campaign flow pauses while selecting and resumes after acceptance.
	provider.add_to_group("card_manager")
	overlay.choice_provider = null
	overlay._on_card_choices_ready([low])
	check(get_tree().paused, "Campaign dialog pauses gameplay")
	await wait_pick()
	check(provider.selected.size() == 4 and not get_tree().paused, "Auto timer works while paused and restores campaign flow")
	provider.next_offer = [high]
	overlay._on_card_choices_ready([low])
	await wait_pick()
	await wait_pick()
	check(provider.selected.size() == 6 and not overlay.visible and not get_tree().paused, "Queued level-up dialogs each auto-pick once and unpause only after final offer")
	overlay._on_card_choices_ready([low])
	overlay._dismiss_for_result()
	await wait_pick()
	check(provider.selected.size() == 6, "Finished run cannot auto-select")
	# Preference isolation, without writing the user's real save file.
	SaveManager.settings_scope = "other"
	check(not Policy.enabled(), "Setting does not bleed into another account/server")
	SaveManager.settings_scope = "c223_test"
	var serialized: Dictionary = JSON.parse_string(JSON.stringify({"settings":SaveManager.save_data.settings}))
	SaveManager._restore_local_settings(serialized)
	check(Policy.enabled(), "Local settings serialization/load retains auto preference")
	overlay.free()
	provider.free()
	UserContext.current_user = original_user
	SaveManager.save_data = original_save
	SaveManager.settings_scope = original_scope
	NK.is_online = original_online
	DataRegistry._remote_ready = original_ready
	get_tree().paused = false
	if errors.is_empty(): print("PASS C223 VIP4 card Auto/Manual: priorities, levels, tiers, settings scope, icons, paused dialog, provider path, manual/stale/result/failure/disconnect guards")
	get_tree().quit(0 if errors.is_empty() else 1)
