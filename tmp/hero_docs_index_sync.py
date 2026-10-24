from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
for name in ['server','client']:
 p=ROOT/name/'docs/INDEX.md';s=p.read_text(encoding='utf-8')
 s=s.replace('(contracts/C162_HERO_SKILL_DAMAGE_CURVES.md) v1.0.1: Hero 1 skill 2 damage/radius/projectile rebalance, 40% flank damage.','(contracts/C162_HERO_SKILL_DAMAGE_CURVES.md) v1.0.2: historical flattening recipe with explicit current overrides; use the five current hero pages.')
 s=s.replace('(contracts/C162_HERO_SKILL_DAMAGE_CURVES.md): server-owned early skill damage increase with flatter late damage growth.','(contracts/C162_HERO_SKILL_DAMAGE_CURVES.md) v1.0.2: historical damage methodology; current overrides documented per hero.')
 s=s.replace('(contracts/C183_HERO_3_FALLING_SEAL.md) v1.0.0: single-target sword, eight-sword AOE, three sound waves at 0.3s intervals; 30% stun for 0.2s.','(contracts/C183_HERO_3_FALLING_SEAL.md) v1.0.2: same three-wave mechanics, current skill2 cooldown8/7.5/7/6.5/6s under C195.')
 s=s.replace('(contracts/C184_HERO_4_VENOM_VORTEX.md) v1.0.0: looping vortex and random timed needle burst; corrected poison description.','(contracts/C184_HERO_4_VENOM_VORTEX.md) v1.0.1: C196 vortex2.5s/five ticks,20% stun and additive ATK poison capped5000 DPS.')
 s=s.replace('(contracts/C185_HERO_1_SKILL_UNLOCKS.md) v1.0.0: historical gate change;','(contracts/C185_HERO_1_SKILL_UNLOCKS.md) v1.0.1: historical gate change;')
 s=s.replace('[HERO_BALANCE_SNAPSHOT_2026-10-13.md](HERO_BALANCE_SNAPSHOT_2026-10-13.md): Snapshot cân bằng runtime hiện hành cho Hero 1–5.','[HERO_SKILLS_CURRENT.md](HERO_SKILLS_CURRENT.md): thông số hiện hành Hero1–5; [snapshot2026-10-13](HERO_BALANCE_SNAPSHOT_2026-10-13.md) chỉ lưu lịch sử.')
 s=s.replace('Hợp đồng Hero 4 Venom Shade & Poison Kite Pipeline (v1.3.0 capped %HP poison).','v1.5.1: Hero4 theo C196; độc cộng ATK/cap5000 DPS và giới hạn bẫy, không dùng lại HP-poison cũ.')
 s=s.replace('- C012 v1.5.0: Hero 4 vortex loops 2s at 2x speed; needles begin at 0.5s, random angles every 0.1s, counts 3/4/5/6/8, full-image atlas and 0.2% poison stacks.','- Lịch sử C012 v1.5.0: vortex2s/HP-poison đã được C196 thay thế; xem [Hero4 hiện hành](heroes/HERO_4.md).')
 if name=='client':
  s=s.replace('[F001_HERO_SYSTEM.md](features/F001_HERO_SYSTEM.md), [HERO_BALANCE_SNAPSHOT_2026-10-13.md](HERO_BALANCE_SNAPSHOT_2026-10-13.md),','[F001_HERO_SYSTEM.md](features/F001_HERO_SYSTEM.md), [HERO_SKILLS_CURRENT.md](HERO_SKILLS_CURRENT.md),')
  s=s.replace('`data/heroes.json`, `data/progression.json`, `data/skills.json`','`../server/data/heroes.json`, `../server/data/progression.json`, `../server/data/skills.json`')
  s=s.replace('`data/skills.json`, `data/cards.json`, `data/effects.json`','`../server/data/skills.json`, `../server/data/cards.json`, `../server/data/effects.json`')
 p.write_text(s,encoding='utf-8')
