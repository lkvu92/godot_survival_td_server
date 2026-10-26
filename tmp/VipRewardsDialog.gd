extends UiDialog

var selected_level := 1
var vip_buttons: Array[Button] = []
var tier_scroll: ScrollContainer
var reward_scroll: ScrollContainer
var reward_row: HBoxContainer
var detail_label: Label
var progress_label: Label
var definitions: Array = []

func _init() -> void:
	super._init({"title":"QUYỀN LỢI VIP", "size":Vector2(700,520), "content_max_width":610.0, "content_max_height":400.0, "footer_height":0.0})

func _horizontal_strip(height: float, name_value: String) -> ScrollContainer:
	var strip := ScrollContainer.new()
	strip.name = name_value
	strip.custom_minimum_size = Vector2(0,height)
	strip.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	strip.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	strip.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	get_content_container().add_child(strip)
	var util := ScrollBarUI.new()
	util.name = name_value + "ScrollBarUI"
	util.mode = ScrollBarUI.Mode.HORIZONTAL
	add_child(util)
	util.bind_existing_scroll(strip)
	return strip

func _build_ui_content() -> void:
	content_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	var config := DataRegistry.vip_config
	if not NK.is_online or not DataRegistry.is_ready() or not config.get("milestone_rewards", null) is Array or config.milestone_rewards.size() != 12:
		add_content_label("Cần kết nối và cấu hình VIP hợp lệ từ server.",16)
		return
	definitions = config.milestone_rewards
	selected_level = clampi(UserContext.get_vip_level(),1,12)
	progress_label = add_content_label("",16)
	tier_scroll = _horizontal_strip(76,"VipLevelList")
	var tiers := HBoxContainer.new()
	tiers.add_theme_constant_override("separation",8)
	tier_scroll.add_child(tiers)
	for definition: Dictionary in definitions:
		var level_value := int(definition.level)
		var button := Button.new()
		button.name = "VIP%d" % level_value
		button.text = "VIP %d" % level_value
		button.toggle_mode = true
		button.custom_minimum_size = Vector2(92,60)
		UiSkin.apply_button(button)
		tiers.add_child(button)
		button.pressed.connect(_select_level.bind(level_value))
		vip_buttons.append(button)
	detail_label = add_content_label("",15)
	detail_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	reward_scroll = _horizontal_strip(205,"VipRewardList")
	reward_row = HBoxContainer.new()
	reward_row.add_theme_constant_override("separation",12)
	reward_scroll.add_child(reward_row)
	UserContext.vip_changed.connect(_refresh)
	_refresh()

func _select_level(level_value: int) -> void:
	selected_level = level_value
	_refresh()

func _refresh() -> void:
	if detail_label == null:
		return
	var config := DataRegistry.vip_config
	var current := UserContext.get_vip_level()
	var bonus := float(config.get("reward_bonus_per_level",0.0))
	var progress := UserContext.get_vip_progress()
	progress_label.text = "VIP hiện tại: %d • %d điểm • Thưởng Huyền Thưởng/Điểm Danh +%d%%" % [current,int(progress.get("exp",0)),roundi(current*bonus*100)]
	for index in range(vip_buttons.size()):
		vip_buttons[index].set_pressed_no_signal(index+1 == selected_level)
	var sent: Array = progress.get("milestone_mail_levels",[])
	var status := "Chưa đạt mốc" if current < selected_level else ("Đã gửi quà qua thư" if sent.has(selected_level) else "Quà được gửi khi server đồng bộ VIP")
	detail_label.text = "VIP %d • Thưởng gốc +%d%%\n%s • Quà mốc chỉ gửi một lần, nhận trong Hộp Thư." % [selected_level,roundi(selected_level*bonus*100),status]
	for child in reward_row.get_children():
		reward_row.remove_child(child)
		child.queue_free()
	for reward: Dictionary in definitions[selected_level-1].rewards:
		var random := str(reward.type) != "item"
		var id := str(reward.pool[0]) if random else str(reward.id)
		var item: Dictionary = DataRegistry.get_item(id).duplicate(true)
		if item.is_empty():
			continue
		var title := str(reward.get("label", item.get("display_name",id)))
		var column := VBoxContainer.new()
		column.custom_minimum_size.x = 116
		reward_row.add_child(column)
		var slot := UiItemSlot.new()
		column.add_child(slot)
		slot.setup(item,{"item_id":id,"quantity":int(reward.amount)})
		slot.tooltip_text = "%s ×%d%s" % [title,int(reward.amount)," • Mỗi phần chọn ngẫu nhiên một trong 5 hệ" if random else ""]
		var label := Label.new()
		label.text = title
		label.custom_minimum_size = Vector2(116,48)
		label.add_theme_font_size_override("font_size",12)
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		column.add_child(label)
	reward_scroll.scroll_horizontal = 0
