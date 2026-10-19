$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
Push-Location $repoRoot
try {
    Get-ChildItem data -Filter '*.json' -Recurse | ForEach-Object {
        Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8 | ConvertFrom-Json | Out-Null
    }
    & node --check nakama/data/build/index.js
    if ($LASTEXITCODE -ne 0) { throw 'Runtime syntax failed' }
    & node tests/test_server_admission.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Server admission regression failed' }
    & node tests/test_character_repository.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Character repository regression failed' }
    & node tests/test_store_platforms.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Store platform boundary regression failed' }
    & node tests/test_run_lifecycle.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Run lifecycle regression failed' }
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
    & node tests/test_daily_pack_rewards.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Legacy pack reward regression failed' }
    & node tests/test_new_profile_inventory.cjs
    if ($LASTEXITCODE -ne 0) { throw 'New profile inventory regression failed' }
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
    & python -B -m unittest discover -s tests -p 'test_*.py'
    if ($LASTEXITCODE -ne 0) { throw 'Seed CLI regressions failed' }
    if ($env:SEED_TEST_PSQL -and $env:SEED_TEST_PORT) {
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
} finally {
    Pop-Location
}
