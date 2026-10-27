param(
    [Parameter(Mandatory = $true)]
    [string]$Godot,
    [ValidateRange(1, 5)]
    [int]$Workers = 2,
    [switch]$Fresh,
    [string]$CheckpointDir = ""
)

$ErrorActionPreference = 'Stop'
$serverRoot = Split-Path $PSScriptRoot -Parent
$runner = 'tools/godot_campaign_recommender.cjs'
function Write-CampaignLog {
    param($Entry, [string]$Arc)
    $line = [string]$Entry
    $color = 'Gray'
    if ($line -match 'UNSOLVED|\bFAIL\b|\bERROR\b|Error:|Exception') { $color = 'Red' }
    elseif ($line -match '\bPASS\b|COMPLETE|complete:') { $color = 'Green' }
    elseif ($line -match 'saved|checkpoint saved') { $color = 'Yellow' }
    elseif ($line -match 'seed=|start Arc') { $color = 'Cyan' }
    Write-Host "[Arc $Arc] $line" -ForegroundColor $color
}
$jobScript = {
    param($root, $runnerPath, $godotPath, $arcOrder, $freshRun, $checkpoints)
    Set-Location $root
    # The Node runner deliberately writes progress to stderr. In a background
    # PowerShell job that is not a failure channel, so preserve it as output.
    $ErrorActionPreference = 'Continue'
    if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
        $PSNativeCommandUseErrorActionPreference = $false
    }
    $arguments = @($runnerPath, "--godot=$godotPath", "--arc=$arcOrder")
    if ($freshRun) { $arguments += '--fresh' }
    if ($checkpoints) { $arguments += "--checkpoint-dir=$checkpoints" }
    & node @arguments 2>&1 | ForEach-Object { Write-Output ([string]$_) }
    $exitCode = $LASTEXITCODE
    exit $exitCode
}

$queued = [System.Collections.Generic.Queue[int]]::new()
1..5 | ForEach-Object { $queued.Enqueue($_) }
$running = @()
$failed = $false

try {
    while ($queued.Count -gt 0 -or $running.Count -gt 0) {
        while ($queued.Count -gt 0 -and $running.Count -lt $Workers) {
            $arc = $queued.Dequeue()
            Write-Host "[C218] start Arc $arc" -ForegroundColor Cyan
            $running += Start-Job -Name "Arc-$arc" -ScriptBlock $jobScript -ArgumentList $serverRoot, $runner, $Godot, $arc, $Fresh.IsPresent, $CheckpointDir
        }

        # Drain each job continuously. Start-Job otherwise buffers native Node
        # output until the complete Arc ends, which hides stage-level progress.
        foreach ($job in @($running)) {
            Receive-Job -Job $job -ErrorAction Continue | ForEach-Object { Write-CampaignLog $_ ($job.Name -replace '^Arc-', '') }
        }

        $completed = @($running | Where-Object { $_.State -in @('Completed', 'Failed', 'Stopped') })
        foreach ($done in $completed) {
            # One final drain catches output written immediately before exit.
            Receive-Job -Job $done -ErrorAction Continue | ForEach-Object { Write-CampaignLog $_ ($done.Name -replace '^Arc-', '') }
            if ($done.State -ne 'Completed' -or $done.ChildJobs[0].JobStateInfo.State -ne 'Completed') {
                $failed = $true
                Write-Host "[C218] $($done.Name) job failed" -ForegroundColor Red
            }
            else {
                Write-Host "[C218] $($done.Name) process complete" -ForegroundColor DarkGray
            }
            Remove-Job -Job $done -Force
            $running = @($running | Where-Object Id -ne $done.Id)
        }
        if ($running.Count -gt 0 -or $queued.Count -gt 0) { Start-Sleep -Seconds 1 }
    }
}
finally {
    if ($running.Count -gt 0) {
        $running | Stop-Job -ErrorAction SilentlyContinue
        $running | Remove-Job -Force -ErrorAction SilentlyContinue
    }
}

if ($failed) { exit 1 }
