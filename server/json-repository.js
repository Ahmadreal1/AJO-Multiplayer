/**
 * AJO JSON Repository (development adapter)
 *
 * Implements the repository contract against a local JSON file.
 * recordVote is atomic within a single Node process (synchronous
 * validation + mutation + durable write before returning).
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const uid = () => crypto.randomUUID();

class JsonRepository {
  constructor(options = {}) {
    this.dataFile =
      options.dataFile ||
      path.join(process.cwd(), "data", "ajo-data.json");
    this.rooms = new Map();
    this._loaded = false;
  }

  async init() {
    this._load();
    this._loaded = true;
  }

  _ensureDir() {
    fs.mkdirSync(path.dirname(this.dataFile), { recursive: true });
  }

  _load() {
    this.rooms = new Map();
    if (!fs.existsSync(this.dataFile)) return;
    try {
      const raw = JSON.parse(fs.readFileSync(this.dataFile, "utf8"));
      for (const x of raw.rooms || []) {
        const room = this._deserializeRoom(x);
        this.rooms.set(room.code, room);
      }
    } catch (e) {
      console.error("JSON repository load failed:", e.message);
    }
  }

  _deserializeRoom(x) {
    const room = {
      id: x.id || uid(),
      code: x.code,
      creator: x.creator,
      hostId: x.hostId,
      lastActivity: x.lastActivity || Date.now(),
      registrationOpen: x.registrationOpen !== false,
      targetPlayerCount: x.targetPlayerCount || x.round?.playerCount || x.players?.length || 1,
      nextRound: x.nextRound || 1,
      nextNumber: x.nextNumber || 1,
      players: new Map(),
      round: null,
    };
    for (const p of x.players || []) {
      room.players.set(p.id, {
        ...p,
        status: p.status === "VOTED" ? "VOTED" : p.status || "OFFLINE",
      });
    }
    if (x.round) {
      room.round = {
        id: x.round.id || uid(),
        number: x.round.number,
        playerCount: x.round.playerCount,
        status: x.round.status,
        startedAt: x.round.startedAt || null,
        objects: (x.round.objects || []).map((o) => ({ ...o })),
        votes: new Map(
          (x.round.votes || []).map((v) => [v.playerId, { ...v }])
        ),
      };
    }
    return room;
  }

  _serializeRoom(r) {
    return {
      id: r.id,
      code: r.code,
      creator: r.creator,
      hostId: r.hostId,
      lastActivity: r.lastActivity || Date.now(),
      registrationOpen: r.registrationOpen,
      targetPlayerCount: r.targetPlayerCount || r.round?.playerCount || r.players.size || 1,
      nextRound: r.nextRound,
      nextNumber: r.nextNumber,
      players: [...r.players.values()],
      round: r.round
        ? {
            id: r.round.id,
            number: r.round.number,
            playerCount: r.round.playerCount,
            status: r.round.status,
            startedAt: r.round.startedAt,
            objects: r.round.objects,
            votes: [...r.round.votes.values()],
          }
        : null,
    };
  }

  _persist() {
    this._ensureDir();
    const data = {
      version: 1,
      rooms: [...this.rooms.values()].map((r) => this._serializeRoom(r)),
    };
    const tmp = this.dataFile + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, this.dataFile);
  }

  // ---- Contract operations ----

  async createRoom(room) {
    if (!room.id) room.id = uid();
    this.rooms.set(room.code, room);
    this._persist();
    return room;
  }

  async getRoomByCode(code) {
    const key = String(code || "").toUpperCase();
    return this.rooms.get(key) || null;
  }

  async saveRoom(room) {
    this.rooms.set(room.code, room);
    this._persist();
    return room;
  }

  async createRound(room, round) {
    if (!round.id) round.id = uid();
    room.round = round;
    this.rooms.set(room.code, room);
    this._persist();
    return round;
  }

  /**
   * Atomic vote recording.
   * Validates:
   *  - round is ACTIVE
   *  - player has not already voted
   *  - object exists and still has a number
   * Then assigns the number, clears the object, reshuffles remaining
   * numbers, records the vote, updates player status, and marks the
   * round COMPLETED when all registered players have voted.
   *
   * Returns { number, objectName, completed }
   */
  async recordVote({ roomCode, playerId, objectId, shuffleFn }) {
    const room = this.rooms.get(String(roomCode || "").toUpperCase());
    if (!room || !room.round) {
      const err = new Error("ROUND_NOT_FOUND");
      err.code = "ROUND_NOT_FOUND";
      throw err;
    }
    const round = room.round;
    if (round.status !== "ACTIVE") {
      const err = new Error("ROUND_NOT_ACTIVE");
      err.code = "ROUND_NOT_ACTIVE";
      throw err;
    }
    if (round.votes.has(playerId)) {
      const err = new Error("ALREADY_VOTED");
      err.code = "ALREADY_VOTED";
      throw err;
    }

    const object = round.objects.find((o) => o.id === objectId);
    if (!object || object.number === null) {
      const err = new Error("OBJECT_NOT_FOUND");
      err.code = "OBJECT_NOT_FOUND";
      throw err;
    }

    const player = room.players.get(playerId);
    if (!player) {
      const err = new Error("PLAYER_NOT_FOUND");
      err.code = "PLAYER_NOT_FOUND";
      throw err;
    }

    // --- critical section (synchronous, single-threaded) ---
    // The object NEVER becomes EMPTY. The same object can be selected again
    // by another player after this vote. The number currently attached to
    // the selected object is awarded, then ALL numbers are reshuffled across
    // ALL objects so every object remains selectable in the next choice.
    const wonNumber = object.number;
    const allObjects = round.objects;
    const numbers = (shuffleFn || defaultShuffle)(
      allObjects.map((o) => o.number)
    );
    allObjects.forEach((o, i) => {
      o.number = numbers[i];
    });

    const vote = {
      playerId,
      player: player.name,
      object: object.name,
      number: wonNumber,
      round: round.number,
      time: new Date().toISOString(),
    };
    round.votes.set(playerId, vote);
    player.status = "VOTED";

    let completed = false;
    if (round.votes.size === round.playerCount) {
      round.status = "COMPLETED";
      completed = true;
    }

    room.lastActivity = Date.now();
    this._persist();
    // --- end critical section ---

    return {
      number: wonNumber,
      objectName: object.name,
      completed,
      vote,
    };
  }

  async getRoundVotes(roomCode) {
    const room = await this.getRoomByCode(roomCode);
    if (!room || !room.round) return [];
    return [...room.round.votes.values()];
  }

  async completeRound(roomCode) {
    const room = await this.getRoomByCode(roomCode);
    if (!room || !room.round) return null;
    room.round.status = "COMPLETED";
    room.lastActivity = Date.now();
    this._persist();
    return room.round;
  }

  async expireRooms(now = Date.now(), ttlMs) {
    const expired = [];
    for (const [code, room] of this.rooms) {
      if (now - (room.lastActivity || 0) > ttlMs) {
        this.rooms.delete(code);
        expired.push(code);
      }
    }
    if (expired.length) this._persist();
    return expired;
  }

  /** Snapshot of all rooms (for bootstrapping the in-memory map). */
  async listRooms() {
    return [...this.rooms.values()];
  }
}

function defaultShuffle(a) {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

module.exports = { JsonRepository };
