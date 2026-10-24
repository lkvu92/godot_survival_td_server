from pathlib import Path
import json
root=Path(__file__).resolve().parents[2]
for repo in ['server','client']:
 p=root/repo/'docs/contracts/C204_LAW_BATTLE_ENTRY.md';s=p.read_text(encoding='utf-8').replace('Version: 1.2.0','Version: 1.3.0');s+='\n## Revision1.3.0 avatar scope\nRemove Law aura from all navigation/profile/hero-selection avatars: Home, ProfileDialog, TrialTower selection and CharacterSelect. Remove ThanLuanService.bind_ui and attach_to_portrait APIs to prevent accidental automatic avatar bindings. World Player retains frozen server-run aura; tower demon retains independent aura. The dedicated ThanLuanScreen explicit cosmetic preview remains available, independent of avatars. No stat, RPC, server schema, entitlement or online-only changes.\n\n| 1.3.0 | 2026-10-24 | Remove all automatic avatar Law effects and their service attachment APIs. |\n';p.write_text(s,encoding='utf-8');p=p.parent/'REGISTRY.json';d=json.loads(p.read_text(encoding='utf-8'))
 for c in d['contracts']:
  if c['id']=='C204_LAW_BATTLE_ENTRY':c['version']='1.3.0'
 p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');p=root/repo/'docs/INDEX.md';p.write_text(p.read_text(encoding='utf-8')+'\n- C204 v1.3.0: no Law effects on Home/Profile/Tower/hero-select avatars.\n',encoding='utf-8')
for name in ['MainMenu','ProfileDialog','TrialTower']:
 p=root/'client/src/ui'/f'{name}.gd';s=p.read_text(encoding='utf-8');s='\n'.join(l for l in s.split('\n') if 'ThanLuanService.attach_to_portrait' not in l);p.write_text(s,encoding='utf-8')
p=root/'client/src/services/ThanLuanService.gd';s=p.read_text(encoding='utf-8');a=s.index('func bind_ui(');b=s.index('func load_state()',a);s=s[:a]+s[b:];p.write_text(s,encoding='utf-8')
