/**
 * Score Integrity, Server-Side Replay Verification & Input Sanitization Module
 */
'use strict';

const { validateStandName } = require('./profanityFilter');
const { replayRun, STAND_TOKEN_REGEX } = require('../../frontend/js/game');
const { hashStandToken, isValidRawStandToken, verifyAndConsumeRunSession } = require('./db');

const VALID_MODES = new Set(['retro', '8-bit', 'modern']);
const VALID_GAME_MODES = new Set(['standard', 'endless']);

// Tightened upper bounds calibrated from simulated perfect-play runs
const MAX_SINGLE_DAY_GLASSES = 600;
const MAX_SINGLE_DAY_PROFIT_CENTS = 25000; // $250.00 max single-day profit
const MAX_STANDARD_RUN_PROFIT_CENTS = 100000; // $1,000.00 max 12-day profit
const MAX_ENDLESS_DAYS = 365;
const MAX_TOTAL_SCORE_CENTS = 2500000; // $25,000.00 max 365-day endless profit

/**
 * Strip any HTML/control characters from strings.
 */
function sanitizeText(value, maxLen = 32) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001F\u007F<>'"`&;]/g, '')
    .trim()
    .slice(0, maxLen);
}

/**
 * Validate, replay, and sanitize a score submission payload.
 * Requires a valid day_log and a server-issued per-run seed.
 */
function validateScoreSubmission(body, db = null) {
  if (!body || typeof body !== 'object') {
    return { valid: false, status: 400, code: 'INVALID_PAYLOAD', error: 'Invalid request payload.' };
  }

  // 1. Validate & filter stand_name
  const rawName = typeof body.stand_name === 'string' ? body.stand_name : '';
  const nameCheck = validateStandName(rawName);
  if (!nameCheck.valid) {
    return {
      valid: false,
      status: 400,
      code: nameCheck.code,
      error: nameCheck.reason
    };
  }

  // 2. Validate visual mode
  const rawMode = typeof body.mode === 'string' ? body.mode.trim().toLowerCase() : 'modern';
  const normalizedMode = rawMode === '8bit' ? '8-bit' : rawMode;
  if (!VALID_MODES.has(normalizedMode)) {
    return {
      valid: false,
      status: 400,
      code: 'INVALID_MODE',
      error: "Visual mode must be 'retro', '8-bit', or 'modern'."
    };
  }

  // 3. Validate game_mode & days_played
  const gameMode = VALID_GAME_MODES.has(body.game_mode) ? body.game_mode : 'standard';
  const daysPlayed = body.days_played !== undefined ? Number(body.days_played) : 12;
  if (!Number.isInteger(daysPlayed) || daysPlayed < 1 || daysPlayed > MAX_ENDLESS_DAYS) {
    return {
      valid: false,
      status: 400,
      code: 'INVALID_DAYS',
      error: `Days played must be an integer between 1 and ${MAX_ENDLESS_DAYS}.`
    };
  }
  if (gameMode === 'standard' && daysPlayed > 12) {
    return {
      valid: false,
      status: 400,
      code: 'INVALID_STANDARD_DAYS',
      error: 'Standard mode runs cannot exceed 12 days.'
    };
  }

  // 4. Validate primary score against tightened perfect-play caps
  const score = Number(body.score);
  if (!Number.isInteger(score) || score < -50000 || score > MAX_TOTAL_SCORE_CENTS) {
    return {
      valid: false,
      status: 400,
      code: 'SCORE_OUT_OF_BOUNDS',
      error: 'Submitted score failed integrity check (out of plausible bounds).'
    };
  }

  if (gameMode === 'standard' && score > MAX_STANDARD_RUN_PROFIT_CENTS) {
    return {
      valid: false,
      status: 400,
      code: 'SCORE_IMPOSSIBLE_STANDARD',
      error: 'Submitted 12-day score exceeds maximum possible perfect-play profit.'
    };
  }

  // 5. Require day_log for all score submissions
  if (!Array.isArray(body.day_log) || body.day_log.length === 0) {
    return {
      valid: false,
      status: 400,
      code: 'MISSING_DAY_LOG',
      error: 'Score submissions require a complete daily decision log (day_log).'
    };
  }

  if (body.day_log.length !== daysPlayed) {
    return {
      valid: false,
      status: 400,
      code: 'DAY_LOG_LENGTH_MISMATCH',
      error: 'Day log length must match days_played.'
    };
  }

  // 6. Verify server-issued per-run seed & session token
  const runSeed = Number(body.run_seed);
  const runId = typeof body.run_id === 'string' ? body.run_id.trim() : '';
  const runToken = typeof body.run_token === 'string' ? body.run_token.trim() : '';

  if (!Number.isInteger(runSeed) || runSeed <= 0 || !runId || !runToken) {
    return {
      valid: false,
      status: 400,
      code: 'MISSING_RUN_SEED',
      error: 'Score submission requires a valid server-issued run_id, run_seed, and run_token.'
    };
  }

  // 7. Replay the player's decisions server-side using the shared simulation engine
  const replay = replayRun(runSeed, body.day_log, gameMode);
  if (!replay.valid) {
    return {
      valid: false,
      status: 400,
      code: replay.code || 'REPLAY_VERIFICATION_FAILED',
      error: replay.error || 'Server-side replay verification failed.'
    };
  }

  // 8. Verify submitted summary metrics match the replayed run
  if (replay.score !== score) {
    return {
      valid: false,
      status: 400,
      code: 'SCORE_REPLAY_MISMATCH',
      error: 'Submitted score does not match server-replayed run total.'
    };
  }

  const submittedTotalGlasses = body.total_glasses_sold !== undefined ? Number(body.total_glasses_sold) : replay.totalGlassesSold;
  const submittedBestDayProfit = body.best_day_profit !== undefined ? Number(body.best_day_profit) : replay.bestDayProfit;
  const submittedBestDayGlasses = body.best_day_glasses !== undefined ? Number(body.best_day_glasses) : replay.bestDayGlasses;

  if (
    !Number.isInteger(submittedTotalGlasses) ||
    !Number.isInteger(submittedBestDayProfit) ||
    !Number.isInteger(submittedBestDayGlasses) ||
    submittedTotalGlasses !== replay.totalGlassesSold ||
    submittedBestDayProfit !== replay.bestDayProfit ||
    submittedBestDayGlasses !== replay.bestDayGlasses ||
    submittedBestDayGlasses > MAX_SINGLE_DAY_GLASSES ||
    submittedBestDayProfit > MAX_SINGLE_DAY_PROFIT_CENTS
  ) {
    return {
      valid: false,
      status: 400,
      code: 'METRICS_REPLAY_MISMATCH',
      error: 'Run metrics failed server-side replay consistency checks.'
    };
  }

  // 9. Verify and consume the run session so the same run cannot be re-submitted
  const sessionCheck = verifyAndConsumeRunSession(db, {
    runId,
    runSeed,
    standName: nameCheck.sanitized,
    gameMode,
    runToken
  });
  if (!sessionCheck.valid) {
    return {
      valid: false,
      status: 400,
      code: sessionCheck.code,
      error: sessionCheck.error
    };
  }

  // 10. Validate and hash stand_token (never return or store raw stand_token)
  const rawTokenCandidate = typeof body.stand_token === 'string'
    ? body.stand_token.trim()
    : (typeof body.standToken === 'string' ? body.standToken.trim() : '');

  if (rawTokenCandidate && !isValidRawStandToken(rawTokenCandidate)) {
    return {
      valid: false,
      status: 400,
      code: 'INVALID_STAND_TOKEN',
      error: 'Stand token must be 16–24 alphanumeric characters.'
    };
  }

  const standTokenHash = rawTokenCandidate ? hashStandToken(rawTokenCandidate) : '';
  const version = sanitizeText(body.version || '1.0.0', 16) || '1.0.0';

  return {
    valid: true,
    rawStandToken: rawTokenCandidate,
    data: {
      stand_name: nameCheck.sanitized,
      stand_token_hash: standTokenHash,
      score: replay.score,
      best_day_profit: replay.bestDayProfit,
      best_day_number: replay.bestDayNumber,
      best_day_weather: replay.bestDayWeather,
      total_glasses_sold: replay.totalGlassesSold,
      best_day_glasses: replay.bestDayGlasses,
      best_glasses_day_number: replay.bestGlassesDayNumber,
      best_glasses_weather: replay.bestGlassesWeather,
      final_assets: replay.finalAssets,
      mode: normalizedMode,
      game_mode: gameMode,
      days_played: replay.daysPlayed,
      version
    }
  };
}

