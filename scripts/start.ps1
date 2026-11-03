# Starts Resume Builder as a background service and opens it in your browser.
#
# First run: checks Node.js, installs dependencies, and warns if Codex or Microsoft Word is missing.
# The server is launched through WMI so it runs outside the terminal (or app) that started it and
# keeps running after that window closes.
#
#   powershell -ExecutionPolicy Bypass -File scripts\start.ps1 [-Port 4310] [-NoBuild] [-NoBrowser]

param(
  [int]$Port = 4310,
  [switch]$NoBuild,
  [switch]$NoBrowser
)
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$data = Join-Path $root 'data'
$logs = Join-Path $data 'logs'
$pidFile = Join-Path $data 'server.pid'
$url = "http://127.0.0.1:$Port"

function Fail([string]$message) {
  Write-Host $message -ForegroundColor Red
  exit 1
}

function Test-Up {
  try { Invoke-RestMethod "$url/api/health" -TimeoutSec 2 | Out-Null; return $true } catch { return $false }
}

function Open-App {
  if (-not $NoBrowser) { Start-Process $url }
}

if (Test-Up) {
  Write-Host "Resume Builder is already running at $url"
  Open-App
  exit 0
}

# --- Requirements -------------------------------------------------------------------------------

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) { Fail 'Node.js is not installed. Install Node.js 24 or newer from https://nodejs.org, then run this again.' }
$node = $nodeCmd.Source
$nodeVersion = (& $node --version).TrimStart('v')
if ([int]($nodeVersion.Split('.')[0]) -lt 24) {
  Fail "Node.js $nodeVersion is too old. Install Node.js 24 or newer from https://nodejs.org, then run this again."
}

Push-Location $root
try {
  if (-not (Test-Path (Join-Path $root 'node_modules'))) {
    Write-Host 'Installing dependencies (first run, takes a minute)...'
    npm install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { Fail 'npm install failed. See the errors above.' }
  }

  if (-not $NoBuild) {
    Write-Host 'Building web app...'
    npm run build | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail 'Web build failed (run "npm run build" to see the error).' }
  }
} finally { Pop-Location }

# Codex and Word are only needed for some features, so missing ones are warnings, not errors.
$codexJs = Join-Path (npm root -g) '@openai\codex\bin\codex.js'
$hasCodex = (Test-Path $codexJs) -or [bool](Get-Command codex -ErrorAction SilentlyContinue)
if (-not $hasCodex) {
  Write-Host 'Warning: Codex CLI not found. AI features won''t work until you run:' -ForegroundColor Yellow
  Write-Host '  npm install -g @openai/codex' -ForegroundColor Yellow
  Write-Host '  codex login' -ForegroundColor Yellow
}
if (-not (Test-Path 'Registry::HKEY_CLASSES_ROOT\Word.Application')) {
  Write-Host 'Warning: Microsoft Word not found. Importing a resume and page counts need the Word desktop app.' -ForegroundColor Yellow
}

# --- Launch -------------------------------------------------------------------------------------

New-Item -ItemType Directory -Force $logs | Out-Null

# WMI can't redirect output or pass environment variables, so a small launcher sets them.
$launcher = Join-Path $data 'launch.cmd'
$codexLine = if (Test-Path $codexJs) { "set RB_CODEX_PATH=$codexJs" } else { '' }
@"
@echo off
cd /d "$root"
set PORT=$Port
$codexLine
"$node" server\src\index.ts >> "$logs\server.out.log" 2>> "$logs\server.err.log"
"@ | Set-Content -Encoding ascii $launcher

Remove-Item $pidFile -ErrorAction SilentlyContinue
$startup = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [uint16]0 }
$result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
  CommandLine               = "cmd.exe /c `"$launcher`""
  CurrentDirectory          = $root
  ProcessStartupInformation = $startup
}
if ($result.ReturnValue -ne 0) { Fail "Windows could not start the server (WMI code $($result.ReturnValue))." }

for ($i = 0; $i -lt 60; $i++) {
  if (Test-Up) {
    $serverPid = if (Test-Path $pidFile) { Get-Content $pidFile } else { '?' }
    Write-Host "Resume Builder started at $url (server pid $serverPid). It keeps running in the background."
    Write-Host "Logs: $logs"
    Open-App
    exit 0
  }
  Start-Sleep -Milliseconds 500
}

Write-Host "Server didn't answer within 30 seconds. Last errors:" -ForegroundColor Red
Get-Content (Join-Path $logs 'server.err.log') -Tail 20 -ErrorAction SilentlyContinue
exit 1
