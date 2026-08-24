const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");
const { createRepository } = require("./server/repository");
const {
  issueToken,
  verifyToken,
  isProductionSecretConfigured,
} = require("./server/session");

const APP_VERSION = "1.5.0";
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  // Slightly stricter defaults for multiplayer readiness
  cors: { origin: process.env.CORS_ORIGIN || true },
  maxHttpBufferSize: 1e5,
});

if (process.env.TRUST_PROXY === "1") {
  app.set("trust proxy", 1);
}

app.use(express.json({ limit: "32kb" }));

// Basic security headers (HTTPS deployment preparation)
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
  if (process.env.AJO_HSTS === "1") {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }
  next();
});

app.use(express.static("public"));


const ROOM_TTL_MS =
  Math.max(1, Number(process.env.AJO_ROOM_TTL_HOURS || 24)) * 60 * 60 * 1000;
const RATE_WINDOW_MS = Math.max(
  1000,
  Number(process.env.AJO_RATE_LIMIT_WINDOW_MS || 60000)
);
const RATE_MAX = Math.max(10, Number(process.env.AJO_RATE_LIMIT_MAX || 60));
const RATE_VOTE_MAX = Math.max(
  5,
  Number(process.env.AJO_RATE_LIMIT_VOTE_MAX || 20)
);
const RATE_JOIN_MAX = Math.max(
  5,
  Number(process.env.AJO_RATE_LIMIT_JOIN_MAX || 15)
);
const rateBuckets = new Map();

const rooms = new Map();
let repo = null;

function cleanText(value, max = 40) {
  return String(value ?? "")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, max);
}

function rateLimited(key, max = RATE_MAX) {
  const now = Date.now();
  const b = rateBuckets.get(key);
  if (!b || now - b.start > RATE_WINDOW_MS) {
    rateBuckets.set(key, { start: now, count: 1 });
    return false;
  }
  b.count++;
  return b.count > max;
}

function touchRoom(room) {
  room.lastActivity = Date.now();
}
function roomExpired(room) {
  return Date.now() - room.lastActivity > ROOM_TTL_MS;
}

const OBJECTS = [
  ["Ball", "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=800&q=80"],
  ["Bell", "https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?auto=format&fit=crop&w=800&q=80"],
  ["Monkey", "https://images.unsplash.com/photo-1540573133985-87b6da6d54a9?auto=format&fit=crop&w=800&q=80"],
  ["Hen", "https://images.unsplash.com/photo-1548550023-2bdb3c5beed7?auto=format&fit=crop&w=800&q=80"],
  ["Cup", "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=800&q=80"],
  ["Apple", "https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?auto=format&fit=crop&w=800&q=80"],
  ["Car", "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=800&q=80"],
  ["Watch", "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80"],
  ["Book", "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=800&q=80"],
  ["Camera", "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=800&q=80"],
  ["Bottle", "https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=800&q=80"],
  ["Chair", "https://images.unsplash.com/photo-1503602642458-232111445657?auto=format&fit=crop&w=800&q=80"],
  ["Bicycle", "https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=800&q=80"],
  ["Clock", "https://images.unsplash.com/photo-1501139083538-0139583c060f?auto=format&fit=crop&w=800&q=80"],
  ["Guitar", "https://images.unsplash.com/photo-1525201548942-d8732f6617a0?auto=format&fit=crop&w=800&q=80"],
  ["Flower", "https://images.unsplash.com/photo-1490750967868-88aa4486c946?auto=format&fit=crop&w=800&q=80"],
  ["Key", "https://images.unsplash.com/photo-1582139329536-e7284fece509?auto=format&fit=crop&w=800&q=80"],
  ["Laptop", "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=800&q=80"],
  ["Phone", "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=800&q=80"],
  ["Shoe", "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=80"],
];

const MAX_ROOM_PLAYERS = Math.max(
  1,
  Math.min(20, OBJECTS.length, Number(process.env.AJO_MAX_ROOM_PLAYERS || 20))
);

const uid = () => crypto.randomUUID();
const makeCode = () => "AJO-" + crypto.randomBytes(3).toString("hex").toUpperCase();

function shuffle(a) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function publicState(r) {
  const q = r.round;
  return {
    code: r.code,
    creator: r.creator,
    registrationOpen: r.registrationOpen,
    targetPlayerCount: r.targetPlayerCount,
    players: [...r.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
    })),
    round: q
      ? {
          number: q.number,
          playerCount: q.playerCount,
          status: q.status,
          objects: q.objects.map((o) => ({
            id: o.id,
            name: o.name,
            image: o.image,
          })),
          results: [...q.votes.values()],
          startedAt: q.startedAt,
        }
      : null,
  };
}

