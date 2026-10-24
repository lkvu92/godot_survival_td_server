from pathlib import Path
import json
root = Path(__file__).resolve().parents[2]
for name in ('server', 'client'):
    repo = root / name
    p = repo / 'docs/contracts/C193_FEATURE_MILESTONES_TOURS.md'
    s = p.read_text(encoding='utf-8').replace('Version: 1.0.2', 'Version: 1.0.3').replace('Version: 1.0.0', 'Version: 1.0.3')
    s = s.replace('|---|---|---|', '|---|---|---|\n| 1.0.3 | 2026-10-24 | During sweep tour select and center first campaign stage after layout; latest-unlocked focus must not override tour targets. No RPC/schema/offline changes. |', 1)
    p.write_text(s, encoding='utf-8')
    p = repo / 'docs/contracts/REGISTRY.json'
    s = p.read_text(encoding='utf-8')
    import re
    s = re.sub(r'("id": "C193_FEATURE_MILESTONES_TOURS",\s*"version": ")[^"]+', r'\g<1>1.0.3', s, count=1)
    p.write_text(s, encoding='utf-8')
    p = repo / 'docs/INDEX.md'
    s = p.read_text(encoding='utf-8')
    s += '\nC193 1.0.3: sweep tour stage focus takes precedence over latest-unlocked scroll.\n'
    p.write_text(s, encoding='utf-8')
p = root / 'client/src/ui/StageSelect.gd'
s = p.read_text(encoding='utf-8')
s = s.replace('if GameState.focus_latest_unlocked_stage:', 'if GameState.focus_latest_unlocked_stage and TourService.current_id != "sweep_v2":', 1)
s = s.replace('func _select_initial_stage() -> void:\n\tvar latest', 'func _select_initial_stage() -> void:\n\tif TourService.current_id == "sweep_v2" and stage_cards.has(TourService.sweep_stage_id()):\n\t\t_select_stage(TourService.sweep_stage_id())\n\t\t_scroll_to_initial_stage.call_deferred()\n\t\treturn\n\tvar latest', 1)
p.write_text(s, encoding='utf-8')
p = root / 'client/tests/test_feature_milestones_tours.gd'
s = p.read_text(encoding='utf-8')
s = s.replace('\tGameState.selected_stage_id = stage_id', '\t# Reproduce progressed accounts: latest stage is far below the tour target.\n\tfor stage in DataRegistry.get_stages_for_arc(arc_id):\n\t\tUserContext.current_user.unlocked_stages.append({"stage_id": str(stage.id), "unlocked_levels": ["normal"]})\n\tGameState.selected_stage_id = stage_id', 1)
s = s.replace('\t\tif index == targets.size() - 1:', '\t\tif index == 3:\n\t\t\tfor settle_frame in range(12):\n\t\t\t\tawait get_tree().process_frame\n\t\t\tvar stage_screen = get_tree().current_scene\n\t\t\tassert(stage_screen.selected_stage_id == stage_id, "tour must override latest unlocked stage selection")\n\t\t\tassert(stage_screen.scroll_container.get_global_rect().encloses(target.get_global_rect()), "Stage 1 remains visible after deferred initial scroll")\n\t\tif index == targets.size() - 1:', 1)
p.write_text(s, encoding='utf-8')
