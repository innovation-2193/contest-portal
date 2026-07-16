param(
  [ValidateSet("start", "stop", "restart", "status")]
  [string]$Action = "status"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Port = 3003

function Get-AppProcess {
  $connection = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($connection) { Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue }
}

function Show-Status {
  $process = Get-AppProcess
  if (!$process) { Write-Output "Web: stopped"; return }
  try {
    $health = Invoke-RestMethod "http://127.0.0.1:$Port/api/health" -TimeoutSec 5
    Write-Output "Web: ready (PID $($process.Id), MySQL $($health.database))"
    Write-Output "URL: http://127.0.0.1:$Port"
  } catch {
    Write-Output "Web: listening but health check failed (PID $($process.Id))"
  }
}

function Start-App {
  if (Get-AppProcess) { Show-Status; return }
  Push-Location $Root
  try {
    docker compose up -d mysql | Out-Host
    if (!(Test-Path ".next\standalone\server.js")) { npm.cmd run build | Out-Host }
    Start-Process -FilePath "npm.cmd" -ArgumentList "run", "start" -WorkingDirectory $Root -WindowStyle Hidden -RedirectStandardOutput "$Root\storage\server.out.log" -RedirectStandardError "$Root\storage\server.err.log"
    Start-Sleep -Seconds 2
    Show-Status
  } finally { Pop-Location }
}

function Stop-App {
  $process = Get-AppProcess
  if (!$process) { Write-Output "Web: already stopped"; return }
  Stop-Process -Id $process.Id -Force
  Write-Output "Web: stopped"
}

switch ($Action) {
  "start" { Start-App }
  "stop" { Stop-App }
  "restart" { Stop-App; Start-Sleep -Seconds 1; Start-App }
  "status" { Show-Status }
}
