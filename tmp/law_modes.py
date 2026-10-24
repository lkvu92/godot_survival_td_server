from pathlib import Path
import json
root=Path(__file__).resolve().parents[2]
for repo in ['server','client']:
 p=root/repo/'docs/contracts/C204_LAW_BATTLE_ENTRY.md';s=p.read_text(encoding='utf-8').replace('Version: 1.0.0','Version: 1.1.0');s+='\n## Revision1.1.0 mode coverage\nTrialTower passes authenticated run.than_luan_snapshot to GameState. Server tower attributes already include thanLuanStats, and talismanCreateStageRun already supplies the aura snapshot. Player.apply_combat_loadout merges its frozen snapshot.stats before passives: absolute reduction fields replace rather than stack, preserving Law during admin creep-test stat rebuilds and repeated loadouts. Empty snapshots add nothing, inner demon remains without player Law. Breakthrough uses its server encounter snapshot. No RPC changes or local config fallback.\n\n| 1.1.0 | 2026-10-24 | Preserve frozen Law stats through loadout rebuilds and tower entry. |\n';p.write_text(s,encoding='utf-8')
 p=p.parent/'REGISTRY.json';d=json.loads(p.read_text(encoding='utf-8'))
 for c in d['contracts']:
  if c['id']=='C204_LAW_BATTLE_ENTRY':c['version']='1.1.0'
 p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');p=root/repo/'docs/INDEX.md';p.write_text(p.read_text(encoding='utf-8')+'\n- C204 v1.1.0: tower, admin-test loadout and breakthrough Law coverage.\n',encoding='utf-8')
