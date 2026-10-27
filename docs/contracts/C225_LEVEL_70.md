# C225 Account and persistent hero level 70

Version: 1.0.0 | Status: IN_PROGRESS | Updated: 2026-10-27

## Schema and behavior

Supersedes the level-50 limits in C105/C110 and the reachability note in C210.
`progression.persistent_leveling` has `max_user_level:70`, `max_hero_level:70`.
Persistent heroes remain capped by account level. Existing EXP curves continue
through 69; level 70 has zero EXP and next-level EXP. Existing level-50 accounts
can earn EXP again; no automatic levels or historical EXP refunds.
Breakthrough gates: 9/19/29/39/49/59/69; success enters the next level.
`tribulation_config.boss_profiles` contains seven ordered profiles. New 59/69
profiles continue the final tier's HP ratio (2.2222) and ATK ratio (1.56), rounded:
59 = HP 222222, ATK 1354; 69 = HP 493827, ATK 2112. DEF and wave steps unchanged.
These are initial balance values, not a measured combat-difficulty guarantee.
`system.realm_milestones.milestones` includes 60 and 70 congratulations, granted
once from committed breakthrough history using existing mail ledgers.

## RPC and interfaces

Existing profile, stage settlement and tribulation RPC requests/responses retain
their schemas. Server controls level/EXP, attempts and rewards. Client cap checks
accept 70. In-run temporary hero levels retain their separate level-50 limit.
Missing/invalid authenticated config blocks play and mutations (C121); no local
gameplay fallback. Publish progression, tribulation and system settings together
with the matching runtime/client release.
Leaderboard scores, realm captions and tower hero snapshots accept levels through
70. Tower sweep reward validation accepts the same cap.

## Presentation

Existing AtlasRegistry avatar_frame_1..7 and rank_frame_1..7 use the supplied
profile atlases. Preserve bands: 1–10 Luyện Khí, 11–20 Trúc Cơ, 21–30 Kim Đan,
31–40 Nguyên Anh, 41–50 Hóa Thần, 51–60 Độ Kiếp, 61–70 Bán Tiên. Thus level
60 uses frame 6 and level 70 uses frame 7. All access through AtlasRegistry;
shared UiRealmAvatar/RealmRankBanner and UiSkin remain in use.

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-10-27 | Raise persistent caps to 70, add two breakthrough/config/mail tiers and validate existing seven-frame assets. |

## Verification (2026-10-27)

Nakama build/packaging PASS. Server EXP, seven breakthrough previews, level-50
resume/level-70 cap, feature unlock/mail idempotency, stage and tower sweeps PASS.
Godot parser/import, client static runner, C210 rank frames, C211 avatar frames
and targeted C225 seven-profile/60/70 asset validation PASS.
Local config published; DB confirms caps 70/70 and seven tribulation profiles.
No production deployment. New 59/69 boss difficulty has not been playtested.
Gate 4 remains pending: full server static runner stops at existing Arc6 catalog
seed/generator recommendation mismatch (unrelated data). Keep IN_PROGRESS until
the complete runner passes; do not treat targeted checks as full acceptance.