async function broadcast(r) {
  await repo.saveRoom(r);
  io.to(r.code).emit("state", publicState(r));
}

function roomNotice(room, type, message, extra = {}) {
  io.to(room.code).emit("roomNotice", {
    type,
    message: cleanText(message, 180),
    at: new Date().toISOString(),
    ...extra,
  });
}

function createRound(r, requestedCount = r.targetPlayerCount || r.players.size) {
  const count = Math.max(1, Math.min(MAX_ROOM_PLAYERS, Number(requestedCount) || 1));
  r.targetPlayerCount = count;
  const objectCount = count;
  const numbers = Array.from({ length: count }, (_, i) => r.nextNumber + i);
  r.nextNumber += count;
  const chosen = shuffle(OBJECTS).slice(0, objectCount);
  const assigned = shuffle(numbers);

  r.round = {
    id: uid(),
    number: r.nextRound++,
    playerCount: count,
    status: "READY",
    startedAt: null,
    objects: chosen.map((x, i) => ({
      id: uid(),
      name: x[0],
      image: x[1],
      number: assigned[i] ?? null,
    })),
    votes: new Map(),
  };
  for (const p of r.players.values()) {
    p.status = p.status === "HOST" ? "HOST" : "WAITING";
  }
}

function requireSession(socket) {
  const session = socket.data && socket.data.session;
  if (!session) return null;
  return session;
}

function requireHost(socket, room) {
  const session = requireSession(socket);
  if (!session || !room) return false;
  if (session.roomCode !== room.code) return false;
  if (session.playerId !== room.hostId) return false;
  if (session.role !== "HOST") return false;
  return true;
}

async function bootstrap() {
  repo = await createRepository();
  const loaded = await repo.listRooms();
  for (const r of loaded) {
    rooms.set(r.code, r);
  }
  console.log(
    `Repository ready (${process.env.AJO_REPOSITORY || "json"}). Loaded ${rooms.size} room(s).`
  );
  if (!isProductionSecretConfigured()) {
    console.log(
      "Session secret: ephemeral (set SESSION_SECRET for production)."
    );
  } else {
    console.log("Session secret: configured.");
  }
}

app.get("/api/health", (req, res) =>
  res.json({
    ok: true,
    rooms: rooms.size,
    app: "AJO",
    version: APP_VERSION,
    repository: process.env.AJO_REPOSITORY || "json",
    sessions: isProductionSecretConfigured() ? "configured" : "ephemeral",
  })
);

app.post("/api/rooms", async (req, res) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    if (rateLimited("http-create:" + ip, RATE_JOIN_MAX)) {
      return res.status(429).json({ error: "Too many requests." });
    }
    const hostId = uid();
    const code = makeCode();
    const creator = cleanText(req.body.name || "Ahmad Real") || "Ahmad Real";
    const room = {
      id: uid(),
      code,
      creator,
      hostId,
      lastActivity: Date.now(),
      registrationOpen: true,
      targetPlayerCount: 1,
      players: new Map(),
      round: null,
      nextRound: 1,
      nextNumber: 1,
    };
    room.players.set(hostId, {
      id: hostId,
      name: creator,
      status: "HOST",
    });
    rooms.set(code, room);
    await repo.createRoom(room);
    const token = issueToken({
      roomCode: code,
      playerId: hostId,
      role: "HOST",
    });
    res.json({ code, id: hostId, token });
  } catch (e) {
    console.error("createRoom error:", e.message);
    res.status(500).json({ error: "Could not create room" });
  }
});

