from pathlib import Path
import json
root=Path(__file__).resolve().parents[2]
for repo in ['server','client']:
 p=root/repo/'docs/contracts/C204_LAW_BATTLE_ENTRY.md';s=p.read_text(encoding='utf-8').replace('Version: 1.1.0','Version: 1.2.0');s+='\n## Revision1.2.0 actual world rendering\nPlayer Law aura uses z_index1 above the opaque default-z0 map and below hero sprite z5. Remove the HUD Law status text (details remain in BattleStatsDialog). Tier outer and middle rings animate their nine registered sheet frames; static center remains single-frame. Preserve preference, frozen stats and separate tower demon aura. No RPC/balance changes or local fallback.\n\n| 1.2.0 | 2026-10-24 | Fix aura hidden behind map; remove text substitute and animate ring sheets. |\n';p.write_text(s,encoding='utf-8');p=p.parent/'REGISTRY.json';d=json.loads(p.read_text(encoding='utf-8'))
 for c in d['contracts']:
  if c['id']=='C204_LAW_BATTLE_ENTRY':c['version']='1.2.0'
 p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');p=root/repo/'docs/INDEX.md';p.write_text(p.read_text(encoding='utf-8')+'\n- C204 v1.2.0: visible world aura above map; remove Law HUD text.\n',encoding='utf-8')
p=root/'client/src/actors/Player.gd';s=p.read_text(encoding='utf-8').replace('than_luan_visual.z_index = -1','than_luan_visual.z_index = 1');p.write_text(s,encoding='utf-8')
p=root/'client/src/ui/HUD.gd';s=p.read_text(encoding='utf-8');a=s.index('func _sync_aura_status()');b=s.index('func _process(',a);s=s[:a]+s[b:];s=s.replace('\t_sync_aura_status()\n','').replace('var aura_status_label: Label\n','');p.write_text(s,encoding='utf-8')
p=root/'client/src/assets/AtlasRegistry.gd';s=p.read_text(encoding='utf-8');s=s.replace('"alpha": 1.0, "frame_count": 1','"alpha": 1.0, "frame_count": 9').replace('"alpha": 0.9, "frame_count": 1','"alpha": 0.9, "frame_count": 9');p.write_text(s,encoding='utf-8')
p=root/'client/tests/test_battle_stats.gd';s=p.read_text(encoding='utf-8');s='\n'.join(l for l in s.split('\n') if 'hud.aura_status_label' not in l);p.write_text(s,encoding='utf-8')
p=root/'client/tests/test_than_luan.gd';s=p.read_text(encoding='utf-8');needle='\tcheck(actor.than_luan_visual.visible and actor.than_luan_visual.aura_id == "tl_5",';a=s.index(needle);s=s[:a]+'\tcheck(actor.than_luan_visual.z_index > 0 and actor.than_luan_visual.z_index < actor.sprite.z_index, "Law renders above opaque map and below hero")\n'+s[a:];p.write_text(s,encoding='utf-8')
