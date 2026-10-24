# C184 — Hero 4 Venom Vortex

Version: 1.0.2
Status: ACTIVE
Updated: 2026-10-24

Current scope follows [C196](C196_HERO4_SKILL_REBALANCE.md) and the complete
[Hero 4 page](../heroes/HERO_4.md). Authoritative row: hero_4_skill_4 in server
skills.json, transported by the existing seed/config RPCs. C121 applies.

Vortex loops for2.5s and rotates400 degrees/s. Animation cycles in1s.
Total ATK damage120/130/140/150/160 percent is split into five equal ticks at
0/0.5/1/1.5/2s. Every tick independently rolls20% stun0.1s per target.
Needles4/5/6/7/8 begin at0.5s, spaced0.1s, with independent random directions.
Each needle deals25/27.5/30/35/40 percent ATK; needle range250/275/300/325/350px;
vortex radius80/85/90/95/100px. Existing cooldown13.5/12.6/11.7/10.8/9.6s.

Each actual needle hit adds5% snapshot caster ATK to current poison DPS and
adds0.5s to remaining duration (none ->0.5s). Total poison capped at5000 DPS;
ordinary poison cannot bypass active cap. Expiry/actor reset clears cap.
This replaces the former0.2% max-HP stack/cap1.2% and3s refresh recipe.
Needle now uses frame_0 through frame_8 of a3x3/400px sheet under C200 v1.1.0.
All artwork comes from AtlasRegistry. No local gameplay fallback/new RPC.

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.2 | 2026-10-24 | Updated user needle sheet to nine400px animation cells; balance unchanged. |
| 1.0.1 | 2026-10-24 | Replace outdated2s/HP poison description with C196 behavior and current curve reference. |
| 1.0.0 | 2026-10-23 | Historical looping vortex/needle image and former HP-poison balance. |
