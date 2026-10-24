from pathlib import Path
import json,copy
ROOT=Path(__file__).resolve().parents[2]
for name in ['server','client']:
 repo=ROOT/name;p=repo/'docs/contracts/C200_HERO4_ASSET_GRID.md';s=p.read_text(encoding='utf-8').replace('Version: 1.0.0','Version: 1.1.0').replace('Status: ACTIVE','Status: IN_PROGRESS')
 s=s.replace('Five Hero4 animation sheets','Six Hero4 animation sheets').replace('hero_4_skill_3b,hero_4_skill_4a.','hero_4_skill_3b,hero_4_skill_4a,hero_4_skill_4b.')
 start=s.index('## Whole-image exception');end=s.index('## Acceptance',start)
 s=s[:start]+'''## Needle animation update
The user replaced hero_4_skill_4_2_animation.png with a1200x1200 sheet,
3x3/nine400px frames. hero_4_skill_4b is now the sixth animated sheet;
needle_vfx_frames in server skills.json contains frame_0 through frame_8.
Client canonical needle_vfx_frames role ensures old one-frame remote metadata
also resolves the complete animation. Reuse the existing projectile animation
cadence/looping (0.06s per frame). Needle damage/speed/scale/poison unchanged.
Only *_projectile.png UI icons remain whole-image1254x1254.

'''+s[end:]
 s=s.replace('all45 animation frames','all54 animation frames').replace('Confirm needle and UI icons remain full-image','Confirm real needles animate all nine cells and UI icons remain full-image')
 s+='\n| 1.1.0 | 2026-10-24 | Replace former whole-image needle with user-provided3x3/nine400px animation and canonical role. |\n'
 p.write_text(s,encoding='utf-8');p=repo/'docs/contracts/REGISTRY.json';d=json.loads(p.read_text(encoding='utf-8'));e=next(x for x in d['contracts'] if x['id']=='C200_HERO4_ASSET_GRID');e.update(version='1.1.0',status='IN_PROGRESS');p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
p=ROOT/'server/data/skills.json';a=json.loads(p.read_text(encoding='utf-8'));before=copy.deepcopy(a);s=next(s for s in a if s['id']=='hero_4_skill_4');s['needle_vfx_frames']=[f'hero_4_skill_4b_frame_{i}' for i in range(9)];check=copy.deepcopy(a);next(s for s in check if s['id']=='hero_4_skill_4')['needle_vfx_frames']=['hero_4_skill_4b_frame_0'];assert check==before;p.write_text(json.dumps(a,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
p=ROOT/'client/data/atlas_registry.json';m=json.loads(p.read_text(encoding='utf-8'));m['spritesheet_vfx']['hero_4_skill_4b'].update(columns=3,rows=3,frame_count=9,frame_width=400,frame_height=400,normalize_grid=True);m['hero_skill_vfx_roles']['hero_4_skill_4']={'needle_vfx_frames':'hero_4_skill_4b'};p.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
