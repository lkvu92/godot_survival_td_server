$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
function Invoke-DockerChecked {
    param([string[]]$DockerArguments)
    $result = & docker @DockerArguments
    if ($LASTEXITCODE -ne 0) { throw "Docker command failed: $($DockerArguments -join ' ')" }
    return $result
}
# Fail before building or touching data if the deployment engine is unavailable.
Invoke-DockerChecked -DockerArguments @('info','--format','{{.ServerVersion}}') | Out-Null
$rewarded = Get-Content (Join-Path $projectRoot 'data/rewarded_ads.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$vip = Get-Content (Join-Path $projectRoot 'data/vip_config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$items = Get-Content (Join-Path $projectRoot 'data/items.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$rewardItems = @($items | Where-Object { ($_.category -eq 'talisman_fragment' -and $_.attributes.quality -eq 'low') -or $_.id -in @('talisman_enhance_charm','element_enlightenment_charm') })
$fragments = @($rewardItems | Where-Object category -eq 'talisman_fragment')
if ($fragments.Count -ne 15 -or $rewardItems.Count -ne 17) { throw 'Expected fifteen low fragments and both reward charms.' }
Push-Location $PSScriptRoot
try {
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Runtime build failed.' }
} finally { Pop-Location }
foreach ($test in @('test_rewarded_server.cjs', 'test_vip_server.cjs')) {
    & node (Join-Path $projectRoot "tests/$test")
    if ($LASTEXITCODE -ne 0) { throw "Server regression failed: $test" }
}
$mounts = Invoke-DockerChecked -DockerArguments @('inspect','nakama-server','--format','{{json .Mounts}}') | ConvertFrom-Json
$runtimeMount = @($mounts | Where-Object Destination -eq '/nakama/data')
if ($runtimeMount.Count -ne 1) { throw 'Cannot identify runtime mount.' }
$expectedData = (Join-Path $PSScriptRoot 'data').Replace('\','/').ToLowerInvariant()
$actualData = ([string]$runtimeMount[0].Source).Replace('\','/').ToLowerInvariant()
$linuxPath = $expectedData.Substring(0,1) + $expectedData.Substring(2)
if ($actualData -notin @($expectedData,"/run/desktop/mnt/host/$linuxPath","/host_mnt/$linuxPath")) { throw "Runtime mount differs from workspace: $actualData" }
# Startup applies additive schema migration, preserves purchases/expiry, and
# backfills already-spent stamina quota. Re-running is safe.
Invoke-DockerChecked -DockerArguments @('restart','nakama-server')
$healthy = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    & docker exec nakama-server /nakama/nakama healthcheck 2>$null
    if ($LASTEXITCODE -eq 0) { $healthy = $true; break }
    Start-Sleep -Seconds 1
}
if (-not $healthy) { throw 'Nakama failed healthcheck after schema migration.' }
$rewardedJson = (ConvertTo-Json -InputObject $rewarded -Depth 12 -Compress).Replace("'","''")
$vipJson = (ConvertTo-Json -InputObject $vip -Depth 12 -Compress).Replace("'","''")
$itemsJson = (ConvertTo-Json -InputObject $rewardItems -Depth 12 -Compress).Replace("'","''")
$sql = @"
BEGIN;
INSERT INTO game_content_configs (id,payload,active,updated_at)
VALUES ('rewarded_ads','$rewardedJson'::jsonb,TRUE,NOW()), ('vip','$vipJson'::jsonb,TRUE,NOW())
ON CONFLICT (id) DO UPDATE SET payload=EXCLUDED.payload,active=TRUE,updated_at=NOW();
INSERT INTO game_items (id,display_name,description,category,rarity,icon_id,stackable,max_stack,sort_order,expires_after_hours,tags,attributes)
SELECT x->>'id',x->>'display_name',x->>'description',x->>'category',x->>'rarity',x->>'icon_id',true,(x->>'max_stack')::integer,(x->>'order')::integer,0,x->'tags',x->'attributes' FROM jsonb_array_elements('$itemsJson'::jsonb) x
ON CONFLICT (id) DO UPDATE SET display_name=EXCLUDED.display_name,description=EXCLUDED.description,category=EXCLUDED.category,rarity=EXCLUDED.rarity,icon_id=EXCLUDED.icon_id,attributes=EXCLUDED.attributes;
COMMIT;
SELECT id,active FROM game_content_configs WHERE id IN ('rewarded_ads','vip');
SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='monetization_daily_reward_claims'::regclass AND contype='p';
SELECT COUNT(*) AS low_fragment_pool FROM game_items WHERE category='talisman_fragment' AND attributes->>'quality'='low';
SELECT COUNT(*) AS active_no_ads_users FROM player_monetization_entitlements WHERE no_ads_expires_at>NOW();
"@
$sql | & docker exec -i nakama-postgres psql -U postgres -d nakama -v ON_ERROR_STOP=1
if ($LASTEXITCODE -ne 0) { throw 'Reward config/catalog deployment failed. Seed transaction was rolled back; rerun after fixing the error.' }
Write-Output 'Rewarded no-ads runtime, daily UTC quota migration, fragment/charm catalog and configs deployed. Reconnect clients to sync.'
