from pathlib import Path
import json
server=Path(__file__).resolve().parents[1]
client=server.parent/'client'
def edit(path,old,new):
    p=client/path;s=p.read_text(encoding='utf-8')
    assert s.count(old)==1,(path,old[:50],s.count(old))
    p.write_text(s.replace(old,new),encoding='utf-8')
for repo in [server,client]:
    if repo==client:
        (repo/'docs/contracts/C223_AUTO_CARD_PICK.md').write_text((server/'docs/contracts/C223_AUTO_CARD_PICK.md').read_text(encoding='utf-8'),encoding='utf-8')
    p=repo/'docs/contracts/REGISTRY.json'
    s=p.read_text(encoding='utf-8');data=json.loads(s)
    assert not any(x['id']=='C223_AUTO_CARD_PICK' for x in data['contracts'])
    entry='    {"id":"C223_AUTO_CARD_PICK","version":"1.0.0","status":"IN_PROGRESS","updated_at":"2026-10-26","contract_file":"docs/contracts/C223_AUTO_CARD_PICK.md"},'
    s=s.replace('"contracts": [','"contracts": [\n'+entry,1)
    p.write_text(s,encoding='utf-8')
    p=repo/'docs/INDEX.md'
    p.write_text(p.read_text(encoding='utf-8')+'\n- [C223 VIP card Auto/Manual](contracts/C223_AUTO_CARD_PICK.md): VIP4 local preference and offered-card priority.\n',encoding='utf-8')
for file,destination in [('CardAutoPick.gd','src/services/CardAutoPick.gd'),('CardPickModeButton.gd','src/ui/CardPickModeButton.gd')]:
    (client/destination).write_text((server/'tmp'/file).read_text(encoding='utf-8'),encoding='utf-8')
edit('src/ui/HUD.gd','\t_apply_safe_area()\n\tpause_button.pressed.connect', '''\t_apply_safe_area()
\tvar card_pick_mode := preload("res://src/ui/CardPickModeButton.gd").new()
\tcard_pick_mode.name = "CardPickMode"
\tadd_child(card_pick_mode)
\tcard_pick_mode.set_anchors_preset(Control.PRESET_TOP_RIGHT)
\tcard_pick_mode.offset_left = speed_button.offset_left - 68.0
\tcard_pick_mode.offset_right = speed_button.offset_right - 68.0
\tcard_pick_mode.offset_top = speed_button.offset_top
\tcard_pick_mode.offset_bottom = speed_button.offset_bottom
\tpause_button.pressed.connect''')
edit('src/ui/CardChoiceOverlay.gd','var _reroll_busy := false','''const AutoPick := preload("res://src/services/CardAutoPick.gd")
var _auto_epoch := 0
var _auto_scope := ""
var _reroll_busy := false''')
edit('src/ui/CardChoiceOverlay.gd','\t_retry_button_placeholder', '') if False else None
edit('src/ui/CardChoiceOverlay.gd','\tEntitlementState.changed.connect(_update_reroll_button)', '''\tEntitlementState.changed.connect(_update_reroll_button)
\t_auto_scope = SaveManager.settings_scope
\tSaveManager.save_changed.connect(_auto_setting_changed)
\tUserContext.vip_changed.connect(_schedule_auto_pick)
\tvar mode := preload("res://src/ui/CardPickModeButton.gd").new()
\tmode.caption = true
\tmode.name = "CardPickMode"
\tmode.size_flags_horizontal = Control.SIZE_SHRINK_END
\tcard_vbox.add_child(mode)
\tcard_vbox.move_child(mode, 1)''')
edit('src/ui/CardChoiceOverlay.gd','func _dismiss_for_result() -> void:\n', 'func _dismiss_for_result() -> void:\n\t_auto_epoch += 1\n')
edit('src/ui/CardChoiceOverlay.gd','func _on_card_choices_ready(new_choices: Array) -> void:\n','func _on_card_choices_ready(new_choices: Array) -> void:\n\t_auto_epoch += 1\n')
edit('src/ui/CardChoiceOverlay.gd','\t_update_reroll_button()\n\nfunc _on_retry_pressed', '\t_update_reroll_button()\n\t_schedule_auto_pick()\n\nfunc _on_retry_pressed') if 'func _on_retry_pressed' in (client/'src/ui/CardChoiceOverlay.gd').read_text(encoding='utf-8') and '\t_update_reroll_button()\n\nfunc _on_retry_pressed' in (client/'src/ui/CardChoiceOverlay.gd').read_text(encoding='utf-8') else None
# Schedule after the offer is populated; deferred work checks visibility/epoch.
edit('src/ui/CardChoiceOverlay.gd','\tchoices = new_choices\n','\tchoices = new_choices\n\t_schedule_auto_pick.call_deferred()\n')
edit('src/ui/CardChoiceOverlay.gd','func _on_card_pressed(index: int) -> void:\n', 'func _on_card_pressed(index: int) -> void:\n\t_auto_epoch += 1\n')
edit('src/ui/CardChoiceOverlay.gd','func _on_card_choices_failed(message: String) -> void:\n','func _on_card_choices_failed(message: String) -> void:\n\t_auto_epoch += 1\n')
p=client/'src/ui/CardChoiceOverlay.gd'
p.write_text(p.read_text(encoding='utf-8')+'''
func _auto_setting_changed(_data: Dictionary) -> void:
\t_schedule_auto_pick()

func _schedule_auto_pick() -> void:
\t_auto_epoch += 1
\tif not is_inside_tree() or not visible or run_finished or choices.is_empty() or _reroll_busy or _retry_busy or _auto_scope != SaveManager.settings_scope or not AutoPick.can_pick():
\t\treturn
\t_auto_pick_after_delay(_auto_epoch)

func _auto_pick_after_delay(epoch: int) -> void:
\tawait get_tree().create_timer(0.35, true, false, true).timeout
\tif epoch != _auto_epoch or not visible or run_finished or _reroll_busy or _retry_busy or _auto_scope != SaveManager.settings_scope or not AutoPick.can_pick():
\t\treturn
\tvar provider := _get_choice_provider()
\tif not is_instance_valid(provider):
\t\treturn
\tvar levels: Dictionary = {}
\tif provider.has_method("setup_tower"):
\t\tlevels = provider.get("levels")
\telif provider is CardManager and is_instance_valid(provider.player):
\t\tlevels = provider.player.active_skill_levels
\tvar index := AutoPick.best_index(choices, levels)
\tif index >= 0:
\t\t_on_card_pressed(index)
''',encoding='utf-8')
print('Installed VIP4 auto/manual card picking')
