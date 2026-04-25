-- One-time migration: add columns needed for the chess.com API sync.
-- Run in the Neon SQL editor against your existing database.

ALTER TABLE games ADD COLUMN IF NOT EXISTS pgn          TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS chesscom_url TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS time_class   TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS rated        BOOLEAN;
ALTER TABLE games ADD COLUMN IF NOT EXISTS eco          TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS source       TEXT;

-- chesscom_url is unique when present; allows multiple NULLs (older paste rows)
CREATE UNIQUE INDEX IF NOT EXISTS games_chesscom_url_uidx
  ON games (chesscom_url) WHERE chesscom_url IS NOT NULL;

-- Tag existing rows as paste-sourced (informational)
UPDATE games SET source = 'paste' WHERE source IS NULL;
