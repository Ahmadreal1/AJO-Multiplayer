# AJO Repository Contract (v1.0)

The repository is the persistence boundary for production.

## Required operations

- `createRoom(room)`
- `getRoomByCode(code)`
- `saveRoom(room)`
- `createRound(room, round)`
- `recordVote({ roomCode, playerId, objectId, shuffleFn })`
- `getRoundVotes(roomCode)`
- `completeRound(roomCode)`
- `expireRooms(now, ttlMs)`
- `listRooms()`

## Critical rule

`recordVote()` must be atomic. It must verify that:

1. the round is ACTIVE;
2. the player has not already voted;
3. the selected object still owns a number;

before assigning that number, removing it from the active pool, reshuffling
reshuffling the complete number set across all objects, and updating round completion state.

## Adapters

| Adapter    | Selection                         | Status                                      |
|------------|-----------------------------------|---------------------------------------------|
| JSON       | `AJO_REPOSITORY=json` (default)   | Fully implemented – development persistence |
| PostgreSQL | `AJO_REPOSITORY=postgres`         | Fully implemented – requires `DATABASE_URL` |

Secrets (`DATABASE_URL`, passwords) must never be placed in source code.
The PostgreSQL adapter is **NOT CONNECTED** to a real managed instance unless
`DATABASE_URL` is supplied at runtime and the connection succeeds.
