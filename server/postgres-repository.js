/**
 * AJO PostgreSQL Repository (production adapter)
 *
 * Implements the repository contract against managed PostgreSQL.
 * recordVote uses a real SQL transaction with row locks so that:
 *  - a player cannot vote twice
 *  - every object remains selectable throughout the round
 *  - numbers are reshuffled across all objects after each vote
 *  - round completion is updated atomically
 *
 * This adapter is selected only when AJO_REPOSITORY=postgres and
 * DATABASE_URL is set. No credentials are hard-coded.
 *
 * NOT CONNECTED to a real cloud instance unless DATABASE_URL points
 * at one and the connection succeeds at runtime.
 */

const crypto = require("crypto");

const uid = () => crypto.randomUUID();

class PostgresRepository {
  constructor(options = {}) {
    this.connectionString =
      options.connectionString || process.env.DATABASE_URL || null;
    this.pool = null;
    this._pg = null;
  }

  async init() {
    if (!this.connectionString) {
      throw new Error(
        "PostgresRepository requires DATABASE_URL (or connectionString). " +
          "No production database is connected."
      );
    }
    try {
      this._pg = require("pg");
    } catch (e) {
      throw new Error(
        "The 'pg' package is required for the PostgreSQL adapter. " +
          "Install it with: npm install pg"
      );
    }
    const poolConfig = {
      connectionString: this.connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
    };
    // Allow sslmode=require style URLs; pg honors ssl in the connection string.
    this.pool = new this._pg.Pool(poolConfig);
    // Verify connectivity
    const client = await this.pool.connect();
    try {
      const r = await client.query("SELECT 1 AS ok");
      if (!r.rows[0] || r.rows[0].ok !== 1) {
        throw new Error("Unexpected response from PostgreSQL");
      }
    } finally {
      client.release();
    }
  }

  /**
   * Apply the canonical schema (idempotent CREATE IF NOT EXISTS).
   * Safe to call on every boot when AJO_AUTO_MIGRATE=1.
   */
  async ensureSchema() {
    const fs = require("fs");
    const path = require("path");
    const schemaPath = path.join(__dirname, "postgres-schema.sql");
    const sql = fs.readFileSync(schemaPath, "utf8");
    await this.pool.query(sql);
  }

  async close() {
    if (this.pool) await this.pool.end();
  }

