# MediBill Local Production - Windows

Phase 18 makes the local Docker deployment recover automatically once Docker Desktop is running, applies Alembic migrations before the backend starts, adds service health checks, and provides guarded backup/restore scripts.

## Normal startup

From the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\START_MEDIBILL.ps1
```

Open `http://localhost:5173`.

The containers use `restart: unless-stopped`. After a Windows reboot or power failure they restart when the Docker engine starts. Enable **Start Docker Desktop when you sign in** in Docker Desktop settings. Windows sign-in may still be required depending on the Docker Desktop configuration.

## Startup sequence

1. PostgreSQL starts and must become healthy.
2. The one-shot `migrate` service runs `alembic upgrade head`.
3. Backend starts only after migrations succeed and must become healthy.
4. Frontend starts after backend health succeeds.

If a migration fails, the backend does not start. Inspect with:

```powershell
docker compose logs migrate
docker compose logs backend --tail=100
```

## Backup

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\BACKUP_MEDIBILL.ps1
```

Backups are stored in the repository `backups` directory by default as PostgreSQL custom-format dumps. Copy important backups to a second physical disk or cloud storage; a backup on the same computer does not protect against disk loss.

## Restore

Restore is intentionally guarded and creates a fresh safety backup first:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\RESTORE_MEDIBILL.ps1 -BackupFile .\backups\medibill_YYYYMMDD_HHMMSS.dump -ConfirmRestore
```

Do not use `docker compose down -v` or delete/prune the `postgres_data` volume during routine maintenance.

## Networking

PostgreSQL is internal to the Docker network and is no longer exposed on host port 5432. The backend remains available on port 8000 for Swagger/API diagnostics. The frontend is exposed on host port 5173 and proxies `/api` to the backend through nginx, avoiding a browser dependency on a hard-coded localhost API URL.

## Production note

This setup improves reliability for a single Windows workstation. It is not a substitute for the planned cloud deployment, off-machine backups, HTTPS, managed PostgreSQL, secret management, and production email delivery for password resets.
