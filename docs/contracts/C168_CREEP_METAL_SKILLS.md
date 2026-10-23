# C168 — Arc 4 Kim hệ

- Version: `1.0.0`
- Status: `ACTIVE`
- Updated: `2026-10-22`

## Schema and authority
Server `enemies` snapshot owns attack_skill and boss_skills dictionaries. Types:
metal_slash, metal_bolt, metal_punch, metal_shatter, metal_fist.
All numeric timing, damage multipliers, radii and status chances are seed fields.
No new RPC: existing authenticated config bootstrap transports these dictionaries.
Missing config blocks gameplay; no offline gameplay fallback.

## Interfaces and behavior
Enemy dispatches melee and boss skills to CreepFireCast.setup; ranged bolts use
EnemyProjectile.setup. AtlasRegistry provides all thirteen nine-frame sheets.
Cast events snapshot ATK and target center; death, pooling or control cancels them.
Lock zones slow occupants 30% for 2s, including entrants, and release on exit.
Canh Kim Song Trảm: two 50% ATK cuts, 0.2s apart (unspecified split chosen as 100% total).
Kim Mang Liên Nỗ: one nonlooping projectile, 100% ATK, 10% paralysis for 0.2s.
Toái Kim Bạo Quyền: 100% ATK, 20% stun for 0.3s.
Bạch Kim Toái Kích: at 2s and 2.8s needles 100% plus burst 30%, each burst
20% paralysis 1s; after second burst animation, core pulls nearby targets with
50% paralysis 0.2s; final large shockwave 100% ATK.
Bạch Hổ Phá Sơn Quyền: four random fists 40%, 0.7s apart starting at 0s;
each successful hit emits a 10% acoustic AOE, 30% stun 0.3s. After fourth
impact completes, palm 150%, then nova knocks targets outward 95px.
Unspecified radii/cooldowns are explicitly seeded; all skills target heroes as
existing creep combat does. This does not introduce a separate companion system.

## Changelog
- 1.0.0 (2026-10-22): Replace Arc 4 mock skills with authored metal skills.
