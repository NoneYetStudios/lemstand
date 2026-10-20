/**
 * Lemonade Stand - SQLite Database Layer
 * Uses parameterized prepared statements via node:sqlite to prevent SQL injection.
 * Enforces canonical schema.sql, SHA-256 hashed stand tokens, per-run seeds, and transactional leaderboard pruning.
 */
'use strict';

// Explicitly filter only the node:sqlite ExperimentalWarning so --no-warnings is not required
const originalEmitWarning = process.emitWarning;
process.emitWarning = function (warning, ...args) {
  const type = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].type);
  const name = warning && typeof warning === 'object' ? warning.name : '';
  const msg = typeof warning === 'string' ? warning : (warning && warning.message) || '';
  if ((type === 'ExperimentalWarning' || name === 'ExperimentalWarning') && /sqlite/i.test(msg)) {
    return;
  }
  return originalEmitWarning.call(this, warning, ...args);
};

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { validateStandName } = require('./profanityFilter');
const { STAND_TOKEN_REGEX } = require('../../frontend/js/game');

const DEFAULT_DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '../data/lemonadestand.db');
const SCHEMA_PATH = path.resolve(__dirname, '../../schema.sql');
const RUN_TOKEN_SECRET = process.env.RUN_TOKEN_SECRET || 'lemstand-server-seed-hmac-key-v2';

let dbInstance = null;

/**
 * Hash a raw client stand token using SHA-256.
 * Raw stand tokens are never stored in the database or returned in API responses.
 */
function hashStandToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return '';
  const trimmed = rawToken.trim();
  if (!trimmed) return '';
  return crypto.createHash('sha256').update(trimmed, 'utf8').digest('hex');
}

/**
 * Validate that a candidate raw stand token matches the 16-24 alphanumeric format.
 */
function isValidRawStandToken(rawToken) {
  return typeof rawToken === 'string' && STAND_TOKEN_REGEX.test(rawToken.trim());
}

/**
 * Compute HMAC-SHA256 signature for a server-issued per-run seed.
 */
function signRunSeed(runId, runSeed, standName, gameMode) {
  const payload = `${runId}|${Number(runSeed) >>> 0}|${String(standName).toLowerCase()}|${gameMode || 'standard'}`;
  return crypto.createHmac('sha256', RUN_TOKEN_SECRET).update(payload, 'utf8').digest('hex');
}

/**
 * Verify HMAC-SHA256 signature for a server-issued per-run seed.
 */
function verifyRunSeedToken(runId, runSeed, standName, gameMode, runToken) {
  if (!runId || !runSeed || !standName || !runToken || typeof runToken !== 'string') {
    return false;
  }
  const expected = signRunSeed(runId, runSeed, standName, gameMode);
  if (expected.length !== runToken.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(runToken, 'utf8'));
  } catch (_) {
    return false;
  }
}

/**
 * Load canonical schema.sql from the repository root.
 */
function loadCanonicalSchema() {
  if (!fs.existsSync(SCHEMA_PATH)) {
    throw new Error(`Canonical schema file not found at ${SCHEMA_PATH}`);
  }
  return fs.readFileSync(SCHEMA_PATH, 'utf8');
}

/**
 * Apply migrations to existing SQLite tables without hiding failures.
 */