  async createRoom(room) {
    const id = room.id || uid();
    const now = new Date();
    const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO rooms (id, code, creator_name, status, current_round,
          created_at, updated_at, expires_at, host_id, next_number, registration_open)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          id,
          room.code,
          room.creator,
          "OPEN",
          0,
          now,
          now,
          expires,
          room.hostId,
          room.nextNumber || 1,
          true,
        ]
      );
      for (const p of room.players.values()) {
        await client.query(
          `INSERT INTO players (id, room_id, display_name, role, status, joined_at, last_seen_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            p.id,
            id,
            p.name,
            p.id === room.hostId ? "HOST" : "PLAYER",
            p.status || "JOINED",
            now,
            now,
          ]
        );
      }
      await client.query("COMMIT");
      room.id = id;
      return room;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async getRoomByCode(code) {
    const key = String(code || "").toUpperCase();
    const client = await this.pool.connect();
    try {
      const { rows: roomRows } = await client.query(
        `SELECT * FROM rooms WHERE code = $1`,
        [key]
      );
      if (!roomRows.length) return null;
      const r = roomRows[0];
      const { rows: playerRows } = await client.query(
        `SELECT * FROM players WHERE room_id = $1`,
        [r.id]
      );
      const { rows: roundRows } = await client.query(
        `SELECT * FROM rounds WHERE room_id = $1 ORDER BY round_number DESC LIMIT 1`,
        [r.id]
      );

      const room = {
        id: r.id,
        code: r.code,
        creator: r.creator_name,
        hostId: r.host_id,
        lastActivity: new Date(r.updated_at).getTime(),
        registrationOpen: r.registration_open !== false,
        nextRound: (r.current_round || 0) + 1,
        nextNumber: r.next_number || 1,
        players: new Map(),
        round: null,
      };
      for (const p of playerRows) {
        room.players.set(p.id, {
          id: p.id,
          name: p.display_name,
          status: p.status,
        });
      }

      if (roundRows.length) {
        const rd = roundRows[0];
        const { rows: objRows } = await client.query(
          `SELECT * FROM round_objects WHERE round_id = $1 ORDER BY position`,
          [rd.id]
        );
        const { rows: voteRows } = await client.query(
          `SELECT v.*, p.display_name AS player_name, o.object_name
           FROM votes v
           JOIN players p ON p.id = v.player_id
           JOIN round_objects o ON o.id = v.object_id
           WHERE v.round_id = $1`,
          [rd.id]
        );
        room.round = {
          id: rd.id,
          number: rd.round_number,
          playerCount: rd.player_count,
          status: rd.status,
          startedAt: rd.started_at
            ? new Date(rd.started_at).toISOString()
            : null,
          objects: objRows.map((o) => ({
            id: o.id,
            name: o.object_name,
            image: o.image_url,
            number: o.active_number,
          })),
          votes: new Map(
            voteRows.map((v) => [
              v.player_id,
              {
                playerId: v.player_id,
                player: v.player_name,
                object: v.object_name,
                number: v.number_received,
                round: rd.round_number,
                time: new Date(v.created_at).toISOString(),
              },
            ])
          ),
        };
      }
      return room;
    } finally {
      client.release();
    }
  }

  async saveRoom(room) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE rooms SET
          creator_name = $2,
          host_id = $3,
          registration_open = $4,
          next_number = $5,
          current_round = $6,
          updated_at = NOW(),
          status = $7
         WHERE id = $1`,
        [
          room.id,
          room.creator,
          room.hostId,
          room.registrationOpen,
          room.nextNumber,
          room.round ? room.round.number : room.nextRound - 1,
          room.round
            ? room.round.status
            : room.registrationOpen
            ? "OPEN"
            : "CLOSED",
        ]
      );

      // Upsert players
      for (const p of room.players.values()) {
        await client.query(
          `INSERT INTO players (id, room_id, display_name, role, status, joined_at, last_seen_at)
           VALUES ($1,$2,$3,$4,$5,NOW(),NOW())
           ON CONFLICT (id) DO UPDATE SET
             display_name = EXCLUDED.display_name,
             status = EXCLUDED.status,
             last_seen_at = NOW()`,
          [
            p.id,
            room.id,
            p.name,
            p.id === room.hostId ? "HOST" : "PLAYER",
            p.status,
          ]
        );
      }

      if (room.round) {
        await this._upsertRound(client, room);
      }

      await client.query("COMMIT");
      return room;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async _upsertRound(client, room) {
    const rd = room.round;
    if (!rd.id) rd.id = uid();
    await client.query(
      `INSERT INTO rounds (id, room_id, round_number, player_count, status, started_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       ON CONFLICT (room_id, round_number) DO UPDATE SET
         status = EXCLUDED.status,
         player_count = EXCLUDED.player_count,
         started_at = EXCLUDED.started_at`,
      [
        rd.id,
        room.id,
        rd.number,
        rd.playerCount,
        rd.status,
        rd.startedAt ? new Date(rd.startedAt) : null,
      ]
    );

    for (let i = 0; i < rd.objects.length; i++) {
      const o = rd.objects[i];
      if (!o.id) o.id = uid();
      await client.query(
        `INSERT INTO round_objects (id, round_id, object_name, image_url, active_number, position)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE SET active_number = EXCLUDED.active_number`,
        [o.id, rd.id, o.name, o.image, o.number, i]
      );
    }
  }

  async createRound(room, round) {
    if (!round.id) round.id = uid();
    room.round = round;
    await this.saveRoom(room);
    return round;
  }

  /**
   * Atomic vote with row-level locking.
   * Follows the transaction blueprint in postgres-schema.sql.
   */
  async recordVote({ roomCode, playerId, objectId, shuffleFn }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // Lock room + current round
      const { rows: roomRows } = await client.query(
        `SELECT * FROM rooms WHERE code = $1 FOR UPDATE`,
        [String(roomCode).toUpperCase()]
      );
      if (!roomRows.length) {
        throw Object.assign(new Error("ROUND_NOT_FOUND"), {
          code: "ROUND_NOT_FOUND",
        });
      }
      const dbRoom = roomRows[0];

      const { rows: roundRows } = await client.query(
        `SELECT * FROM rounds WHERE room_id = $1 AND status = 'ACTIVE'
         ORDER BY round_number DESC LIMIT 1 FOR UPDATE`,
        [dbRoom.id]
      );
      if (!roundRows.length) {
        throw Object.assign(new Error("ROUND_NOT_ACTIVE"), {
          code: "ROUND_NOT_ACTIVE",
        });
      }
      const dbRound = roundRows[0];

      // Already voted?
      const { rows: existingVote } = await client.query(
        `SELECT id FROM votes WHERE round_id = $1 AND player_id = $2 FOR UPDATE`,
        [dbRound.id, playerId]
      );
      if (existingVote.length) {
        throw Object.assign(new Error("ALREADY_VOTED"), {
          code: "ALREADY_VOTED",
        });
      }

      // The object remains selectable forever during the round.
      // Its current number is awarded, then all object numbers are reshuffled.
      const { rows: objRows } = await client.query(
        `SELECT * FROM round_objects WHERE id = $1 AND round_id = $2 FOR UPDATE`,
        [objectId, dbRound.id]
      );
      if (!objRows.length || objRows[0].active_number === null) {
        throw Object.assign(new Error("OBJECT_NOT_FOUND"), { code: "OBJECT_NOT_FOUND" });
      }
      const dbObj = objRows[0];
      const wonNumber = dbObj.active_number;

      // Player must exist
      const { rows: playerRows } = await client.query(
        `SELECT * FROM players WHERE id = $1 AND room_id = $2 FOR UPDATE`,
        [playerId, dbRoom.id]
      );
      if (!playerRows.length) {
        throw Object.assign(new Error("PLAYER_NOT_FOUND"), {
          code: "PLAYER_NOT_FOUND",
        });
      }
      const dbPlayer = playerRows[0];

      // Keep every object alive. Reshuffle the complete number set across
      // every object so the same object can be selected again by another player.
      const { rows: allObjects } = await client.query(
        `SELECT id, active_number FROM round_objects
         WHERE round_id = $1
         ORDER BY position FOR UPDATE`,
        [dbRound.id]
      );
      const nums = (shuffleFn || defaultShuffle)(
        allObjects.map((r) => r.active_number)
      );
      for (let i = 0; i < allObjects.length; i++) {
        await client.query(
          `UPDATE round_objects SET active_number = $1 WHERE id = $2`,
          [nums[i], allObjects[i].id]
        );
      }

      // Insert vote
      const voteId = uid();
      const now = new Date();
      await client.query(
        `INSERT INTO votes (id, round_id, player_id, object_id, number_received, created_at)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [voteId, dbRound.id, playerId, objectId, wonNumber, now]
      );

      // Update player status
      await client.query(
        `UPDATE players SET status = 'VOTED', last_seen_at = NOW() WHERE id = $1`,
        [playerId]
      );

      // Complete round if all have voted
      const { rows: countRows } = await client.query(
        `SELECT COUNT(*)::int AS c FROM votes WHERE round_id = $1`,
        [dbRound.id]
      );
      const voteCount = countRows[0].c;
      let completed = false;
      if (voteCount >= dbRound.player_count) {
        await client.query(
          `UPDATE rounds SET status = 'COMPLETED', completed_at = NOW() WHERE id = $1`,
          [dbRound.id]
        );
        completed = true;
      }

      await client.query(
        `UPDATE rooms SET updated_at = NOW() WHERE id = $1`,
        [dbRoom.id]
      );

      await client.query("COMMIT");

      return {
        number: wonNumber,
        objectName: dbObj.object_name,
        completed,
        vote: {
          playerId,
          player: dbPlayer.display_name,
          object: dbObj.object_name,
          number: wonNumber,
          round: dbRound.round_number,
          time: now.toISOString(),
        },
      };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async getRoundVotes(roomCode) {
    const room = await this.getRoomByCode(roomCode);
    if (!room || !room.round) return [];
    return [...room.round.votes.values()];
  }

  async completeRound(roomCode) {
    const room = await this.getRoomByCode(roomCode);
    if (!room || !room.round) return null;
    await this.pool.query(
      `UPDATE rounds SET status = 'COMPLETED', completed_at = NOW() WHERE id = $1`,
      [room.round.id]
    );
    room.round.status = "COMPLETED";
    return room.round;
  }

  async expireRooms(now = Date.now(), ttlMs) {
    const cutoff = new Date(now - ttlMs);
    const { rows } = await this.pool.query(
      `DELETE FROM rooms WHERE updated_at < $1 RETURNING code`,
      [cutoff]
    );
    return rows.map((r) => r.code);
  }

  async listRooms() {
    const { rows } = await this.pool.query(`SELECT code FROM rooms`);
    const rooms = [];
    for (const r of rows) {
      const room = await this.getRoomByCode(r.code);
      if (room) rooms.push(room);
    }
    return rooms;
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

module.exports = { PostgresRepository };
