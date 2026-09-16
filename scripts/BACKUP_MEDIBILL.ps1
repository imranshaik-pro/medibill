param(
    [string]$BackupDir = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not $BackupDir) {
    $BackupDir = Join-Path $Root "backups"
}
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupFile = Join-Path $BackupDir "medibill_$Timestamp.dump"
$TempFile = "/tmp/medibill_$Timestamp.dump"

Write-Host "Checking PostgreSQL..."
docker compose up -d postgres
if ($LASTEXITCODE -ne 0) { throw "Could not start PostgreSQL." }

Write-Host "Creating database backup..."
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f '"$TempFile"
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed." }

docker cp "medibill_postgres:$TempFile" "$BackupFile"
if ($LASTEXITCODE -ne 0) { throw "Could not copy backup to the host." }

docker compose exec -T postgres rm -f "$TempFile"

if (-not (Test-Path $BackupFile) -or (Get-Item $BackupFile).Length -eq 0) {
    throw "Backup verification failed."
}

Write-Host "Backup created: $BackupFile"
