# AJO Final Production Verification (baseline v1.4)

Do **not** start Android APK/AAB packaging until all three gates below are PASS.

This document does not claim any gate has passed. Each gate must be executed
on real infrastructure and recorded honestly.

---

## Gate 1 — Real managed PostgreSQL

### Prerequisites
- Managed PostgreSQL 14+ (Neon, Supabase, Railway, AWS RDS, Cloud SQL, etc.)
- Network access from the host that will run AJO
- `npm install pg` completed on that host

### Steps
```bash
export DATABASE_URL='postgres://USER:PASSWORD@HOST:5432/DB?sslmode=require'
export AJO_REPOSITORY=postgres
npm install pg
npm run db:migrate
npm run db:verify
```

### PASS criteria
- `db:migrate` prints schema applied successfully
- `db:verify` prints **AJO live PostgreSQL verification: PASS**

### FAIL / NOT CONNECTED
- Missing `DATABASE_URL`
- Connection refused / auth failure
- `db:verify` exits non-zero

### Record
| Field | Value |
|-------|-------|
| Date | |
| Provider / host | |
| `db:migrate` result | PASS / FAIL |
| `db:verify` result | PASS / FAIL / NOT CONNECTED |
| Operator | |

---

## Gate 2 — Real HTTPS deployment

### Prerequisites
- Public or LAN hostname with a valid TLS certificate
- Reverse proxy / load balancer terminating HTTPS
- Stable `SESSION_SECRET` (do not use the ephemeral dev secret)

### Steps
```bash
export SESSION_SECRET="$(openssl rand -hex 32)"   # store in secret manager
export TRUST_PROXY=1
export AJO_HSTS=1                                  # only if site is HTTPS-only
export CORS_ORIGIN='https://your-real-origin.example'
# plus Gate 1 env if using Postgres
npm start
```

Point the reverse proxy at the Node process. Confirm:

```bash
curl -fsS https://YOUR_HOST/api/health
```

### PASS criteria
- Health JSON returns `"ok": true` and `"version":"1.4.0"` over **HTTPS**
- `sessions` reports `"configured"` when `SESSION_SECRET` is set
- Browser padlock / valid certificate (no cert warnings on test devices)
- Rate limiting sees real client IPs (proxy forwards `X-Forwarded-For`)

### FAIL / NOT PROVISIONED
- HTTP-only access from the public internet
- Missing or self-signed cert rejected by devices
- Ephemeral session secret (sessions lost on restart)

### Record
| Field | Value |
|-------|-------|
| Date | |
| Hostname | |
| TLS provider | |
| `/api/health` over HTTPS | PASS / FAIL |
| `SESSION_SECRET` stable | YES / NO |
| `TRUST_PROXY=1` | YES / NO |
| Operator | |

See also: `docs/HTTPS-DEPLOYMENT.md`

---

## Gate 3 — Manual multi-device testing

### Prerequisites
- Gates 1–2 recommended (at minimum a reachable server on LAN/HTTPS)
- At least 3 real devices or browsers (phones + desktop is ideal)

### Execute
Follow **every** row in `docs/MULTIDEVICE-TEST-PLAN.md` (scenarios A–U).

Minimum required outcomes:
- Host create + several joins
- Close registration → start voting
- Change selection + confirm vote
- Full-number reshuffling + unique active numbers
- Round does **not** complete early
- Completes only after last registered player votes
- Duplicate / post-completion votes rejected
- Next round with a **different** player count
- Disconnect + reconnect restores session/status
- Host-only actions rejected for non-host devices

### PASS criteria
- All A–U scenarios observed PASS on real devices
- No data corruption; server remains authoritative

### NOT PERFORMED
- If only the automated `npm run test:multidevice` was run (that is necessary but not sufficient)

### Record
| Field | Value |
|-------|-------|
| Date | |
| Server URL | |
| Devices used | |
| Scenarios A–U | all PASS / list failures |
| Operator | |

---

## After all three gates PASS

1. Freeze backend feature development on this baseline (v1.4).
2. Proceed to Android APK/AAB packaging using `docs/ANDROID-BUILD-PLAN.md`.
3. Do not claim production readiness without the three records above.

## Current status in the repository environment

| Gate | Status |
|------|--------|
| 1 Managed PostgreSQL | **NOT CONNECTED** (`DATABASE_URL` unset here) |
| 2 HTTPS deployment | **NOT PROVISIONED** (no domain/cert in this tree) |
| 3 Physical multi-device | **NOT PERFORMED HERE** (automated sim only) |

Automated local suite (`npm run test:all`, `npm run audit:security`) must remain green before and after operational changes.
