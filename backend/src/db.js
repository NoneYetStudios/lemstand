/**
 * Lemonade Stand - SQLite Database Layer
 * Uses parameterized prepared statements via node:sqlite to prevent SQL injection.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { validateStandName } = require('./profanityFilter');

const DEFAULT_DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '../data/lemonadestand.db');
const SCHEMA_PATH = path.resolve(__dirname, '../../schema.sql');

let dbInstance = null;

const EMBEDDED_SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

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

CREATE TABLE IF NOT EXISTS game_saves (
    stand_token TEXT PRIMARY KEY,
    stand_name TEXT NOT NULL,
    game_state TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_game_saves_token ON game_saves (stand_token);
`;

/**
 * Migrate existing SQLite tables to include stand_token column if created previously.
 */
function ensureMigrations(db) {
  const tables = [
    'leaderboard_daily',
    'leaderboard_weekly',
    'leaderboard_all_time',
    'leaderboard_best_day',
    'leaderboard_best_run',
    'leaderboard_glasses_day',
    'leaderboard_glasses_run'
  ];
  for (const table of tables) {
    try {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all();
      const hasToken = cols.some((c) => c.name === 'stand_token');
      if (!hasToken) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN stand_token TEXT DEFAULT ''`);
      }
    } catch (_) {}
  }

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS game_saves (
          stand_token TEXT PRIMARY KEY,
          stand_name TEXT NOT NULL,
          game_state TEXT NOT NULL,
          updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_game_saves_token ON game_saves (stand_token);
    `);
  } catch (_) {}
}

/**
 * Initialize and return the singleton SQLite database instance.
 */
