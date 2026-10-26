extends Node

class HomeProbe extends "res://src/ui/MainMenu.gd":
	func _ready() -> void:
		_build_home_layout()
	func _refresh_special_event_visibility(_force_remote: bool = false) -> void:
		pass
	func _refresh_checkin_event_visibility(_force_remote: bool = false) -> void:
		pass

var failures: Array[String] = []
func check(ok: bool, message: String) -> void:
	if not ok:
		failures.append(message)
		push_error(message)

func _ready() -> void:
	call_deferred("run")

func run() -> void:
	var args := OS.get_cmdline_user_args()
	check(not args.is_empty(),"Explicit server fixture path required")
	if args.is_empty():
		get_tree().quit(1)
		return
	DataRegistry.vip_config = JSON.parse_string(FileAccess.get_file_as_string(args[0].path_join("vip_config.json")))
	for item: Dictionary in JSON.parse_string(FileAccess.get_file_as_string(args[0].path_join("items.json"))):
		DataRegistry.items[str(item.id)] = item
	DataRegistry._remote_ready = true
	NK.is_online = true
	UserContext.current_user = {"id":"vip-ui-fixture", "vip":6,"vip_exp":16000,"vip_progress":{"configured":true,"level":6,"exp":16000,"level_min_exp":16000,"next_level_exp":32000,"milestone_mail_levels":[1,2,3,4,5,6]}}
	var home := HomeProbe.new()
	var template := preload("res://scenes/ui/MainMenu.tscn").instantiate()
	for child in template.get_children():
		template.remove_child(child)
		child.owner = null
		home.add_child(child)
	template.free()
	home.size = Vector2(720,1280)
	add_child(home)
	for frame in range(6): await get_tree().process_frame
	var point: Vector2 = home.home_user_vip.level_label.get_global_rect().get_center()
	var motion := InputEventMouseMotion.new()
	motion.position = point
	get_viewport().push_input(motion,true)
	await get_tree().process_frame
	var click := InputEventMouseButton.new()
	click.button_index = MOUSE_BUTTON_LEFT
	click.pressed = true
	click.position = point
	# Reproduce the touch+mouse pair produced by the project's emulation.
	var touch := InputEventScreenTouch.new()
	touch.position = point
	touch.pressed = true
	get_viewport().push_input(touch,true)
	get_viewport().push_input(click,true)
	await get_tree().process_frame
	click.pressed = false
	get_viewport().push_input(click,true)
	touch.pressed = false
	get_viewport().push_input(touch,true)
	await get_tree().process_frame
	var dialog = home.vip_rewards_dialog
	check(dialog != null and dialog is UiDialog,"Home VIP opens standard dialog")
	if dialog == null:
		print("VIP hit-test: ", home.home_user_vip.get_global_rect()," mouse_filter=",home.home_user_vip.mouse_filter," hovered=",get_viewport().gui_get_hovered_control())
		get_tree().quit(1)
		return
	for frame in range(6): await get_tree().process_frame
	check(dialog.vip_buttons.size()==12,"All12 VIP levels visible")
	check(dialog.selected_level==6 and dialog.detail_label.text.contains("Đã gửi"),"Current level and actual delivered state")
	check(dialog.progress_label.text.contains("+60%"),"Current VIP benefit shown")
	check(dialog.tier_scroll.get_h_scroll_bar().max_value > dialog.tier_scroll.get_h_scroll_bar().page,"VIP list scrolls horizontally")
	check(dialog.get_node("VipLevelListScrollBarUI").mode==ScrollBarUI.Mode.HORIZONTAL,"Tier list uses horizontal ScrollBarUI")
	check(dialog.get_node("VipRewardListScrollBarUI").mode==ScrollBarUI.Mode.HORIZONTAL,"Reward list uses horizontal ScrollBarUI")
	for level in range(1,13):
		dialog._select_level(level)
		check(dialog.reward_row.get_child_count()==DataRegistry.vip_config.milestone_rewards[level-1].rewards.size(),"Complete reward preview VIP%d"%level)
		for column in dialog.reward_row.get_children():
			check(column.get_child(0) is UiItemSlot,"Rewards reuse inventory slot component")
	check(dialog.detail_label.text.contains("Chưa đạt"),"Locked milestone can be previewed")
	for frame in range(4): await get_tree().process_frame
	check(dialog.reward_scroll.get_h_scroll_bar().max_value > dialog.reward_scroll.get_h_scroll_bar().page,"Reward row scrolls horizontally")
	click.pressed = true
	home._on_home_vip_input(click)
	check(home.vip_rewards_dialog==dialog,"Repeated clicks cannot duplicate the modal")
	NK.is_online = false
	var offline := preload("res://src/ui/VipRewardsDialog.gd").new()
	offline.open(self)
	check(offline.definitions.is_empty(),"Offline preview requires server config/connection")
	if failures.is_empty():print("PASS C224 VIP UI: Home click, single UiDialog, all12 tiers, current bonus/sent/locked state, horizontal ScrollBarUI lists, inventory frames, complete quantities and offline guard")
	get_tree().quit(0 if failures.is_empty() else 1)
