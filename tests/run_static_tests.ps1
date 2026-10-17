$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
Push-Location $repoRoot
try {
    Get-ChildItem data -Filter '*.json' -Recurse | ForEach-Object {
        Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8 | ConvertFrom-Json | Out-Null
    }
    & node --check nakama/data/build/index.js
    if ($LASTEXITCODE -ne 0) { throw 'Runtime syntax failed' }
    & node tests/test_new_profile_inventory.cjs
    if ($LASTEXITCODE -ne 0) { throw 'New profile inventory regression failed' }
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
        & node tests/test_seed_integrity.cjs
        if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL regressions failed' }
    }
    Write-Output 'PASS server static checks and seed CLI regressions'
    & node tests/test_first_clear_exp.cjs
    if ($LASTEXITCODE -ne 0) { throw 'First-clear EXP regression failed' }
} finally {
    Pop-Location
}
