-- AJO production database blueprint (v1.0)
-- Extended with columns required by the live domain model while preserving
-- the original core tables from v0.6/v0.7.

CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY,
  code VARCHAR(12) UNIQUE NOT NULL,
  creator_name VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL,
  current_round INTEGER NOT NULL DEFAULT 0,
  host_id UUID,
  next_number INTEGER NOT NULL DEFAULT 1,
  registration_open BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  display_name VARCHAR(40) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'PLAYER',
  status VARCHAR(20) NOT NULL DEFAULT 'JOINED',
  joined_at TIMESTAMP NOT NULL,
  last_seen_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS rounds (
  id UUID PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  player_count INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL,
  UNIQUE(room_id, round_number)
);

CREATE TABLE IF NOT EXISTS round_objects (
  id UUID PRIMARY KEY,
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  object_name VARCHAR(40) NOT NULL,
  image_url TEXT NOT NULL,
  active_number INTEGER,
  position INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS votes (
  id UUID PRIMARY KEY,
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  object_id UUID NOT NULL REFERENCES round_objects(id) ON DELETE CASCADE,
  number_received INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL,
  UNIQUE(round_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code);
CREATE INDEX IF NOT EXISTS idx_players_room ON players(room_id);
CREATE INDEX IF NOT EXISTS idx_rounds_room ON rounds(room_id);
CREATE INDEX IF NOT EXISTS idx_votes_round ON votes(round_id);

-- Production atomic vote transaction (reference)
-- BEGIN;
-- SELECT id FROM round_objects WHERE id = $1 AND active_number IS NOT NULL FOR UPDATE;
-- SELECT id FROM votes WHERE round_id = $2 AND player_id = $3 FOR UPDATE;
-- INSERT INTO votes ... ; UPDATE round_objects SET active_number = NULL ...;
-- UPDATE rounds SET status = CASE WHEN count = player_count THEN 'COMPLETED' ...;
-- COMMIT;
