from pathlib import Path
server=Path(__file__).resolve().parents[1];client=server.parent/'client'
p=client/'src/ui/HUD.gd';s=p.read_text(encoding='utf-8')
s=s.replace('utility_action_row','utility_action_column').replace('UtilityActionRow','UtilityActionColumn')
s=s.replace('var utility_action_column: HBoxContainer','var utility_action_column: VBoxContainer')
start=s.index('func _layout_skill_mode_button() -> void:');end=s.index('\nfunc _sync_skill_control_mode()',start)
s=s[:start]+'''func _layout_skill_mode_button() -> void:
\tif not is_instance_valid(skill_mode_button) or not is_instance_valid(utility_action_column):
\t\treturn
\tif skill_mode_button.get_parent() != utility_action_column:
\t\tskill_mode_button.reparent(utility_action_column)
\tskill_mode_button.custom_minimum_size = Vector2(60, 60)
\tskill_mode_button.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
\t_position_skill_bar_below_actions()

func _position_skill_bar_below_actions() -> void:
\tif not is_instance_valid(utility_action_column):
\t\treturn
\tutility_action_column.offset_bottom = utility_action_column.offset_top + utility_action_column.get_combined_minimum_size().y
\tif not tower_skill_fan:
\t\tskill_bar.offset_top = utility_action_column.offset_bottom + 12.0

func _setup_utility_action_column() -> void:
\tutility_action_column = VBoxContainer.new()
\tutility_action_column.name = "UtilityActionColumn"
\tutility_action_column.add_theme_constant_override("separation", 8)
\tadd_child(utility_action_column)
\tutility_action_column.set_anchors_preset(Control.PRESET_TOP_RIGHT)
\tutility_action_column.offset_left = -72.0
\tutility_action_column.offset_right = -12.0
\tutility_action_column.offset_top = 12.0 + float(SafeAreaUtil.get_safe_margins().get("top", 0.0))
\tutility_action_column.offset_bottom = utility_action_column.offset_top
\tfor action in [pause_button, settings_button, speed_button, cast_labels_button]:
\t\taction.reparent(utility_action_column)
\t\taction.set_anchors_preset(Control.PRESET_TOP_LEFT)
\t\taction.custom_minimum_size = Vector2(60, 60)
\t\taction.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
\tvar mode := preload("res://src/ui/CardPickModeButton.gd").new()
\tmode.name = "CardPickMode"
\tmode.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
\tutility_action_column.add_child(mode)
\tutility_action_column.minimum_size_changed.connect(_position_skill_bar_below_actions)
\t_position_skill_bar_below_actions.call_deferred()
''' +s[end:]
p.write_text(s,encoding='utf-8')
p=client/'tests/test_hud_text_layout.gd';s=p.read_text(encoding='utf-8').replace('utility_action_row','utility_action_column')
s=s.replace('"Auto pick shares utility action row"','"Auto pick shares the vertical utility column"')
s=s.replace('action.get_parent() == hud.utility_action_column and is_zero_approx(action.position.y), "All actions share one horizontal row"','action.get_parent() == hud.utility_action_column and is_equal_approx(action.get_rect().get_center().x, hud.utility_action_column.size.x * 0.5), "All action centers share one vertical axis"')
old='\thud.hp_label.text ='
addition='''\tvar previous_action: Control
\tfor action in hud.utility_action_column.get_children():
\t\tif not action is Control or not action.visible:
\t\t\tcontinue
\t\tassert(is_equal_approx(action.get_rect().get_center().x, hud.utility_action_column.size.x * 0.5), "Action center stays on column axis")
\t\tif previous_action != null:
\t\t\tassert(is_equal_approx(action.position.y - previous_action.get_rect().end.y, 8.0), "Action spacing is uniformly8px")
\t\tprevious_action = action
\thud.hp_label.text ='''
assert s.count(old)==1;s=s.replace(old,addition,1).replace('one utility action row','one centered vertical action column')
p.write_text(s,encoding='utf-8')
(client/'docs/contracts/C223_AUTO_CARD_PICK.md').write_text((server/'docs/contracts/C223_AUTO_CARD_PICK.md').read_text(encoding='utf-8'),encoding='utf-8')
p=client/'docs/contracts/REGISTRY.json';s=p.read_text(encoding='utf-8').replace('"id":"C223_AUTO_CARD_PICK","version":"1.1.0"','"id":"C223_AUTO_CARD_PICK","version":"1.1.1"');p.write_text(s,encoding='utf-8')
p=client/'docs/INDEX.md';p.write_text(p.read_text(encoding='utf-8')+'\n- C223 v1.1.1: centered vertical gameplay action column with uniform spacing.\n',encoding='utf-8')
print('Restored one centered vertical gameplay action column')
