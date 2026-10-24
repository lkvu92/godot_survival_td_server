from pathlib import Path
import json
root=Path(__file__).resolve().parents[2]
contract='''# C204 Law aura battle entry

Version: 1.0.0
Status: IN_PROGRESS

## Schema and interfaces
GameState.begin_server_run(run_id, talisman_snapshot={}, than_luan_snapshot={})
atomically copies both authenticated server snapshots. Repeated initialization
at CharacterSelect must carry the same response aura rather than clear it.
UserContext and admin sandbox entry pass the returned than_luan_snapshot.
Missing/empty aura remains empty: no profile or local gameplay fallback.
No RPC/server schema or balance changes. Player renders its frozen run aura
through existing AtlasRegistry DynamicAura and respects show_effect preference.
Remove CharacterSelect avatar aura creation/binding. Dedicated Law preview and
other unrelated UI remain unchanged; UiSkin and signals unchanged.

## Acceptance
Regression covers repeated entry copying, input alias isolation, empty/new-run
reset and visible Player aura from server snapshot. Run aura and static suites.

## Changelog
| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-24 | Preserve Law snapshot into battle and remove hero-select aura. |
'''
for repo in ['server','client']:
 p=root/repo/'docs/contracts/C204_LAW_BATTLE_ENTRY.md';p.write_text(contract,encoding='utf-8');p=p.parent/'REGISTRY.json';d=json.loads(p.read_text(encoding='utf-8'));d['contracts'].insert(0,dict(id='C204_LAW_BATTLE_ENTRY',version='1.0.0',status='IN_PROGRESS',updated_at='2026-10-24',contract_file='docs/contracts/C204_LAW_BATTLE_ENTRY.md'));p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');p=root/repo/'docs/INDEX.md';p.write_text(p.read_text(encoding='utf-8')+'\n- [C204 Law battle entry](contracts/C204_LAW_BATTLE_ENTRY.md): preserve run aura; remove CharacterSelect aura.\n',encoding='utf-8')
p=root/'client/src/core/GameState.gd';s=p.read_text(encoding='utf-8').replace('func begin_server_run(run_id: String, talisman_snapshot: Dictionary = {})','func begin_server_run(run_id: String, talisman_snapshot: Dictionary = {}, than_luan_snapshot: Dictionary = {})').replace('\tserver_than_luan_snapshot = {}','\tserver_than_luan_snapshot = than_luan_snapshot.duplicate(true)',1);p.write_text(s,encoding='utf-8')
p=root/'client/src/ui/CharacterSelect.gd';s=p.read_text(encoding='utf-8');a=s.index('\t\tvar hero_aura :=');b=s.index('\t\tvar portrait :=',a);s=s[:a]+s[b:];s=s.replace('GameState.begin_server_run(str(admin_run.get("run_id", "")))','GameState.begin_server_run(str(admin_run.get("run_id", "")), {}, admin_run.get("than_luan_snapshot", {}))');s=s.replace('run_talisman if run_talisman is Dictionary else {}\n\t\t)','run_talisman if run_talisman is Dictionary else {},\n\t\t\tstart_result.get("than_luan_snapshot", {})\n\t\t)');p.write_text(s,encoding='utf-8')
p=root/'client/src/core/UserContext.gd';s=p.read_text(encoding='utf-8').replace('GameState.begin_server_run(str(server_result.get("run_id", "")), run_talisman if run_talisman is Dictionary else {})\n\t\tGameState.server_than_luan_snapshot = server_result.get("than_luan_snapshot", {}).duplicate(true)','GameState.begin_server_run(str(server_result.get("run_id", "")), run_talisman if run_talisman is Dictionary else {}, server_result.get("than_luan_snapshot", {}))');p.write_text(s,encoding='utf-8')
p=root/'client/src/ui/AdminSkillTest.gd';s=p.read_text(encoding='utf-8').replace('GameState.begin_server_run(str(admin_run.get("run_id", "")))','GameState.begin_server_run(str(admin_run.get("run_id", "")), {}, admin_run.get("than_luan_snapshot", {}))');p.write_text(s,encoding='utf-8')
