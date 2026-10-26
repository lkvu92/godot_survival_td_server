from pathlib import Path
server=Path(__file__).resolve().parents[1];client=server.parent/'client'
(client/'docs/contracts/C224_VIP_BENEFITS_MILESTONES.md').write_text((server/'docs/contracts/C224_VIP_BENEFITS_MILESTONES.md').read_text(encoding='utf-8'),encoding='utf-8')
p=client/'docs/contracts/REGISTRY.json';s=p.read_text(encoding='utf-8').replace('"contracts": [','"contracts": [\n    {"id":"C224_VIP_BENEFITS_MILESTONES","version":"1.1.0","status":"IN_PROGRESS","updated_at":"2026-10-26","contract_file":"docs/contracts/C224_VIP_BENEFITS_MILESTONES.md"},',1);p.write_text(s,encoding='utf-8')
p=client/'docs/INDEX.md';p.write_text(p.read_text(encoding='utf-8')+'\n- [C224 VIP benefits and milestone mail](contracts/C224_VIP_BENEFITS_MILESTONES.md): Home reward preview and server-authoritative gifts.\n',encoding='utf-8')
(client/'src/ui/VipRewardsDialog.gd').write_text((server/'tmp/VipRewardsDialog.gd').read_text(encoding='utf-8'),encoding='utf-8')
p=client/'src/ui/MainMenu.gd';s=p.read_text(encoding='utf-8')
old='var home_user_vip: VipBadge';assert s.count(old)==1
s=s.replace(old,old+'\nvar vip_rewards_dialog: UiDialog',1)
old='\tuser_vbox.add_child(home_user_vip)';assert s.count(old)==1
s=s.replace(old,old+'''\n\thome_user_vip.mouse_filter = Control.MOUSE_FILTER_STOP
\thome_user_vip.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
\thome_user_vip.focus_mode = Control.FOCUS_ALL
\thome_user_vip.gui_input.connect(_on_home_vip_input)''',1)
s+='''
func _on_home_vip_input(event: InputEvent) -> void:
\tvar clicked := event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed
\tvar touched := event is InputEventScreenTouch and event.pressed
\tif not clicked and not touched and not event.is_action_pressed("ui_accept"):
\t\treturn
\thome_user_vip.accept_event()
\tif is_instance_valid(vip_rewards_dialog):
\t\treturn
\tvip_rewards_dialog = preload("res://src/ui/VipRewardsDialog.gd").new()
\tvip_rewards_dialog.name = "VipRewardsDialog"
\tvip_rewards_dialog.open(self)
'''
p.write_text(s,encoding='utf-8')
print('Installed Home VIP rewards dialog with horizontal ScrollBarUI and inventory slots')
