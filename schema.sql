-- Run this once against your Neon database (via the Neon SQL editor).
CREATE TABLE IF NOT EXISTS games (
  id              SERIAL PRIMARY KEY,
  played_at       TIMESTAMP NOT NULL,
  time_control    TEXT,
  variant         TEXT,
  duration_min    REAL,
  moves           INT,
  score           TEXT NOT NULL,          -- '1-0', '0-1', '1/2-1/2'
  user_name       TEXT NOT NULL,
  user_rating     INT  NOT NULL,
  user_change     REAL NOT NULL,
  user_color      TEXT,                    -- 'white' | 'black' | NULL for unknown
  opponent_name   TEXT NOT NULL,
  opponent_rating INT  NOT NULL,
  opponent_change REAL NOT NULL,
  result          TEXT NOT NULL,           -- 'win' | 'loss' | 'draw'
  winner_name     TEXT,                    -- NULL if draw
  white_player    TEXT,
  black_player    TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (played_at)
);

CREATE INDEX IF NOT EXISTS games_played_at_idx ON games (played_at DESC);
CREATE INDEX IF NOT EXISTS games_opponent_idx  ON games (opponent_name);
