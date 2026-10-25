<#
.SYNOPSIS
  Starts all three dev servers (desktop, backend Functions, mobile) at once, each
  in its own window, instead of running three separate commands by hand.

.DESCRIPTION
  Before starting each one, frees up the port it needs by stopping whatever
  process is already listening on it — in practice that's almost always a
  leftover copy of this same dev server from a previous run that didn't shut
  down cleanly, so the new one can safely reuse the same port instead of Vite/
  Expo/Functions silently drifting to the next free one.

    Desktop (electron-vite)   -> port 5173
    Backend (Azure Functions) -> port 7071
    Mobile (Expo/Metro)       -> port 8081

.USAGE
  From the repo root:  npm run artha
  Or directly, from anywhere:  powershell -ExecutionPolicy Bypass -File scripts\dev-all.ps1
#>

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

$targets = @(
    @{ Name = 'Desktop (electron-vite)';    Port = 5173; Dir = $root;                        Command = 'npm run dev' },
    @{ Name = 'Backend (Azure Functions)';  Port = 7071; Dir = (Join-Path $root 'backend');   Command = 'npm start' },
    @{ Name = 'Mobile (Expo)';              Port = 8081; Dir = (Join-Path $root 'mobile');    Command = 'npm start' }
)

function Stop-ProcessOnPort {
    param([int]$Port)

    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (-not $conns) { return }

    $procIds = $conns | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $procIds) {
        $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Host "  Port $Port is in use by $($proc.ProcessName) (PID $procId) - stopping it." -ForegroundColor Yellow
            Stop-Process -Id $procId -Force -Confirm:$false -ErrorAction SilentlyContinue
        }
    }
}

Write-Host "Freeing up ports..." -ForegroundColor Cyan
foreach ($t in $targets) {
    Stop-ProcessOnPort -Port $t.Port
}

# Give Windows a moment to actually release each socket before the next process
# tries to bind it - stopping a process doesn't free its port instantaneously.
Start-Sleep -Seconds 2

Write-Host "`nStarting dev servers..." -ForegroundColor Cyan
foreach ($t in $targets) {
    Write-Host "  $($t.Name) -> http://localhost:$($t.Port)" -ForegroundColor Green
    $title = $t.Name
    $dir = $t.Dir
    $cmd = $t.Command
    Start-Process powershell -ArgumentList @(
        '-NoExit',
        '-Command',
        "`$Host.UI.RawUI.WindowTitle = '$title'; Set-Location '$dir'; $cmd"
    )
}

Write-Host "`nAll three dev servers are starting, each in its own window." -ForegroundColor Cyan
