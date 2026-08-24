const assert = require("assert");
const fs = require("fs");
const path = require("path");

const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));

assert(server.includes("/api/health"));
assert(server.includes("/api/rooms"));
assert(server.includes("confirmVote"));
assert(server.includes("1.5.0"));
assert(server.includes("requireHost"));
assert(server.includes("issueToken"));
assert(pkg.version === "1.5.0");
assert(pkg.scripts["test:multidevice"]);
assert(pkg.scripts["audit:security"]);
assert(fs.existsSync(path.join(__dirname, "multidevice-sim.test.js")));
assert(fs.existsSync(path.join(__dirname, "..", "scripts", "security-audit.js")));

console.log("AJO server contract test: PASS");
