# MediBill Pro Sites application

This directory contains the complete TypeScript application currently deployed as MediBill Pro Sites Version 34.

## Safety and repository layout

The existing Python/FastAPI project remains at the repository root. This application is isolated under `sites-app/` so both implementations can be reviewed before any consolidation.

Uploaded invoices, medicine photographs, generated deployment archives, runtime secrets and build output are intentionally excluded.

## Validation

The synchronized source passed `npm run build` before publication. Database changes include migration `drizzle/0016_exotic_sugar_man.sql` for Schedule H1, Rx, high-caution and prescription/RMP fields.
