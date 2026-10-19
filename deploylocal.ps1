param(
    [ValidateSet('deploy', 'start', 'stop', 'restart', 'seed', 'build', 'logs', 'status', 'health')]
    [string]$Action = 'deploy',
    [string]$Service = ''
)

$ErrorActionPreference = 'Stop'
$nakamaDir = Join-Path $PSScriptRoot 'nakama'
$envPath = Join-Path $nakamaDir '.env.local'
$iapPath = Join-Path $nakamaDir 'iap.local.secret.yml'
$composeArgs = @('compose', '-p', 'survival_td_local', '-f', 'docker-compose.local.yml', '--env-file', '.env.local')

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

Push-Location $nakamaDir
try {
    switch ($Action) {
        { $_ -in 'deploy', 'start', 'restart' } {
            Initialize-LocalConfig
            Build-Runtime
            Configure-Runtime
            if ($Action -eq 'restart') { Invoke-Checked docker ($composeArgs + @('down')) }
            Invoke-Checked docker ($composeArgs + @('up', '-d', '--build'))
            Wait-Nakama
            if ($Action -eq 'deploy') { Configure-Runtime $true }
        }
        'build' { Build-Runtime }
        'seed' { Initialize-LocalConfig; Configure-Runtime $true }
        'stop' { Initialize-LocalConfig; Invoke-Checked docker ($composeArgs + @('down')) }
        'logs' {
            Initialize-LocalConfig
            $args = $composeArgs + @('logs', '-f')
            if ($Service) { $args += $Service }
            Invoke-Checked docker $args
        }
        { $_ -in 'status', 'health' } {
            Initialize-LocalConfig
            Invoke-Checked docker ($composeArgs + @('ps'))
            Wait-Nakama
        }
    }
} finally {
    Pop-Location
}