/**
 * Validate active game save payload (including carry-forward daily settings).
 * Enforces 16-24 character raw stand_token so leaderboard hashes cannot overwrite saves.
 */
function validateSaveState(body) {
  if (!body || typeof body !== 'object') {
    return { valid: false, status: 400, code: 'INVALID_PAYLOAD', error: 'Missing or malformed request body.' };
  }
  const standToken = typeof body.stand_token === 'string'
    ? body.stand_token.trim()
    : (typeof body.standToken === 'string' ? body.standToken.trim() : '');

  if (!STAND_TOKEN_REGEX.test(standToken)) {
    return {
      valid: false,
      status: 400,
      code: 'INVALID_STAND_TOKEN',
      error: 'Stand token must be 16–24 alphanumeric characters.'
    };
  }

  const state = body.state;
  if (!state || typeof state !== 'object') {
    return { valid: false, status: 400, code: 'INVALID_STATE', error: 'Missing game state object.' };
  }
  const standName = typeof state.standName === 'string' ? state.standName : '';
  const nameCheck = validateStandName(standName);
  if (!nameCheck.valid) {
    return { valid: false, status: 400, code: nameCheck.code, error: nameCheck.reason };
  }
  const day = Number(state.day);
  if (!Number.isInteger(day) || day < 1 || day > 1000) {
    return { valid: false, status: 400, code: 'INVALID_DAY', error: 'Day must be an integer >= 1.' };
  }
  const assetsCents = Number(state.assetsCents);
  if (!Number.isInteger(assetsCents)) {
    return { valid: false, status: 400, code: 'INVALID_ASSETS', error: 'Assets must be an integer.' };
  }

  if (state.lastSettings && typeof state.lastSettings === 'object') {
    const { glasses, signs, price } = state.lastSettings;
    if (
      (glasses !== undefined && (!Number.isInteger(Number(glasses)) || Number(glasses) < 0)) ||
      (signs !== undefined && (!Number.isInteger(Number(signs)) || Number(signs) < 0)) ||
      (price !== undefined && (!Number.isInteger(Number(price)) || Number(price) < 1 || Number(price) > 500))
    ) {
      return { valid: false, status: 400, code: 'INVALID_DAILY_SETTINGS', error: 'Daily settings contain invalid numbers.' };
    }
  }

  return { valid: true, standToken, standName: nameCheck.sanitized, state };
}

module.exports = {
  VALID_MODES,
  MAX_SINGLE_DAY_GLASSES,
  MAX_SINGLE_DAY_PROFIT_CENTS,
  MAX_STANDARD_RUN_PROFIT_CENTS,
  MAX_ENDLESS_DAYS,
  MAX_TOTAL_SCORE_CENTS,
  sanitizeText,
  validateScoreSubmission,
  validateSaveState
};
