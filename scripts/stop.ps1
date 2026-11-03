# Stops the Resume Builder background service (and any Codex run it started).
#
#   powershell -ExecutionPolicy Bypass -File scripts\stop.ps1 [-Port 4310]

param([int]$Port = 4310)
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $root 'data\server.pid'

$serverPid = $null
if (Test-Path $pidFile) { $serverPid = [int](Get-Content $pidFile) }
if (-not $serverPid -or -not (Get-Process -Id $serverPid -ErrorAction SilentlyContinue)) {
  # Fall back to whatever is listening on the port.
  $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  $serverPid = if ($conn) { $conn.OwningProcess } else { $null }
}

if (-not $serverPid) {
  Write-Host 'Resume Builder is not running.'
  Remove-Item $pidFile -ErrorAction SilentlyContinue
  exit 0
}

# /T also ends child processes, such as a Codex run in progress.
taskkill /PID $serverPid /T /F | Out-Null
Remove-Item $pidFile -ErrorAction SilentlyContinue
Write-Host "Stopped Resume Builder (pid $serverPid)."
