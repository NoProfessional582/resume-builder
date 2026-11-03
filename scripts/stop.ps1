# Stops the Resume Builder background service (and any Codex run it started).
#
#   powershell -ExecutionPolicy Bypass -File scripts\stop.ps1 [-Port 4310]
#
# Only stops a process after confirming it is this app's server (node.exe running
# server\src\index.ts), so a stale pid file can never take down an unrelated program.

param([int]$Port = 4310)
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $root 'data\server.pid'

function Test-IsOurServer([int]$id) {
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$id" -ErrorAction SilentlyContinue
  if (-not $proc) { return $false }
  return ($proc.Name -ieq 'node.exe') -and ($proc.CommandLine -match 'server[\\/]src[\\/]index\.ts')
}

$candidates = @()
if (Test-Path $pidFile) { $candidates += [int](Get-Content $pidFile) }
$conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($conn) { $candidates += @($conn.OwningProcess) }

$serverPid = $candidates | Select-Object -Unique | Where-Object { Test-IsOurServer $_ } | Select-Object -First 1

if (-not $serverPid) {
  Remove-Item $pidFile -ErrorAction SilentlyContinue
  if ($conn) {
    Write-Host "Port $Port is in use by another program (pid $($conn.OwningProcess -join ', ')); not stopping it."
    exit 1
  }
  Write-Host 'Resume Builder is not running.'
  exit 0
}

# /T also ends child processes, such as a Codex run in progress.
taskkill /PID $serverPid /T /F | Out-Null
Remove-Item $pidFile -ErrorAction SilentlyContinue
Write-Host "Stopped Resume Builder (pid $serverPid)."
