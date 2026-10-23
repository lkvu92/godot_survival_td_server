# C184 — Hero 4 Venom Vortex

Version: 1.0.0  
Status: ACTIVE  
Updated: 2026-10-23

Authoritative seed row: `hero_4_skill_4` in `server/data/skills.json`.
Client contract: C012 v1.5.0 in the sibling client repository.

Vortex remains active for 2 seconds, with AOE damage at 0/0.5/1/1.5 seconds.
Its nine-frame visual loops until expiry, cycling every 1 second (2x the old
animation speed). Existing direct/needle ATK damage, radius, cooldown, initial
0.1s stun and slow values remain unchanged.

The first needle emits 0.5 seconds after cast start, subsequent needles every
0.1 seconds. Each needle independently chooses a random 360-degree direction.
Counts by skill level: 3/4/5/6/8. Each hit adds 0.002 max HP per second of
stacking poison (0.2%, not 2%), capped at 0.012/s, refresh window 3 seconds.

Schema: `levels[].stats.vortex_animation_duration=1`, `needle_delay=0.5`,
`needle_interval=0.1`, updated `needle_count`; existing `vortex_duration=2`.
Needle frame ID stays `hero_4_skill_4b_frame_0`; client atlas is corrected to
one complete image (1x1). No new RPC: existing seed/config transports these
fields. Nakama remains authoritative with no offline gameplay fallback.

Validation: timed needle emission, counts at all five levels, independently
random directions, looping cadence/lifetime, complete-image atlas rectangle,
0.2% stack payload and retained ATK curves. Seed only Hero 4 skill 4 locally.

Changelog: 1.0.0 — doubled looping vortex, corrected needle image and burst
timing/counts, corrected poison description.
