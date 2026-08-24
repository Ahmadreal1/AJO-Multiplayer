const assert = require("assert");
const {
  issueToken,
  verifyToken,
  isProductionSecretConfigured,
} = require("../server/session");

// Issue + verify
const token = issueToken({
  roomCode: "AJO-ABC123",
  playerId: "player-1",
  role: "HOST",
});
assert.ok(token && token.includes("."));
const session = verifyToken(token);
assert.ok(session);
assert.strictEqual(session.roomCode, "AJO-ABC123");
assert.strictEqual(session.playerId, "player-1");
assert.strictEqual(session.role, "HOST");
console.log("  issue + verify: PASS");

// Tamper rejection
const tampered = token.slice(0, -4) + "xxxx";
assert.strictEqual(verifyToken(tampered), null);
console.log("  tamper rejection: PASS");

// Garbage rejection
assert.strictEqual(verifyToken(null), null);
assert.strictEqual(verifyToken(""), null);
assert.strictEqual(verifyToken("not.a.real.token"), null);
console.log("  garbage rejection: PASS");

// Role preserved for player
const ptok = issueToken({
  roomCode: "AJO-XYZ",
  playerId: "p2",
  role: "PLAYER",
});
const ps = verifyToken(ptok);
assert.strictEqual(ps.role, "PLAYER");
console.log("  player role: PASS");

// Production secret flag reflects env
const before = isProductionSecretConfigured();
assert.strictEqual(typeof before, "boolean");
console.log("  production secret flag: PASS");

console.log("AJO session tests: PASS");
