$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
Push-Location $repoRoot
try {
    & node --test services/account-identity/test/security.test.js services/account-identity/test/mail-template.test.js
    if ($LASTEXITCODE -ne 0) { throw 'C232 account identity security regression failed' }
    & node tests/test_mid_tier_talisman_config.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Mid-tier talisman config regression failed' }
    & node tests/test_low_tier_talisman_balance.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Low-tier talisman balance regression failed' }
    & node tests/test_campaign_spawn_formation.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Ordered campaign spawn formation regression failed' }
    Get-ChildItem data -Filter '*.json' -Recurse | ForEach-Object {
        Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8 | ConvertFrom-Json | Out-Null
    }
    & node --check nakama/data/build/index.js
    if ($LASTEXITCODE -ne 0) { throw 'Runtime syntax failed' }
    & node tests/test_arc6_backend.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Arc 6 backend integration failed' }
    & node tests/test_breakthrough_preview.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Immediate breakthrough preview regression failed' }
    & node tests/test_hero4_revision13.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Hero4 balance revision 1.3 regression failed' }
    & node tests/test_vip_benefits.cjs
    if ($LASTEXITCODE -ne 0) { throw 'VIP benefits and milestone mail regression failed' }
    & node tests/test_arc6_catalog.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Arc 6 catalog regression failed' }
    & node tests/test_tactical_support.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Tactical support regression failed' }
    & node tests/test_status_icon_metadata.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Status icon metadata regression failed' }
    & node tests/test_arc_mode_unlocks.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Arc difficulty unlock regression failed' }
    & node tests/test_feature_unlocks.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Feature unlock regression failed' }
    & node tests/test_than_luan.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Than Luan regression failed' }
    & node tests/test_server_admission.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Server admission regression failed' }
    & node tests/test_character_repository.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Character repository regression failed' }
    & node tests/test_store_platforms.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Store platform boundary regression failed' }
    & node tests/test_mailbox_runtime.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Mailbox regression failed' }
    & node tests/test_run_lifecycle.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Run lifecycle regression failed' }
    & node tests/test_stage_sweep.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Stage sweep acceptance failed' }
    node tests/test_tower_sweep.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Tower sweep acceptance failed' }
    & node tests/test_operator_publish.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Operator publication regression failed' }
    & node tests/test_sweep_config.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Stage sweep config publication failed' }
    & node tests/test_layered_talisman_config.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Layered talisman config regression failed' }
    & node tests/test_weekly_leaderboard_config.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Weekly leaderboard config regression failed' }
    & node tests/test_stage_reward_ads.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Stage reward/System ad config regression failed' }
    & node tests/test_arc_visual_scale.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Arc visual scale regression failed' }
    & node tests/test_daily_pack_entitlements.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Daily pack entitlement regression failed' }
    & node tests/test_currency_pricing.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Currency pricing regression failed' }
    & node tests/test_daily_pack_rewards.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Legacy pack reward regression failed' }
    & node tests/test_new_profile_inventory.cjs
    if ($LASTEXITCODE -ne 0) { throw 'New profile inventory regression failed' }
    & node tests/test_hero_exp_test.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Hero EXP test failed' }
    & node tests/test_admin_skill_test.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Admin skill test regression failed' }
    & node tests/test_account_password.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Account password regression failed' }
    & node tests/test_single_login.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Single login regression failed' }
    & node tests/test_player_names.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Player names regression failed' }
    & node tests/test_consumable_store.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Consumable store regression failed' }
    & node tests/test_consumable_use.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Consumable use regression failed' }
    & node --check services/monetization-verifier/src/server.js
    if ($LASTEXITCODE -ne 0) { throw 'Verifier syntax failed' }
    # unittest defaults to stderr; Windows PowerShell treats successful progress
    # output as a native error under Stop. Keep the report on stdout.
    & python -B -c "import sys,unittest; result=unittest.TextTestRunner(stream=sys.stdout).run(unittest.defaultTestLoader.discover('tests',pattern='test_*.py')); sys.exit(not result.wasSuccessful())"
    if ($LASTEXITCODE -ne 0) { throw 'Seed CLI regressions failed' }
    if ($env:SEED_TEST_PSQL -and $env:SEED_TEST_PORT) {
        & node tests/test_sweep_migration.cjs
        if ($LASTEXITCODE -ne 0) { throw 'Sweep startup migration PostgreSQL regression failed' }
        & node tests/test_sweep_worker_sql.cjs
        if ($LASTEXITCODE -ne 0) { throw 'Sweep worker PostgreSQL regression failed' }
        & node tests/test_server_registry_sql.cjs
        if ($LASTEXITCODE -ne 0) { throw 'Server registry PostgreSQL regressions failed' }
        & node tests/test_weekly_leaderboard.cjs
        if ($LASTEXITCODE -ne 0) { throw 'Weekly leaderboard PostgreSQL regressions failed' }
        & node tests/test_seed_integrity.cjs
        if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL regressions failed' }
    }
    & node tests/test_s1_migration_cli.cjs
    if ($LASTEXITCODE -ne 0) { throw 'S1 migration CLI safety regressions failed' }
    Write-Output 'PASS server static checks and seed CLI regressions'
    & node tests/test_first_clear_exp.cjs
    if ($LASTEXITCODE -ne 0) { throw 'First-clear EXP regression failed' }
    & node tests/test_campaign_wave_exp.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Campaign wave EXP regression failed' }
    & node tests/test_campaign_wave_pressure.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Campaign wave pressure regression failed' }
    & node tests/test_campaign_pressure_engine.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Campaign pressure engine regression failed' }
    & node tests/test_campaign_opening_relief.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Campaign opening-relief regression failed' }
} finally {
    Pop-Location
}
