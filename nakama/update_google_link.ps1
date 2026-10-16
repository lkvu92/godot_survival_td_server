$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
function Invoke-LinkDocker {
    param([string[]]$DockerArguments)
    $result = & docker @DockerArguments
    if ($LASTEXITCODE -ne 0) { throw "Docker failed: $($DockerArguments -join ' ')" }
    return $result
}
Invoke-LinkDocker -DockerArguments @('info','--format','{{.ServerVersion}}') | Out-Null
$mounts = Invoke-LinkDocker -DockerArguments @('inspect','nakama-server','--format','{{json .Mounts}}') | ConvertFrom-Json
$mount = @($mounts | Where-Object Destination -eq '/nakama/data')
if ($mount.Count -ne 1) { throw 'Cannot identify Nakama runtime mount.' }
$expected = (Join-Path $PSScriptRoot 'data').Replace('\','/').ToLowerInvariant()
$actual = ([string]$mount[0].Source).Replace('\','/').ToLowerInvariant()
$linux = $expected.Substring(0,1)+$expected.Substring(2)
if ($actual -notin @($expected,"/run/desktop/mnt/host/$linux","/host_mnt/$linux")) { throw "Runtime mount differs from workspace: $actual" }
Push-Location $PSScriptRoot
try { & npm run build; if ($LASTEXITCODE -ne 0) { throw 'Runtime build failed.' } } finally { Pop-Location }
foreach ($test in @('test_account_link_server.cjs','test_vip_server.cjs','test_rewarded_server.cjs','test_avatar_server.cjs')) {
    & node (Join-Path $projectRoot "tests/$test")
    if ($LASTEXITCODE -ne 0) { throw "Regression failed: $test" }
}
& (Join-Path $projectRoot 'tests/run_account_link_postgres.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Isolated PostgreSQL acceptance failed.' }
$backupName = 'before-google-link-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.sql'
$backupDir = Join-Path $PSScriptRoot 'backups'
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
# Native pg_dump/cp creates a private data backup, not a code edit or a reseed.
Invoke-LinkDocker -DockerArguments @('exec','nakama-postgres','pg_dump','-U','postgres','-d','nakama','-f',"/tmp/$backupName")
Invoke-LinkDocker -DockerArguments @('cp',"nakama-postgres:/tmp/$backupName",(Join-Path $backupDir $backupName))
Invoke-LinkDocker -DockerArguments @('restart','nakama-server')
for ($attempt=0; $attempt -lt 30; $attempt++) {
    $healthy = $false
    try {
        & docker exec nakama-server /nakama/nakama healthcheck 2>$null
        $healthy = ($LASTEXITCODE -eq 0)
    } catch { $healthy = $false }
    if ($healthy) {
        Write-Output "Google linking deployed; startup schema verified, backup: $backupDir/$backupName. No account was merged by this script. Sign in to the email account, then Profile > Google to resolve a conflict."
        exit 0
    }
    Start-Sleep -Seconds 1
}
throw 'Nakama failed healthcheck. Keep backup and inspect docker logs nakama-server.'
