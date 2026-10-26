from pathlib import Path
server=Path(__file__).resolve().parents[1];client=server.parent/'client'
p=client/'src/ui/MainMenu.gd';s=p.read_text(encoding='utf-8')
start=s.index('func _on_home_vip_input(event: InputEvent) -> void:')
end=s.find('\nfunc ',start+1)
if end<0:end=len(s)
s=s[:start]+'''func _on_home_vip_input(event: InputEvent) -> void:
\tvar released_mouse: bool = event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed
\tvar released_touch: bool = event is InputEventScreenTouch and not event.pressed
\tif not released_mouse and not released_touch and not event.is_action_released("ui_accept"):
\t\treturn
\tif (released_mouse or released_touch) and not Rect2(Vector2.ZERO, home_user_vip.size).has_point(event.position):
\t\treturn
\thome_user_vip.accept_event()
\t# Mouse/touch emulation can emit two presses for one gesture. Open only
\t# after the releases finish, so the second event cannot close the new scrim.
\t_open_vip_rewards_dialog.call_deferred()

func _open_vip_rewards_dialog() -> void:
\tif not is_inside_tree() or is_instance_valid(vip_rewards_dialog):
\t\treturn
\tvip_rewards_dialog = preload("res://src/ui/VipRewardsDialog.gd").new()
\tvip_rewards_dialog.name = "VipRewardsDialog"
\tvip_rewards_dialog.open(self)
''' + s[end:]
p.write_text(s,encoding='utf-8')
(client/'docs/contracts/C224_VIP_BENEFITS_MILESTONES.md').write_text((server/'docs/contracts/C224_VIP_BENEFITS_MILESTONES.md').read_text(encoding='utf-8'),encoding='utf-8')
p=client/'docs/contracts/REGISTRY.json';s=p.read_text(encoding='utf-8').replace('"id":"C224_VIP_BENEFITS_MILESTONES","version":"1.1.0"','"id":"C224_VIP_BENEFITS_MILESTONES","version":"1.1.1"');p.write_text(s,encoding='utf-8')
p=client/'docs/INDEX.md';p.write_text(p.read_text(encoding='utf-8')+'\n- C224 v1.1.1: defer Home VIP dialog until mouse/touch gesture release.\n',encoding='utf-8')
print('Fixed Home VIP paired-input gesture')
