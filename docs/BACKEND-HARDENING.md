# AJO Backend Hardening (updated for v1.0)

## Verified
- Server starts successfully with the repository layer.
- `/api/health` returns version 1.0.0 and the active repository name.
- Room creation returns a join code and host/player ID.
- Core voting-rule tests pass.
- Multi-player lifecycle simulation passes.
- Repository tests cover create/load, player/round persistence, successful vote,
  duplicate rejection, EMPTY rejection, atomic number assignment, and completion.

## Production database boundary
- JSON store remains the **default development** persistence implementation.
- The PostgreSQL adapter implements the full repository contract with a real
  SQL transaction and row locks for `recordVote`.
- Selection is controlled by `AJO_REPOSITORY` and `DATABASE_URL`.
- **No managed cloud database is connected** unless `DATABASE_URL` is supplied
  at runtime and the connection succeeds. Credentials are never stored in source.

## Security boundary
The server remains authoritative for player membership, round status,
duplicate-vote prevention, object availability and number assignment.
Client-side UI is never treated as proof of a valid vote.
