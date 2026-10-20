/**
 * Lemonade Stand - Express API & Static Server
 * Production-ready backend with SQLite leaderboards, strict family-friendly filtering,
 * rate limiting, and anti-cheat score integrity validation.
 */
'use strict';

const path = require('node:path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { getDb, insertScoreRecord, fetchLeaderboard, saveGameState, loadGameState, deleteGameState } = require('./src/db');
const { validateStandName } = require('./src/profanityFilter');
const { validateScoreSubmission, validateSaveState, sanitizeText } = require('./src/validation');

function createApp(customDbPath) {
  const app = express();
  const db = getDb(customDbPath);

  // Trust proxy for accurate rate-limiting behind Fly.io / Render / Cloudflare
  app.set('trust proxy', 1);

  // Security headers (configured to allow Tailwind CDN & Google Fonts in frontend)
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

  // CORS configuration for lemonadestand.stabthefinger.com and local dev
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : [
        'https://lemonadestand.stabthefinger.com',
        'http://lemonadestand.stabthefinger.com',
        'http://localhost:3000',
        'http://localhost:5173',
        'http://127.0.0.1:3000'
      ];

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
          return callback(null, true);
        }
        return callback(null, true); // Allow public read/submit with rate-limiting & integrity checks
      },
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Accept']
    })
  );

  // Strict JSON body limit to prevent payload abuse
  app.use(express.json({ limit: '16kb' }));

  // General API rate limiter
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: Number(process.env.RATE_LIMIT_MAX_READ || 120),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      ok: false,
      error: 'Too many requests from this IP, please try again in a minute.'
    }
  });

  // Strict score submission rate limiter
  const submitScoreLimiter = rateLimit({
    windowMs: Number(process.env.SUBMIT_RATE_WINDOW_MS || 60 * 1000), // 1 minute window
    max: Number(process.env.SUBMIT_RATE_LIMIT_MAX || 10), // Max 10 score submissions per minute per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      ok: false,
      code: 'RATE_LIMITED',
      error: 'Too many score submissions. Please wait a moment before submitting again.'
    }
  });

  app.use('/api', apiLimiter);

  // Middleware: sanitize query parameters and reject any profanity in query strings
  app.use('/api', (req, res, next) => {
    for (const [key, val] of Object.entries(req.query || {})) {
      if (typeof val === 'string') {
        const cleaned = sanitizeText(val, 32);
        req.query[key] = cleaned;
        if (key === 'stand_name' || key === 'search') {
          const check = validateStandName(cleaned);
          if (!check.valid) {
            return res.status(400).json({
              ok: false,
              code: check.code,
              error: check.reason
            });
          }
        }
      }
    }
    return next();
  });

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
    const raw = req.body && typeof req.body.stand_name === 'string'
      ? req.body.stand_name
      : (req.body && typeof req.body.nickname === 'string' ? req.body.nickname : '');

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

  // Submit Score handler
  function handleScoreSubmission(req, res) {
    const validation = validateScoreSubmission(req.body);
    if (!validation.valid) {
      return res.status(validation.status || 400).json({
        ok: false,
        code: validation.code || 'VALIDATION_ERROR',
        error: validation.error
      });
    }

    try {
      const record = insertScoreRecord(db, validation.data);
      // Clean up active save state upon run completion
      if (validation.data.stand_token) {
        try {
          deleteGameState(db, validation.data.stand_token);
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
      return res.status(val.status).json({ ok: false, error: val.error, code: val.code });
    }
    try {
      const result = saveGameState(db, val.standToken, val.state);
      return res.json({ ok: true, updated_at: result.updated_at });
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'Failed to save game state to database.' });
    }
  });

  app.get('/api/save/:standToken', (req, res) => {
    const standToken = req.params.standToken;
    if (!standToken) {
      return res.status(400).json({ ok: false, error: 'Stand token is required.' });
    }
    try {
      const state = loadGameState(db, standToken);
      if (!state) {
        return res.status(404).json({ ok: false, error: 'No saved game found for this token.' });
      }
      return res.json({ ok: true, state });
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'Failed to load game state.' });
    }
  });

  app.delete('/api/save/:standToken', (req, res) => {
    const standToken = req.params.standToken;
    if (!standToken) {
      return res.status(400).json({ ok: false, error: 'Stand token is required.' });
    }
    try {
      deleteGameState(db, standToken);
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'Failed to delete saved game.' });
    }
  });

  // Helper to register leaderboard GET endpoints
  function makeLeaderboardHandler(category, title, unit) {
    return (req, res) => {
      try {
        const modeRaw = req.query.mode ? String(req.query.mode).toLowerCase() : null;
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
  app.get('/api/leaderboard/daily', makeLeaderboardHandler('daily', 'Daily Leaderboard (Last 24h)', 'cents'));

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
        error: `Invalid category. Valid categories: ${validCategories.join(', ')}`
      });
    }
    return makeLeaderboardHandler(normalized, `Leaderboard (${normalized})`, normalized.startsWith('glasses') ? 'glasses' : 'cents')(req, res, next);
  });

  // Serve static frontend files
  const frontendDir = path.resolve(__dirname, '../frontend');
  app.use(express.static(frontendDir));

  // Fallback for SPA navigation
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ ok: false, error: 'API endpoint not found.' });
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

module.exports = { createApp };
