# C185 Hero 1 skill unlock levels

> **ĐÃ ĐƯỢC C189 THAY THẾ VỀ GATE:** [Hero 1 hiện hành](../heroes/HERO_1.md). Level hero mở skill là 1/10/20/30; chọn trong trận là 1/5/10/15; domain ở slot3, mastery ở slot4. Mốc5/10/15 bên dưới là lịch sử, không còn áp dụng.

Version: 1.0.1
Status: ACTIVE

> Historical values below are superseded by C189: permanent 1/10/20/30,
> combat 1/5/10/15; skills 3/4 exchange behavior.

## Data schema and behavior

Authoritative `server/data/skills.json` seed rows use integer
`hero_level_unlock`: hero_1_skill_1=1, hero_1_skill_2=5,
hero_1_skill_3=10, hero_1_skill_4=15. These are persistent owned hero
levels, inclusive at the threshold. Other heroes and in-run criteria are unchanged.
Seed these rows into Nakama game_skills before online verification.

## RPC and interfaces

No payload or interface changes. Existing seed_game_data request
`{table:"skills",rows:[{id,hero_level_unlock,...}]}` returns
`{success:true,inserted:N}`. Existing authenticated config bootstrap exposes
these DB fields; skill selection and tower catalogs use the owned hero level.
Existing runs keep their issued catalog; create a new run for updated eligibility.

## Offline fallback and presentation

C121 applies: missing config or connection blocks actions. No local gameplay
fallback. Existing UI renders server requirements; no asset or signal changes.

## Acceptance

Verify Hero 1 requirements 1/5/10/15, other heroes 1/10/20/30,
and existing static suite. Runtime integration expectations follow new thresholds.

Validation: static suite PASS; seed assertions PASS for all five heroes.
Gate score: 9/10. Native multi-server integration expectations updated;
not executed against a seeded DB. No database publication performed.

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0.1 | 2026-10-24 | Đồng bộ đường dẫn thông số hiện hành và phạm vi override; không thay config/gameplay. |
| 1.0.0 | 2026-10-24 | Lower Hero 1 skills 2/3/4 persistent level requirements to 5/10/15. |
