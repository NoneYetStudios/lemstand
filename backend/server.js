/**
 * Lemonade Stand - Express API & Static Server
 * Production-ready backend with SQLite leaderboards, shared family-friendly filtering,
 * proxy-accurate rate limiting, and server-side simulation replay anti-cheat verification.
 */
'use strict';

const path = require('node:path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const {
  getDb,
  isValidRawStandToken,
  createRunSession,
  insertScoreRecord,
  fetchLeaderboard,
  pruneLeaderboards,
  saveGameState,
  loadGameState,
  deleteGameState
} = require('./src/db');
const { validateStandName } = require('./src/profanityFilter');
const { validateScoreSubmission, validateSaveState } = require('./src/validation');

/**
 * Resolve real client IP across Netlify/Vercel -> Fly.io / Cloudflare proxy chains.
 */
function resolveClientIp(req) {
  const headers = req.headers || {};
  // 1. Netlify / Vercel / Cloudflare dedicated client IP headers
  const edgeClientIp =
    headers['x-nf-client-connection-ip'] ||
    headers['x-vercel-forwarded-for'] ||
    headers['cf-connecting-ip'];

  if (typeof edgeClientIp === 'string' && edgeClientIp.trim()) {
    return edgeClientIp.split(',')[0].trim();
  }

  // 2. Leftmost (original client) IP in X-Forwarded-For chain (e.g. client, netlify-edge, fly-proxy)
  const xff = headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim();
  }

  // 3. Fly.io direct client IP or Express req.ip
  if (typeof headers['fly-client-ip'] === 'string' && headers['fly-client-ip'].trim()) {
    return headers['fly-client-ip'].trim();
  }

  return req.ip || (req.socket && req.socket.remoteAddress) || '127.0.0.1';
}

