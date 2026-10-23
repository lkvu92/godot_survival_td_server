# C180 — Hero 1: Cực Địa Băng Giới 4 tầng

Status: ACTIVE  
Version: 1.0.0  
Updated: 2026-10-23

`hero_1_skill_4` is an automatic control field centred on the selected enemy at
cast time. It is not a replacement for `hero_1_skill_3`.

| Tầng | Asset | Presentation and gameplay |
|---|---|---|
| 1 | `hero_1_skill4_1.png` | Nine-frame beam travels down from above and strikes the selected enemy. The impact has a 50% chance to stun for 0.1 seconds. It plays once. |
| 2 | `hero_1_skill4_2.png` | Nine-frame ground ice trail plays once at impact, holds its final ice state, then gently fades. |
| 3 | `hero_1_skill4_3.png` | Nine-frame ice seal loops at the impact centre. |
| 4 | `hero_1_skill4_4.png` | Seamless 128×128 frost ground texture, rendered at 0.5 source scale and tiled by the shader. A feathered radial mask matches the circular control radius; it fades in/out softly at low opacity. |

The control field lasts 10 seconds and has a 15-second cooldown. Its radius is
260 world pixels. Monsters are slowed by 10% at the edge, increasing linearly
to 50% at the ice-seal centre; the existing 30% attack-speed reduction and 20%
defence reduction remain active inside the circle.

The three 1200×1200 layer sheets are parsed as 3 columns × 3 rows of 400×400
frames. The domain uses a single 128×128 texture and must be repeated only by
the shader; `TextureRect` must stretch rather than independently tile it.

## Acceptance checks

- Data: every level declares `cooldown: 15`, `domain_duration: 10`, radius 260,
  slow 0.10 → 0.50, and impact stun 50% / 0.1s.
- Client: beam and trail are non-looping, seal loops, and the field applies its
  distance-based slow on a 10 Hz scan.
- Assets: each of the three sheets resolves to nine 400×400 atlas frames;
  domain resolves to the authored 128×128 texture.
