# Server documentation

- [C158 Arc 3 wood creep skills](contracts/C158_CREEP_WOOD_SKILLS.md) v1.0.0: poison bolts, life-draining vines, poison swamp and homing skulls use server-authoritative skill data.

- [C157 Arc 2 ice creep skills](contracts/C157_CREEP_ICE_SKILLS.md) v1.0.0: ice claws, bolts, pillars, Cực Băng Tam Trọng Thiên and Băng Linh Lung use server-authoritative skill data.

- [C156 Campaign mode stat multipliers](contracts/C156_CAMPAIGN_MODE_STAT_MULTIPLIERS.md) v1.0.0: Normal/Epic/Legend apply `1.00× / 1.25× / 1.5625×` to every enemy HP, ATK, and DEF.

- [C155 Arc 3–5 boss stat reduction](contracts/C155_ARC_3_5_BOSS_REDUCTION.md) v1.0.0: campaign boss HP, ATK, and DEF are reduced by 30%; timing, rewards, and EXP are unchanged.

- [C154 Unified defense curve](contracts/C154_UNIFIED_DEFENSE_CURVE.md) v1.0.0: live damage, tribulation, and combat power use `100 / (100 + DEF)`; talisman DEF is synchronized.

- [C143 Multi-server](contracts/C143_MULTI_SERVER.md): v1.5.2 IN_PROGRESS — scoped item-request dedupe included; operator-authorized VPS S1 cutover recorded in [migration runbook](S1_MIGRATION_RUNBOOK.md).

- [Kế hoạch triển khai nhiều server logic](MULTI_SERVER_IMPLEMENTATION_PLAN.md): DRAFT — định danh account/server, tích hợp backend/client, migration S1; mục 15 đặc tả API create/disable/reset/delete/cleanup, generation, dry-run và integration test.

- [C142 Admin skill test](contracts/C142_ADMIN_SKILL_TEST.md): read-only admin access RPC and no-reward Arc 0 test stage.

- [C121 Online-only configuration](contracts/C121_ONLINE_ONLY_CONFIG.md) v1.0.2: profile loading never grants Thanh Phong Kiếm to new or empty inventories.

- [C141 Hero skill 1 range](contracts/C141_HERO_SKILL1_RANGE.md) v1.1.0: every hero skill 1 is constrained to 60--70% of the design viewport height and at least 15% above basic attack range.

- [C138 Local deployment](contracts/C138_LOCAL_DEPLOYMENT.md) v1.0.0: isolated local Compose stack and `deploylocal.ps1`.

- [System Settings — quảng cáo nhận thưởng](SYSTEM_SETTINGS.md): trường cấu hình, mặc định, quota, ví dụ chỉnh và publish.

- [C134 Result ads and System config](contracts/C134_RESULT_AD_SYSTEM_CONFIG.md): victory x2 rewards (five/day) and centralized ad amounts/limits.

- [C109 Store catalog](contracts/C109_STORE_CATALOG_PURCHASE_ORDER.md) v1.1.2: Production verifier package and read-only Google credentials; resource rewards and 30 daily claim windows unchanged.

- [C133 Run lifecycle](contracts/C133_RUN_LIFECYCLE.md): explicit abandon and login recovery; refresh never ends combat.

- [C105 Progression](contracts/C105_PROGRESSION.md) v1.2.1: Diễn Võ Trường grants no permanent EXP; ordinary stages retain User EXP thresholds x5 and first-clear EXP x2.

- [C131 Single login](contracts/C131_SINGLE_LOGIN.md) v1.1.0: signed login generations and realtime login-change push without polling.

- [C131 Single login](contracts/C131_SINGLE_LOGIN.md) v1.1.0: signed login generations and realtime login-change push without polling.

- [C132 Docker runtime build](contracts/C132_DOCKER_RUNTIME_BUILD.md) v1.0.0: build and verify Nakama runtime in Docker before deploy/start/restart.

- C129 v1.2.0: store_purchase atomically settles 1â€“99 catalog bundles and binds replay to quantity; C130 v1.0.1: left vertical client item rail and original HP position.

- [C130 Consumable use](contracts/C130_CONSUMABLE_USE.md) v1.0.1 — transactional use, permanent cultivation sources and left vertical item rail. [Item guide](items/CONSUMABLES.md).

- [C129 Consumable store](contracts/C129_CONSUMABLE_STORE.md): item rarity/prices, Gold/Gem alternatives, item-paid renames and talent reroll.

- [C124 Public proxy network](contracts/C124_PUBLIC_PROXY_NETWORK.md) v1.0.0: shared Nginx network and stable game service aliases.

