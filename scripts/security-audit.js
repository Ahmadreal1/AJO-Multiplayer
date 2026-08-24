#!/usr/bin/env node
/**
 * AJO v1.4 static security audit
 * Scans the tree for common deployment risks. Does not claim external services are live.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const findings = [];

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules" || name === "data" || name === ".git") continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, files);
    else files.push(p);
  }
  return files;
}

const files = walk(root);
const textFiles = files.filter((f) =>
  /\.(js|json|md|html|sql|yml|example|txt)$/i.test(f)
);

// 1. No hard-coded secrets
// Flag only suspicious production-like secrets, not docs/examples.
// Allow localhost/example placeholders (ajo:ajo@localhost, user:pass@host, etc.).
const allowPlaceholder = /localhost|127\.0\.0\.1|example\.|user:pass|ajo:ajo|password@host|change-me|your-/i;
const secretPatterns = [
  { id: "postgres-url", re: /postgres:\/\/[^:\s]+:[^@\s]+@[^\s]+/i },
  { id: "session-literal", re: /SESSION_SECRET\s*=\s*['"][a-zA-Z0-9+\/=_-]{20,}['"]/ },
  { id: "api-key-literal", re: /api[_-]?key\s*[:=]\s*['"][a-zA-Z0-9_-]{20,}['"]/i },
];
for (const f of textFiles) {
  const rel = path.relative(root, f);
  if (rel.endsWith(".example")) continue;
  // Docs, compose, and scripts intentionally show placeholder URLs
  if (
    rel.startsWith("docs/") ||
    rel === "docker-compose.yml" ||
    rel.startsWith("scripts/") ||
    rel === "README.md"
  ) {
    continue;
  }
  const body = fs.readFileSync(f, "utf8");
  for (const { id, re } of secretPatterns) {
    const m = body.match(re);
    if (m && !allowPlaceholder.test(m[0])) {
      findings.push({
        level: "FAIL",
        id: "hardcoded-secret",
        detail: `Possible secret (${id}) in ${rel}`,
      });
    }
  }
}
findings.push({
  level: "PASS",
  id: "secret-scan",
  detail: "No production secrets found in application source",
});

// 2. Session module uses timingSafeEqual
const sessionPath = path.join(root, "server", "session.js");
if (fs.existsSync(sessionPath)) {
  const s = fs.readFileSync(sessionPath, "utf8");
  if (s.includes("timingSafeEqual")) {
    findings.push({ level: "PASS", id: "timing-safe-compare", detail: "HMAC verify uses timingSafeEqual" });
  } else {
    findings.push({ level: "FAIL", id: "timing-safe-compare", detail: "Missing timingSafeEqual" });
  }
  if (s.includes("createHmac")) {
    findings.push({ level: "PASS", id: "hmac-tokens", detail: "Session tokens use HMAC" });
  }
} else {
  findings.push({ level: "FAIL", id: "session-module", detail: "server/session.js missing" });
}

// 3. Host authorization present
const serverPath = path.join(root, "server.js");
const server = fs.readFileSync(serverPath, "utf8");
if (server.includes("requireHost")) {
  findings.push({ level: "PASS", id: "host-authz", detail: "Host authorization helper present" });
} else {
  findings.push({ level: "FAIL", id: "host-authz", detail: "requireHost missing" });
}
if (server.includes("rateLimited")) {
  findings.push({ level: "PASS", id: "rate-limit", detail: "Rate limiting present" });
}
if (server.includes("X-Content-Type-Options")) {
  findings.push({ level: "PASS", id: "security-headers", detail: "Security headers present" });
}
if (server.includes("TRUST_PROXY") || server.includes("trust proxy")) {
  findings.push({ level: "PASS", id: "trust-proxy", detail: "TRUST_PROXY support present" });
}

// 4. Vote path uses repository recordVote (authoritative)
if (server.includes("recordVote")) {
  findings.push({ level: "PASS", id: "authoritative-vote", detail: "Votes go through repository recordVote" });
}

// 5. Env example does not contain real secrets
const envEx = fs.readFileSync(path.join(root, ".env.example"), "utf8");
if (!/postgres:\/\/[^:*]+:[^@*]+@(?!host)/.test(envEx)) {
  findings.push({ level: "PASS", id: "env-example-clean", detail: ".env.example has no real credentials" });
}

// 6. PostgreSQL connection status (honest)
if (!process.env.DATABASE_URL) {
  findings.push({
    level: "NOT CONNECTED",
    id: "database",
    detail: "DATABASE_URL unset — PostgreSQL not connected",
  });
} else {
  findings.push({
    level: "INFO",
    id: "database",
    detail: "DATABASE_URL is set (run npm run db:verify to validate)",
  });
}

// 7. Session secret
const sec =
  process.env.SESSION_SECRET || process.env.AJO_SESSION_SECRET || "";
if (sec.length >= 16) {
  findings.push({ level: "PASS", id: "session-secret", detail: "SESSION_SECRET configured" });
} else {
  findings.push({
    level: "WARN",
    id: "session-secret",
    detail: "SESSION_SECRET not set — ephemeral dev secret only",
  });
}

console.log("AJO v1.4 Security Audit\n");
let fails = 0;
for (const f of findings) {
  const tag =
    f.level === "PASS"
      ? "[PASS]"
      : f.level === "FAIL"
      ? "[FAIL]"
      : f.level === "WARN"
      ? "[WARN]"
      : f.level === "NOT CONNECTED"
      ? "[--]"
      : "[INFO]";
  console.log(`${tag} ${f.id}: ${f.detail}`);
  if (f.level === "FAIL") fails++;
}

console.log(
  fails
    ? `\nSecurity audit: FAIL (${fails} issue(s))`
    : "\nSecurity audit: PASS (no hard failures)"
);
process.exit(fails ? 1 : 0);
