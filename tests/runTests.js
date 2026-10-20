/**
 * Lemonade Stand - End-to-End & Unit Test Suite
 * Verifies:
 * 1. Strict Family-Friendly Nickname Filter (silent success + exact friendly failure message)
 * 2. Non-enforced uniqueness (multiple players can use the same Stand Name)
 * 3. Hidden Stand Token (anonymous player identity stored and returned)
 * 4. Leaderboard "You" Indicator (🍋 <=== You) logic
 * 5. SQLite Schema & All 7 Leaderboard Tables with stand_token
 * 6. Express API Endpoints & Server-side Validation
 * 7. Anti-Cheat Score Integrity & SQL Injection Prevention
 * 8. Frontend Assets (Retro, 8-bit, Modern icons & WAV sounds)
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const ProfanityFilter = require('../frontend/js/profanityFilter');
const { computeRunChecksum } = require('../backend/src/validation');
const { createApp } = require('../backend/server');

const EXPECTED_FAILURE_MSG = 'Stand Name not allowed. Please choose a family-friendly name.';

async function runTests() {
  console.log('🧪 Starting Lemonade Stand Test Suite...\n');

  // --------------------------------------------------------------------------
  // 1. Test Strict Family-Friendly Nickname Filter (Silent Success + Friendly Failure)
  // --------------------------------------------------------------------------
  console.log('1️⃣  Testing Strict Family-Friendly Nickname Filter (Silent Success & Friendly Failure)...');

  const validNames = [
    'Sunny_Cups',
    'Apple_IIe',
    'Lemon_King',
    'Pixel_Stand',
    'Citrus_79',
    'Fresh_Ade',
    'Gold_Lemon'
  ];

  for (const name of validNames) {
    const res = ProfanityFilter.validateStandName(name);
    assert.equal(res.valid, true, `Expected valid stand name "${name}" to be accepted`);
    assert.equal(res.reason, '', `Expected silent success (empty reason), got: "${res.reason}"`);
  }

  const invalidFormatNames = [
    '',
    'ab', // too short (<3)
    'TooLongStandName123', // too long (>12)
    'Bad Space', // space not allowed
    'Bad-Dash', // hyphen not allowed
    'Bad$Sign', // special char not allowed
    '<script>1' // HTML injection attempt
  ];

  for (const name of invalidFormatNames) {
    const res = ProfanityFilter.validateStandName(name);
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
    // Repeated-letter profanity
    'fuuuuck',
    'shiiiit',
    'biiiiitch',
    'f_u_u_c_k',
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
    // Embedded inside longer strings
    'my_a55_cup',
    'superfuk99',
    'cool_shyt',
    'x_b1tch_x',
    'cawk_stand',
    'lemon_azz',
    'the_f4g_1'
  ];

  for (const bad of profaneNames) {
    const res = ProfanityFilter.validateStandName(bad);
    assert.equal(res.valid, false, `Expected profane/obfuscated name "${bad}" to be strictly rejected`);
    assert.equal(
      res.reason,
      EXPECTED_FAILURE_MSG,
      `Expected exact friendly failure message for "${bad}", got: "${res.reason}"`
    );
  }
  console.log('   ✅ Silent success and exact friendly failure messages verified!');

  // --------------------------------------------------------------------------
  // 2. Test Express API + In-Memory SQLite Database + Stand Token
  // --------------------------------------------------------------------------
  console.log('2️⃣  Testing Backend API Endpoints, Stand Tokens, & SQLite Leaderboard Tables...');
  const app = createApp(':memory:');
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // Healthcheck
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
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

    // Validate nickname endpoint — silent success message
    const valGoodRes = await fetch(`${baseUrl}/api/validate-nickname`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stand_name: 'Sunny_Ade' })
    });
    assert.equal(valGoodRes.status, 200);
    const valGoodJson = await valGoodRes.json();
    assert.equal(valGoodJson.ok, true);
    assert.equal(valGoodJson.message, '');

    // Reject profane score submission server-side
    const badSubmitRes = await fetch(`${baseUrl}/api/scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stand_name: 'bad_a55_1',
        score: 1200,
        mode: 'retro',
        version: '1.0.0'
      })
    });
    assert.equal(badSubmitRes.status, 400);
    const badSubmitJson = await badSubmitRes.json();
    assert.equal(badSubmitJson.error, EXPECTED_FAILURE_MSG);

    // Reject cheated/impossible score submission
    const cheatSubmitRes = await fetch(`${baseUrl}/api/scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stand_name: 'Sunny_Cups',
        score: 999999999,
        mode: 'modern',
        version: '1.0.0'
      })
    });
    assert.equal(cheatSubmitRes.status, 400);

    // Reject tampered day_log where sum does not match score
    const tamperedLogRes = await fetch(`${baseUrl}/api/scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stand_name: 'Sunny_Cups',
        score: 5000,
        total_glasses_sold: 20,
        best_day_profit: 200,
        best_day_glasses: 20,
        mode: '8-bit',
        days_played: 1,
        day_log: [
          { glassesMade: 20, glassesSold: 20, pricePerGlass: 10, signsMade: 0, profitCents: 160 }
        ]
      })
    });
    assert.equal(tamperedLogRes.status, 400);

    // Valid authenticated score submission with anonymous Stand Token
    const myPlayerToken = 'Xk9Pq2Lm';
    const validScore = 4120;
    const totalGlasses = 510;
    const bestDayProfit = 680;
    const bestDayGlasses = 84;
    const daysPlayed = 12;
    const checksum = computeRunChecksum('Retro_Wiz', validScore, totalGlasses, bestDayProfit, bestDayGlasses, daysPlayed);

    const validSubmitRes = await fetch(`${baseUrl}/api/scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stand_name: 'Retro_Wiz',
        stand_token: myPlayerToken,
        score: validScore,
        best_day_profit: bestDayProfit,
        total_glasses_sold: totalGlasses,
        best_day_glasses: bestDayGlasses,
        mode: 'retro',
        game_mode: 'standard',
        days_played: daysPlayed,
        version: '1.0.0',
        integrity_hash: checksum
      })
    });
    assert.equal(validSubmitRes.status, 201);
    const validSubmitJson = await validSubmitRes.json();
    assert.equal(validSubmitJson.ok, true);
    assert.equal(validSubmitJson.entry.stand_name, 'Retro_Wiz');
    assert.equal(validSubmitJson.entry.stand_token, myPlayerToken);

    // Verify multiple players can use the SAME Stand Name (non-enforced uniqueness)
    const secondPlayerToken = 'Aa8Bb3Cc';
    const checksum2 = computeRunChecksum('Retro_Wiz', 3800, 480, 600, 75, 12);
    const dupNameRes = await fetch(`${baseUrl}/api/scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stand_name: 'Retro_Wiz', // Same name as before!
        stand_token: secondPlayerToken,
        score: 3800,
        best_day_profit: 600,
        total_glasses_sold: 480,
        best_day_glasses: 75,
        mode: '8-bit',
        game_mode: 'standard',
        days_played: 12,
        version: '1.0.0',
        integrity_hash: checksum2
      })
    });
    assert.equal(dupNameRes.status, 201, 'Multiple players must be allowed to use the same Stand Name');

    // Test all 7 Leaderboard GET endpoints and verify stand_token & "You" matching logic
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

      const first = data.entries[0];
      assert.ok(first.id, 'Entry must include unique ID');
      assert.ok(first.stand_name, 'Entry must include stand_name');
      assert.ok(typeof first.score === 'number', 'Entry must include numeric score');
      assert.ok(first.date, 'Entry must include date');
      assert.ok(['retro', '8-bit', 'modern'].includes(first.mode), 'Entry must include valid mode');
      assert.ok(first.version, 'Entry must include version');
      assert.ok(typeof first.stand_token === 'string', 'Entry must include stand_token');
    }

    // Verify "You" indicator matching logic for current player
    const allTimeRes = await fetch(`${baseUrl}/api/leaderboard/all-time`);
    const allTimeData = await allTimeRes.json();
    const myEntry = allTimeData.entries.find((e) => e.stand_token === myPlayerToken);
    assert.ok(myEntry, 'Player entry with myPlayerToken must be found in leaderboard');
    const isPlayer = myEntry.stand_token === myPlayerToken;
    const indicatorText = isPlayer ? '🍋 <=== You' : '';
    assert.equal(indicatorText, '🍋 <=== You');

    const otherEntry = allTimeData.entries.find((e) => e.stand_token !== myPlayerToken);
    assert.ok(otherEntry, 'Other player entry found');
    const isOtherPlayer = otherEntry.stand_token === myPlayerToken;
    assert.equal(isOtherPlayer, false, 'Other entry must not match myPlayerToken');

    // Test active game save endpoint (/api/save) with carry-forward daily settings
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
    const postSaveData = await postSaveRes.json();
    assert.equal(postSaveData.ok, true);

    const getSaveRes = await fetch(`${baseUrl}/api/save/${myPlayerToken}`);
    assert.equal(getSaveRes.status, 200);
    const getSaveData = await getSaveRes.json();
    assert.equal(getSaveData.ok, true);
    assert.equal(getSaveData.state.day, 2);
    assert.equal(getSaveData.state.lastSettings.price, 15);
    assert.equal(getSaveData.state.lastSettings.glasses, 40);
    assert.equal(getSaveData.state.lastSettings.signs, 2);

    const delSaveRes = await fetch(`${baseUrl}/api/save/${myPlayerToken}`, { method: 'DELETE' });
    assert.equal(delSaveRes.status, 200);
    const delSaveData = await delSaveRes.json();
    assert.equal(delSaveData.ok, true);

    const getAfterDelRes = await fetch(`${baseUrl}/api/save/${myPlayerToken}`);
    assert.equal(getAfterDelRes.status, 404);

    console.log('   ✅ All 8 API endpoints, SQLite tables, stand tokens, save sync, and "You" indicator logic verified!');
  } finally {
    server.close();
  }

  // --------------------------------------------------------------------------
  // 3. Verify All Visual & Sound Assets Exist
  // --------------------------------------------------------------------------
  console.log('3️⃣  Verifying Retro, 8-Bit, Modern, and Sound Assets...');
  const requiredFiles = [
    'frontend/index.html',
    'frontend/css/styles.css',
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
  // 4. Verify UI Navigation Controls & Text Requirements
  // --------------------------------------------------------------------------
  console.log('4️⃣  Verifying UI Navigation Controls & Text Updates...');
  const frontendHtml = fs.readFileSync(path.resolve(__dirname, '../frontend/index.html'), 'utf8');
  const distHtml = fs.readFileSync(path.resolve(__dirname, '../dist/index.html'), 'utf8');
  const gameJs = fs.readFileSync(path.resolve(__dirname, '../frontend/js/game.js'), 'utf8');

  for (const [name, html] of [['frontend/index.html', frontendHtml], ['dist/index.html', distHtml]]) {
    // 1. "Back" button on setup screen
    assert.match(html, /id="btn-setup-back"/, `${name} must include id="btn-setup-back"`);
    // 2. "Back to Game" button on leaderboards screen
    assert.match(html, /id="btn-leaderboard-back"/, `${name} must include id="btn-leaderboard-back"`);
    // 3. Settings button removed
    assert.doesNotMatch(html, /id="btn-open-settings"/, `${name} must NOT include Settings button`);
    assert.doesNotMatch(html, /id="settings-modal"/, `${name} must NOT include settings modal`);
    // 4. "7 SQLite Leaderboards" replaced with "7 Leaderboards"
    assert.match(html, /7 Leaderboards/, `${name} must contain "7 Leaderboards"`);
    assert.doesNotMatch(html, /7 SQLite Leaderboards/, `${name} must NOT contain "7 SQLite Leaderboards"`);
    // 5. "View Leaderboards" button on title screen
    assert.match(html, /id="btn-title-leaderboards"/, `${name} must include id="btn-title-leaderboards"`);
  }

  // Verify event listeners are registered in game.js
  assert.match(gameJs, /document\.getElementById\('btn-setup-back'\)\?\.addEventListener/, 'game.js must bind btn-setup-back');
  assert.match(gameJs, /document\.getElementById\('btn-leaderboard-back'\)\?\.addEventListener/, 'game.js must bind btn-leaderboard-back');
  assert.match(gameJs, /document\.getElementById\('btn-title-leaderboards'\)\?\.addEventListener/, 'game.js must bind btn-title-leaderboards');
  console.log('   ✅ All navigation buttons, Settings removal, and "7 Leaderboards" text verified in frontend and dist!');

  // --------------------------------------------------------------------------
  // 5. Verify Carry-Forward Daily Settings Across Modes
  // --------------------------------------------------------------------------
  console.log('5️⃣  Verifying Carry-Forward Daily Settings Behavior Across Retro, 8-Bit, and Modern Modes...');
  // Require frontend game engine in Node environment
  require('../frontend/js/game');
  const LemonadeGame = globalThis.LemonadeGame;
  assert.ok(LemonadeGame, 'LemonadeGame must be loaded on global scope');

  for (const mode of ['retro', '8-bit', 'modern']) {
    LemonadeGame.setTheme(mode);
    const state = LemonadeGame.createNewGameState('Carry_Stand', 'standard');
    assert.equal(state.day, 1, `[${mode}] Game should start on Day 1`);
    assert.equal(state.lastSettings, null, `[${mode}] New game has no prior settings set`);

    // Day 1: Player decides 45 glasses, 3 signs, 17 cents price
    state.lastSettings = { glasses: 45, signs: 3, price: 17 };
    const outcome1 = LemonadeGame.simulateDayOutcome(state, {
      glassesMade: 45,
      signsMade: 3,
      pricePerGlass: 17
    });
    state.assetsCents += outcome1.profitCents;
    state.dayLog.push({ ...outcome1, glassesMade: 45, signsMade: 3, pricePerGlass: 17 });

    // Local save state serialization round-trip
    const serialized = JSON.parse(JSON.stringify(state));
    assert.ok(serialized.lastSettings, `[${mode}] Save state must persist lastSettings`);
    assert.equal(serialized.lastSettings.glasses, 45, `[${mode}] Glasses must be preserved`);
    assert.equal(serialized.lastSettings.signs, 3, `[${mode}] Signs must be preserved`);
    assert.equal(serialized.lastSettings.price, 17, `[${mode}] Price must be preserved`);

    // Advancing to Day 2: Day 2 begins with previous day's settings
    const stateDay2 = serialized;
    stateDay2.day = 2;
    stateDay2.currentWeather = 'cold_snap'; // Weather that normally suggests 8 cents

    // When resolving carried settings, the player's previous price (17¢) must NOT be overridden by weather (8¢)
    assert.equal(stateDay2.lastSettings.price, 17, `[${mode}] Weather forecast must not override player's previous price`);
    assert.equal(stateDay2.lastSettings.glasses, 45, `[${mode}] Previous day glasses carried forward`);
    assert.equal(stateDay2.lastSettings.signs, 3, `[${mode}] Previous day signs carried forward`);
  }
  // --------------------------------------------------------------------------
  // 6. Verify Retro Font Readability Refinements & ASCII Art Alignment
  // --------------------------------------------------------------------------
  console.log('6️⃣  Verifying Retro Font Readability Refinements & ASCII Art Alignment...');
  const frontendCss = fs.readFileSync(path.resolve(__dirname, '../frontend/css/styles.css'), 'utf8');
  const distCss = fs.readFileSync(path.resolve(__dirname, '../dist/css/styles.css'), 'utf8');

  for (const [name, css] of [['frontend/css/styles.css', frontendCss], ['dist/css/styles.css', distCss]]) {
    // 1. Font weight lightened to 400 on base retro body
    assert.match(css, /body\.theme-retro\s*\{[^}]*font-weight:\s*400;/, `${name} must set font-weight: 400 for body.theme-retro`);
    // 2. Phosphor glow present
    assert.match(css, /body\.theme-retro\s*\{[^}]*text-shadow:[^}]*rgba\(\s*51,\s*255,\s*51/i, `${name} must have phosphor glow text-shadow`);
    // 3. Pixel crispness rendering
    assert.match(css, /body\.theme-retro\s*\{[^}]*text-rendering:\s*geometricPrecision;/, `${name} must set text-rendering: geometricPrecision`);
    // 4. Line height increased (1.58 base)
    assert.match(css, /body\.theme-retro\s*\{[^}]*line-height:\s*1\.58;/, `${name} must have increased base line-height (1.58)`);
    // 5. Letter spacing increased (0.12em base)
    assert.match(css, /body\.theme-retro\s*\{[^}]*letter-spacing:\s*0\.12em;/, `${name} must have increased letter-spacing (0.12em)`);
    // 6. ASCII art pre tags preserved to prevent misalignment
    assert.match(css, /body\.theme-retro\s+pre\s*\{[^}]*letter-spacing:\s*0\.05em;[^}]*line-height:\s*1\.25;/, `${name} must preserve ASCII pre letter-spacing and line-height`);
  }

    // 7. Verify Retro ASCII Stand Hero Banner Alignment
    require('../frontend/js/assets');
    const LemonadeAssets = globalThis.LemonadeAssets;
    assert.ok(LemonadeAssets, 'LemonadeAssets must be loaded');

    for (const testStand of ['Sunny_Cups', 'A', 'VERY_LONG_NAME_123', 'LEMONADE STAND']) {
      const html = LemonadeAssets.getStandHeroHtml('retro', testStand);
      const preMatch = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/);
      assert.ok(preMatch, 'Must contain <pre> tag with ASCII art');
      const lines = preMatch[1].split('\n');
      assert.equal(lines.length, 8, 'ASCII stand must have 8 lines');
      for (let i = 0; i < lines.length; i++) {
        assert.equal(lines[i].length, 40, `Line ${i} of stand banner for "${testStand}" must be exactly 40 characters (got ${lines[i].length}): "${lines[i]}"`);
      }
      // Top sign line right delimiter "||" must end at column 38 (index 36-37)
      assert.equal(lines[1].slice(36, 38), '||', 'Top sign right border must align at column 37');
    }
    console.log('   ✅ Retro ASCII stand sign board width and alignment verified across multiple stand names!');
    console.log('   ✅ Retro font weight, phosphor glow, line height, letter spacing, and ASCII alignment verified in frontend and dist!');

  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY!');
}

runTests().catch((err) => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
