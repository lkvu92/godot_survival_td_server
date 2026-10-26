extends Button

const Policy := preload("res://src/services/CardAutoPick.gd")
var caption := false

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	custom_minimum_size = Vector2(60, 60)
	pressed.connect(_toggle)
	UserContext.vip_changed.connect(_refresh)
	SaveManager.save_changed.connect(_saved)
	_refresh()

func _saved(_data: Dictionary) -> void:
	_refresh()

func _refresh() -> void:
	visible = Policy.unlocked()
	var automatic := Policy.enabled()
	UiSkin.apply_icon_button(self, AtlasRegistry.get_action_icon("target" if automatic else "map"))
	text = ("AUTO PICK" if automatic else "MANUAL PICK") if caption else ""
	tooltip_text = "Tự chọn thẻ: %s (VIP4)" % ("BẬT" if automatic else "TẮT")

func _toggle() -> void:
	if Policy.unlocked() and not SaveManager.settings_scope.is_empty():
		SaveManager.set_setting(Policy.SETTING_KEY, not Policy.enabled())
