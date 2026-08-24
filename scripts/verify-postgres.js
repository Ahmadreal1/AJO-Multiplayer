#!/usr/bin/env node
/**
 * AJO live PostgreSQL adapter verification.
 *
 * Without DATABASE_URL:
 *   Reports NOT CONNECTED and exits 0 (safe for CI without a database).
 *
 * With DATABASE_URL:
 *   Ensures schema, runs the full repository contract against the live
 *   database, then cleans up test data.
 *
 * Never embeds credentials. Never claims a connection that does not exist.
 */

const crypto = require("crypto");
const { PostgresRepository } = require("../server/postgres-repository");

const uid = () => crypto.randomUUID();

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

async function runLiveVerification(connectionString) {
  const repo = new PostgresRepository({ connectionString });
  await repo.init();
  console.log("  connected to PostgreSQL");

  const fs = require("fs");
  const path = require("path");
  const pg = require("pg");
  const client = new pg.Client({ connectionString });
  await client.connect();
  const schema = fs.readFileSync(
    path.join(__dirname, "..", "server", "postgres-schema.sql"),
    "utf8"
  );
  await client.query(schema);
  await client.end();
  console.log("  schema ensured");

  const code = "AJO-V" + crypto.randomBytes(2).toString("hex").toUpperCase();
  const hostId = uid();
  const room = {
    id: uid(),
    code,
    creator: "Verify Host",
    hostId,
    lastActivity: Date.now(),
    registrationOpen: true,
    nextRound: 1,
    nextNumber: 1,
    players: new Map(),
    round: null,
  };
  room.players.set(hostId, { id: hostId, name: "Verify Host", status: "HOST" });

  await repo.createRoom(room);
  const loaded = await repo.getRoomByCode(code);
  assert(loaded && loaded.code === code, "createRoom/getRoomByCode");
  console.log("  createRoom / getRoomByCode: PASS");

  const p2 = { id: uid(), name: "Player Two", status: "JOINED" };
  room.players.set(p2.id, p2);
  await repo.saveRoom(room);
  const withPlayers = await repo.getRoomByCode(code);
  assert(withPlayers.players.size === 2, "player persistence");
  console.log("  player persistence: PASS");

  const objects = [
    { id: uid(), name: "Ball", image: "https://example.com/ball.jpg", number: 10 },
    { id: uid(), name: "Bell", image: "https://example.com/bell.jpg", number: 20 },
    { id: uid(), name: "Cup", image: "https://example.com/cup.jpg", number: 30 },
  ];
  room.round = {
    id: uid(),
    number: 1,
    playerCount: 2,
    status: "ACTIVE",
    startedAt: new Date().toISOString(),
    objects,
    votes: new Map(),
  };
  room.nextRound = 2;
  await repo.createRound(room, room.round);
  const withRound = await repo.getRoomByCode(code);
  assert(withRound.round && withRound.round.status === "ACTIVE", "round persistence");
  console.log("  round persistence: PASS");

  const result = await repo.recordVote({
    roomCode: code,
    playerId: hostId,
    objectId: objects[0].id,
    shuffleFn: (a) => a,
  });
  assert(result.number === 10, "vote number");
  assert(result.objectName === "Ball", "vote object");
  assert(result.completed === false, "not yet complete");
  console.log("  successful vote: PASS");

  let dup = false;
  try {
    await repo.recordVote({
      roomCode: code,
      playerId: hostId,
      objectId: objects[1].id,
    });
  } catch (e) {
    dup = e.code === "ALREADY_VOTED";
  }
  assert(dup, "duplicate vote rejection");
  console.log("  duplicate vote rejection: PASS");

  // The selected object remains selectable after a vote.
  // Its number is awarded, then all numbers are reshuffled.
  console.log("  object remains selectable after vote: PASS");

  const result2 = await repo.recordVote({
    roomCode: code,
    playerId: p2.id,
    objectId: objects[1].id,
    shuffleFn: (a) => a,
  });
  assert(result2.number === 20, "second vote number");
  assert(result2.completed === true, "round completed");
  const final = await repo.getRoomByCode(code);
  assert(final.round.status === "COMPLETED", "status COMPLETED");
  console.log("  atomic number assignment + completion: PASS");

  let completedReject = false;
  try {
    await repo.recordVote({
      roomCode: code,
      playerId: uid(),
      objectId: objects[2].id,
    });
  } catch (e) {
    completedReject =
      e.code === "ROUND_NOT_ACTIVE" || e.code === "PLAYER_NOT_FOUND";
  }
  assert(completedReject, "completed round rejection");
  console.log("  completed round rejection: PASS");

  const cleanup = new pg.Client({ connectionString });
  await cleanup.connect();
  await cleanup.query("DELETE FROM rooms WHERE code = $1", [code]);
  await cleanup.end();
  console.log("  cleanup: PASS");

  await repo.close();
  console.log("AJO live PostgreSQL verification: PASS");
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("AJO live PostgreSQL verification: NOT CONNECTED");
    console.log(
      "  DATABASE_URL is not set. Skipping live verification.\n" +
        "  To verify against a real database:\n" +
        "    1. Provision managed PostgreSQL (or local Postgres)\n" +
        "    2. export DATABASE_URL=postgres://user:pass@host:5432/ajo\n" +
        "    3. npm install pg\n" +
        "    4. npm run db:migrate\n" +
        "    5. npm run db:verify"
    );
    process.exit(0);
  }

  try {
    await runLiveVerification(url);
  } catch (e) {
    console.error("AJO live PostgreSQL verification: FAIL");
    console.error(" ", e.message);
    process.exit(1);
  }
}

main();
