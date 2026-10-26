from pathlib import Path
client=Path(__file__).resolve().parents[2]/'client'
p=client/'tests/test_hud_text_layout.gd';s=p.read_text(encoding='utf-8')
s=s.replace('assert(not slot.mode_label.get_rect().intersects(slot.level_label.get_rect()), "passive mode and level cannot overlap")','assert(not slot.mode_label.visible and not slot.key_label.visible and slot.level_label.text == "Lv.5", "Only skill level remains visible")')
s=s.replace('assert(not slot.key_label.get_rect().intersects(slot.mode_label.get_rect()), "shortcut and mode cannot overlap")','assert(slot.mode_label.text.is_empty() and slot.key_label.text.is_empty(), "No leftover shortcut/mode captions")')
s=s.replace('assert(not slot.cooldown_label.get_rect().intersects(slot.level_label.get_rect()), "cooldown and level cannot overlap")','assert(slot.cooldown_label.get_rect().get_center().is_equal_approx(slot.size * 0.5), "Cooldown stays at exact badge center")')
s=s.replace('assert(not slot.mode_label.get_rect().intersects(slot.level_label.get_rect()), "mobile passive caption and level cannot overlap")','assert(not slot.mode_label.visible and not slot.key_label.visible and slot.level_label.text == "Lv.5", "Mobile level-only badge")')
s=s.replace('assert(not slot.cooldown_label.get_rect().intersects(slot.level_label.get_rect()), "mobile cooldown and level cannot overlap")','assert(slot.cooldown_label.get_rect().get_center().is_equal_approx(slot.size * 0.5), "Mobile cooldown stays at badge center")')
s=s.replace('assert(slot.key_label.visible, "shortcut returns when cooldown ends")','assert(not slot.key_label.visible and not slot.mode_label.visible, "No captions return when cooldown ends")')
s=s.replace('\thud.hp_label.text =', '''\tassert(hud.utility_action_row.get_node("CardPickMode").get_parent() == hud.speed_button.get_parent(), "Auto pick shares utility action row")
\tfor action in [hud.pause_button, hud.settings_button, hud.speed_button, hud.cast_labels_button]:
\t\tassert(action.get_parent() == hud.utility_action_row and is_zero_approx(action.position.y), "All actions share one horizontal row")
\thud.hp_label.text =''',1)
s=s.replace('PASS HUD text: separate skill labels at 64/76/80/96/180px; HP text centered','PASS HUD text: level-only skill tiles and centered cooldown at64/76/80/96/180px, one utility action row; HP text centered')
p.write_text(s,encoding='utf-8')
# Remove obsolete explanatory comments, without changing behavior.
p=client/'src/ui/SkillButton.gd';s=p.read_text(encoding='utf-8').replace('\t# Normal active/projectile skills no longer show an activation-mode caption\n\t# under their icon. Branches that still need a mode marker enable it below.','\t# Tile captions contain only the learned level; mode and hotkeys stay hidden.')
p.write_text(s,encoding='utf-8')
print('Updated existing HUD layout acceptance checks')
