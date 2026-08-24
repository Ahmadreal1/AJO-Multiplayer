#!/usr/bin/env node
/**
 * AJO deployment readiness check (v1.2)
 *
 * Reports what is ready locally vs what still requires external infrastructure.
 * Never claims a live database connection that does not exist.
 */

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const checks = [];

function ok(name, detail) {
  checks.push({ name, status: "OK", detail });
}
function missing(name, detail) {
  checks.push({ name, status: "MISSING", detail });
}
function notConnected(name, detail) {
  checks.push({ name, status: "NOT CONNECTED", detail });
}

// Files
const required = [
  "server.js",
  "server/repository.js",
  "server/json-repository.js",
  "server/postgres-repository.js",
  "server/postgres-schema.sql",
  "scripts/migrate.js",
  "scripts/verify-postgres.js",
  "docker-compose.yml",
  "docs/POSTGRES-DEPLOYMENT.md",
  "server/session.js",
  "package.json",
  ".env.example",
];
for (const f of required) {
  if (fs.existsSync(path.join(root, f))) ok(f, "present");
  else missing(f, "required file missing");
}

// package scripts
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
for (const s of ["db:migrate", "db:verify", "test:all"]) {
  if (pkg.scripts && pkg.scripts[s]) ok(`script:${s}`, pkg.scripts[s]);
  else missing(`script:${s}`, "not defined in package.json");
}

// Env / live connection
const hasUrl = !!(process.env.DATABASE_URL && process.env.DATABASE_URL.trim());
const repoKind = (process.env.AJO_REPOSITORY || "json").toLowerCase();

if (!hasUrl) {
  notConnected(
    "DATABASE_URL",
    "Not set. PostgreSQL adapter cannot connect. Default remains JSON."
  );
} else {
  ok("DATABASE_URL", "set (value not printed)");
}

ok("AJO_REPOSITORY", `current = ${repoKind}`);

// Session secret
const hasSessionSecret = !!(
  (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) ||
  (process.env.AJO_SESSION_SECRET && process.env.AJO_SESSION_SECRET.length >= 16)
);
if (hasSessionSecret) ok("SESSION_SECRET", "configured");
else notConnected("SESSION_SECRET", "Not set. Ephemeral secret will be used (dev only).");


// Summary
console.log("AJO v1.3 Deployment Readiness\n");
let failures = 0;
for (const c of checks) {
  const mark =
    c.status === "OK" ? "[OK]" : c.status === "NOT CONNECTED" ? "[--]" : "[!!]";
  console.log(`${mark} ${c.name}: ${c.detail}`);
  if (c.status === "MISSING") failures++;
}

console.log("\n--- Summary ---");
if (!hasUrl) {
  console.log(
    "PostgreSQL: NOT CONNECTED\n" +
      "To connect a real database:\n" +
      "  1. Provision managed PostgreSQL (Neon / Supabase / RDS / Railway) or: docker compose up -d\n" +
      "  2. export DATABASE_URL=postgres://user:pass@host:5432/ajo\n" +
      "  3. export AJO_REPOSITORY=postgres\n" +
      "  4. npm install pg\n" +
      "  5. npm run db:migrate\n" +
      "  6. npm run db:verify\n" +
      "Only after step 6 prints PASS is a live PostgreSQL deployment verified."
  );
} else {
  console.log(
    "DATABASE_URL is set. Run: npm run db:migrate && npm run db:verify"
  );
}

console.log(
  "\nSafest production setup:\n" +
    "  - Managed PostgreSQL with SSL (sslmode=require)\n" +
    "  - Secrets only in environment / secret manager\n" +
    "  - HTTPS termination in front of the Node process\n" +
    "  - Server-issued session tokens (v1.3) + HTTPS terminator"
);

process.exit(failures > 0 ? 1 : 0);
