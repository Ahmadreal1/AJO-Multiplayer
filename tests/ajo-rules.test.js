const assert = require("assert");

function choose(state, playerId, objectId) {
  if (state.status !== "ACTIVE") throw Error("ROUND_NOT_ACTIVE");
  if (state.votes[playerId]) throw Error("ALREADY_VOTED");

  const obj = state.objects.find(o => o.id === objectId);
  if (!obj || obj.number === null) throw Error("OBJECT_NOT_FOUND");

  const number = obj.number;
  const nums = state.objects.map(o => o.number).reverse();
  state.objects.forEach((o, i) => o.number = nums[i]);

  state.votes[playerId] = {playerId, objectId, number};

  if (Object.keys(state.votes).length === state.playerCount) {
    state.status = "COMPLETED";
  }
  return number;
}

const state = {
  status: "ACTIVE",
  playerCount: 3,
  objects: [
    {id:"a", number:1},
    {id:"b", number:2},
    {id:"c", number:3}
  ],
  votes: {}
};

assert.strictEqual(choose(state, "p1", "a"), 1);
assert.notStrictEqual(state.objects.find(o => o.id === "a").number, null);
assert.throws(() => choose(state, "p1", "b"), /ALREADY_VOTED/);
assert.strictEqual(choose(state, "p2", "b"), 2);
assert.strictEqual(choose(state, "p3", "c"), 3);
assert.strictEqual(state.status, "COMPLETED");
assert.throws(() => choose(state, "p4", "a"), /ROUND_NOT_ACTIVE/);

console.log("AJO rules tests: PASS");