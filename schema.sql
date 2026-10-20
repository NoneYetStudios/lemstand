-- ============================================================================
-- Lemonade Stand - Canonical SQLite Database Schema
-- Domain: lemonadestand.stabthefinger.com
-- Note: stand_token columns store SHA-256 hex digests, never raw client tokens.
-- ============================================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- 1. Daily Leaderboard (Scores recorded on the current day / rolling window)
CREATE TABLE IF NOT EXISTS leaderboard_daily (
    id TEXT PRIMARY KEY,
    stand_name TEXT NOT NULL,
    score INTEGER NOT NULL,
    date TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('retro', '8-bit', 'modern')),
    version TEXT NOT NULL DEFAULT '1.0.0',
    game_mode TEXT NOT NULL DEFAULT 'standard',
    days_played INTEGER NOT NULL DEFAULT 12,
    stand_token TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_daily_score_date ON leaderboard_daily (score DESC, date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_date ON leaderboard_daily (date DESC);

-- 2. Weekly Leaderboard (Scores recorded in the current week / rolling window)
CREATE TABLE IF NOT EXISTS leaderboard_weekly (
    id TEXT PRIMARY KEY,
    stand_name TEXT NOT NULL,
    score INTEGER NOT NULL,
    date TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('retro', '8-bit', 'modern')),
    version TEXT NOT NULL DEFAULT '1.0.0',
    game_mode TEXT NOT NULL DEFAULT 'standard',
    days_played INTEGER NOT NULL DEFAULT 12,
    stand_token TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_weekly_score_date ON leaderboard_weekly (score DESC, date DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_date ON leaderboard_weekly (date DESC);

-- 3. All-Time Leaderboard (Best total profit across all runs)
CREATE TABLE IF NOT EXISTS leaderboard_all_time (
    id TEXT PRIMARY KEY,
    stand_name TEXT NOT NULL,
    score INTEGER NOT NULL,
    date TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('retro', '8-bit', 'modern')),
    version TEXT NOT NULL DEFAULT '1.0.0',
    game_mode TEXT NOT NULL DEFAULT 'standard',
    days_played INTEGER NOT NULL DEFAULT 12,
    stand_token TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_all_time_score ON leaderboard_all_time (score DESC, date DESC);
CREATE INDEX IF NOT EXISTS idx_all_time_date ON leaderboard_all_time (date DESC);

-- 4. Best Single-Day Profit Leaderboard (score = profit in cents on best day)
CREATE TABLE IF NOT EXISTS leaderboard_best_day (
    id TEXT PRIMARY KEY,
    stand_name TEXT NOT NULL,
    score INTEGER NOT NULL,
    date TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('retro', '8-bit', 'modern')),
    version TEXT NOT NULL DEFAULT '1.0.0',
    day_number INTEGER NOT NULL DEFAULT 1,
    weather TEXT DEFAULT 'sunny',
    stand_token TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_best_day_score ON leaderboard_best_day (score DESC, date DESC);
CREATE INDEX IF NOT EXISTS idx_best_day_date ON leaderboard_best_day (date DESC);

-- 5. Best 12-Day Run Leaderboard (score = net profit in cents over a standard 12-day run)
CREATE TABLE IF NOT EXISTS leaderboard_best_run (
    id TEXT PRIMARY KEY,
    stand_name TEXT NOT NULL,
    score INTEGER NOT NULL,
    date TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('retro', '8-bit', 'modern')),
    version TEXT NOT NULL DEFAULT '1.0.0',
    final_assets INTEGER NOT NULL DEFAULT 200,
    stand_token TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_best_run_score ON leaderboard_best_run (score DESC, date DESC);
CREATE INDEX IF NOT EXISTS idx_best_run_date ON leaderboard_best_run (date DESC);

-- 6. Most Glasses Sold in a Day Leaderboard (score = glasses sold in a single day)
CREATE TABLE IF NOT EXISTS leaderboard_glasses_day (
    id TEXT PRIMARY KEY,
    stand_name TEXT NOT NULL,
    score INTEGER NOT NULL,
    date TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('retro', '8-bit', 'modern')),
    version TEXT NOT NULL DEFAULT '1.0.0',
    day_number INTEGER NOT NULL DEFAULT 1,
    weather TEXT DEFAULT 'sunny',
    stand_token TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_glasses_day_score ON leaderboard_glasses_day (score DESC, date DESC);
CREATE INDEX IF NOT EXISTS idx_glasses_day_date ON leaderboard_glasses_day (date DESC);

-- 7. Most Glasses Sold in a Full Run Leaderboard (score = total glasses sold in run)
CREATE TABLE IF NOT EXISTS leaderboard_glasses_run (
    id TEXT PRIMARY KEY,
    stand_name TEXT NOT NULL,
    score INTEGER NOT NULL,
    date TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('retro', '8-bit', 'modern')),
    version TEXT NOT NULL DEFAULT '1.0.0',
    game_mode TEXT NOT NULL DEFAULT 'standard',
    days_played INTEGER NOT NULL DEFAULT 12,
    stand_token TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_glasses_run_score ON leaderboard_glasses_run (score DESC, date DESC);
CREATE INDEX IF NOT EXISTS idx_glasses_run_date ON leaderboard_glasses_run (date DESC);

-- 8. Active Saved Games (Keyed by sha256(stand_token))
CREATE TABLE IF NOT EXISTS game_saves (
    stand_token TEXT PRIMARY KEY,
    stand_name TEXT NOT NULL,
    game_state TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_game_saves_token ON game_saves (stand_token);
CREATE INDEX IF NOT EXISTS idx_game_saves_updated_at ON game_saves (updated_at DESC);

-- 9. Server-Issued Per-Run Seeds (Anti-cheat replay verification)
CREATE TABLE IF NOT EXISTS game_runs (
    run_id TEXT PRIMARY KEY,
    run_seed INTEGER NOT NULL,
    stand_name TEXT NOT NULL,
    game_mode TEXT NOT NULL DEFAULT 'standard',
    stand_token TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_game_runs_created_at ON game_runs (created_at DESC);
