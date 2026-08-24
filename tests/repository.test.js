/**
 * AJO v1.0 repository-level tests
 * Runs against the JSON adapter (default development persistence).
 * Does not require a live PostgreSQL instance.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { JsonRepository } = require("../server/json-repository");
const { PostgresRepository } = require("../server/postgres-repository");
const { createRepository } = require("../server/repository");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ajo-repo-"));
const dataFile = path.join(tmpDir, "ajo-data.json");

function uid() {
  return require("crypto").randomUUID();
}

function makeRoom(overrides = {}) {
  const hostId = uid();
  const code = "AJO-TEST" + Math.random().toString(16).slice(2, 6).toUpperCase();
  const room = {
    id: uid(),
    code,
    creator: "Host",
    hostId,
    lastActivity: Date.now(),
    registrationOpen: true,
    nextRound: 1,
    nextNumber: 1,
    players: new Map(),
    round: null,
    ...overrides,
  };
  room.players.set(hostId, { id: hostId, name: "Host", status: "HOST" });
  return room;
}

function makeActiveRound(room, playerIds) {
  const objects = [
    { id: uid(), name: "Ball", image: "img1", number: 1 },
    { id: uid(), name: "Bell", image: "img2", number: 2 },
    { id: uid(), name: "Cup", image: "img3", number: 3 },
  ];
  room.round = {
    id: uid(),
    number: room.nextRound++,
    playerCount: playerIds.length,
    status: "ACTIVE",
    startedAt: new Date().toISOString(),
    objects,
    votes: new Map(),
  };
  for (const id of playerIds) {
    if (!room.players.has(id)) {
      room.players.set(id, { id, name: "P-" + id.slice(0, 4), status: "WAITING" });
    }
  }
  return objects;
}

async function run() {
  const repo = new JsonRepository({ dataFile });
  await repo.init();

  // ---- createRoom / getRoomByCode / saveRoom ----
  const room = makeRoom();
  await repo.createRoom(room);
  const loaded = await repo.getRoomByCode(room.code);
  assert.ok(loaded, "room should be loadable");
  assert.strictEqual(loaded.code, room.code);
  assert.strictEqual(loaded.creator, "Host");
  assert.strictEqual(loaded.players.size, 1);
  console.log("  createRoom / getRoomByCode: PASS");

  // player persistence
  const p2 = { id: uid(), name: "Player Two", status: "JOINED" };
  room.players.set(p2.id, p2);
  await repo.saveRoom(room);
  const loaded2 = await repo.getRoomByCode(room.code);
  assert.strictEqual(loaded2.players.size, 2);
  assert.ok(loaded2.players.has(p2.id));
  console.log("  player persistence: PASS");

  // ---- createRound / round persistence ----
  const objects = makeActiveRound(room, [room.hostId, p2.id]);
  await repo.createRound(room, room.round);
  const withRound = await repo.getRoomByCode(room.code);
  assert.ok(withRound.round);
  assert.strictEqual(withRound.round.status, "ACTIVE");
  assert.strictEqual(withRound.round.playerCount, 2);
  assert.strictEqual(withRound.round.objects.length, 3);
  console.log("  round persistence: PASS");

  // ---- successful vote ----
  const result = await repo.recordVote({
    roomCode: room.code,
    playerId: room.hostId,
    objectId: objects[0].id,
    shuffleFn: (a) => a, // deterministic for test
  });
  assert.strictEqual(result.number, 1);
  assert.strictEqual(result.objectName, "Ball");
  assert.strictEqual(result.completed, false);

  const afterVote = await repo.getRoomByCode(room.code);
  assert.strictEqual(afterVote.round.votes.size, 1);
  assert.ok(
    afterVote.round.objects.find((o) => o.id === objects[0].id).number !== null,
    "selected object must remain available"
  );
  assert.strictEqual(afterVote.round.objects.length, 3);
  assert.strictEqual(
    new Set(afterVote.round.objects.map((o) => o.number)).size,
    afterVote.round.objects.length,
    "all active object numbers must remain unique"
  );
  assert.strictEqual(afterVote.players.get(room.hostId).status, "VOTED");
  console.log("  successful vote + object remains available: PASS");

  // ---- duplicate vote rejection ----
  let dupThrown = false;
  try {
    await repo.recordVote({
      roomCode: room.code,
      playerId: room.hostId,
      objectId: objects[1].id,
    });
  } catch (e) {
    dupThrown = e.code === "ALREADY_VOTED";
  }
  assert.ok(dupThrown, "duplicate vote must be rejected");
  console.log("  duplicate vote rejection: PASS");

  // ---- same object can be selected again ----
  const result2 = await repo.recordVote({
    roomCode: room.code,
    playerId: p2.id,
    objectId: objects[0].id, // SAME object selected again
    shuffleFn: (a) => a,
  });
  assert.ok(Number.isFinite(result2.number), "second player receives the object's current number");
  assert.strictEqual(result2.objectName, "Ball");
  const afterSecondVote = await repo.getRoomByCode(room.code);
  assert.strictEqual(afterSecondVote.round.votes.size, 2);
  assert.ok(afterSecondVote.round.objects.find((o) => o.id === objects[0].id).number !== null);
  assert.strictEqual(
    new Set(afterSecondVote.round.objects.map((o) => o.number)).size,
    afterSecondVote.round.objects.length,
    "all numbers must still be assigned after reselecting the same object"
  );
  console.log("  same object can be selected again + reshuffle: PASS");

  // ---- legacy EMPTY behavior is no longer valid ----
  // There is intentionally no EMPTY object state in the new AJO rules.

  // ---- round completion ----
  // playerCount was 2; both voted → COMPLETED
  const final = await repo.getRoomByCode(room.code);
  assert.strictEqual(final.round.status, "COMPLETED");
  assert.strictEqual(result2.completed, true);
  console.log("  round completion: PASS");

  // completed round rejects further votes
  const p3 = { id: uid(), name: "Late", status: "JOINED" };
  room.players.set(p3.id, p3);
  let completedReject = false;
  try {
    await repo.recordVote({
      roomCode: room.code,
      playerId: p3.id,
      objectId: objects[2].id,
    });
  } catch (e) {
    completedReject = e.code === "ROUND_NOT_ACTIVE";
  }
  assert.ok(completedReject, "completed round must reject votes");
  console.log("  completed round rejection: PASS");

  // ---- expireRooms ----
  room.lastActivity = Date.now() - 999999999;
  await repo.saveRoom(room);
  const expired = await repo.expireRooms(Date.now(), 1000);
  assert.ok(expired.includes(room.code));
  assert.strictEqual(await repo.getRoomByCode(room.code), null);
  console.log("  expireRooms: PASS");

  // ---- factory defaults to JSON ----
  const factoryRepo = await createRepository({
    kind: "json",
    dataFile: path.join(tmpDir, "factory.json"),
  });
  assert.ok(factoryRepo instanceof JsonRepository);
  console.log("  factory default (json): PASS");

  // ---- Postgres adapter refuses missing DATABASE_URL ----
  // Temporarily remove the environment credential so this test actually
  // verifies the missing-credentials path without affecting the real
  // PostgreSQL configuration used by the application.
  const savedDatabaseUrl = process.env.DATABASE_URL;
  let pgRefused = false;

  try {
    delete process.env.DATABASE_URL;

    const pg = new PostgresRepository({ connectionString: null });
    await pg.init();
  } catch (e) {
    pgRefused = /DATABASE_URL|connectionString/i.test(e.message);
  } finally {
    if (savedDatabaseUrl !== undefined) {
      process.env.DATABASE_URL = savedDatabaseUrl;
    }
  }

  assert.ok(pgRefused, "Postgres adapter must refuse missing credentials");
  console.log("  postgres adapter refuses missing DATABASE_URL: PASS");

  // cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.log("AJO repository tests: PASS");
}

run().catch((e) => {
  console.error("AJO repository tests: FAIL", e);
  process.exit(1);
});
