const assert = require("assert");
const fs = require("fs");

const server = fs.readFileSync("server.js", "utf8");
const publicHtml = fs.readFileSync("public/index.html", "utf8");

const objectBlock = server.match(/const OBJECTS = \[(.*?)\];/s);
assert(objectBlock, "OBJECTS list must exist");
const objects = [...objectBlock[1].matchAll(/\["[^"]+",\s*"https?:\/\//g)];
assert.strictEqual(objects.length, 20, "AJO must define exactly 20 playable objects");

assert(
  /Math\.min\(20, OBJECTS\.length/.test(server),
  "Server maximum must be capped at 20"
);
assert(
  /Math\.min\(20,current\+delta\)/.test(publicHtml),
  "Frontend player selector must allow up to 20"
);

const state = {
  status: "ACTIVE",
  playerCount: 20,
  objects: Array.from({length: 20}, (_, i) => ({id: `o${i+1}`, number: i+1})),
  votes: new Map(),
};

for (let i = 1; i <= 20; i++) {
  const object = state.objects.find(o => o.number !== null);
  assert(object, "There must be an available numbered object");
  const won = object.number;
  object.number = null;
  const remaining = state.objects.filter(o => o.number !== null);
  remaining.forEach((o, idx) => { o.number = remaining.length - idx; });
  state.votes.set(`p${i}`, {number: won});
}

assert.strictEqual(state.votes.size, 20);
assert.strictEqual(state.objects.filter(o => o.number !== null).length, 0);

console.log("AJO 20-player / 20-object test: PASS");