function createApp(customDbPath) {
  const app = express();
  const db = getDb(customDbPath);

  // Adjust trust proxy for multi-hop Netlify/Vercel -> Fly.io proxy topology (2 hops by default)
  const trustProxyHops =
    process.env.TRUST_PROXY !== undefined ? Number(process.env.TRUST_PROXY) || 2 : 2;
  app.set('trust proxy', trustProxyHops);

  // Scheduled background leaderboard pruning (hourly, unref'd so it never blocks process exit)
  const pruneIntervalMs = Number(process.env.PRUNE_INTERVAL_MS || 60 * 60 * 1000);
  const pruneTimer = setInterval(() => {
    try {
      pruneLeaderboards(db);
    } catch (err) {
      console.error('[PRUNE_ERROR] Failed scheduled leaderboard pruning:', err.message);
    }
  }, pruneIntervalMs);
  if (typeof pruneTimer.unref === 'function') {
    pruneTimer.unref();
  }

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          imgSrc: ["'self'", 'data:', 'blob:'],
          mediaSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'", 'https://lemonadestand.stabthefinger.com', 'http://localhost:*']
        }
      },
      crossOriginEmbedderPolicy: false
    })
  );

  // Public API CORS configuration (explicitly allows all origins unless strict ALLOWED_ORIGINS list is configured)
  const rawAllowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.trim() : '*';
  const corsOptions =
    rawAllowedOrigins === '*' || !rawAllowedOrigins
      ? {
          origin: '*',
          methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
          allowedHeaders: ['Content-Type', 'Accept']
        }
      : {
          origin(origin, callback) {
            const allowlist = rawAllowedOrigins.split(',').map((o) => o.trim()).filter(Boolean);
            if (!origin || allowlist.includes(origin)) {
              return callback(null, true);
            }
            return callback(null, false);
          },
          methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
          allowedHeaders: ['Content-Type', 'Accept']
        };

  app.use(cors(corsOptions));

  // Strict JSON body limit to prevent payload abuse
  app.use(express.json({ limit: '32kb' }));

  // Log req.ip and resolved client IP in production to confirm proxy accuracy
  app.use('/api', (req, res, next) => {
    req.clientIp = resolveClientIp(req);
    if (process.env.NODE_ENV === 'production') {
      console.log(`[API] ${req.method} ${req.path} - req.ip=${req.ip} clientIp=${req.clientIp}`);
    }
    return next();
  });

  // General API rate limiter (keyed per real client IP)
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX_READ || 120),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => resolveClientIp(req),
    message: {
      ok: false,
      code: 'RATE_LIMITED',
      error: 'Too many requests from this IP, please try again in a minute.'
    }
  });

  // Strict score submission rate limiter (keyed per real client IP)
  const submitScoreLimiter = rateLimit({
    windowMs: Number(process.env.SUBMIT_RATE_WINDOW_MS || 60 * 1000),
    max: Number(process.env.SUBMIT_RATE_LIMIT_MAX || 10),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => resolveClientIp(req),
    message: {
      ok: false,
      code: 'RATE_LIMITED',
      error: 'Too many score submissions. Please wait a moment before submitting again.'
    }
  });

  app.use('/api', apiLimiter);

  // Healthcheck endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      service: 'lemonade-stand-api',
      domain: 'lemonadestand.stabthefinger.com',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    });
  });

  // Validate Stand Name endpoint
  app.post('/api/validate-nickname', (req, res) => {
    const raw =
      req.body && typeof req.body.stand_name === 'string'
        ? req.body.stand_name
        : req.body && typeof req.body.nickname === 'string'
          ? req.body.nickname
          : '';

    const result = validateStandName(raw);
    if (!result.valid) {
      return res.status(400).json({
        ok: false,
        valid: false,
        code: result.code,
        error: result.reason
      });
    }

    return res.json({
      ok: true,
      valid: true,
      stand_name: result.sanitized,
      normalized: result.normalized,
      message: result.reason
    });
  });

  // Start New Stand Run & Issue Server Seed endpoint
  app.post('/api/run/start', (req, res) => {
    const rawName = req.body && typeof req.body.stand_name === 'string' ? req.body.stand_name : '';
    const nameCheck = validateStandName(rawName);
    if (!nameCheck.valid) {
      return res.status(400).json({
        ok: false,
        code: nameCheck.code,
        error: nameCheck.reason
      });
    }

    const gameMode = req.body && req.body.game_mode === 'endless' ? 'endless' : 'standard';
    const standToken = req.body && typeof req.body.stand_token === 'string' ? req.body.stand_token.trim() : '';

    if (standToken && !isValidRawStandToken(standToken)) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_STAND_TOKEN',
        error: 'Stand token must be 16–24 alphanumeric characters.'
      });
    }

    try {
      const session = createRunSession(db, {
        standName: nameCheck.sanitized,
        gameMode,
        standToken
      });
      return res.status(201).json({
        ok: true,
        run_id: session.run_id,
        run_seed: session.run_seed,
        run_token: session.run_token,
        stand_name: session.stand_name,
        game_mode: session.game_mode
      });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        code: 'SEED_CREATION_ERROR',
        error: 'Failed to initialize run seed on server.'
      });
    }
  });

  // Submit Score handler
  function handleScoreSubmission(req, res) {
    const validation = validateScoreSubmission(req.body, db);
    if (!validation.valid) {
      console.warn('[ANTI-CHEAT] Suspicious score submission rejected:', {
        ip: resolveClientIp(req),
        stand_name: req.body && req.body.stand_name,
        score: req.body && req.body.score,
        code: validation.code,
        error: validation.error
      });
      return res.status(validation.status || 400).json({
        ok: false,
        code: validation.code || 'VALIDATION_ERROR',
        error: validation.error
      });
    }

    try {
      const record = insertScoreRecord(db, validation.data);
      if (validation.rawStandToken) {
        try {
          deleteGameState(db, validation.rawStandToken);
        } catch (_) {}
      }

      return res.status(201).json({
        ok: true,
        message: 'Score verified and recorded on leaderboards!',
        entry: record
      });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        code: 'DB_ERROR',
        error: 'Failed to store score in database.'
      });
    }
  }

  app.post('/api/scores', submitScoreLimiter, handleScoreSubmission);
  app.post('/api/leaderboard/submit', submitScoreLimiter, handleScoreSubmission);
  app.post('/api/leaderboard', submitScoreLimiter, handleScoreSubmission);

  // Active Game State Save & Carry-Forward Daily Settings Endpoints
  app.post('/api/save', (req, res) => {
    const val = validateSaveState(req.body);
    if (!val.valid) {
      return res.status(val.status).json({
        ok: false,
        code: val.code || 'INVALID_SAVE_STATE',
        error: val.error
      });
    }
    try {
      const result = saveGameState(db, val.standToken, val.state);
      return res.json({ ok: true, updated_at: result.updated_at });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        code: 'DB_SAVE_ERROR',
        error: 'Failed to save game state to database.'
      });
    }
  });

  app.get('/api/save/:standToken', (req, res) => {
    const standToken = req.params.standToken;
    if (!isValidRawStandToken(standToken)) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_STAND_TOKEN',
        error: 'Valid 16–24 character stand token is required.'
      });
    }
    try {
      const state = loadGameState(db, standToken);
      if (!state) {
        return res.status(404).json({
          ok: false,
          code: 'SAVE_NOT_FOUND',
          error: 'No saved game found for this token.'
        });
      }
      return res.json({ ok: true, state });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        code: 'DB_LOAD_ERROR',
        error: 'Failed to load game state.'
      });
    }
  });

  app.delete('/api/save/:standToken', (req, res) => {
    const standToken = req.params.standToken;
    if (!isValidRawStandToken(standToken)) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_STAND_TOKEN',
        error: 'Valid 16–24 character stand token is required.'
      });
    }
    try {
      deleteGameState(db, standToken);
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        code: 'DB_DELETE_ERROR',
        error: 'Failed to delete saved game.'
      });
    }
  });

  // Helper to register leaderboard GET endpoints
  function makeLeaderboardHandler(category, title, unit) {
    return (req, res) => {
      try {
        const modeRaw = req.query.mode ? String(req.query.mode).toLowerCase().trim() : null;
        const mode = modeRaw === '8bit' ? '8-bit' : modeRaw;
        if (mode && !['retro', '8-bit', 'modern'].includes(mode)) {
          return res.status(400).json({
            ok: false,
            code: 'INVALID_MODE',
            error: "Mode filter must be 'retro', '8-bit', or 'modern'."
          });
        }

        const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 25;
        const entries = fetchLeaderboard(db, category, { mode, limit });

        return res.json({
          ok: true,
          category,
          title,
          unit,
          mode_filter: mode || 'all',
          count: entries.length,
          entries
        });
      } catch (err) {
        return res.status(500).json({
          ok: false,
          code: 'DB_READ_ERROR',
          error: 'Could not fetch leaderboard entries.'
        });
      }
    };
  }

  // 1. Fetch daily leaderboard
  app.get('/api/leaderboard/daily', makeLeaderboardHandler('daily', 'Daily High Scores (Last 24 Hours)', 'cents'));

  // 2. Fetch weekly leaderboard
  app.get('/api/leaderboard/weekly', makeLeaderboardHandler('weekly', 'Weekly Leaderboard (Last 7d)', 'cents'));

  // 3. Fetch all-time leaderboard
  const allTimeHandler = makeLeaderboardHandler('all-time', 'All-Time Top Profits', 'cents');
  app.get('/api/leaderboard/all-time', allTimeHandler);
  app.get('/api/leaderboard/all_time', allTimeHandler);
  app.get('/api/leaderboard/alltime', allTimeHandler);

  // 4. Fetch best-day leaderboard
  const bestDayHandler = makeLeaderboardHandler('best-day', 'Best Single-Day Profit', 'cents');
  app.get('/api/leaderboard/best-day', bestDayHandler);
  app.get('/api/leaderboard/best_day', bestDayHandler);

  // 5. Fetch best-run leaderboard
  const bestRunHandler = makeLeaderboardHandler('best-run', 'Best 12-Day Run', 'cents');
  app.get('/api/leaderboard/best-run', bestRunHandler);
  app.get('/api/leaderboard/best_run', bestRunHandler);

  // 6. Fetch glasses-day leaderboard
  const glassesDayHandler = makeLeaderboardHandler('glasses-day', 'Most Glasses Sold in a Day', 'glasses');
  app.get('/api/leaderboard/glasses-day', glassesDayHandler);
  app.get('/api/leaderboard/glasses_day', glassesDayHandler);

  // 7. Fetch glasses-run leaderboard
  const glassesRunHandler = makeLeaderboardHandler('glasses-run', 'Most Glasses Sold in a Full Run', 'glasses');
  app.get('/api/leaderboard/glasses-run', glassesRunHandler);
  app.get('/api/leaderboard/glasses_run', glassesRunHandler);

  // Overview / root leaderboard endpoint
  app.get('/api/leaderboard', (req, res, next) => {
    const category = req.query.category || 'all-time';
    const normalized = String(category).replace(/_/g, '-');
    const validCategories = ['daily', 'weekly', 'all-time', 'best-day', 'best-run', 'glasses-day', 'glasses-run'];
    if (!validCategories.includes(normalized)) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_CATEGORY',
        error: `Invalid category. Valid categories: ${validCategories.join(', ')}`
      });
    }
    return makeLeaderboardHandler(
      normalized,
      `Leaderboard (${normalized})`,
      normalized.startsWith('glasses') ? 'glasses' : 'cents'
    )(req, res, next);
  });

  // Serve static frontend files
  const frontendDir = path.resolve(__dirname, '../frontend');
  app.use(express.static(frontendDir));

  // Fallback for SPA navigation
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({
        ok: false,
        code: 'NOT_FOUND',
        error: 'API endpoint not found.'
      });
    }
    return res.sendFile(path.join(frontendDir, 'index.html'));
  });

  return app;
}

if (require.main === module) {
  const PORT = Number(process.env.PORT || 3000);
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`🍋 Lemonade Stand server running at http://localhost:${PORT}`);
  });
}

module.exports = { createApp, resolveClientIp };