function ensureMigrations(db) {
  const leaderboardTables = [
    'leaderboard_daily',
    'leaderboard_weekly',
    'leaderboard_all_time',
    'leaderboard_best_day',
    'leaderboard_best_run',
    'leaderboard_glasses_day',
    'leaderboard_glasses_run'
  ];

  for (const table of leaderboardTables) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    if (cols.length === 0) {
      throw new Error(`Expected table ${table} to exist after applying schema.sql`);
    }
    const hasToken = cols.some((c) => c.name === 'stand_token');
    if (!hasToken) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN stand_token TEXT DEFAULT ''`);
    }
  }
}

/**
 * Initialize and return the SQLite database instance.
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
  const schemaSql = loadCanonicalSchema();

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

  // Run initial leaderboard pruning
  pruneLeaderboards(db);

  return db;
}

/**
 * Issue and record a server-side per-run seed when a new stand begins.
 */
function createRunSession(db, { standName, gameMode = 'standard', standToken = '' }) {
  const check = validateStandName(standName);
  if (!check.valid) {
    throw new Error(check.reason);
  }
  const normalizedGameMode = gameMode === 'endless' ? 'endless' : 'standard';
  const runId = crypto.randomUUID();
  const runSeed = crypto.randomInt(1, 0x7fffffff);
  const tokenHash = isValidRawStandToken(standToken) ? hashStandToken(standToken) : '';
  const createdAt = new Date().toISOString();
  const runToken = signRunSeed(runId, runSeed, check.sanitized, normalizedGameMode);

  if (db) {
    db.prepare(`
      INSERT INTO game_runs (run_id, run_seed, stand_name, game_mode, stand_token, created_at, used)
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `).run(runId, runSeed, check.sanitized, normalizedGameMode, tokenHash, createdAt);
  }

  return {
    run_id: runId,
    run_seed: runSeed,
    run_token: runToken,
    stand_name: check.sanitized,
    game_mode: normalizedGameMode,
    created_at: createdAt
  };
}

/**
 * Verify that a per-run seed was issued by the server and has not yet been used, then mark it consumed.
 */
function verifyAndConsumeRunSession(db, { runId, runSeed, standName, gameMode, runToken }) {
  if (!verifyRunSeedToken(runId, runSeed, standName, gameMode, runToken)) {
    return { valid: false, code: 'INVALID_RUN_TOKEN', error: 'Invalid or forged server run token.' };
  }

  if (db) {
    const row = db.prepare('SELECT run_id, run_seed, stand_name, game_mode, used FROM game_runs WHERE run_id = ?').get(runId);
    if (!row) {
      return { valid: false, code: 'UNKNOWN_RUN_ID', error: 'Run session not found on server.' };
    }
    if (Number(row.used) !== 0) {
      return { valid: false, code: 'RUN_ALREADY_SUBMITTED', error: 'Score for this run has already been submitted.' };
    }
    if (
      Number(row.run_seed) !== Number(runSeed) ||
      String(row.stand_name).toLowerCase() !== String(standName).toLowerCase() ||
      row.game_mode !== gameMode
    ) {
      return { valid: false, code: 'RUN_METADATA_MISMATCH', error: 'Run metadata does not match server session.' };
    }
    db.prepare('UPDATE game_runs SET used = 1 WHERE run_id = ?').run(runId);
  }

  return { valid: true };
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
      stand_token: 'StarterSeedToken0001',
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
      stand_token: 'StarterSeedToken0002',
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
      stand_token: 'StarterSeedToken0003',
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
      stand_token: 'StarterSeedToken0004',
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
      stand_token: 'StarterSeedToken0005',
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
      stand_token: 'StarterSeedToken0006',
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
 * Stores and returns only sha256(stand_token), never the raw token.
 */
function insertScoreRecord(db, data, customDateIso) {
  const check = validateStandName(data.stand_name);
  if (!check.valid) {
    throw new Error(`Rejected Stand Name at DB layer: ${check.reason}`);
  }

  const timestamp = customDateIso || new Date().toISOString();
  const rawOrHashed = typeof data.stand_token_hash === 'string' && /^[a-f0-9]{64}$/.test(data.stand_token_hash)
    ? data.stand_token_hash
    : (typeof data.stand_token === 'string' && data.stand_token
        ? (/^[a-f0-9]{64}$/.test(data.stand_token) ? data.stand_token : hashStandToken(data.stand_token))
        : '');

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
    `).run(ids.daily, check.sanitized, data.score, timestamp, data.mode, data.version, data.game_mode, data.days_played, rawOrHashed);

    // 2. Weekly
    db.prepare(`
      INSERT INTO leaderboard_weekly (id, stand_name, score, date, mode, version, game_mode, days_played, stand_token)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(ids.weekly, check.sanitized, data.score, timestamp, data.mode, data.version, data.game_mode, data.days_played, rawOrHashed);

    // 3. All-time
    db.prepare(`
      INSERT INTO leaderboard_all_time (id, stand_name, score, date, mode, version, game_mode, days_played, stand_token)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(ids.all_time, check.sanitized, data.score, timestamp, data.mode, data.version, data.game_mode, data.days_played, rawOrHashed);

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
        rawOrHashed
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
        rawOrHashed
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
        rawOrHashed
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
        rawOrHashed
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
    stand_token: rawOrHashed
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
 * Never returns raw tokens; stand_token is always the SHA-256 hash.
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
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    whereClauses.push('date >= ?');
    params.push(cutoff);
  } else if (category === 'weekly') {
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
  return rows.map((row, idx) => {
    const storedToken = row.stand_token || '';
    const safeTokenHash = storedToken && !/^[a-f0-9]{64}$/.test(storedToken)
      ? hashStandToken(storedToken)
      : storedToken;
    return {
      rank: idx + 1,
      id: row.id,
      stand_name: row.stand_name,
      score: row.score,
      date: row.date,
      mode: row.mode,
      version: row.version,
      stand_token: safeTokenHash
    };
  });
}

