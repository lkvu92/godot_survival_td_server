$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$progression = Get-Content (Join-Path $projectRoot 'data/progression.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$coefficient = [int]$progression.talisman_system.upgrade.material_quantity_per_level
if ($coefficient -le 0) { throw 'Invalid Heavenly Crystal coefficient.' }

function Invoke-DockerChecked {
    param([string[]]$DockerArguments)
    $result = & docker @DockerArguments
    if ($LASTEXITCODE -ne 0) { throw "Docker command failed: $($DockerArguments -join ' ')" }
    return $result
}

# Verify that this server actually loads this workspace's compiled runtime.
$mounts = Invoke-DockerChecked -DockerArguments @('inspect', 'nakama-server', '--format', '{{json .Mounts}}') | ConvertFrom-Json
$runtimeMount = @($mounts | Where-Object Destination -eq '/nakama/data')
if ($runtimeMount.Count -ne 1) { throw 'Cannot identify Nakama runtime mount.' }
$expectedData = (Join-Path $PSScriptRoot 'data').Replace('\', '/').ToLowerInvariant()
$mountSource = ([string]$runtimeMount[0].Source).Replace('\', '/').ToLowerInvariant()
$dockerDesktopPath = '/run/desktop/mnt/host/' + $expectedData.Substring(0, 1) + $expectedData.Substring(2)
if ($mountSource -ne $expectedData -and $mountSource -ne $dockerDesktopPath) {
    throw "Server runtime mount differs from this workspace: $mountSource"
}

Push-Location $PSScriptRoot
try {
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Runtime build failed.' }
} finally { Pop-Location }
& node (Join-Path $projectRoot 'tests/test_talisman_cost_server.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Server cost regression failed.' }

# Change only the requested balance field; preserve all other server config.
$exists = Invoke-DockerChecked -DockerArguments @('exec', 'nakama-postgres', 'psql', '-U', 'postgres', '-d', 'nakama', '-tAc', "SELECT count(*) FROM game_config WHERE key='progression' AND jsonb_typeof(value #> '{talisman_system,upgrade}')='object'")
if (([string]$exists).Trim() -ne '1') { throw 'Server progression/upgrade config is missing; no update applied.' }
$tiersJson = (ConvertTo-Json -InputObject @($progression.talisman_system.upgrade.tiers) -Depth 8 -Compress).Replace("'", "''")
$allItems = Get-Content (Join-Path $projectRoot 'data/items.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$crystalItems = @($allItems | Where-Object { $_.id -in @('talisman_heavenly_crystal', 'talisman_heavenly_crystal_medium', 'talisman_heavenly_crystal_high') })
if ($crystalItems.Count -ne 3) { throw 'Expected three crystal catalog items.' }
$itemsJson = (ConvertTo-Json -InputObject $crystalItems -Depth 12 -Compress).Replace("'", "''")
$sql = @"
BEGIN;
UPDATE game_config SET value=jsonb_set(jsonb_set(value, '{talisman_system,upgrade,material_quantity_per_level}', '$coefficient'::jsonb, true), '{talisman_system,upgrade,tiers}', '$tiersJson'::jsonb, true), updated_at=NOW() WHERE key='progression';
INSERT INTO game_items (id,display_name,description,category,rarity,icon_id,stackable,max_stack,sort_order,expires_after_hours,tags,attributes)
SELECT x->>'id',x->>'display_name',x->>'description',x->>'category',x->>'rarity',x->>'icon_id',true,(x->>'max_stack')::integer,(x->>'order')::integer,0,x->'tags',x->'attributes' FROM jsonb_array_elements('$itemsJson'::jsonb) x
ON CONFLICT (id) DO UPDATE SET display_name=EXCLUDED.display_name, description=EXCLUDED.description, rarity=EXCLUDED.rarity, icon_id=EXCLUDED.icon_id, attributes=EXCLUDED.attributes;
COMMIT;
"@
$sql | & docker exec -i nakama-postgres psql -U postgres -d nakama -v ON_ERROR_STOP=1
if ($LASTEXITCODE -ne 0) { throw 'Crystal catalog/tier update failed; SQL transaction was rolled back.' }
Invoke-DockerChecked -DockerArguments @('restart', 'nakama-server')
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    & docker exec nakama-server /nakama/nakama healthcheck 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Output "Nakama updated and healthy. Heavenly Crystal cost = current level * $coefficient (Lv.24 = $($coefficient * 24))."
        exit 0
    }
    Start-Sleep -Seconds 1
}
throw 'Nakama restart did not become healthy within 30 seconds. Inspect docker logs nakama-server.'
