$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "Starting MediBill..."
docker compose up -d --build
if ($LASTEXITCODE -ne 0) { throw "MediBill startup failed." }

docker compose ps
Write-Host "MediBill is available at http://localhost:5173"
