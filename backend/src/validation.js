/**
 * Score Integrity & Input Sanitization Module
 */
'use strict';

const { validateStandName } = require('./profanityFilter');

const VALID_MODES = new Set(['retro', '8-bit', 'modern']);
const VALID_GAME_MODES = new Set(['standard', 'endless']);

// Realistic upper bounds for anti-cheat validation
const MAX_SINGLE_DAY_GLASSES = 2000;
const MAX_SINGLE_DAY_PROFIT_CENTS = 250000; // $2,500.00 in a single day
const MAX_STANDARD_RUN_PROFIT_CENTS = 2000000; // $20,000.00 in 12 days
const MAX_ENDLESS_DAYS = 365;
const MAX_TOTAL_SCORE_CENTS = 50000000;

/**
 * Deterministic checksum shared with frontend game engine to verify untampered run logs.
 */
function computeRunChecksum(standName, score, totalGlasses, bestDayProfit, bestDayGlasses, daysPlayed) {
  const payload = `${String(standName).toLowerCase()}|${score}|${totalGlasses}|${bestDayProfit}|${bestDayGlasses}|${daysPlayed}|LEMSTAND_V1_SALT`;
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

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
 * Validate and sanitize a score submission payload.
 */
function validateScoreSubmission(body) {
  if (!body || typeof body !== 'object') {
    return { valid: false, status: 400, error: 'Invalid request payload.' };
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

  // 4. Validate primary score (in cents)
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
      error: 'Submitted 12-day score exceeds maximum mathematically possible profit.'
    };
  }

  // 5. Validate optional/companion metrics (best_day_profit, total_glasses_sold, best_day_glasses)
  const bestDayProfit = body.best_day_profit !== undefined ? Number(body.best_day_profit) : Math.max(0, Math.round(score / Math.max(1, daysPlayed)));
  const totalGlassesSold = body.total_glasses_sold !== undefined ? Number(body.total_glasses_sold) : 0;
  const bestDayGlasses = body.best_day_glasses !== undefined ? Number(body.best_day_glasses) : 0;

  if (
    !Number.isInteger(bestDayProfit) ||
    !Number.isInteger(totalGlassesSold) ||
    !Number.isInteger(bestDayGlasses)
  ) {
    return {
      valid: false,
      status: 400,
      code: 'INVALID_METRICS',
      error: 'Run metrics must be integer values.'
    };
  }

  if (
    totalGlassesSold < 0 ||
    bestDayGlasses < 0 ||
    bestDayGlasses > MAX_SINGLE_DAY_GLASSES ||
    bestDayGlasses > totalGlassesSold ||
    bestDayProfit > MAX_SINGLE_DAY_PROFIT_CENTS ||
    totalGlassesSold > daysPlayed * MAX_SINGLE_DAY_GLASSES
  ) {
    return {
      valid: false,
      status: 400,
      code: 'METRICS_INTEGRITY_FAILED',
      error: 'Run metrics failed anti-cheat consistency checks.'
    };
  }

  // 6. If day_log array is provided, verify each day's math and sum
  if (Array.isArray(body.day_log) && body.day_log.length > 0) {
    if (body.day_log.length > MAX_ENDLESS_DAYS) {
      return { valid: false, status: 400, code: 'LOG_TOO_LONG', error: 'Day log exceeds maximum allowed length.' };
    }

    let computedProfitSum = 0;
    let computedGlassesSum = 0;
    let computedMaxDayProfit = 0;
    let computedMaxDayGlasses = 0;

    for (const entry of body.day_log) {
      if (!entry || typeof entry !== 'object') {
        return { valid: false, status: 400, code: 'INVALID_LOG_ENTRY', error: 'Malformed day log entry.' };
      }
      const glassesMade = Number(entry.glassesMade);
      const glassesSold = Number(entry.glassesSold);
      const pricePerGlass = Number(entry.pricePerGlass);
      const signsMade = Number(entry.signsMade);
      const profitCents = Number(entry.profitCents);

      if (
        !Number.isInteger(glassesMade) || glassesMade < 0 || glassesMade > MAX_SINGLE_DAY_GLASSES ||
        !Number.isInteger(glassesSold) || glassesSold < 0 || glassesSold > glassesMade ||
        !Number.isInteger(pricePerGlass) || pricePerGlass < 1 || pricePerGlass > 500 ||
        !Number.isInteger(signsMade) || signsMade < 0 || signsMade > 500 ||
        !Number.isInteger(profitCents)
      ) {
        return {
          valid: false,
          status: 400,
          code: 'DAY_LOG_TAMPERED',
          error: 'Daily transaction log contains impossible values.'
        };
      }

      const revenue = glassesSold * pricePerGlass;
      if (profitCents > revenue) {
        return {
          valid: false,
          status: 400,
          code: 'PROFIT_EXCEEDS_REVENUE',
          error: 'Daily profit cannot exceed gross daily revenue.'
        };
      }

      computedProfitSum += profitCents;
      computedGlassesSum += glassesSold;
      if (profitCents > computedMaxDayProfit) computedMaxDayProfit = profitCents;
      if (glassesSold > computedMaxDayGlasses) computedMaxDayGlasses = glassesSold;
    }

    if (
      computedProfitSum !== score ||
      computedGlassesSum !== totalGlassesSold ||
      computedMaxDayProfit !== bestDayProfit ||
      computedMaxDayGlasses !== bestDayGlasses
    ) {
      return {
        valid: false,
        status: 400,
        code: 'LOG_SUM_MISMATCH',
        error: 'Run summary does not match daily transaction log.'
      };
    }
  }

  // 7. Verify integrity_hash if supplied by client
  if (typeof body.integrity_hash === 'string' && body.integrity_hash.length > 0) {
    const expectedHash = computeRunChecksum(
      nameCheck.sanitized,
      score,
      totalGlassesSold,
      bestDayProfit,
      bestDayGlasses,
      daysPlayed
    );
    if (body.integrity_hash !== expectedHash) {
      return {
        valid: false,
        status: 400,
        code: 'INVALID_INTEGRITY_HASH',
        error: 'Score integrity signature mismatch.'
      };
    }
  }

  const version = sanitizeText(body.version || '1.0.0', 16) || '1.0.0';
  const standToken = typeof body.stand_token === 'string'
    ? sanitizeText(body.stand_token, 16)
    : (typeof body.standToken === 'string' ? sanitizeText(body.standToken, 16) : '');

  return {
    valid: true,
    data: {
      stand_name: nameCheck.sanitized,
      stand_token: standToken,
      score,
      best_day_profit: bestDayProfit,
      best_day_number: Number.isInteger(Number(body.best_day_number)) ? Number(body.best_day_number) : 1,
      best_day_weather: sanitizeText(body.best_day_weather || 'sunny', 24) || 'sunny',
      total_glasses_sold: totalGlassesSold,
      best_day_glasses: bestDayGlasses,
      best_glasses_day_number: Number.isInteger(Number(body.best_glasses_day_number)) ? Number(body.best_glasses_day_number) : 1,
      best_glasses_weather: sanitizeText(body.best_glasses_weather || 'sunny', 24) || 'sunny',
      final_assets: Number.isInteger(Number(body.final_assets)) ? Number(body.final_assets) : 200 + score,
      mode: normalizedMode,
      game_mode: gameMode,
      days_played: daysPlayed,
      version
    }
  };
}

/**
 * Validate active game save payload (including carry-forward daily settings).
 */
function validateSaveState(body) {
  if (!body || typeof body !== 'object') {
    return { valid: false, status: 400, code: 'INVALID_PAYLOAD', error: 'Missing or malformed request body.' };
  }
  const standToken = typeof body.stand_token === 'string' ? body.stand_token.trim() : '';
  if (!standToken || standToken.length < 6 || standToken.length > 20) {
    return { valid: false, status: 400, code: 'INVALID_STAND_TOKEN', error: 'Invalid stand token.' };
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

  // Validate lastSettings (carry-forward daily settings) if present
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
  computeRunChecksum,
  sanitizeText,
  validateScoreSubmission,
  validateSaveState
};
