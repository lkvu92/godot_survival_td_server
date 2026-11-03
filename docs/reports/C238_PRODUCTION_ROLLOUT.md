# C238 v1.1.1 — Production growth rollout

Date: 2026-10-30. Status: VERIFIED.

User authorized production deployment after the local round-3 adjustment. Target: existing Nakama stack at api.lkvustudio.com / 14.225.217.231.

| Hero | Growth field | Production value |
|---|---|---:|
| hero_2 | hp | 1.057139 |
| hero_2 | atk | 1.078060 |
| hero_2 | crit_rate | 0.0033 |
| hero_4 | hp | 1.056458 |
| hero_4 | attack_speed | 1.016488 |
| hero_4 | crit_damage | 0.012 |

The guarded transaction checked the audited full hero-row snapshot before writing and verified the exact expected full-table result before commit. Only these six nested growth fields changed. Other hero fields/rows, skills and player data were preserved. The same six fields were updated in `/opt/thong-thien-lo/server/data/heroes.json` for subsequent seeds.

Backup on VPS: `/opt/thong-thien-lo/server/backups/c238-round3-20261030T053525Z/` contains original seed, before/after DB hero rows and release metadata. Audited DB SHA256: `9f024ef3e6d33092adc88e7fa85a99eb300922823fbccbe5979afb63bed70366`; original seed SHA256: `8c982f4fd76356cdddc34ede6ee9b995747a4aef58e444c316f15a0cf237308c`.

Verification:
- DB readback and production seed file match all six approved values.
- Loopback `get_game_config` and public HTTPS `get_game_config` return all six approved values using the accepted app_version 1.0.0.
- Loopback Nakama healthcheck: HTTP200. Public `/healthcheck`: nginx HTTP404; public gameplay config RPC succeeded, so this route difference was recorded without changing proxy configuration.
- Active remote settings remain config_version17, snapshot MD5 `4795e7c6ccb9842c3a7cf2b0bb2c1f67`, unchanged from preflight. Catalog tables are read directly by get_game_config; no remote-settings publication was needed (SEEDING.md).
- No server build/restart, full-catalog seed, C239 rollout, draft-settings publication or profile mutation occurred.

Existing test evidence: actual backend growth targets and Lv1/30/50/70 checks, client/server static suites, backend build and six round-3 mortal diagnostic runs documented in C238. This deployment changes approved growth; it does not certify overall PvE/PvP balance. Players need a fresh login/bootstrap and a new battle to receive the updated authoritative attributes.
