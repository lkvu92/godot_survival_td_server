$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
function Invoke-DockerChecked {
    param([string[]]$DockerArguments)
    $result = & docker @DockerArguments
    if ($LASTEXITCODE -ne 0) { throw "Docker command failed: $($DockerArguments -join ' ')" }
    return $result
}

$config = Get-Content (Join-Path $projectRoot 'data/vip_config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if (@($config.levels).Count -ne 12) { throw 'Expected twelve VIP levels.' }
Push-Location $PSScriptRoot
try {
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Runtime build failed.' }
} finally { Pop-Location }
& node (Join-Path $projectRoot 'tests/test_vip_server.cjs')
if ($LASTEXITCODE -ne 0) { throw 'VIP server regressions failed.' }

$mounts = Invoke-DockerChecked -DockerArguments @('inspect', 'nakama-server', '--format', '{{json .Mounts}}') | ConvertFrom-Json
$runtimeMount = @($mounts | Where-Object Destination -eq '/nakama/data')
if ($runtimeMount.Count -ne 1) { throw 'Cannot identify runtime mount.' }
$expectedData = (Join-Path $PSScriptRoot 'data').Replace('\', '/').ToLowerInvariant()
$actualData = ([string]$runtimeMount[0].Source).Replace('\', '/').ToLowerInvariant()
$linuxPath = $expectedData.Substring(0, 1) + $expectedData.Substring(2)
if ($actualData -notin @($expectedData, "/run/desktop/mnt/host/$linuxPath", "/host_mnt/$linuxPath")) {
    throw "Runtime mount differs from workspace: $actualData"
}
# Restart loads the newly built runtime and its additive, idempotent schema migration.
Invoke-DockerChecked -DockerArguments @('restart', 'nakama-server')
$healthy = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    & docker exec nakama-server /nakama/nakama healthcheck 2>$null
    if ($LASTEXITCODE -eq 0) { $healthy = $true; break }
    Start-Sleep -Seconds 1
}
if (-not $healthy) { throw 'Nakama failed healthcheck after restart.' }
$configJson = (ConvertTo-Json -InputObject $config -Depth 12 -Compress).Replace("'", "''")
$sql = @"
INSERT INTO game_content_configs (id,payload,active,updated_at)
VALUES ('vip','$configJson'::jsonb,TRUE,NOW())
ON CONFLICT (id) DO UPDATE SET payload=EXCLUDED.payload,active=TRUE,updated_at=NOW();
SELECT id,jsonb_array_length(payload->'levels') AS vip_levels FROM game_content_configs WHERE id='vip';
SELECT COUNT(*) AS legacy_receipts_requiring_audit FROM monetization_purchases p
LEFT JOIN monetization_purchase_orders o ON o.id=COALESCE(NULLIF(p.purchase_order_id,''),p.request_id)
WHERE p.status IN ('verified','consumed') AND p.verified_at IS NOT NULL
AND COALESCE(o.vip_environment,'')='' AND p.purchase_token_hash NOT LIKE 'mock:%';
"@
$sql | & docker exec -i nakama-postgres psql -U postgres -d nakama -v ON_ERROR_STOP=1
if ($LASTEXITCODE -ne 0) { throw 'VIP config deployment failed.' }
Write-Output 'VIP runtime and config deployed. Reconnect the game to refresh VIP; receipt-verified legacy restores are reconciled without regranting rewards.'