function getDb(customPath) {
  if (dbInstance && !customPath) {
    return dbInstance;
  }

  const targetPath = customPath || DEFAULT_DB_PATH;
  if (targetPath !== ':memory:') {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new DatabaseSync(targetPath);
  const schemaSql = fs.existsSync(SCHEMA_PATH)
    ? fs.readFileSync(SCHEMA_PATH, 'utf8')
    : EMBEDDED_SCHEMA;

  db.exec(schemaSql);
  ensureMigrations(db);

  if (!customPath) {
    dbInstance = db;
  }

  // Seed default family-friendly entries if all-time leaderboard is empty
  const countRow = db.prepare('SELECT COUNT(*) AS cnt FROM leaderboard_all_time').get();
  if (countRow && countRow.cnt === 0 && process.env.SKIP_SEED !== 'true') {
    seedInitialData(db);
  }

  return db;
}

/**
 * Seed initial classic Apple ][e themed family-friendly leaderboard entries.
 */
function seedInitialData(db) {
  const now = new Date();
  const todayIso = now.toISOString();
  const twoDaysAgoIso = new Date(now.getTime() - 2 * 86400 * 1000).toISOString();
  const fiveDaysAgoIso = new Date(now.getTime() - 5 * 86400 * 1000).toISOString();

  const starterRuns = [
    {
      stand_name: 'Apple_IIe',
      score: 3480,
      best_day_profit: 640,
      best_day_number: 9,
      best_day_weather: 'heatwave',
      total_glasses_sold: 485,
      best_day_glasses: 78,
      mode: 'retro',
      game_mode: 'standard',
      days_played: 12,
      date: todayIso,
      version: '1.0.0'
    },
    {
      stand_name: 'Pixel_Press',
      score: 2950,
      best_day_profit: 520,
      best_day_number: 7,
      best_day_weather: 'hot_dry',
      total_glasses_sold: 412,
      best_day_glasses: 65,
      mode: '8-bit',
      game_mode: 'standard',
      days_played: 12,
      date: todayIso,
      version: '1.0.0'
    },
    {
      stand_name: 'Citrus_Drop',
      score: 2640,
      best_day_profit: 475,
      best_day_number: 5,
      best_day_weather: 'sunny',
      total_glasses_sold: 376,
      best_day_glasses: 58,
      mode: 'modern',
      game_mode: 'standard',
      days_played: 12,
      date: todayIso,
      version: '1.0.0'
    },
    {
      stand_name: 'Woz_Lemons',
      score: 2210,
      best_day_profit: 410,
      best_day_number: 11,
      best_day_weather: 'hot_dry',
      total_glasses_sold: 330,
      best_day_glasses: 52,
      mode: 'retro',
      game_mode: 'standard',
      days_played: 12,
      date: twoDaysAgoIso,
      version: '1.0.0'
    },
    {
      stand_name: 'Sunny_Cups',
      score: 1890,
      best_day_profit: 360,
      best_day_number: 4,
      best_day_weather: 'sunny',
      total_glasses_sold: 295,
      best_day_glasses: 46,
      mode: 'modern',
      game_mode: 'standard',
      days_played: 12,
      date: fiveDaysAgoIso,
      version: '1.0.0'
    },
    {
      stand_name: 'Bit_Breeze',
      score: 1540,
      best_day_profit: 310,
      best_day_number: 6,
      best_day_weather: 'sunny',
      total_glasses_sold: 248,
      best_day_glasses: 42,
      mode: '8-bit',
      game_mode: 'standard',
      days_played: 12,
      date: fiveDaysAgoIso,
      version: '1.0.0'
    }
  ];

  for (const run of starterRuns) {
    insertScoreRecord(db, run, run.date);
  }
}

/**
 * Insert a validated score record across the leaderboard tables in a transaction.
 */
function insertScoreRecord(db, data, customDateIso) {
  // Double-check profanity filter at DB boundary
  const check = validateStandName(data.stand_name);
  if (!check.valid) {
    throw new Error(`Rejected Stand Name at DB layer: ${check.reason}`);
  }

  const timestamp = customDateIso || new Date().toISOString();
  const standToken = typeof data.stand_token === 'string' ? data.stand_token : '';
  const ids = {
    daily: crypto.randomUUID(),
    weekly: crypto.randomUUID(),
    all_time: crypto.randomUUID(),
    best_day: crypto.randomUUID(),
    best_run: crypto.randomUUID(),
    glasses_day: crypto.randomUUID(),
    glasses_run: crypto.randomUUID()
  };

  db.exec('BEGIN IMMEDIATE TRANSACTION');
  try {
    // 1. Daily
    db.prepare(`
      INSERT INTO leaderboard_daily (id, stand_name, score, date, mode, version, game_mode, days_played, stand_token)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(ids.daily, check.sanitized, data.score, timestamp, data.mode, data.version, data.game_mode, data.days_played, standToken);

    // 2. Weekly
    db.prepare(`
      INSERT INTO leaderboard_weekly (id, stand_name, score, date, mode, version, game_mode, days_played, stand_token)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(ids.weekly, check.sanitized, data.score, timestamp, data.mode, data.version, data.game_mode, data.days_played, standToken);

    // 3. All-time
    db.prepare(`
      INSERT INTO leaderboard_all_time (id, stand_name, score, date, mode, version, game_mode, days_played, stand_token)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(ids.all_time, check.sanitized, data.score, timestamp, data.mode, data.version, data.game_mode, data.days_played, standToken);

    // 4. Best single-day profit
    if (data.best_day_profit !== undefined && data.best_day_profit > 0) {
      db.prepare(`
        INSERT INTO leaderboard_best_day (id, stand_name, score, date, mode, version, day_number, weather, stand_token)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        ids.best_day,
        check.sanitized,
        data.best_day_profit,
        timestamp,
        data.mode,
        data.version,
        data.best_day_number || 1,
        data.best_day_weather || 'sunny',
        standToken
      );
    }

    // 5. Best 12-day run (Standard 12-day runs)
    if (data.game_mode === 'standard' && data.days_played === 12) {
      db.prepare(`
        INSERT INTO leaderboard_best_run (id, stand_name, score, date, mode, version, final_assets, stand_token)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        ids.best_run,
        check.sanitized,
        data.score,
        timestamp,
        data.mode,
        data.version,
        data.final_assets || (200 + data.score),
        standToken
      );
    }

    // 6. Most glasses sold in a day
    if (data.best_day_glasses !== undefined && data.best_day_glasses > 0) {
      db.prepare(`
        INSERT INTO leaderboard_glasses_day (id, stand_name, score, date, mode, version, day_number, weather, stand_token)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        ids.glasses_day,
        check.sanitized,
        data.best_day_glasses,
        timestamp,
        data.mode,
        data.version,
        data.best_glasses_day_number || 1,
        data.best_glasses_weather || 'sunny',
        standToken
      );
    }

    // 7. Most glasses sold in a full run
    if (data.total_glasses_sold !== undefined && data.total_glasses_sold > 0) {
      db.prepare(`
        INSERT INTO leaderboard_glasses_run (id, stand_name, score, date, mode, version, game_mode, days_played, stand_token)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        ids.glasses_run,
        check.sanitized,
        data.total_glasses_sold,
        timestamp,
        data.mode,
        data.version,
        data.game_mode,
        data.days_played,
        standToken
      );
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return {
    id: ids.all_time,
    ids,
    stand_name: check.sanitized,
    score: data.score,
    date: timestamp,
    mode: data.mode,
    version: data.version,
    stand_token: standToken
  };
}

const TABLE_MAP = {
  'daily': 'leaderboard_daily',
  'weekly': 'leaderboard_weekly',
  'all-time': 'leaderboard_all_time',
  'best-day': 'leaderboard_best_day',
  'best-run': 'leaderboard_best_run',
  'glasses-day': 'leaderboard_glasses_day',
  'glasses-run': 'leaderboard_glasses_run'
};

/**
 * Fetch entries from a specific leaderboard table with optional visual mode filter and limit.
 */
function fetchLeaderboard(db, category, options = {}) {
  const tableName = TABLE_MAP[category];
  if (!tableName) {
    throw new Error(`Unknown leaderboard category: ${category}`);
  }

  const limit = Math.min(100, Math.max(1, parseInt(options.limit, 10) || 25));
  const modeFilter = options.mode && ['retro', '8-bit', 'modern'].includes(options.mode)
    ? options.mode
    : null;

  const whereClauses = [];
  const params = [];

  if (category === 'daily') {
    // Rolling 24 hours
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    whereClauses.push('date >= ?');
    params.push(cutoff);
  } else if (category === 'weekly') {
    // Rolling 7 days
    const cutoff = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
    whereClauses.push('date >= ?');
    params.push(cutoff);
  }

  if (modeFilter) {
    whereClauses.push('mode = ?');
    params.push(modeFilter);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const sql = `
    SELECT id, stand_name, score, date, mode, version, stand_token
    FROM ${tableName}
    ${whereSql}
    ORDER BY score DESC, date DESC
    LIMIT ?
  `;
  params.push(limit);

  const rows = db.prepare(sql).all(...params);
  return rows.map((row, idx) => ({
    rank: idx + 1,
    id: row.id,
    stand_name: row.stand_name,
    score: row.score,
    date: row.date,
    mode: row.mode,
    version: row.version,
    stand_token: row.stand_token || ''
  }));
}

/**
 * Save active game state (with carry-forward daily settings) to SQLite.
 */
function saveGameState(db, standToken, state) {
  if (!standToken || typeof standToken !== 'string') {
    throw new Error('Invalid stand token');
  }
  const stateJson = typeof state === 'string' ? state : JSON.stringify(state);
  const standName = (state && state.standName) || 'Lemonade Stand';
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO game_saves (stand_token, stand_name, game_state, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(stand_token) DO UPDATE SET
      stand_name = excluded.stand_name,
      game_state = excluded.game_state,
      updated_at = excluded.updated_at
  `);
  stmt.run(standToken, standName, stateJson, now);
  return { ok: true, updated_at: now };
}

/**
 * Retrieve active saved game state for a stand token.
 */
function loadGameState(db, standToken) {
  if (!standToken || typeof standToken !== 'string') {
    return null;
  }
  const row = db.prepare('SELECT game_state FROM game_saves WHERE stand_token = ?').get(standToken);
  if (!row || !row.game_state) return null;
  try {
    return JSON.parse(row.game_state);
  } catch (_) {
    return null;
  }
}

/**
 * Remove active saved game state from SQLite.
 */
function deleteGameState(db, standToken) {
  if (!standToken || typeof standToken !== 'string') {
    return { ok: false };
  }
  db.prepare('DELETE FROM game_saves WHERE stand_token = ?').run(standToken);
  return { ok: true };
}

module.exports = {
  getDb,
  seedInitialData,
  insertScoreRecord,
  fetchLeaderboard,
  saveGameState,
  loadGameState,
  deleteGameState,
  TABLE_MAP
};
