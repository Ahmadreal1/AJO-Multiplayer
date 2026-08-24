/**
 * AJO session tokens (v1.3)
 *
 * Server-issued HMAC-signed tokens bind a player to a room.
 * Tokens are not secrets stored in source — SESSION_SECRET comes from env.
 * Development falls back to an ephemeral secret (not for production).
 */

const crypto = require("crypto");

const TOKEN_TTL_MS = Math.max(
  60 * 60 * 1000,
  Number(process.env.AJO_SESSION_TTL_HOURS || 24) * 60 * 60 * 1000
);

function getSecret() {
  const fromEnv = process.env.SESSION_SECRET || process.env.AJO_SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  // Ephemeral dev secret — regenerated each process start.
  // Production MUST set SESSION_SECRET.
  if (!getSecret._dev) {
    getSecret._dev = crypto.randomBytes(32).toString("hex");
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "WARNING: SESSION_SECRET is not set. Sessions will not survive restarts."
      );
    }
  }
  return getSecret._dev;
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function fromB64url(str) {
  const pad = 4 - (str.length % 4 || 4);
  const s = str.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  return Buffer.from(s, "base64").toString("utf8");
}

/**
 * Issue a session token for a player in a room.
 * @returns {string} token
 */
function issueToken({ roomCode, playerId, role }) {
  const payload = {
    rc: String(roomCode).toUpperCase(),
    pid: playerId,
    role: role || "PLAYER",
    iat: Date.now(),
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = crypto
    .createHmac("sha256", getSecret())
    .update(body)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${body}.${sig}`;
}

/**
 * Verify and decode a session token.
 * @returns {{ roomCode, playerId, role, iat, exp } | null}
 */
function verifyToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = crypto
    .createHmac("sha256", getSecret())
    .update(body)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(fromB64url(body));
    if (!payload.rc || !payload.pid || !payload.exp) return null;
    if (Date.now() > payload.exp) return null;
    return {
      roomCode: payload.rc,
      playerId: payload.pid,
      role: payload.role || "PLAYER",
      iat: payload.iat,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

function isProductionSecretConfigured() {
  const s = process.env.SESSION_SECRET || process.env.AJO_SESSION_SECRET;
  return !!(s && s.length >= 16);
}

module.exports = {
  issueToken,
  verifyToken,
  isProductionSecretConfigured,
  TOKEN_TTL_MS,
};
