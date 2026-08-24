# AJO HTTPS Deployment Readiness (v1.4)

This guide prepares the backend for production HTTPS. It does **not** provision
a certificate or claim a public domain is live.

## Recommended architecture

```
Clients (Android / Web)
        |  HTTPS
        v
Reverse proxy / load balancer  (TLS termination)
        |  HTTP to app (private network)
        v
AJO Node process (server.js)
        |
        v
JSON (dev)  or  Managed PostgreSQL (prod)
```

## Checklist

1. Obtain a TLS certificate (Let's Encrypt, cloud-managed cert, etc.).
2. Configure reverse proxy (Caddy, nginx, Cloudflare, cloud LB).
3. Set environment on the app host:
   ```
   SESSION_SECRET=<long-random-value>
   TRUST_PROXY=1
   AJO_HSTS=1
   CORS_ORIGIN=https://your-real-origin.example
   AJO_REPOSITORY=postgres   # when DB is ready
   DATABASE_URL=postgres://...?sslmode=require
   ```
4. Confirm `/api/health` is reachable only over HTTPS from the public internet.
5. Confirm rate limits see real client IPs (`TRUST_PROXY=1`).
6. Confirm sessions survive process restart (`SESSION_SECRET` is stable).

## What this tree already provides

- Security headers (nosniff, frame deny, referrer, permissions)
- Optional HSTS via `AJO_HSTS=1`
- `TRUST_PROXY` support
- Session tokens with HMAC + timing-safe compare
- Host authorization and vote authorization
- Rate limiting (join / vote / general)

## What is NOT claimed

- No public domain is configured in this repository
- No TLS certificate is bundled
- No cloud load balancer is connected
