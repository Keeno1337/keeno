-- Vibe Code Arena Database Schema
-- PostgreSQL 15+

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  discord_id    TEXT UNIQUE NOT NULL,
  username      TEXT NOT NULL,
  xp            INTEGER NOT NULL DEFAULT 0,
  rank          INTEGER NOT NULL DEFAULT 0,
  streak        INTEGER NOT NULL DEFAULT 0,
  last_submission_challenge_id INTEGER,
  submission_count  INTEGER NOT NULL DEFAULT 0,
  win_count         INTEGER NOT NULL DEFAULT 0,
  weekly_help_xp    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS challenges (
  id              SERIAL PRIMARY KEY,
  prompt          TEXT NOT NULL,
  constraints     TEXT,
  scoring_weights JSONB NOT NULL DEFAULT '{"demo":30,"quality":20,"creativity":25,"completeness":15,"speed":10}',
  opened_at       TIMESTAMPTZ NOT NULL,
  closed_at       TIMESTAMPTZ NOT NULL,
  discord_message_id  TEXT,
  discord_thread_id   TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS submissions (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_id    INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  url             TEXT NOT NULL,
  github_url      TEXT,
  description     TEXT NOT NULL,
  score_breakdown JSONB,
  total_score     INTEGER,
  xp_awarded      INTEGER,
  is_late         BOOLEAN NOT NULL DEFAULT FALSE,
  scoring_status  TEXT NOT NULL DEFAULT 'pending', -- pending | scoring | complete | failed
  discord_message_id  TEXT,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scored_at       TIMESTAMPTZ,
  UNIQUE(user_id, challenge_id, url)
);

-- Index for per-user per-challenge submission count
CREATE INDEX IF NOT EXISTS idx_submissions_user_challenge
  ON submissions(user_id, challenge_id);

-- Index for leaderboard queries
CREATE INDEX IF NOT EXISTS idx_users_xp ON users(xp DESC);

CREATE TABLE IF NOT EXISTS appeals (
  id              SERIAL PRIMARY KEY,
  submission_id   INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_id    INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  reason          TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open', -- open | resolved | rejected
  moderator_id    TEXT,
  resolution_note TEXT,
  discord_thread_id TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ,
  UNIQUE(user_id, challenge_id) -- one appeal per user per challenge
);

CREATE TABLE IF NOT EXISTS weekly_leaderboard_snapshots (
  id              SERIAL PRIMARY KEY,
  challenge_id    INTEGER REFERENCES challenges(id),
  snapshot        JSONB NOT NULL,
  week_start      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Track peer reactions bonus (one bonus awarded per challenge per user)
CREATE TABLE IF NOT EXISTS reaction_bonuses (
  id            SERIAL PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_id  INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  xp_awarded    INTEGER NOT NULL DEFAULT 25,
  awarded_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(challenge_id)
);
