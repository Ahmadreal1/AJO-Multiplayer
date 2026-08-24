# AJO PostgreSQL Deployment Guide (v1.2)

This document prepares the project for a real managed PostgreSQL instance.
It does **not** claim that any cloud database is already connected.

## Safest production setup

1. **Managed PostgreSQL** with automated backups (Neon, Supabase, Railway, AWS RDS, Cloud SQL, etc.)
2. **SSL required** on the connection string (`?sslmode=require` or provider equivalent)
3. **Secrets only in environment / secret manager** — never in git
4. **HTTPS terminator** in front of the Node process (`TRUST_PROXY=1` when applicable)
5. Run migrate + live verify **before** pointing real users at the service

## Local verification option

```bash
docker compose up -d
export DATABASE_URL=postgres://ajo:ajo@localhost:5432/ajo
export AJO_REPOSITORY=postgres
npm install pg
npm run db:migrate
npm run db:verify
```

## Production steps

1. Provision managed PostgreSQL.
2. `export DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DB?sslmode=require`
3. `export AJO_REPOSITORY=postgres`
4. `npm install pg`
5. `npm run db:migrate`
6. `npm run db:verify`  ← must print PASS
7. `npm start`
8. Confirm `/api/health` shows `"repository":"postgres"` and `"version":"1.2.0"`.

## Without DATABASE_URL

- `npm run db:verify` → **NOT CONNECTED** (exit 0)
- `npm run check:readiness` → reports NOT CONNECTED for DATABASE_URL
- Default repository remains JSON

## Status of this project tree

PostgreSQL adapter code: **implemented**  
Managed cloud instance: **NOT CONNECTED** (until DATABASE_URL is set and `db:verify` passes)