io.on("connection", (socket) => {
  const ip = socket.handshake.address || "unknown";

  socket.on("join", async ({ code, name, playerId, token }) => {
    try {
      if (rateLimited("join:" + ip, RATE_JOIN_MAX))
        return socket.emit("errorMessage", "Too many requests. Please wait.");

      const roomCode = String(code || "").toUpperCase();
      const room = rooms.get(roomCode);
      if (!room) return socket.emit("errorMessage", "Room not found.");
      if (roomExpired(room)) {
        rooms.delete(room.code);
        return socket.emit("errorMessage", "This room has expired.");
      }
      touchRoom(room);

      // Prefer verified session token for reconnect/recovery
      let session = token ? verifyToken(token) : null;
      if (session && session.roomCode !== roomCode) session = null;

      let player = null;
      let role = "PLAYER";
      let isNewPlayer = false;

      if (session && room.players.has(session.playerId)) {
        // Authenticated reconnect
        player = room.players.get(session.playerId);
        role = session.playerId === room.hostId ? "HOST" : "PLAYER";
        player.status =
          player.id === room.hostId
            ? "HOST"
            : room.round?.votes.has(player.id)
            ? "VOTED"
            : "JOINED";
      } else if (playerId && room.players.has(playerId) && !token) {
        // Legacy recovery path (playerId only) — issue a fresh token
        player = room.players.get(playerId);
        role = player.id === room.hostId ? "HOST" : "PLAYER";
        player.status =
          player.id === room.hostId
            ? "HOST"
            : room.round?.votes.has(player.id)
            ? "VOTED"
            : "JOINED";
      } else {
        const target = room.targetPlayerCount || MAX_ROOM_PLAYERS;
        const canJoin = room.players.size < target &&
          ((!room.round && room.registrationOpen) || (room.round && room.round.status === "ACTIVE"));
        if (!canJoin)
          return socket.emit("errorMessage", room.players.size >= target
            ? "The confirmed player count has been reached."
            : "Joining is not available right now.");
        const id = uid();
        player = {
          id,
          name: cleanText(name) || "Player",
          status: "JOINED",
        };
        room.players.set(id, player);
        role = "PLAYER";
        isNewPlayer = true;
      }

      const newToken = issueToken({
        roomCode: room.code,
        playerId: player.id,
        role,
      });

      socket.data = {
        code: room.code,
        playerId: player.id,
        session: {
          roomCode: room.code,
          playerId: player.id,
          role,
        },
      };
      socket.join(room.code);
      socket.emit("joined", {
        id: player.id,
        host: room.hostId === player.id,
        token: newToken,
      });
      await broadcast(room);
      if (isNewPlayer) {
        roomNotice(room, "join", `${player.name} joined the room.`);
      }
    } catch (e) {
      console.error("join error:", e.message);
      socket.emit("errorMessage", "Join failed.");
    }
  });

  socket.on("setPlayerCount", async (value) => {
    const room = rooms.get(socket.data?.code);
    if (!requireHost(socket, room)) return;
    const count = Math.max(room.players.size, Math.min(MAX_ROOM_PLAYERS, Number(value) || 1));
    if (room.round && room.round.votes.size > 0)
      return socket.emit("errorMessage", "Player count cannot change after voting starts.");
    room.targetPlayerCount = count;
    room.registrationOpen = true;
    createRound(room, count);
    room.round.status = "ACTIVE";
    room.round.startedAt = room.round.startedAt || new Date().toISOString();
    touchRoom(room);
    await broadcast(room);
    roomNotice(room, "player-count", `Player target is now ${count}.`);
  });

  socket.on("closeRegistration", async () => {
    const room = rooms.get(socket.data?.code);
    if (!requireHost(socket, room)) return;
    if (!room.round) {
      createRound(room, room.targetPlayerCount || room.players.size || 1);
      room.round.status = "ACTIVE";
      room.round.startedAt = new Date().toISOString();
    }
    room.registrationOpen = true;
    touchRoom(room);
    await broadcast(room);
  });

  socket.on("startVoting", async () => {
    const room = rooms.get(socket.data?.code);
    if (!requireHost(socket, room) || !room.round) return;
    room.round.status = "ACTIVE";
    room.round.startedAt = room.round.startedAt || new Date().toISOString();
    room.registrationOpen = true;
    touchRoom(room);
    await broadcast(room);
  });

  socket.on("openRegistration", async () => {
    const room = rooms.get(socket.data?.code);
    if (!requireHost(socket, room)) return;
    if (room.round && room.round.status !== "COMPLETED")
      return socket.emit("errorMessage", "Finish the current round first.");
    room.registrationOpen = true;
    touchRoom(room);
    await broadcast(room);
  });

  socket.on("confirmVote", async (objectId) => {
    if (rateLimited("vote:" + ip, RATE_VOTE_MAX))
      return socket.emit("errorMessage", "Too many requests. Please wait.");

    const session = requireSession(socket);
    const room = rooms.get(socket.data?.code);
    if (!session || !room || !room.round) return;
    if (session.roomCode !== room.code) return;
    if (session.playerId !== socket.data.playerId) return;

    // Authorize: only the session player may vote as themselves
    const playerId = session.playerId;

    try {
      const result = await repo.recordVote({
        roomCode: room.code,
        playerId,
        objectId,
        shuffleFn: shuffle,
      });

      const fresh = await repo.getRoomByCode(room.code);
      if (fresh) rooms.set(room.code, fresh);

      const live = rooms.get(room.code);
      io.to(room.code).emit("state", publicState(live));
      const vote = result.vote || {};
      roomNotice(
        live,
        "vote",
        `${vote.player || "Player"} selected ${result.objectName} and received number ${result.number}.`,
        {
          player: vote.player || "Player",
          object: result.objectName,
          number: result.number,
          round: live.round?.number,
        }
      );
      roomNotice(
        live,
        "reshuffle",
        `${result.objectName} remains available. All numbers have been reshuffled.`,
        { object: result.objectName, round: live.round?.number }
      );
      if (result.completed) {
        roomNotice(live, "complete", `Round ${live.round?.number} is complete. All players have voted.`);
      }
      socket.emit("voteConfirmed", {
        object: result.objectName,
        number: result.number,
        round: live.round?.number,
      });
    } catch (e) {
      const msg =
        e.code === "ALREADY_VOTED"
          ? "Your vote has already been confirmed."
          : e.code === "OBJECT_NOT_FOUND"
          ? "That object is not available. Please choose another."
          : e.code === "ROUND_NOT_ACTIVE"
          ? "Voting is not active."
          : e.code === "PLAYER_NOT_FOUND"
          ? "Player session not found. Please rejoin."
          : "Vote could not be recorded.";
      socket.emit("errorMessage", msg);
    }
  });

  socket.on("nextRound", async () => {
    const room = rooms.get(socket.data?.code);
    if (!requireHost(socket, room) || !room.round) return;
    if (room.round.status !== "COMPLETED")
      return socket.emit("errorMessage", "The current round is not complete.");
    room.registrationOpen = true;
    room.round = null;
    for (const p of room.players.values())
      p.status = p.id === room.hostId ? "HOST" : "JOINED";
    createRound(room, room.targetPlayerCount || room.players.size || 1);
    room.round.status = "ACTIVE";
    room.round.startedAt = new Date().toISOString();
    await broadcast(room);
    roomNotice(room, "round", `Round ${room.round.number} has started. Numbers are NOT YET revealed.`);
  });

  socket.on("newRoundRegistration", async () => {
    const room = rooms.get(socket.data?.code);
    if (!requireHost(socket, room)) return;
    if (room.round && room.round.status !== "COMPLETED")
      return socket.emit("errorMessage", "The current round is not complete.");
    room.registrationOpen = true;
    room.round = null;
    for (const p of room.players.values())
      p.status = p.id === room.hostId ? "HOST" : "JOINED";
    createRound(room, room.targetPlayerCount || room.players.size || 1);
    room.round.status = "ACTIVE";
    room.round.startedAt = new Date().toISOString();
    await broadcast(room);
    roomNotice(room, "round", `Round ${room.round.number} has started. Numbers are NOT YET revealed.`);
  });

  socket.on("disconnect", async () => {
    const room = rooms.get(socket.data?.code);
    if (!room) return;
    const p = room.players.get(socket.data.playerId);
    if (p && p.id !== room.hostId) p.status = "OFFLINE";
    await repo.saveRoom(room);
    io.to(room.code).emit("state", publicState(room));
  });
});

setInterval(async () => {
  try {
    const expired = await repo.expireRooms(Date.now(), ROOM_TTL_MS);
    for (const code of expired) rooms.delete(code);
  } catch (e) {
    console.error("expireRooms error:", e.message);
  }
}, 10 * 60 * 1000);

// Periodic rate-bucket cleanup
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of rateBuckets) {
    if (now - b.start > RATE_WINDOW_MS * 2) rateBuckets.delete(k);
  }
}, 5 * 60 * 1000);

const PORT = Number(process.env.PORT || 3000);

async function shutdown(signal) {
  console.log(`Received ${signal}; shutting down AJO gracefully...`);
  try {
    await new Promise((resolve) => io.close(() => resolve()));
    await new Promise((resolve) => server.close(() => resolve()));
  } catch (e) {
    console.error("Shutdown error:", e.message);
  } finally {
    process.exit(0);
  }
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));

bootstrap()
  .then(() => {
    server.listen(PORT, "0.0.0.0", () =>
      console.log(`AJO v${APP_VERSION} running on port ${PORT}`)
    );
  })
  .catch((e) => {
    console.error("Failed to start AJO:", e.message);
    process.exit(1);
  });