- [C119 Config and seed integrity](contracts/C119_CONFIG_SEED_INTEGRITY.md) — v1.0.0.
- [Repository split](../REPOSITORY_SPLIT.md).
- [Seed, remote settings and publication commands](SEEDING.md).

- [C121 Online-only gameplay config](contracts/C121_ONLINE_ONLY_CONFIG.md) - version 1.0.1; supersedes offline fallback.
- [C121 Online-only gameplay config](contracts/C121_ONLINE_ONLY_CONFIG.md) - version 1.0.0; supersedes offline fallback.

- [C123 Runtime secret binding](contracts/C123_RUNTIME_SECRET_BINDING.md) v1.0.0: use existing .env keys without logging or committing values.

- [C123 Account password setup](contracts/C123_ACCOUNT_PASSWORD.md) v1.1.0 IN_PROGRESS - Google proof, same account email login and Login-style UI.

- [C125 Player names](contracts/C125_PLAYER_NAMES.md) v1.0.0 - persistent Google game names and one-time rename.

- [C135 Weekly leaderboard rewards](contracts/C135_WEEKLY_LEADERBOARD_REWARDS.md): weekly snapshots, 3 categories, top500 rewards and System configuration.

- [Weekly rewards operations and Settings](WEEKLY_LEADERBOARD_REWARDS.md): approved reward table, configuration, publication and scheduler installation.

- C135 v1.0.1: production users.display_name ambiguity regression and retryable weekly dialog errors.

- [C137 Layered talisman skills](contracts/C137_LAYERED_TALISMAN_SKILLS.md): skills 16, 26-30, phase damage, statuses and four-layer assets.

- [C144 Stage sweep](contracts/C144_STAGE_SWEEP.md): v1.0.1 ACTIVE; campaign grades, atomic combat exclusion, durable sweep and Home widget.

- [Stage sweep operations](STAGE_SWEEP.md): worker deployment, recovery, queue diagnostics and HP authority.

- C144 v1.0.2: daily ticket rewards 5/15, Huyen Thien Cac 20 gems per ticket; dedicated Tickets filter. Build, daily entitlement/store replay/CAS and static checks PASS.

- C144 v1.0.3: shared cards shop category and live ticket offer correction.

- [Campaign sweep operations](STAGE_SWEEP.md): worker, catalog deployment, configuration and diagnostics. [Player guide](../../client/docs/STAGE_SWEEP.md).

- [C147 Mailbox](contracts/C147_MAILBOX.md) v1.2.0 ? atomic claims, expiry, campaigns, shared WebSocket, immediate VIP rights and mail-claimed pack rewards (ACTIVE).

- [Mailbox operations](MAILBOX_OPERATIONS.md): rollout, worker, settings, admin delivery, campaigns and validation.

- C144 v1.0.4: server-derived completion loot preview includes ticket outcomes and actual fragment probabilities.

- C144 v1.4.0: double-click sweep minimap to confirm instant completion, 5 gems per unfinished timed round, atomic server settlement.

- C144 v1.4.1: request-scoped completion-loot query reuse fixes configuration sync timeouts.

- [C148 Creep fire skills](contracts/C148_CREEP_FIRE_SKILLS.md): authoritative attack_skill JSONB migration, enemy seed roundtrip and config normalization.

- C148 v1.1.0: Arc 1 fire skills in normal/epic/legend, current-server restore and thirty campaign combinations.

- C148 v1.1.1: crop legacy ranged fireball sheets and animate legacy-config pyromancer presentation.

- C148 v1.1.2: fireball size x2, claw size x0.5, lava brute stomp/rings grounded at feet.

- C110 v2.2.0: progressive server-configured Thi?n Ki?p boss defense, base100 and15% per additional wave.

- [C149: Campaign wave role unlocks](contracts/C149_CAMPAIGN_WAVE_ROLE_UNLOCKS.md): wave1?3 no rushers/tankers;4?6 no tankers; all existing per-wave counts preserved.

- [C150: Deploy seed/publish forwarding](contracts/C150_DEPLOY_SEED_PUBLISH.md): `publish` shortcut seeds and publishes without restarting; optional reviewed settings.

- [C151: Progressive spawn cadence](contracts/C151_PROGRESSIVE_SPAWN_CADENCE.md): slower early batches, unchanged creep counts and EXP.

- [C152: Halve opening waves](contracts/C152_HALVE_OPENING_WAVES.md): halve wave1?3 creep totals across all five arcs, per-creep EXP retained.

- [C153: Exact campaign wave EXP](contracts/C153_EXACT_CAMPAIGN_WAVE_EXP.md): maintain reduced counts while restoring one level per fully cleared wave.
