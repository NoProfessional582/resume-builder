# Starts Resume Builder as a background service.
#
# The server is launched through WMI so it runs outside the Claude desktop app's process job;
# processes started directly from Claude's shells are killed when the app quits or updates.
#
#   powershell -ExecutionPolicy Bypass -File scripts\start.ps1 [-Port 4310] [-NoBuild]

param(
  [int]$Port = 4310,
  [switch]$NoBuild
)
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$data = Join-Path $root 'data'
$logs = Join-Path $data 'logs'
$pidFile = Join-Path $data 'server.pid'
$url = "http://127.0.0.1:$Port"
New-Item -ItemType Directory -Force $logs | Out-Null

function Test-Up {
  try { Invoke-RestMethod "$url/api/health" -TimeoutSec 2 | Out-Null; return $true } catch { return $false }
}

if (Test-Up) {
  Write-Host "Resume Builder is already running at $url"
  exit 0
}

if (-not $NoBuild) {
  Write-Host 'Building web app...'
  Push-Location $root
  try {
    npm run build | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Web build failed (run "npm run build" to see the error).' }
  } finally { Pop-Location }
}

$node = (Get-Command node -ErrorAction Stop).Source
$codex = Join-Path (npm root -g) '@openai\codex\bin\codex.js'

# WMI can't redirect output or pass environment variables, so a small launcher sets them.
$launcher = Join-Path $data 'launch.cmd'
@"
@echo off
cd /d "$root"
set PORT=$Port
set RB_CODEX_PATH=$codex
"$node" server\src\index.ts >> "$logs\server.out.log" 2>> "$logs\server.err.log"
"@ | Set-Content -Encoding ascii $launcher

Remove-Item $pidFile -ErrorAction SilentlyContinue
$startup = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [uint16]0 }
$result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
  CommandLine               = "cmd.exe /c `"$launcher`""
  CurrentDirectory          = $root
  ProcessStartupInformation = $startup
}
if ($result.ReturnValue -ne 0) { throw "WMI could not start the server (code $($result.ReturnValue))." }

for ($i = 0; $i -lt 60; $i++) {
  if (Test-Up) {
    $serverPid = if (Test-Path $pidFile) { Get-Content $pidFile } else { '?' }
    Write-Host "Resume Builder started at $url (server pid $serverPid, launched outside Claude via WMI)."
    Write-Host "Logs: $logs"
    exit 0
  }
  Start-Sleep -Milliseconds 500
}

Write-Host "Server didn't answer within 30 seconds. Last errors:" -ForegroundColor Red
Get-Content (Join-Path $logs 'server.err.log') -Tail 20 -ErrorAction SilentlyContinue
exit 1
