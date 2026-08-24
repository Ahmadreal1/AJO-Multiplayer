# AJO — Use Without Termux

AJO has two separate parts:

1. **Server** — runs once on a cloud host.
2. **Players** — open the AJO web address in a normal browser. They do **not** need Termux, Node.js, Docker, or any developer tools.

The local Termux server is only for development/testing.

## Recommended deployment path

The repository now includes `render.yaml`, which defines an AJO web service plus PostgreSQL. Render can build the included Dockerfile, provision PostgreSQL, connect `DATABASE_URL`, generate a stable `SESSION_SECRET`, run the database migration before deployment, and expose AJO at a public HTTPS URL.

Render Blueprints are documented here:
https://render.com/docs/blueprint-spec

### Deployment flow

1. Put this repository in a GitHub/GitLab/Bitbucket repository.
2. In Render, create a new Blueprint from that repository.
3. Select the repository containing `render.yaml`.
4. Deploy the Blueprint.
5. Wait for the web service and PostgreSQL database to finish provisioning.
6. Open the generated HTTPS AJO address.
7. Test `/api/health` and confirm `ok: true`, `version: "1.4.0"`, `repository: "postgres"`, and `sessions: "configured"`.

After deployment, ordinary AJO users only need the HTTPS address.

## Local Termux control

If the server is being tested locally, do not repeatedly start and stop it manually. Use:

```bash
npm run start:bg
npm run health
npm run stop
```

`start:bg` keeps Node running in the background, so leaving the Termux prompt does not immediately stop AJO. `health` confirms whether port 3000 is reachable.

## Important

`127.0.0.1:3000` is the local machine only. It is not a public AJO address. For people on other phones, AJO must be hosted on a reachable LAN server or, preferably, a public HTTPS deployment.
