# C183 — Hero 3 falling seal and propagating sound waves

Status: ACTIVE  
Version: 1.0.1
Updated: 2026-10-23

Client behavior is specified in C010 v1.4.0 in the sibling client repository.
Presentation tuning 1.0.1 doubles layer B's speed: `phase_b_duration` is
0.24/0.25/0.26/0.27/0.28 seconds at levels 1-5. Sound-wave timing is unchanged.
The authoritative `game_skills` record for `hero_3_skill_2` retains the existing
direct and secondary damage curves, range and cooldown. Direct impact hits
only the locked target. The secondary hit is an eight-sword filled AOE.

Three additional sound waves start at impact plus 0 / 0.3 / 0.6 seconds.
Each is an expanding annulus, hits once per target per wave and independently
rolls 30% stun for 0.2 seconds. Wave damage is one third of the secondary
coefficient per wave. `wave_radius` matches `second_radius`. Nine radius samples
in `wave_radius_progress` synchronize collision to the authored ring frames.

Data schema: `levels[].stats` adds `wave_count`, `wave_interval`,
`wave_stun_chance`, `wave_stun_duration`, `wave_damage_pct`, `wave_radius`,
`wave_duration`, `wave_ring_width`, `wave_collision_padding`,
`wave_radius_progress`. Remove the old guaranteed impact stun in `effects`.
Primary, `phase_b_vfx_frames`, and new `wave_vfx_frames` each contain nine IDs.
All Hero 3 skill frame lists contain nine frames for the normalized 3x3 sheets.

Transport: existing seed endpoint and authenticated config bootstrap, with
additional frame metadata preserved in `game_skills.metadata`; no new RPC or
offline fallback. Seed only the four Hero 3 skill rows for local verification.

Changelog: 1.0.0 — separate single-target impact, eight-sword AOE and three
propagating sound waves; consume the user's 400x400, 3x3 assets.
