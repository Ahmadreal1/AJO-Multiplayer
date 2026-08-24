# AJO Multiplayer v1.4

Production deployment and real-world validation milestone.

### Run the full suite
```bash
npm run test:all
npm run audit:security
npm run check:readiness
npm run db:verify
```

### Results meaning
| Command | PASS | NOT CONNECTED |
|---------|------|---------------|
| `test:all` | Local rules, repo, session, multi-device sim | — |
| `db:verify` | Live Postgres contract succeeded | `DATABASE_URL` missing or unreachable |
| `audit:security` | No hard security failures in source | DB/session secret may still be unset |
| Physical multi-device | Real phones/browsers against a live host | Not run in this repository environment |


### Run AJO without Termux (Docker)
AJO now includes a production-shaped container so the Node server can run as a service instead of being tied to an interactive Termux session.

```bash
docker compose up -d --build ajo
```

Then verify the service from the host with `http://127.0.0.1:3000/api/health`. For public use, place HTTPS in front of the container and supply a stable `SESSION_SECRET`; use managed PostgreSQL for persistent production data.

The `postgres` service is behind a Compose profile and is intended for local verification: `docker compose --profile postgres up -d postgres`. It does not by itself make AJO public.

### Added in v1.4
- Comprehensive multi-device simulation (`test:multidevice`)
- Static security audit (`audit:security`)
- HTTPS deployment guide
- Multi-device manual test plan
- Version 1.4.0

### Explicit status
- Live managed PostgreSQL: **NOT CONNECTED** (no `DATABASE_URL` in this environment)
- Public HTTPS domain / certificates: **NOT PROVISIONED**
- Physical multi-device test on real hardware: **NOT PERFORMED HERE** (automated sim PASS)
- Android packaging: **DEFERRED** until physical multi-device validation passes

### AJO rules
Unchanged. Dynamic player counts, one vote per player, EMPTY rejection,
number redistribution, completion only after all registered players vote.

### Final production verification (required before Android)
See **[docs/FINAL-VERIFICATION.md](docs/FINAL-VERIFICATION.md)** for the three gates:

1. Managed PostgreSQL — `db:migrate` + `db:verify` → PASS  
2. HTTPS deployment — stable `SESSION_SECRET`, `TRUST_PROXY=1`, health over HTTPS  
3. Manual multi-device testing — scenarios A–U on real phones/browsers  

In this repository environment those gates remain **NOT CONNECTED / NOT PROVISIONED / NOT PERFORMED HERE**.
Use `.env.production.example` as a template only (no real secrets).

