$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
function Invoke-AvatarDocker {
    param([string[]]$DockerArguments)
    $result = & docker @DockerArguments
    if ($LASTEXITCODE -ne 0) { throw "Docker command failed: $($DockerArguments -join ' ')" }
    return $result
}
Invoke-AvatarDocker -DockerArguments @('info','--format','{{.ServerVersion}}') | Out-Null
$mounts = Invoke-AvatarDocker -DockerArguments @('inspect','nakama-server','--format','{{json .Mounts}}') | ConvertFrom-Json
$runtimeMount = @($mounts | Where-Object Destination -eq '/nakama/data')
if ($runtimeMount.Count -ne 1) { throw 'Cannot identify runtime mount.' }
$expectedData = (Join-Path $PSScriptRoot 'data').Replace('\','/').ToLowerInvariant()
$actualData = ([string]$runtimeMount[0].Source).Replace('\','/').ToLowerInvariant()
$linuxPath = $expectedData.Substring(0,1) + $expectedData.Substring(2)
if ($actualData -notin @($expectedData,"/run/desktop/mnt/host/$linuxPath","/host_mnt/$linuxPath")) { throw "Runtime mount differs from workspace: $actualData" }
Push-Location $PSScriptRoot
try {
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Runtime build failed.' }
} finally { Pop-Location }
& node (Join-Path $projectRoot 'tests/test_avatar_server.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Avatar server regressions failed.' }
# No user data reseed. Avatar fields live in existing profile JSON.
Invoke-AvatarDocker -DockerArguments @('restart','nakama-server')
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    & docker exec nakama-server /nakama/nakama healthcheck 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Output 'Avatar runtime deployed and Nakama healthy. Reconnect clients or press LUU LAI to sync pending avatars.'
        exit 0
    }
    Start-Sleep -Seconds 1
}
throw 'Nakama failed healthcheck after restart. Inspect docker logs nakama-server.'
