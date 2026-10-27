param(
    [ValidateSet('deploy', 'start', 'stop', 'restart', 'seed', 'build', 'logs', 'status', 'health')]
    [string]$Action = 'deploy',
    [string]$Service = '',
    [switch]$Publish
)

$ErrorActionPreference = 'Stop'
if ($Service -eq '--publish') { $Publish = $true; $Service = '' }
if ($Publish -and $Action -ne 'seed') { throw 'Publish is supported only with seed.' }
if ($Service -and $Action -ne 'logs') { throw "Unexpected argument: $Service" }
if ($args.Count) { throw "Unexpected arguments: $args" }
$nakamaDir = Join-Path $PSScriptRoot 'nakama'
$envPath = Join-Path $nakamaDir '.env.local'
$iapPath = Join-Path $nakamaDir 'iap.local.secret.yml'
$composeArgs = @('compose', '-p', 'survival_td_local', '-f', 'docker-compose.local.yml', '--env-file', '.env.local')
$managedComposeArgs = $composeArgs + @('--profile', 'identity')
$identityEnabled = $false
$activeComposeArgs = $composeArgs

function Select-IdentityProfile {
    $profile = Invoke-Checked python @('identity_config.py', '--compose-file', 'docker-compose.local.yml', '--env-file', '.env.local')
    if ($profile -notin @('identity', 'none')) { throw 'Invalid identity profile inspection result' }
    $script:identityEnabled = $profile -eq 'identity'
    $script:activeComposeArgs = if ($script:identityEnabled) { $managedComposeArgs } else { $composeArgs }
    Write-Host "[INFO] Account identity enabled: $script:identityEnabled"
}

function Invoke-Checked([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program exited with code $LASTEXITCODE" }
}

function Initialize-LocalConfig {
    if (-not (Test-Path -LiteralPath $envPath)) {
        $template = Get-Content -LiteralPath (Join-Path $nakamaDir '.env.local.example')
        $generated = foreach ($line in $template) {
            if ($line -match '^([A-Z_]+)=GENERATE_ON_FIRST_RUN$') {
                $bytes = New-Object byte[] 32
                $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
                try { $random.GetBytes($bytes) } finally { $random.Dispose() }
                "$($Matches[1])=$([BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant())"
            } else { $line }
        }
        [System.IO.File]::WriteAllLines($envPath, [string[]]$generated, [System.Text.UTF8Encoding]::new($false))
        Write-Host '[INFO] Created nakama/.env.local with unique local credentials.'
    }
    if (-not (Test-Path -LiteralPath $iapPath)) {
        Copy-Item -LiteralPath (Join-Path $nakamaDir 'iap.local.example.yml') -Destination $iapPath
    }
}

function Build-Runtime {
    Write-Host '[INFO] Building Nakama runtime...'
    Invoke-Checked docker @('run', '--rm', '-v', "${nakamaDir}:/workspace", '-w', '/workspace', 'node:20-bookworm-slim', 'sh', '-lc', 'npm ci && npm run build')
    Invoke-Checked docker @('run', '--rm', '-v', "${nakamaDir}:/workspace", '-w', '/workspace', 'node:20-bookworm-slim', 'node', 'verify_runtime.cjs')
}

function Configure-Runtime([bool]$Seed = $false) {
    $arguments = @('configure_runtime.py', '--compose-file', 'docker-compose.local.yml', '--env-file', '.env.local', '--output', 'runtime.local.secret.yml')
    if ($Seed) { $arguments += '--seed' }
    if ($Seed -and $Publish) { $arguments += @('--', '--publish') }
    Invoke-Checked python $arguments
}

function Wait-Nakama {
    $port = 7350
    $line = Get-Content -LiteralPath $envPath | Where-Object { $_ -match '^NAKAMA_HTTP_PORT=' } | Select-Object -Last 1
    if ($line) { $port = [int]($line -split '=', 2)[1] }
    $url = "http://127.0.0.1:$port/healthcheck"
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        try {
            $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -eq 200) { Write-Host '[OK] Local Nakama is healthy.'; return }
        } catch { Start-Sleep -Seconds 2 }
    }
    throw "Local Nakama did not become healthy at $url"
}

function Wait-Identity([bool]$VerifySmtp = $true) {
    if (-not $script:identityEnabled) { return }
    $probe = "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
    $healthy = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        & docker @managedComposeArgs exec -T account-identity node -e $probe *> $null
        if ($LASTEXITCODE -eq 0) { $healthy = $true; break }
        Start-Sleep -Seconds 1
    }
    if (-not $healthy) { throw 'Account identity healthcheck failed; inspect logs account-identity.' }
    Write-Host '[OK] Account identity is healthy.'
    if ($VerifySmtp) { Invoke-Checked docker ($managedComposeArgs + @('exec', '-T', 'account-identity', 'node', 'src/verify-smtp.js')) }
}

Push-Location $nakamaDir
try {
    switch ($Action) {
        { $_ -in 'deploy', 'start', 'restart' } {
            Initialize-LocalConfig
            Select-IdentityProfile
            Build-Runtime
            Configure-Runtime
            if ($Action -eq 'restart') { Invoke-Checked docker ($managedComposeArgs + @('down')) }
            Invoke-Checked docker ($activeComposeArgs + @('up', '-d', '--build'))
            # Mounted runtime files are loaded only at process startup.
            Invoke-Checked docker ($activeComposeArgs + @('up', '-d', '--no-deps', '--force-recreate', 'nakama'))
            Wait-Nakama
            Wait-Identity
            if ($Action -eq 'deploy') { Configure-Runtime $true }
        }
        'build' { Build-Runtime }
        'seed' { Initialize-LocalConfig; Configure-Runtime $true }
        'stop' { Initialize-LocalConfig; Invoke-Checked docker ($managedComposeArgs + @('down')) }
        'logs' {
            Initialize-LocalConfig
            $logArgs = $managedComposeArgs + @('logs', '-f')
            if ($Service) { $logArgs += $Service }
            Invoke-Checked docker $logArgs
        }
        { $_ -in 'status', 'health' } {
            Initialize-LocalConfig
            Select-IdentityProfile
            Invoke-Checked docker ($managedComposeArgs + @('ps'))
            Wait-Nakama
            Wait-Identity $false
        }
    }
} finally {
    Pop-Location
}