/**
 * Transactional pruning for leaderboard_daily, leaderboard_weekly, and expired sessions.
 * Keeps N days of daily history and N weeks of weekly history.
 */
function pruneLeaderboards(db, options = {}) {
  const dailyDays = Math.max(1, Number(options.dailyDays ?? process.env.DAILY_RETENTION_DAYS ?? 7));
  const weeklyWeeks = Math.max(1, Number(options.weeklyWeeks ?? process.env.WEEKLY_RETENTION_WEEKS ?? 4));
  const nowMs = options.now instanceof Date
    ? options.now.getTime()
    : (typeof options.now === 'number' ? options.now : Date.now());

  const dailyCutoff = new Date(nowMs - dailyDays * 86400 * 1000).toISOString();
  const weeklyCutoff = new Date(nowMs - weeklyWeeks * 7 * 86400 * 1000).toISOString();
  const runCutoff = new Date(nowMs - 7 * 86400 * 1000).toISOString();

  db.exec('BEGIN IMMEDIATE TRANSACTION');
  try {
    const dailyRes = db.prepare('DELETE FROM leaderboard_daily WHERE date < ?').run(dailyCutoff);
    const weeklyRes = db.prepare('DELETE FROM leaderboard_weekly WHERE date < ?').run(weeklyCutoff);
    const runsRes = db.prepare('DELETE FROM game_runs WHERE created_at < ? OR used = 1').run(runCutoff);
    db.exec('COMMIT');

    return {
      ok: true,
      prunedDaily: Number(dailyRes.changes || 0),
      prunedWeekly: Number(weeklyRes.changes || 0),
      prunedRuns: Number(runsRes.changes || 0),
      dailyCutoff,
      weeklyCutoff
    };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/**
 * Save active game state (with carry-forward daily settings) to SQLite.
 * Keys by sha256(rawStandToken) and requires a valid 16-24 char raw token so another player's
 * save can never be overwritten using a leaderboard hash.
 */
function saveGameState(db, rawStandToken, state) {
  if (!isValidRawStandToken(rawStandToken)) {
    throw new Error('Invalid stand token');
  }
  const tokenHash = hashStandToken(rawStandToken);
  const cleanState = { ...(typeof state === 'string' ? JSON.parse(state) : state) };
  delete cleanState.stand_token;
  delete cleanState.standToken;

  const stateJson = JSON.stringify(cleanState);
  const standName = (cleanState && cleanState.standName) || 'Lemonade Stand';
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO game_saves (stand_token, stand_name, game_state, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(stand_token) DO UPDATE SET
      stand_name = excluded.stand_name,
      game_state = excluded.game_state,
      updated_at = excluded.updated_at
  `);
  stmt.run(tokenHash, standName, stateJson, now);
  return { ok: true, updated_at: now };
}

/**
 * Retrieve active saved game state for a raw stand token.
 */
function loadGameState(db, rawStandToken) {
  if (!isValidRawStandToken(rawStandToken)) {
    return null;
  }
  const tokenHash = hashStandToken(rawStandToken);
  const row = db.prepare('SELECT game_state FROM game_saves WHERE stand_token = ?').get(tokenHash);
  if (!row || !row.game_state) return null;
  try {
    const parsed = JSON.parse(row.game_state);
    delete parsed.stand_token;
    delete parsed.standToken;
    return parsed;
  } catch (_) {
    return null;
  }
}

/**
 * Remove active saved game state from SQLite using the player's raw stand token.
 */
function deleteGameState(db, rawStandToken) {
  if (!isValidRawStandToken(rawStandToken)) {
    return { ok: false };
  }
  const tokenHash = hashStandToken(rawStandToken);
  db.prepare('DELETE FROM game_saves WHERE stand_token = ?').run(tokenHash);
  return { ok: true };
}

module.exports = {
  getDb,
  hashStandToken,
  isValidRawStandToken,
  signRunSeed,
  verifyRunSeedToken,
  createRunSession,
  verifyAndConsumeRunSession,
  seedInitialData,
  insertScoreRecord,
  fetchLeaderboard,
  pruneLeaderboards,
  saveGameState,
  loadGameState,
  deleteGameState,
  TABLE_MAP
};
