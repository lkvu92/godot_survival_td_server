from pathlib import Path
server=Path(__file__).resolve().parents[1];client=server.parent/'client'
p=client/'src/ui/MainMenu.gd';s=p.read_text(encoding='utf-8').replace('var clicked := event is InputEventMouseButton','var clicked: bool = event is InputEventMouseButton').replace('var touched := event is InputEventScreenTouch','var touched: bool = event is InputEventScreenTouch');p.write_text(s,encoding='utf-8')
p=client/'src/ui/CheckinDialog.gd';s=p.read_text(encoding='utf-8').replace('checkin_state = PlayerService.get_cached_daily_checkin_status()\n\tif checkin_state.is_empty():\n\t\tcheckin_state = await PlayerService.get_daily_checkin_status()','checkin_state = await PlayerService.get_daily_checkin_status()');p.write_text(s,encoding='utf-8')
p=client/'src/ui/VipRewardsDialog.gd';s=p.read_text(encoding='utf-8')
s=s.replace('slot.tooltip_text = "%s ×%d%s" % [title,int(reward.amount)," • Mỗi phần chọn ngẫu nhiên một trong 5 hệ" if random else ""]','slot.tooltip_text = "%s ×%d%s" % [title,int(reward.amount),(" • Cả bó mảnh cùng một pháp bảo trung cấp" if str(reward.type) == "random_item_bundle" else " • Mỗi phần chọn ngẫu nhiên một trong 5 hệ") if random else ""]')
p.write_text(s,encoding='utf-8')
(client/'tests/test_vip_rewards_ui.gd').write_text((server/'tmp/test_vip_rewards_ui.gd').read_text(encoding='utf-8'),encoding='utf-8')
(client/'tests/TestVipRewardsUI.tscn').write_text('[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://tests/test_vip_rewards_ui.gd" id="1"]\n[node name="TestVipRewardsUI" type="Node"]\nscript = ExtResource("1")\n',encoding='utf-8')
print('Installed VIP UI acceptance scene')
for relative in ['docs/contracts/C224_VIP_BENEFITS_MILESTONES.md','docs/reports/VIP_BENEFITS_ACCEPTANCE.md','docs/VIP_MANAGEMENT.md']:
    source=server/relative
    if source.exists():(client/relative).write_text(source.read_text(encoding='utf-8'),encoding='utf-8')
