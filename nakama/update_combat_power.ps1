$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
function Invoke-PowerDocker {
    param([string[]]$DockerArguments)
    $result = & docker @DockerArguments
    if ($LASTEXITCODE -ne 0) { throw "Docker failed: $($DockerArguments -join ' ')" }
    return $result
}
Invoke-PowerDocker -DockerArguments @('info','--format','{{.ServerVersion}}') | Out-Null
$mounts = Invoke-PowerDocker -DockerArguments @('inspect','nakama-server','--format','{{json .Mounts}}') | ConvertFrom-Json
$mount = @($mounts | Where-Object Destination -eq '/nakama/data')
if ($mount.Count -ne 1) { throw 'Cannot identify Nakama runtime mount.' }
$expected = (Join-Path $PSScriptRoot 'data').Replace('\','/').ToLowerInvariant()
$actual = ([string]$mount[0].Source).Replace('\','/').ToLowerInvariant()
$linux = $expected.Substring(0,1)+$expected.Substring(2)
if ($actual -notin @($expected,"/run/desktop/mnt/host/$linux","/host_mnt/$linux")) { throw "Runtime mount differs from workspace: $actual" }
$sql = & (Join-Path $PSScriptRoot 'build_combat_power_migration.ps1')
Push-Location $PSScriptRoot
try { & npm run build; if ($LASTEXITCODE -ne 0) { throw 'Runtime build failed.' } } finally { Pop-Location }
foreach ($test in @('test_combat_power_server.cjs','test_account_link_server.cjs','test_vip_server.cjs','test_rewarded_server.cjs','test_avatar_server.cjs')) {
    & node (Join-Path $projectRoot "tests/$test")
    if ($LASTEXITCODE -ne 0) { throw "Regression failed: $test" }
}
$backupName = 'before-combat-power-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.sql'
$backupDir = Join-Path $PSScriptRoot 'backups'
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
Invoke-PowerDocker -DockerArguments @('exec','nakama-postgres','pg_dump','-U','postgres','-d','nakama','-f',"/tmp/$backupName")
Invoke-PowerDocker -DockerArguments @('cp',"nakama-postgres:/tmp/$backupName",(Join-Path $backupDir $backupName))
# Bootstrap missing dependency config only; keep existing custom settings/player data.
$sql | & docker exec -i nakama-postgres psql -U postgres -d nakama -v ON_ERROR_STOP=1
if ($LASTEXITCODE -ne 0) { throw 'Combat power config migration failed. Runtime not restarted; keep backup.' }
Invoke-PowerDocker -DockerArguments @('restart','nakama-server')
for ($attempt=0; $attempt -lt 45; $attempt++) {
    $healthy = $false
    try { & docker exec nakama-server /nakama/nakama healthcheck 2>$null; $healthy=($LASTEXITCODE -eq 0) } catch { $healthy=$false }
    if ($healthy) {
        Write-Output "Combat power v2 deployed. Backup: $backupDir/$backupName. Check startup leaderboard sync and compare in-game scores."
        exit 0
    }
    Start-Sleep -Seconds 1
}
throw 'Nakama healthcheck failed; keep backup and inspect docker logs --tail 100 nakama-server.'
