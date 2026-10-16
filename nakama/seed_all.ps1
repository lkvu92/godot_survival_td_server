# Arguments are forwarded to Python, including --settings and --publish.
$ErrorActionPreference = 'Stop'
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw 'Python is required. Install Python 3 and rerun seed_all.ps1.'
}
& python (Join-Path $PSScriptRoot 'seed_all.py') @args
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
