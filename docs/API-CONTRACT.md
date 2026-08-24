# AJO Production API Contract

## Room lifecycle
- `POST /api/rooms` → create a room and return a join code.
- `GET /api/rooms/:code` → public room state.
- `POST /api/rooms/:code/join` → join using name + join code.
- `POST /api/rooms/:code/close-registration` → host only.
- `POST /api/rooms/:code/start` → host only.
- `POST /api/rooms/:code/next-round` → host only after completion.

## Voting
- `POST /api/rounds/:roundId/votes` → authenticated player confirms one object.
- Server validates:
  1. round is ACTIVE;
  2. player belongs to the room;
  3. player has not voted already;
  4. object exists;
  5. object still has a number.
- The server assigns the number and atomically removes it from the active pool.
- If votes == registered player count, round becomes COMPLETED.

## Recovery
A reconnecting player presents its authenticated session. The server returns the current room,
round, player status and public results without exposing hidden numbers that are no longer available.

## Security
All write operations require an authenticated session and server-side authorization.
Join-code lookup is rate-limited. Production deployment must use HTTPS.
