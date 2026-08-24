-- AJO production database blueprint
CREATE TABLE rooms (
  id UUID PRIMARY KEY,
  code VARCHAR(12) UNIQUE NOT NULL,
  creator_name VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL,
  current_round INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP NOT NULL
);

CREATE TABLE players (
  id UUID PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  display_name VARCHAR(40) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'PLAYER',
  status VARCHAR(20) NOT NULL DEFAULT 'JOINED',
  joined_at TIMESTAMP NOT NULL,
  last_seen_at TIMESTAMP NOT NULL
);

CREATE TABLE rounds (
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

CREATE TABLE round_objects (
  id UUID PRIMARY KEY,
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  object_name VARCHAR(40) NOT NULL,
  image_url TEXT NOT NULL,
  active_number INTEGER,
  position INTEGER NOT NULL
);

CREATE TABLE votes (
  id UUID PRIMARY KEY,
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  object_id UUID NOT NULL REFERENCES round_objects(id) ON DELETE CASCADE,
  number_received INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL,
  UNIQUE(round_id, player_id)
);

CREATE INDEX idx_rooms_code ON rooms(code);
CREATE INDEX idx_players_room ON players(room_id);
CREATE INDEX idx_rounds_room ON rounds(room_id);
CREATE INDEX idx_votes_round ON votes(round_id);