from pathlib import Path
import json
root=Path(__file__).resolve().parents[2]
for repo in ['server','client']:
 p=root/repo/'docs/contracts/C199_HERO5_ASSET_GRID.md';s=p.read_text(encoding='utf-8').replace('Version: 1.0.0','Version: 1.1.0');s+='\n## Skill4 punch animation revision\nCanonical punch_vfx_frames now resolves hero_5_skill4_effect1, 3x3 nine 400px frames. Projectile options set vfx_hold_last_frame=true: play once then retain frame8 until impact. Skill1 explosion and Skill4 target mark are unchanged. Existing RPC payloads/schema, damage, timing and online-only rules unchanged. No gameplay fallback.\n\n| 1.1.0 | 2026-10-24 | Correct Skill4 flying punch asset and hold its final frame without looping. |\n';p.write_text(s,encoding='utf-8')
 p=p.parent/'REGISTRY.json';d=json.loads(p.read_text(encoding='utf-8'))
 for c in d['contracts']:
  if c['id'].startswith('C199'):c.update(version='1.1.0',updated_at='2026-10-24')
 p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 p=root/repo/'docs/INDEX.md';p.write_text(p.read_text(encoding='utf-8')+'\n- C199 v1.1.0: Skill4 punches use skill4_effect1, play once and hold last frame.\n',encoding='utf-8')
 p=root/repo/'docs/heroes/HERO_5.md';s=p.read_text(encoding='utf-8');a,b=s.split('## Skill 4',1);b=b.replace('hero_5_skill1_effect1','hero_5_skill4_effect1');s=a+'## Skill 4'+b;s+='\nC199 v1.1.0: chưởng tầng 2 Skill 4 dùng hero_5_skill4_effect1.png, chạy 9 frame một lần rồi giữ frame cuối khi bay.\n';p.write_text(s,encoding='utf-8')
p=root/'client/data/atlas_registry.json';d=json.loads(p.read_text(encoding='utf-8'));d['hero_skill_vfx_roles']['hero_5_skill_4']['punch_vfx_frames']='hero_5_skill4_effect1';p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
