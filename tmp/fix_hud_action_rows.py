from pathlib import Path
import re
server=Path(__file__).resolve().parents[1];client=server.parent/'client'
def edit(path,old,new):
    p=client/path;s=p.read_text(encoding='utf-8');assert s.count(old)==1,(path,old[:50],s.count(old))
    p.write_text(s.replace(old,new),encoding='utf-8')
(client/'docs/contracts/C223_AUTO_CARD_PICK.md').write_text((server/'docs/contracts/C223_AUTO_CARD_PICK.md').read_text(encoding='utf-8'),encoding='utf-8')
p=client/'docs/contracts/REGISTRY.json';s=p.read_text(encoding='utf-8').replace('"id":"C223_AUTO_CARD_PICK","version":"1.0.0"','"id":"C223_AUTO_CARD_PICK","version":"1.1.0"');p.write_text(s,encoding='utf-8')
p=client/'docs/INDEX.md';p.write_text(p.read_text(encoding='utf-8')+'\n- C223 v1.1.0: single action rows, level-only skill captions and centered cooldowns.\n',encoding='utf-8')

edit('src/ui/HUD.gd','var cast_labels_enabled := true','var utility_action_row: HBoxContainer\nvar cast_labels_enabled := true')
p=client/'src/ui/HUD.gd';s=p.read_text(encoding='utf-8')
start=s.index('\tvar card_pick_mode := preload("res://src/ui/CardPickModeButton.gd").new()')
end=s.index('\tpause_button.pressed.connect',start)
s=s[:start]+'\t_setup_utility_action_row()\n'+s[end:]
start=s.index('func _layout_skill_mode_button() -> void:')
end=s.index('\nfunc _sync_skill_control_mode()',start)
s=s[:start]+'''func _layout_skill_mode_button() -> void:
\tif not is_instance_valid(skill_mode_button) or not is_instance_valid(utility_action_row):
\t\treturn
\tif skill_mode_button.get_parent() != utility_action_row:
\t\tskill_mode_button.reparent(utility_action_row)
\tskill_mode_button.custom_minimum_size = Vector2(60, 60)
\tif not tower_skill_fan:
\t\tskill_bar.offset_top = utility_action_row.offset_bottom + 12.0

func _setup_utility_action_row() -> void:
\tutility_action_row = HBoxContainer.new()
\tutility_action_row.name = "UtilityActionRow"
\tutility_action_row.alignment = BoxContainer.ALIGNMENT_END
\tutility_action_row.add_theme_constant_override("separation", 8)
\tadd_child(utility_action_row)
\tutility_action_row.set_anchors_preset(Control.PRESET_TOP_RIGHT)
\tutility_action_row.offset_left = -412.0
\tutility_action_row.offset_right = -12.0
\tutility_action_row.offset_top = 64.0 + float(SafeAreaUtil.get_safe_margins().get("top", 0.0))
\tutility_action_row.offset_bottom = utility_action_row.offset_top + 60.0
\tfor action in [pause_button, settings_button, speed_button, cast_labels_button]:
\t\taction.reparent(utility_action_row)
\t\taction.set_anchors_preset(Control.PRESET_TOP_LEFT)
\t\taction.custom_minimum_size = Vector2(60, 60)
\tvar mode := preload("res://src/ui/CardPickModeButton.gd").new()
\tmode.name = "CardPickMode"
\tutility_action_row.add_child(mode)
''' + s[end:]
p.write_text(s,encoding='utf-8')
edit('src/ui/CardChoiceOverlay.gd','''\tcard_vbox.add_child(mode)
\tcard_vbox.move_child(mode, 1)''','''\tvar actions := HBoxContainer.new()
\tactions.name = "CardActionRow"
\tactions.alignment = BoxContainer.ALIGNMENT_CENTER
\tactions.add_theme_constant_override("separation", 12)
\tcard_vbox.add_child(actions)
\treroll_button.reparent(actions)
\tretry_button.reparent(actions)
\tactions.add_child(mode)''')
p=client/'src/ui/SkillButton.gd';s=p.read_text(encoding='utf-8')
start=s.index('func _layout_text() -> void:');end=s.index('\nfunc _setup_cooldown_shade_shader()',start)
s=s[:start]+'''func _layout_text() -> void:
\tif not is_node_ready():
\t\treturn
\tkey_label.hide()
\tmode_label.hide()
\tkey_label.text = ""
\tmode_label.text = ""
\tlevel_label.add_theme_font_size_override("font_size", int(clampf(size.y * 0.15, 8.0, 12.0)))
\tlevel_label.set_anchors_preset(Control.PRESET_TOP_LEFT)
\tvar bottom_height := level_label.get_combined_minimum_size().y
\tlevel_label.position = Vector2(4, size.y - bottom_height - 2)
\tlevel_label.size = Vector2(maxf(size.x - 8, 1), bottom_height)
\tlevel_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
\tlevel_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
\t# Cooldown owns the full badge; static captions never shift its center.
\tcooldown_label.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
\tcooldown_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
\tcooldown_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
\tcooldown_label.add_theme_font_size_override("font_size", int(clampf(size.y * 0.25, 10.0, 18.0)))
''' +s[end:]
# Static mode/key captions are removed, while their gameplay bindings remain.
start=s.index('func _refresh_static_labels() -> void:');end=s.index('\nfunc _ensure_passive_border()',start)
part=s[start:end]
part='\n'.join(line for line in part.split('\n') if not any(x in line for x in ['key_label.text =','mode_label.text =','mode_label.visible =']))
part=part.replace('\tdisabled = not unlocked','\tdisabled = not unlocked\n\tkey_label.hide()\n\tmode_label.hide()\n\tkey_label.text = ""\n\tmode_label.text = ""',1)
part=part.replace('level_label.text = "KHÓA"','level_label.text = "Lv.0"').replace('level_label.text = "75%"','level_label.text = "Lv.1"').replace('level_label.text = "Lv.%d" % level if unlocked else "KHÓA"','level_label.text = "Lv.%d" % level')
s=s[:start]+part+s[end:]
# Do not replace Lv with a charge counter or exhausted caption during combat.
s=s.replace('\t\t\t\tmode_label.text = "0/%d" % max_uses\n','').replace('\t\t\t\tlevel_label.text = "HẾT"\n','').replace('\t\t\t\tmode_label.text = "%d/%d" % [uses_left, max_uses]\n','')
p.write_text(s,encoding='utf-8')
p=client/'tests/test_auto_card_pick.gd';s=p.read_text(encoding='utf-8').replace('overlay.card_vbox.get_node("CardPickMode")','overlay.card_vbox.get_node("CardActionRow/CardPickMode")');p.write_text(s,encoding='utf-8')
print('Updated horizontal action rows and clean centered skill badges')
