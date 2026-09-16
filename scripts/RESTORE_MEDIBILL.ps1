param(
    [Parameter(Mandatory=$true)]
    [string]$BackupFile,
    [switch]$ConfirmRestore
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not (Test-Path $BackupFile)) { throw "Backup file not found: $BackupFile" }
if (-not $ConfirmRestore) {
    throw "Restore replaces the current MediBill database. Re-run with -ConfirmRestore after taking a current backup."
}

Write-Host "Creating a safety backup before restore..."
& (Join-Path $PSScriptRoot "BACKUP_MEDIBILL.ps1")
if ($LASTEXITCODE -ne 0) { throw "Safety backup failed; restore cancelled." }

docker compose up -d postgres
if ($LASTEXITCODE -ne 0) { throw "Could not start PostgreSQL." }

$TempFile = "/tmp/medibill_restore.dump"
docker cp "$BackupFile" "medibill_postgres:$TempFile"
if ($LASTEXITCODE -ne 0) { throw "Could not copy restore file into PostgreSQL container." }

Write-Host "Stopping application services during restore..."
docker compose stop backend frontend

docker compose exec -T postgres sh -c 'dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB" && pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists '"$TempFile"
if ($LASTEXITCODE -ne 0) { throw "Database restore failed. The pre-restore safety backup is available." }

docker compose exec -T postgres rm -f "$TempFile"
docker compose up -d
if ($LASTEXITCODE -ne 0) { throw "Restore completed but MediBill startup failed." }

Write-Host "Restore completed. Verify http://localhost:5173 before continuing normal work."
