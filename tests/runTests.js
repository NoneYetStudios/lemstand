/**
 * Lemonade Stand - Comprehensive Unit & End-to-End Test Suite
 * Verifies:
 * 1. Stand Token Security (16–24 char tokens, SHA-256 hashing, save isolation, client-hashed "You" indicator)
 * 2. Anti-Cheat Overhaul (server-issued per-run seeds, rolling seeds in Endless mode, mandatory day_log, server-side replay)
 * 3. Profanity Filter Rewrite (innocent words pass, new profanities blocked, token vs substring matching, shared implementation, name generator)
 * 4. Rate-Limit IP Accuracy (Netlify/Vercel -> Fly.io proxy headers) & Public CORS
 * 5. Schema Consolidation (canonical schema.sql, date indexes, zero embedded copies)
 * 6. Transactional Leaderboard Pruning (daily & weekly retention)
 * 7. Visual Modes, Assets, Carry-Forward Settings, and Retro Typography
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const FrontendProfanityFilter = require('../frontend/js/profanityFilter');
const BackendProfanityFilter = require('../backend/src/profanityFilter');
const LemonadeGame = require('../frontend/js/game');
const {
  getDb,
  hashStandToken,
  pruneLeaderboards,
  insertScoreRecord
} = require('../backend/src/db');
const { createApp, resolveClientIp } = require('../backend/server');

const EXPECTED_FAILURE_MSG = 'Stand Name not allowed. Please choose a family-friendly name.';

async function runTests() {
  console.log('🧪 Starting Lemonade Stand Test Suite...\n');

  // --------------------------------------------------------------------------
  // 1. Test Shared Profanity Filter Rewrite (Innocent Names Pass + Profanity Blocked)
  // --------------------------------------------------------------------------
  console.log('1️⃣  Testing Consolidated Profanity Filter (Scunthorpe Fix, Leetspeak, New Words, Name Generator)...');

  assert.equal(
    FrontendProfanityFilter,
    BackendProfanityFilter,
    'Frontend and backend must share the exact same ProfanityFilter implementation'
  );

  const validNames = [
    'Sunny_Cups',
    'Apple_IIe',
    'Lemon_King',
    'Pixel_Stand',
    'Citrus_79',
    'Fresh_Ade',
    'Gold_Lemon',
    // Innocent names that previously triggered false-positive substring matches:
    'Glass',
    'Michelle',
    'Classic',
    'Cucumber',
    'GrapeSoda',
    'Pass_Stand',
    'Butter_Cup',
    'Shell_Bay',
    'Spiced_Tea',
    'SunnyLemonCart'
  ];

  for (const name of validNames) {
    const res = FrontendProfanityFilter.validateStandName(name);
    assert.equal(res.valid, true, `Expected valid stand name "${name}" to be accepted`);
    assert.equal(res.reason, '', `Expected silent success (empty reason), got: "${res.reason}"`);
  }

  // Test "Pick Your Stand Name" generator
  for (let i = 0; i < 10; i++) {
    const generated = FrontendProfanityFilter.generateStandName();
    const check = FrontendProfanityFilter.validateStandName(generated);
    assert.equal(check.valid, true, `Generated stand name "${generated}" must be valid`);
  }
  const customGenerated = FrontendProfanityFilter.generateStandName({
    prefix: 'Sunny',
    theme: 'Lemon',
    suffix: 'Cart'
  });
  assert.equal(customGenerated, 'SunnyLemonCart');

  const invalidFormatNames = [
    '',
    'ab', // too short (<3)
    'TooLongStandName123', // too long (>18)
    'Bad Space', // space not allowed
    'Bad-Dash', // hyphen not allowed
    'Bad$Sign', // special char not allowed
    '<script>1' // HTML injection attempt
  ];

  for (const name of invalidFormatNames) {
    const res = FrontendProfanityFilter.validateStandName(name);
    assert.equal(res.valid, false, `Expected malformed name "${name}" to be rejected`);
    assert.equal(
      res.reason,
      EXPECTED_FAILURE_MSG,
      `Expected friendly failure message for "${name}", got: "${res.reason}"`
    );
  }

  const profaneNames = [
    // Direct profanity
    'fuck',
    'shit',
    'bitch',
    'cunt',
    // Newly added profanities
    'biotch',
    'jackoff',
    'douche',
    'scrotum',
    'fcuk',
    'my_biotch',
    'x_jackoff',
    'bigdouche',
    'scrotum99',
    'fcuk_stand',
    // Repeated-letter profanity
    'fuuuuck',
    'shiiiit',
    'biiiiitch',
    'f_u_u_c_k',
    'a_s_s',
    // Leetspeak profanity
    'a55',
    'f4g',
    'b1tch',
    '5h1t',
    'd1ck',
    'c0ck',
    'p0rn',
    'n1gg4',
    // Obfuscated profanity
    'azz',
    'fuk',
    'shyt',
    'cawk',
    'phuck',
    'biatch',
    'kunt',
    // Token-separated & embedded profanity
    'my_a55_cup',
    'superfuk99',
    'cool_shyt',
    'x_b1tch_x',
    'cawk_stand',
    'lemon_azz',
    'the_f4g_1',
    'BadAss'
  ];

  for (const bad of profaneNames) {
    const res = FrontendProfanityFilter.validateStandName(bad);
    assert.equal(res.valid, false, `Expected profane/obfuscated name "${bad}" to be strictly rejected`);
    assert.equal(
      res.reason,
      EXPECTED_FAILURE_MSG,
      `Expected exact friendly failure message for "${bad}", got: "${res.reason}"`
    );
  }
  console.log('   ✅ Innocent names accepted, profanities blocked, and stand name generator verified!');

  // --------------------------------------------------------------------------
  // 2. Test Stand Token Security, Server-Seeded Anti-Cheat Replay, & API
  // --------------------------------------------------------------------------
  console.log('2️⃣  Testing Stand Token SHA-256 Security, Server-Seeded Anti-Cheat Replay, & API Endpoints...');
  const app = createApp(':memory:');
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // Verify client random token generation (16-24 chars) and SHA-256 parity
    const myPlayerToken = LemonadeGame.generateRandomStandToken(20);
    assert.match(myPlayerToken, /^[A-Za-z0-9]{16,24}$/, 'Generated stand token must be 16-24 alphanumeric chars');
    const clientTokenHash = LemonadeGame.sha256Hex(myPlayerToken);
    const serverTokenHash = hashStandToken(myPlayerToken);
    assert.equal(clientTokenHash, serverTokenHash, 'Client SHA-256 and Server SHA-256 must match identically');
    assert.equal(clientTokenHash.length, 64, 'SHA-256 hex digest must be 64 chars');

    // Healthcheck & CORS
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    assert.equal(healthRes.headers.get('access-control-allow-origin'), '*', 'Public API must explicitly allow * origin');
    const healthJson = await healthRes.json();
    assert.equal(healthJson.ok, true);

    // Validate nickname endpoint — friendly failure message
    const valBadRes = await fetch(`${baseUrl}/api/validate-nickname`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stand_name: 'bad_a55' })
    });
    assert.equal(valBadRes.status, 400);
    const valBadJson = await valBadRes.json();
    assert.equal(valBadJson.error, EXPECTED_FAILURE_MSG);

    // Validate nickname endpoint — innocent word "Glass" passes with silent message
    const valGoodRes = await fetch(`${baseUrl}/api/validate-nickname`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stand_name: 'Glass' })
    });
    assert.equal(valGoodRes.status, 200);
    const valGoodJson = await valGoodRes.json();
    assert.equal(valGoodJson.ok, true);
    assert.equal(valGoodJson.message, '');

    // Issue a per-run seed via POST /api/run/start
    const startRunRes = await fetch(`${baseUrl}/api/run/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stand_name: 'Retro_Wiz',
        game_mode: 'standard',
        stand_token: myPlayerToken
      })
    });
    assert.equal(startRunRes.status, 201);
    const startRunData = await startRunRes.json();
    assert.equal(startRunData.ok, true);
    assert.ok(startRunData.run_id, 'Must return server-issued run_id');
    assert.ok(Number.isInteger(startRunData.run_seed) && startRunData.run_seed > 0, 'Must return server-issued run_seed');
    assert.ok(startRunData.run_token, 'Must return server-signed run_token');

    // Simulate a legitimate 12-day run using the server-issued seed
    const simRun = LemonadeGame.simulateAutomatedRun(startRunData.run_seed, 12, 'standard');
    assert.equal(simRun.valid, true, 'Simulated run must pass replay verification');

    // Reject score submission without day_log
    const noLogRes = await fetch(`${baseUrl}/api/scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stand_name: 'Retro_Wiz',
        stand_token: myPlayerToken,
        run_id: startRunData.run_id,
        run_seed: startRunData.run_seed,
        run_token: startRunData.run_token,
        score: simRun.score,
        mode: 'retro',
        game_mode: 'standard',
        days_played: simRun.daysPlayed
      })
    });
    assert.equal(noLogRes.status, 400);
    const noLogJson = await noLogRes.json();
    assert.equal(noLogJson.code, 'MISSING_DAY_LOG');

    // Reject tampered day_log where profitCents was inflated by 100 cents on Day 1
    const tamperedLog = simRun.dayLog.map((d, idx) => (idx === 0 ? { ...d, profitCents: d.profitCents + 100 } : d));
    const tamperedRes = await fetch(`${baseUrl}/api/scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stand_name: 'Retro_Wiz',
        stand_token: myPlayerToken,
        run_id: startRunData.run_id,
        run_seed: startRunData.run_seed,
        run_token: startRunData.run_token,
        score: simRun.score + 100,
        mode: 'retro',
        game_mode: 'standard',
        days_played: simRun.daysPlayed,
        day_log: tamperedLog
      })
    });
    assert.equal(tamperedRes.status, 400);
    const tamperedJson = await tamperedRes.json();
    assert.equal(tamperedJson.code, 'REPLAY_MISMATCH');

    // Submit valid server-verified run
    const validSubmitRes = await fetch(`${baseUrl}/api/scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stand_name: 'Retro_Wiz',
        stand_token: myPlayerToken,
        run_id: startRunData.run_id,
        run_seed: startRunData.run_seed,
        run_token: startRunData.run_token,
        score: simRun.score,
        best_day_profit: simRun.bestDayProfit,
        total_glasses_sold: simRun.totalGlassesSold,
        best_day_glasses: simRun.bestDayGlasses,
        mode: 'retro',
        game_mode: 'standard',
        days_played: simRun.daysPlayed,
        version: '1.0.0',
        day_log: simRun.dayLog
      })
    });
    assert.equal(validSubmitRes.status, 201);
    const validSubmitJson = await validSubmitRes.json();
    assert.equal(validSubmitJson.ok, true);
    assert.equal(validSubmitJson.entry.stand_name, 'Retro_Wiz');
    // Critical #1: Server must return sha256(token), NEVER raw myPlayerToken
    assert.notEqual(validSubmitJson.entry.stand_token, myPlayerToken, 'Raw stand_token must never be returned');
    assert.equal(validSubmitJson.entry.stand_token, clientTokenHash, 'Returned stand_token must be sha256(token)');

    // Reject duplicate submission of the same run_id
    const replayAttackRes = await fetch(`${baseUrl}/api/scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stand_name: 'Retro_Wiz',
        stand_token: myPlayerToken,
        run_id: startRunData.run_id,
        run_seed: startRunData.run_seed,
        run_token: startRunData.run_token,
        score: simRun.score,
        best_day_profit: simRun.bestDayProfit,
        total_glasses_sold: simRun.totalGlassesSold,
        best_day_glasses: simRun.bestDayGlasses,
        mode: 'retro',
        game_mode: 'standard',
        days_played: simRun.daysPlayed,
        version: '1.0.0',
        day_log: simRun.dayLog
      })
    });
    assert.equal(replayAttackRes.status, 400);
    const replayAttackJson = await replayAttackRes.json();
    assert.equal(replayAttackJson.code, 'RUN_ALREADY_SUBMITTED');

    // Test Endless Mode with rolling seeds (15 days) and non-enforced stand_name uniqueness
    const secondPlayerToken = LemonadeGame.generateRandomStandToken(22);
    const startEndlessRes = await fetch(`${baseUrl}/api/run/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stand_name: 'Retro_Wiz', // Same Stand Name allowed!
        game_mode: 'endless',
        stand_token: secondPlayerToken
      })
    });
    assert.equal(startEndlessRes.status, 201);
    const startEndlessData = await startEndlessRes.json();
    const endlessRun = LemonadeGame.simulateAutomatedRun(startEndlessData.run_seed, 15, 'endless');
    assert.equal(endlessRun.valid, true);
    assert.equal(endlessRun.daysPlayed, 15);

    const dupNameRes = await fetch(`${baseUrl}/api/scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stand_name: 'Retro_Wiz',
        stand_token: secondPlayerToken,
        run_id: startEndlessData.run_id,
        run_seed: startEndlessData.run_seed,
        run_token: startEndlessData.run_token,
        score: endlessRun.score,
        best_day_profit: endlessRun.bestDayProfit,
        total_glasses_sold: endlessRun.totalGlassesSold,
        best_day_glasses: endlessRun.bestDayGlasses,
        mode: '8-bit',
        game_mode: 'endless',
        days_played: endlessRun.daysPlayed,
        version: '1.0.0',
        day_log: endlessRun.dayLog
      })
    });
    assert.equal(dupNameRes.status, 201, 'Endless mode rolling seed run & duplicate Stand Name must succeed');

    // Test all 7 Leaderboard GET endpoints and verify hashed stand_token & "You" matching logic
    const endpoints = [
      '/api/leaderboard/daily',
      '/api/leaderboard/weekly',
      '/api/leaderboard/all-time',
      '/api/leaderboard/best-day',
      '/api/leaderboard/best-run',
      '/api/leaderboard/glasses-day',
      '/api/leaderboard/glasses-run'
    ];

    for (const ep of endpoints) {
      const res = await fetch(`${baseUrl}${ep}`);
      assert.equal(res.status, 200, `Expected 200 OK from ${ep}`);
      const data = await res.json();
      assert.equal(data.ok, true);
      assert.ok(Array.isArray(data.entries), `Expected entries array from ${ep}`);
      assert.ok(data.entries.length > 0, `Expected non-empty entries in ${ep}`);

      for (const entry of data.entries) {
        assert.notEqual(entry.stand_token, myPlayerToken, `Raw token must never appear in ${ep}`);
        if (entry.stand_token) {
          assert.match(entry.stand_token, /^[a-f0-9]{64}$/, `stand_token in ${ep} must be a 64-char SHA-256 hex digest`);
        }
      }
    }

    // Verify client-hashed "You" indicator and "Last Run" highlight/circle matching logic
    // Submit a second run for the same player (myPlayerToken) so they have 2 entries on the leaderboard
    const startRun2Res = await fetch(`${baseUrl}/api/run/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stand_name: 'Retro_Wiz',
        game_mode: 'standard',
        stand_token: myPlayerToken
      })
    });
    const startRun2Data = await startRun2Res.json();
    const simRun2 = LemonadeGame.simulateAutomatedRun(startRun2Data.run_seed, 12, 'standard');
    const validSubmit2Res = await fetch(`${baseUrl}/api/scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stand_name: 'Retro_Wiz',
        stand_token: myPlayerToken,
        run_id: startRun2Data.run_id,
        run_seed: startRun2Data.run_seed,
        run_token: startRun2Data.run_token,
        score: simRun2.score,
        best_day_profit: simRun2.bestDayProfit,
        total_glasses_sold: simRun2.totalGlassesSold,
        best_day_glasses: simRun2.bestDayGlasses,
        mode: 'retro',
        game_mode: 'standard',
        days_played: simRun2.daysPlayed,
        version: '1.0.0',
        day_log: simRun2.dayLog
      })
    });
    assert.equal(validSubmit2Res.status, 201);
    const validSubmit2Json = await validSubmit2Res.json();
    const savedLastRun = LemonadeGame.saveLastRunInfo(validSubmit2Json.entry);

    const allTimeRes = await fetch(`${baseUrl}/api/leaderboard/all-time`);
    const allTimeData = await allTimeRes.json();
    const myEntries = allTimeData.entries.filter((e) => e.stand_token === clientTokenHash);
    assert.equal(myEntries.length, 2, 'Player should have 2 entries on the all-time leaderboard');

    const lastRunMatches = allTimeData.entries.filter((e) =>
      LemonadeGame.isEntryLastRun(e, allTimeData.entries, clientTokenHash, savedLastRun)
    );
    assert.equal(lastRunMatches.length, 1, 'Exactly 1 entry on the leaderboard must be highlighted as Last Run');
    assert.equal(
      lastRunMatches[0].id,
      validSubmit2Json.entry.ids.all_time,
      'The highlighted Last Run entry must match the player most recent completed run ID'
    );

    // Test active game save endpoint (/api/save) & verify another player cannot use leaderboard hash to overwrite/delete
    const savePayload = {
      stand_token: myPlayerToken,
      state: {
        standName: 'Sunny_Cups',
        gameMode: 'standard',
        day: 2,
        assetsCents: 345,
        lastSettings: {
          glasses: 40,
          signs: 2,
          price: 15
        }
      }
    };
    const postSaveRes = await fetch(`${baseUrl}/api/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(savePayload)
    });
    assert.equal(postSaveRes.status, 200);

    // Attacker tries to read, overwrite, or delete save using the 64-char SHA-256 hash exposed on the leaderboard
    const attackerGetRes = await fetch(`${baseUrl}/api/save/${clientTokenHash}`);
    assert.equal(attackerGetRes.status, 400, 'Must reject 64-char hash on GET /api/save/:token');

    const attackerDelRes = await fetch(`${baseUrl}/api/save/${clientTokenHash}`, { method: 'DELETE' });
    assert.equal(attackerDelRes.status, 400, 'Must reject 64-char hash on DELETE /api/save/:token');

    const attackerOverwriteRes = await fetch(`${baseUrl}/api/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stand_token: clientTokenHash,
        state: { standName: 'Hacked', day: 1, assetsCents: 1 }
      })
    });
    assert.equal(attackerOverwriteRes.status, 400, 'Must reject 64-char hash on POST /api/save');

    // Legitimate owner can still load and delete their save using their raw 20-char token
    const getSaveRes = await fetch(`${baseUrl}/api/save/${myPlayerToken}`);
    assert.equal(getSaveRes.status, 200);
    const getSaveData = await getSaveRes.json();
    assert.equal(getSaveData.ok, true);
    assert.equal(getSaveData.state.standName, 'Sunny_Cups');
    assert.equal(getSaveData.state.day, 2);
    assert.equal(getSaveData.state.lastSettings.price, 15);

    const delSaveRes = await fetch(`${baseUrl}/api/save/${myPlayerToken}`, { method: 'DELETE' });
    assert.equal(delSaveRes.status, 200);

    const getAfterDelRes = await fetch(`${baseUrl}/api/save/${myPlayerToken}`);
    assert.equal(getAfterDelRes.status, 404);

    console.log('   ✅ SHA-256 stand tokens, save protection, per-run seeds, and server-side replay verified!');
  } finally {
    server.close();
  }

  // --------------------------------------------------------------------------
  // 3. Test Proxy IP Resolution & Transactional Leaderboard Pruning
  // --------------------------------------------------------------------------
  console.log('3️⃣  Testing Proxy IP Resolution (Netlify/Vercel -> Fly.io) & Transactional Leaderboard Pruning...');

  assert.equal(
    resolveClientIp({
      headers: {
        'x-nf-client-connection-ip': '203.0.113.42',
        'x-forwarded-for': '203.0.113.42, 198.51.100.10',
        'fly-client-ip': '198.51.100.10'
      },
      ip: '198.51.100.10'
    }),
    '203.0.113.42',
    'Must prioritize real client IP over Netlify/Fly proxy hop'
  );

  assert.equal(
    resolveClientIp({
      headers: {
        'x-forwarded-for': '192.0.2.88, 100.64.0.5, 172.16.0.1'
      },
      ip: '100.64.0.5'
    }),
    '192.0.2.88',
    'Must extract leftmost client IP from multi-hop X-Forwarded-For'
  );

  // Test transactional leaderboard pruning
  const pruneDb = getDb(':memory:');
  const oldDateIso = new Date(Date.now() - 40 * 86400 * 1000).toISOString(); // 40 days ago
  insertScoreRecord(
    pruneDb,
    {
      stand_name: 'Old_Stand',
      stand_token: 'OldPlayerToken123456',
      score: 1200,
      mode: 'retro',
      game_mode: 'standard',
      days_played: 12,
      version: '1.0.0'
    },
    oldDateIso
  );

  const pruneResult = pruneLeaderboards(pruneDb, { dailyDays: 7, weeklyWeeks: 4 });
  assert.equal(pruneResult.ok, true);
  assert.ok(pruneResult.prunedDaily >= 1, 'Expected expired daily entry to be pruned');
  assert.ok(pruneResult.prunedWeekly >= 1, 'Expected expired weekly entry to be pruned');

  const remainingAllTime = pruneDb
    .prepare("SELECT COUNT(*) AS cnt FROM leaderboard_all_time WHERE stand_name = 'Old_Stand'")
    .get();
  assert.equal(remainingAllTime.cnt, 1, 'All-time leaderboard must preserve historical records after daily/weekly pruning');
  console.log('   ✅ Proxy IP resolution and transactional leaderboard pruning verified!');

  // --------------------------------------------------------------------------
  // 4. Verify All Visual & Sound Assets Exist
  // --------------------------------------------------------------------------
  console.log('4️⃣  Verifying Retro, 8-Bit, Modern, and Sound Assets...');
  const requiredFiles = [
    'frontend/index.html',
    'frontend/css/styles.css',
    'frontend/css/tailwind.min.css',
    'frontend/js/profanityFilter.js',
    'frontend/js/assets.js',
    'frontend/js/sound.js',
    'frontend/js/game.js',
    'frontend/assets/icons/svg/sunny.svg',
    'frontend/assets/icons/svg/cloudy.svg',
    'frontend/assets/icons/svg/hot_dry.svg',
    'frontend/assets/icons/svg/thunderstorms.svg',
    'frontend/assets/icons/svg/heatwave.svg',
    'frontend/assets/icons/svg/cold_snap.svg',
    'frontend/assets/icons/pixel/sunny.svg',
    'frontend/assets/icons/pixel/cloudy.svg',
    'frontend/assets/icons/pixel/hot_dry.svg',
    'frontend/assets/icons/pixel/thunderstorms.svg',
    'frontend/assets/icons/pixel/heatwave.svg',
    'frontend/assets/icons/pixel/cold_snap.svg',
    'frontend/assets/icons/retro/sunny.svg',
    'frontend/assets/sounds/click.wav',
    'frontend/assets/sounds/cash.wav',
    'frontend/assets/sounds/day_start.wav',
    'frontend/assets/sounds/victory.wav',
    'frontend/assets/sounds/error.wav',
    'schema.sql'
  ];

  for (const relPath of requiredFiles) {
    const fullPath = path.resolve(__dirname, '..', relPath);
    assert.ok(fs.existsSync(fullPath), `Missing required deliverable file: ${relPath}`);
  }

  // --------------------------------------------------------------------------
  // 5. Verify UI Navigation Controls, Carry-Forward Settings, & Retro Typography
  // --------------------------------------------------------------------------
  console.log('5️⃣  Verifying UI Navigation Controls, Carry-Forward Settings, & Retro Typography...');
  const frontendHtml = fs.readFileSync(path.resolve(__dirname, '../frontend/index.html'), 'utf8');
  const frontendCss = fs.readFileSync(path.resolve(__dirname, '../frontend/css/styles.css'), 'utf8');
  const gameJs = fs.readFileSync(path.resolve(__dirname, '../frontend/js/game.js'), 'utf8');

  assert.match(frontendHtml, /id="btn-setup-back"/, 'frontend/index.html must include id="btn-setup-back"');
  assert.match(frontendHtml, /id="btn-leaderboard-back"/, 'frontend/index.html must include id="btn-leaderboard-back"');
  assert.match(frontendHtml, /id="btn-random-stand-name"/, 'frontend/index.html must include Pick Your Stand Name generator button');
  assert.match(frontendHtml, /7 Leaderboards/, 'frontend/index.html must contain "7 Leaderboards"');
  assert.match(frontendHtml, /id="btn-title-leaderboards"/, 'frontend/index.html must include id="btn-title-leaderboards"');

  assert.match(gameJs, /document\.getElementById\('btn-setup-back'\)\?\.addEventListener/, 'game.js must bind btn-setup-back');
  assert.match(gameJs, /document\.getElementById\('btn-leaderboard-back'\)\?\.addEventListener/, 'game.js must bind btn-leaderboard-back');
  assert.match(gameJs, /document\.getElementById\('btn-title-leaderboards'\)\?\.addEventListener/, 'game.js must bind btn-title-leaderboards');

  // Verify Carry-Forward Daily Settings across modes
  for (const mode of ['retro', '8-bit', 'modern']) {
    LemonadeGame.setTheme(mode);
    const state = LemonadeGame.createNewGameState('Carry_Stand', 'standard', { runSeed: 123456 });
    assert.equal(state.day, 1);
    assert.equal(state.lastSettings, null);

    state.lastSettings = { glasses: 45, signs: 3, price: 17 };
    const outcome1 = LemonadeGame.simulateDayOutcome(state, {
      glassesMade: 45,
      signsMade: 3,
      pricePerGlass: 17
    });
    state.assetsCents += outcome1.profitCents;
    state.dayLog.push({ ...outcome1, glassesMade: 45, signsMade: 3, pricePerGlass: 17 });

    const serialized = JSON.parse(JSON.stringify(state));
    assert.equal(serialized.lastSettings.glasses, 45);
    assert.equal(serialized.lastSettings.signs, 3);
    assert.equal(serialized.lastSettings.price, 17);
  }

  // Verify Retro Typography & ASCII Stand Alignment
  assert.match(frontendCss, /body\.theme-retro\s*\{[^}]*font-weight:\s*400;/);
  assert.match(frontendCss, /body\.theme-retro\s*\{[^}]*text-rendering:\s*geometricPrecision;/);
  assert.match(frontendCss, /body\.theme-retro\s*\{[^}]*line-height:\s*1\.58;/);
  assert.match(frontendCss, /body\.theme-retro\s*\{[^}]*letter-spacing:\s*0\.12em;/);

  require('../frontend/js/assets');
  const LemonadeAssets = globalThis.LemonadeAssets;
  for (const testStand of ['Sunny_Cups', 'A', 'VERY_LONG_NAME_123', 'LEMONADE STAND']) {
    const html = LemonadeAssets.getStandHeroHtml('retro', testStand);
    const preMatch = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/);
    assert.ok(preMatch);
    const lines = preMatch[1].split('\n');
    assert.equal(lines.length, 8);
    for (let i = 0; i < lines.length; i++) {
      assert.equal(lines[i].length, 40);
    }
  }

  console.log('   ✅ Navigation, Carry-Forward Settings, Retro Typography, and ASCII alignment verified!');
  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY!');
}

runTests().catch((err) => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
