# Server documentation

- [C143 Multi-server](contracts/C143_MULTI_SERVER.md): v1.5.2 IN_PROGRESS — scoped item-request dedupe included; operator-authorized VPS S1 cutover recorded in [migration runbook](S1_MIGRATION_RUNBOOK.md).

- [Kế hoạch triển khai nhiều server logic](MULTI_SERVER_IMPLEMENTATION_PLAN.md): DRAFT — định danh account/server, tích hợp backend/client, migration S1; mục 15 đặc tả API create/disable/reset/delete/cleanup, generation, dry-run và integration test.

- [C142 Admin skill test](contracts/C142_ADMIN_SKILL_TEST.md): read-only admin access RPC and no-reward Arc 0 test stage.

- [C121 Online-only configuration](contracts/C121_ONLINE_ONLY_CONFIG.md) v1.0.2: profile loading never grants Thanh Phong Kiếm to new or empty inventories.

- [C141 Hero skill 1 range](contracts/C141_HERO_SKILL1_RANGE.md) v1.0.0: +15% range at every level for heroes 1, 3, 4 and 5.

- [C138 Local deployment](contracts/C138_LOCAL_DEPLOYMENT.md) v1.0.0: isolated local Compose stack and `deploylocal.ps1`.

- [System Settings — quảng cáo nhận thưởng](SYSTEM_SETTINGS.md): trường cấu hình, mặc định, quota, ví dụ chỉnh và publish.

- [C134 Result ads and System config](contracts/C134_RESULT_AD_SYSTEM_CONFIG.md): victory x2 rewards (five/day) and centralized ad amounts/limits.

- [C109 Store catalog](contracts/C109_STORE_CATALOG_PURCHASE_ORDER.md) v1.1.2: Production verifier package and read-only Google credentials; resource rewards and 30 daily claim windows unchanged.

- [C133 Run lifecycle](contracts/C133_RUN_LIFECYCLE.md): explicit abandon and login recovery; refresh never ends combat.

- [C105 Progression](contracts/C105_PROGRESSION.md) v1.2.1: Diễn Võ Trường grants no permanent EXP; ordinary stages retain User EXP thresholds x5 and first-clear EXP x2.

- [C131 Single login](contracts/C131_SINGLE_LOGIN.md) v1.1.0: signed login generations and realtime login-change push without polling.

- [C131 Single login](contracts/C131_SINGLE_LOGIN.md) v1.1.0: signed login generations and realtime login-change push without polling.

- [C132 Docker runtime build](contracts/C132_DOCKER_RUNTIME_BUILD.md) v1.0.0: build and verify Nakama runtime in Docker before deploy/start/restart.

- C129 v1.1.1: strict store_purchase currency protocol; C130 v1.0.1: left vertical client item rail and original HP position.

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
