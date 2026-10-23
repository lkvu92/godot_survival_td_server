# C176 local test readiness

Verified: 2026-10-23. Target: Docker Compose project `survival_td_local` only.

- Docker Desktop started; existing PostgreSQL and Nakama containers started with
  their existing volumes. Nakama healthcheck passes; mail/sweep workers running.
- Rebuilt and loaded the canonical runtime including C176.
- Added an operator publisher credential only to the ignored local runtime secret.
- Seeded system.feature_unlocks and system.realm_milestones through seed_game_data.
  Preserved the active 1.1.0 app-version settings and all other published settings.
- Published local config **v4**, then validated it through operator_config_release
  check_active and authenticated get_config_bootstrap.
- Enabled: checkin@2, shop@5, leaderboard@9, stage_epic@10, sweep@15,
  elements@20, stage_legend@22, talisman@25, trial_tower@30.
- Planned/disabled: daily_quests, laws, guild_war, ancient_battlefield, multiverse.

Native smoke test used a dedicated device account `c176-local-smoke-20261023`,
username `c176_local_smoke`, character s001/generation 1. Existing gameplay
accounts were not modified. Test fixture level/history changes affected this
named smoke character only; they are not gameplay progression claims.

Authenticated RPC checks passed:

1. Create/enter character; config bootstrap returns v4; profile starts at Lv1.
2. Element RPC rejects with FEATURE_LOCKED below its required level.
3. Lv2 profile reconcile grants checkin; tour completion ACK and repeated ACK succeed.
4. Lv30 profile reconcile grants all nine released features; mailbox contains nine
   feature_unlocked mails and three realm_breakthrough mails for proven history
   10/20/30, committed through the real Nakama/PostgreSQL runtime.
5. Repeated profile load and mailbox read do not create duplicate mail.

Client project default remains production. For this local stack, pass Godot user
argument `--nakama-env=develop` (command line separator: `-- --nakama-env=develop`).
Develop endpoint is 127.0.0.1:7350. Do not run a local test against production.
Existing eligible characters baseline old tours during migration; use a fresh
test character to verify automatic tours as levels are earned.

Physical Android/iOS validation remains outstanding. No production seed or deploy.
