from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[2]
contract='''# C199 Hero 5 canonical visual roles and 400px frame grid

Version: 1.0.0
Status: IN_PROGRESS

## Presentation schema and interfaces
Client atlas manifest adds hero_skill_vfx_roles[skill_id][role]=sheet_id,
with all four Hero5 skills explicitly mapped to approved presentation assets.
Skill1 explosion_vfx_frames always resolves hero_5_skill1_effect1 (user PNG),
not stale frame IDs/level overrides from old remote metadata. Primary/named
SkillVisualFrames ask AtlasRegistry for the canonical presentation role first;
all other heroes/unknown roles retain existing resolution. This is cosmetic
mapping only, never local gameplay JSON or balance override. C121 remains.

Ten Hero5 animation sheets (*_sprite and *_effect*) declare3x3/nine frames,
frame_width400/frame_height400 and normalize_grid=true. Source PNGs remain
unchanged. A non1200x1200 source is normalized to a cached1200x1200 texture
before row-major400px extraction; exact-size sources use original textures.
Preserve transparency; normalize once per path/size, not per animation frame.
Icons *_projectile.png are whole-image icons, not animation cells; preserve
their existing regions. No skills balance, RPC/payload, UiSkin or signal changes.

## Cache and acceptance
AtlasRegistry owns all access and normalized textures; tower asset scope release
must evict normalized texture and frame-cache derivatives for released paths.
Test all90 frames, region400x400,1200x1200 texture, row-major layout, exact
requested PNG path, cache identity and normalizer scope cleanup. Use an actual
Hero5 projectile hit with deliberately stale remote explosion IDs to prove the
spawned impact visual uses the right asset, not only metadata string checks.
Run Hero5 combat/VFX regressions and both static suites. No PNG regeneration,
server mutation or config publication required for this presentation fix.

## Changelog
| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-24 | Bind Hero5 visual roles and normalize animation grids to3x3/400px cells with scoped caches. |
'''
for name in ['server','client']:
 repo=ROOT/name;(repo/'docs/contracts/C199_HERO5_ASSET_GRID.md').write_text(contract,encoding='utf-8')
 p=repo/'docs/contracts/REGISTRY.json';d=json.loads(p.read_text(encoding='utf-8'));d['contracts'].insert(0,dict(id='C199_HERO5_ASSET_GRID',version='1.0.0',status='IN_PROGRESS',updated_at='2026-10-24',contract_file='docs/contracts/C199_HERO5_ASSET_GRID.md'));p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 p=repo/'docs/INDEX.md';p.write_text(p.read_text(encoding='utf-8')+'\n- [C199 Hero5 asset grid](contracts/C199_HERO5_ASSET_GRID.md): canonical impact artwork, 3x3/400px frames and scoped normalization cache.\n',encoding='utf-8')
p=ROOT/'client/data/atlas_registry.json';m=json.loads(p.read_text(encoding='utf-8'))
roles={
 'hero_5_skill_1':{'vfx_frames':'hero_5_skill1_sprite','explosion_vfx_frames':'hero_5_skill1_effect1'},
 'hero_5_skill_2':{'vfx_frames':'hero_5_skill2_sprite','rune_vfx_frames':'hero_5_skill2_effect1'},
 'hero_5_skill_3':{'vfx_frames':'hero_5_skill3_sprite','crack_vfx_frames':'hero_5_skill3_effect1','wave_vfx_frames':'hero_5_skill3_effect2'},
 'hero_5_skill_4':{'vfx_frames':'hero_5_skill4_sprite','punch_vfx_frames':'hero_5_skill1_effect1','explosion_vfx_frames':'hero_5_skill4_effect2'}
}
m['hero_skill_vfx_roles']=roles
for key,conf in m['spritesheet_vfx'].items():
 if key.startswith('hero_5_skill') and not key.endswith('_projectile'):
  conf.update(columns=3,rows=3,frame_count=9,frame_width=400,frame_height=400,normalize_grid=True)
p.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Hero5 visual roles and ten 400px animation grids registered; PNG files unchanged.')
