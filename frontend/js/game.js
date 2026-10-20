/**
 * Lemonade Stand - Core Game Engine, State Persistence, and UI Controller
 * Recreates the classic Apple ][e Lemonade Stand mechanics with Retro, 8-Bit, and Modern modes.
 */
(function (root) {
  'use strict';

  const SAVE_KEY = 'lemonadestand_save_v1';
  const THEME_KEY = 'lemonadestand_theme';
  const NICKNAME_KEY = 'lemonadestand_nickname';
  const STAND_TOKEN_KEY = 'standToken';
  const GAME_VERSION = '1.0.0';
  const STARTING_ASSETS_CENTS = 200; // $2.00
  const SIGN_COST_CENTS = 15; // $0.15 per sign
  const FRIENDLY_FAILURE_MSG = 'Stand Name not allowed. Please choose a family-friendly name.';

  /**
   * Hidden, anonymous Stand Token stored in localStorage to distinguish leaderboard entries.
   * Generates a 6-10 character random token on first visit. Never displayed to user.
   */
  function getOrCreateStandToken() {
    try {
      let token = localStorage.getItem(STAND_TOKEN_KEY);
      if (!token || typeof token !== 'string' || token.length < 6 || token.length > 10) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let generated = '';
        for (let i = 0; i < 8; i++) {
          generated += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        token = generated;
        localStorage.setItem(STAND_TOKEN_KEY, token);
      }
      return token;
    } catch (_) {
      return 'anonUser8';
    }
  }

  // Weather Definitions
  const WEATHER_TYPES = {
    sunny: {
      key: 'sunny',
      label: 'Sunny & Clear',
      tempF: 78,
      demandMultiplier: 1.0,
      forecastText: 'Clear skies and pleasant sunshine across the neighborhood. Steady foot traffic expected.',
      rainChance: 0.05
    },
    cloudy: {
      key: 'cloudy',
      label: 'Cloudy & Overcast',
      tempF: 66,
      demandMultiplier: 0.62,
      forecastText: 'Overcast skies with a 30% chance of light rain. Cooler temperatures may reduce thirst.',
      rainChance: 0.30
    },
    hot_dry: {
      key: 'hot_dry',
      label: 'Hot & Dry',
      tempF: 94,
      demandMultiplier: 1.55,
      forecastText: 'A scorching, dry summer day! Neighbors will be very thirsty for cold lemonade.',
      rainChance: 0.0
    },
    thunderstorms: {
      key: 'thunderstorms',
      label: 'Thunderstorms',
      tempF: 63,
      demandMultiplier: 0.25,
      forecastText: 'Dark storm clouds gathering! High risk of severe thunderstorms shutting down outdoor sales.',
      rainChance: 0.85
    },
    heatwave: {
      key: 'heatwave',
      label: 'Extreme Heatwave',
      tempF: 103,
      demandMultiplier: 1.95,
      forecastText: 'HEATWAVE ADVISORY! Record-breaking triple-digit heat. Demand for cold drinks is sky-high!',
      rainChance: 0.0
    },
    cold_snap: {
      key: 'cold_snap',
      label: 'Chilly Cold Snap',
      tempF: 49,
      demandMultiplier: 0.38,
      forecastText: 'An unseasonable cold snap swept in overnight. Fewer customers are looking for cold drinks.',
      rainChance: 0.15
    }
  };

  // Random Event Definitions
  const RANDOM_EVENTS = {
    none: {
      id: 'none',
      title: 'Normal Neighborhood Day',
      description: 'Traffic flowed steadily along the sidewalk with no unusual disruptions.',
      badge: 'STEADY DAY',
      type: 'neutral'
    },
    thunderstorm_wipeout: {
      id: 'thunderstorm_wipeout',
      title: 'SEVERE THUNDERSTORM!',
      description: 'A sudden downpour and lightning storm hit right as you opened! Everyone ran indoors and all unsold lemonade spoiled.',
      badge: 'STORM WIPEOUT',
      type: 'danger'
    },
    street_crew_buys_all: {
      id: 'street_crew_buys_all',
      title: 'STREET CLOSURE — THIRSTY WORK CREW!',
      description: 'The street department closed your block for paving! Regular foot traffic stopped, but the thirsty road crew bought every glass you had at lunch!',
      badge: 'ROAD CREW BONUS',
      type: 'success'
    },
    street_closure_detour: {
      id: 'street_closure_detour',
      title: 'STREET CLOSED FOR REPAIRS',
      description: 'Barricades blocked the sidewalk for afternoon utility work, cutting neighborhood foot traffic in half.',
      badge: 'STREET DETOUR',
      type: 'warning'
    },
    wind_signs_blown: {
      id: 'wind_signs_blown',
      title: 'GUSTY WINDS BLEW AWAY SIGNS!',
      description: 'Strong mid-morning gusts blew down most of your handmade advertising signs, reducing your advertising boost.',
      badge: 'WINDY GUSTS',
      type: 'warning'
    },
    supply_shortage: {
      id: 'supply_shortage',
      title: 'LEMON & SUGAR SUPPLY SHORTAGE',
      description: 'A local grocery shortage spiked ingredient prices today (+2¢ extra per glass to prepare).',
      badge: 'SUPPLY SHORTAGE',
      type: 'warning'
    },
    bonus_demand: {
      id: 'bonus_demand',
      title: 'NEIGHBORHOOD BLOCK PARTY!',
      description: 'A lively community parade and block party marched right past your stand,nearly doubling thirsty customers!',
      badge: 'BONUS DEMAND',
      type: 'success'
    }
  };

  // Application State
  let currentTheme = 'modern';
  let activeScreen = 'title';
  let previousScreen = 'title';
  let activeLeaderboardTab = 'all-time';
  let activeLeaderboardModeFilter = '';
  let gameState = null;

  /**
   * Format cents integer into "$X.XX" string.
   */
  function formatCurrency(cents) {
    const num = Number(cents) || 0;
    const sign = num < 0 ? '-' : '';
    const abs = Math.abs(num);
    return `${sign}$${(abs / 100).toFixed(2)}`;
  }

  /**
   * Deterministic run checksum matching backend/src/validation.js
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
   * Determine base cost per glass (in cents) for a given day number.
   */
  function getBaseCostPerGlass(day) {
    if (day <= 2) return 2; // $0.02 (Mom's free sugar)
    if (day <= 6) return 4; // $0.04
    return 5;               // $0.05
  }

  /**
   * Roll weather & morning pre-decision event (such as supply shortage) for a new day.
   */
  function generateDayConditions(day) {
    const roll = Math.random();
    let weatherKey = 'sunny';

    if (day === 1) {
      // Day 1 is always welcoming weather (Sunny or Hot & Dry)
      weatherKey = roll < 0.7 ? 'sunny' : 'hot_dry';
    } else if (roll < 0.34) {
      weatherKey = 'sunny';
    } else if (roll < 0.54) {
      weatherKey = 'hot_dry';
    } else if (roll < 0.72) {
      weatherKey = 'cloudy';
    } else if (roll < 0.84) {
      weatherKey = 'thunderstorms';
    } else if (roll < 0.93) {
      weatherKey = 'heatwave';
    } else {
      weatherKey = 'cold_snap';
    }

    // Check for morning supply shortage (can happen Day 3+)
    const hasSupplyShortage = day >= 3 && Math.random() < 0.14;
    const baseCost = getBaseCostPerGlass(day) + (hasSupplyShortage ? 2 : 0);

    let costReason =
      day <= 2
        ? 'Mom gave you free sugar! Cost is only $0.02/glass.'
        : day <= 6
          ? 'Mom stopped giving free sugar. Standard cost is $0.04/glass.'
          : 'Summer lemon & sugar prices rose. Standard cost is $0.05/glass.';

    if (hasSupplyShortage) {
      costReason = 'SUPPLY SHORTAGE! Grocery store lemon shortage raised cost by +$0.02/glass today!';
    }

    return {
      weatherKey,
      hasSupplyShortage,
      costPerGlassCents: baseCost,
      costReason
    };
  }

  /**
   * Simulate a day's sales based on decisions, weather, and random events.
   */
  function simulateDayOutcome(state, decisions) {
    const { glassesMade, signsMade, pricePerGlass } = decisions;
    const weather = WEATHER_TYPES[state.currentWeather] || WEATHER_TYPES.sunny;

    // Determine afternoon random event
    let eventKey = state.hasSupplyShortage ? 'supply_shortage' : 'none';
    const eventRoll = Math.random();

    if (state.currentWeather === 'thunderstorms' && eventRoll < 0.75) {
      eventKey = 'thunderstorm_wipeout';
    } else if (state.currentWeather === 'cloudy' && eventRoll < 0.12) {
      eventKey = 'thunderstorm_wipeout';
    } else if (eventRoll < 0.09) {
      eventKey = 'street_crew_buys_all';
    } else if (eventRoll < 0.17) {
      eventKey = 'street_closure_detour';
    } else if (signsMade > 0 && eventRoll < 0.28) {
      eventKey = 'wind_signs_blown';
    } else if (
      (state.currentWeather === 'sunny' || state.currentWeather === 'hot_dry' || state.currentWeather === 'heatwave') &&
      eventRoll > 0.84
    ) {
      eventKey = 'bonus_demand';
    }

    const eventObj = RANDOM_EVENTS[eventKey] || RANDOM_EVENTS.none;

    // Calculate effective signs after wind
    let effectiveSigns = signsMade;
    let signsLost = 0;
    if (eventKey === 'wind_signs_blown' && signsMade > 0) {
      signsLost = Math.max(1, Math.ceil(signsMade * 0.65));
      effectiveSigns = Math.max(0, signsMade - signsLost);
    }

    // Classic Apple ][e demand curve based on price (in cents)
    // Base reference demand at 10¢ is ~36 glasses on a sunny day
    let priceFactor;
    if (pricePerGlass <= 10) {
      priceFactor = 1.0 + (10 - pricePerGlass) * 0.085;
    } else if (pricePerGlass <= 25) {
      priceFactor = Math.pow((28 - pricePerGlass) / 18, 1.45) * 0.95 + 0.15;
    } else if (pricePerGlass <= 50) {
      priceFactor = Math.max(0.03, 0.18 * Math.pow(0.92, pricePerGlass - 25));
    } else {
      priceFactor = 0.01;
    }

    const baseCustomers = 36 * priceFactor * weather.demandMultiplier;

    // Advertising boost: diminishing exponential curve (classic Apple ][ formula: 1 - exp(-0.5 * signs))
    const adBoostMultiplier = 1 + (1 - Math.exp(-0.45 * effectiveSigns)) * 0.95;

    let rawDemand = Math.round(baseCustomers * adBoostMultiplier);

    // Apply random event modifiers
    if (eventKey === 'thunderstorm_wipeout') {
      rawDemand = 0;
    } else if (eventKey === 'street_crew_buys_all') {
      rawDemand = Math.max(glassesMade, 45);
    } else if (eventKey === 'street_closure_detour') {
      rawDemand = Math.round(rawDemand * 0.42);
    } else if (eventKey === 'bonus_demand') {
      rawDemand = Math.round(rawDemand * 1.75);
    }

    const glassesSold = Math.max(0, Math.min(glassesMade, rawDemand));
    const glassesSpoiled = Math.max(0, glassesMade - glassesSold);

    const grossRevenueCents = glassesSold * pricePerGlass;
    const lemonadeCostCents = glassesMade * state.costPerGlassCents;
    const signsCostCents = signsMade * SIGN_COST_CENTS;
    const totalExpensesCents = lemonadeCostCents + signsCostCents;
    const netProfitCents = grossRevenueCents - totalExpensesCents;

    return {
      day: state.day,
      weatherKey: state.currentWeather,
      weatherLabel: weather.label,
      tempF: weather.tempF,
      eventKey,
      eventTitle: eventObj.title,
      eventDescription: eventObj.description,
      eventBadge: eventObj.badge,
      eventType: eventObj.type,
      glassesMade,
      glassesSold,
      glassesSpoiled,
      signsMade,
      signsLost,
      pricePerGlass,
      costPerGlassCents: state.costPerGlassCents,
      grossRevenueCents,
      lemonadeCostCents,
      signsCostCents,
      totalExpensesCents,
      profitCents: netProfitCents
    };
  }

  /**
   * Save current game state to localStorage and sync with backend API.
   */
  function saveGameToStorage() {
    try {
      if (gameState && !gameState.isFinished) {
        localStorage.setItem(SAVE_KEY, JSON.stringify(gameState));
        syncSaveWithBackend(gameState);
      } else {
        localStorage.removeItem(SAVE_KEY);
        clearBackendSave();
      }
    } catch (_) {}
  }

  /**
   * Asynchronously sync active game state with backend SQLite database.
   */
  function syncSaveWithBackend(state) {
    try {
      const apiBase = window.LEMONADE_API_BASE || '';
      const token = getOrCreateStandToken();
      fetch(`${apiBase}/api/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stand_token: token, state })
      }).catch(() => {});
    } catch (_) {}
  }

  /**
   * Asynchronously remove active saved game from backend SQLite database.
   */
  function clearBackendSave() {
    try {
      const apiBase = window.LEMONADE_API_BASE || '';
      const token = getOrCreateStandToken();
      fetch(`${apiBase}/api/save/${encodeURIComponent(token)}`, {
        method: 'DELETE'
      }).catch(() => {});
    } catch (_) {}
  }

  /**
   * Helper to retrieve carried-forward daily settings (glasses, signs, price).
   * Loads from gameState.lastSettings, falling back to the previous day in dayLog.
   */
  function getCarriedSettings() {
    if (!gameState) return null;
    if (gameState.lastSettings && typeof gameState.lastSettings === 'object') {
      return gameState.lastSettings;
    }
    if (Array.isArray(gameState.dayLog) && gameState.dayLog.length > 0) {
      const last = gameState.dayLog[gameState.dayLog.length - 1];
      if (last) {
        return {
          glasses: Number(last.glassesMade),
          signs: Number(last.signsMade),
          price: Number(last.pricePerGlass)
        };
      }
    }
    return null;
  }

  /**
   * Load saved game state from localStorage if valid.
   */
  function loadGameFromStorage() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed.standName === 'string' &&
        Number.isInteger(parsed.day) &&
        Number.isInteger(parsed.assetsCents) &&
        !parsed.isFinished
      ) {
        // Ensure saved nickname still passes strict profanity filter
        const check = root.ProfanityFilter.validateStandName(parsed.standName);
        if (!check.valid) {
          localStorage.removeItem(SAVE_KEY);
          return null;
        }
        return parsed;
      }
    } catch (_) {}
    return null;
  }

  /**
   * Wipe saved game state from localStorage.
   */
  function clearSavedGame() {
    try {
      localStorage.removeItem(SAVE_KEY);
      clearBackendSave();
    } catch (_) {}
  }

  /**
   * Create a brand new game state object.
   */
  function createNewGameState(standName, gameMode = 'standard') {
    const day1 = generateDayConditions(1);
    return {
      standName,
      gameMode: gameMode === 'endless' ? 'endless' : 'standard',
      maxDays: gameMode === 'endless' ? null : 12,
      day: 1,
      assetsCents: STARTING_ASSETS_CENTS,
      totalProfitCents: 0,
      totalGlassesSold: 0,
      totalGlassesMade: 0,
      bestDayProfitCents: 0,
      bestDayNumber: 1,
      bestDayWeather: day1.weatherKey,
      bestDayGlasses: 0,
      bestGlassesDayNumber: 1,
      bestGlassesWeather: day1.weatherKey,
      currentWeather: day1.weatherKey,
      hasSupplyShortage: day1.hasSupplyShortage,
      costPerGlassCents: day1.costPerGlassCents,
      costReason: day1.costReason,
      lastDayReport: null,
      dayLog: [],
      // Carry-forward daily settings (glasses, signs, price)
      lastSettings: null,
      isFinished: false,
      scoreSubmitted: false,
      startedAt: new Date().toISOString()
    };
  }

  /**
   * Apply visual mode ('retro', '8-bit', 'modern') and persist in localStorage.
   */
  function setTheme(mode, playSound = false) {
    const validModes = ['retro', '8-bit', 'modern'];
    const normalized = mode === '8bit' ? '8-bit' : mode;
    currentTheme = validModes.includes(normalized) ? normalized : 'modern';

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(THEME_KEY, currentTheme);
      }
    } catch (_) {}

    if (typeof document !== 'undefined') {
      const body = document.body;
      if (body) {
        body.classList.remove('theme-retro', 'theme-8bit', 'theme-modern');
        if (currentTheme === 'retro') {
          body.classList.add('theme-retro');
        } else if (currentTheme === '8-bit') {
          body.classList.add('theme-8bit');
        } else {
          body.classList.add('theme-modern');
        }
      }

      // Update all theme toggle buttons across header
      document.querySelectorAll('[data-theme-btn]').forEach((btn) => {
        const btnMode = btn.getAttribute('data-theme-btn');
        if (btnMode === currentTheme) {
          btn.classList.add('active');
          btn.setAttribute('aria-pressed', 'true');
        } else {
          btn.classList.remove('active');
          btn.setAttribute('aria-pressed', 'false');
        }
      });
    }

    if (playSound && root.LemonadeSound) {
      root.LemonadeSound.play('click');
    }

    // Refresh dynamic artwork on current screen
    renderDynamicArtwork();
  }

  /**
   * Re-render theme-dependent weather icons and stand hero banners.
   */
  function renderDynamicArtwork() {
    if (typeof document === 'undefined' || !root.LemonadeAssets) return;

    const titleHero = document.getElementById('title-stand-hero');
    if (titleHero) {
      const savedName = getSavedNickname() || 'LEMONADE STAND';
      titleHero.innerHTML = root.LemonadeAssets.getStandHeroHtml(currentTheme, savedName);
    }

    if (gameState) {
      const decisionHero = document.getElementById('decision-stand-hero');
      if (decisionHero) {
        decisionHero.innerHTML = root.LemonadeAssets.getStandHeroHtml(currentTheme, gameState.standName);
      }

      const forecastIconBox = document.getElementById('forecast-weather-icon');
      if (forecastIconBox) {
        forecastIconBox.innerHTML = root.LemonadeAssets.getWeatherIconHtml(
          gameState.currentWeather,
          currentTheme,
          'w-20 h-20'
        );
      }

      if (gameState.lastDayReport) {
        const resultIconBox = document.getElementById('result-weather-icon');
        if (resultIconBox) {
          resultIconBox.innerHTML = root.LemonadeAssets.getWeatherIconHtml(
            gameState.lastDayReport.weatherKey,
            currentTheme,
            'w-16 h-16'
          );
        }
      }
    }
  }

  /**
   * Switch active screen view.
   */
  function showScreen(screenId) {
    if (activeScreen !== screenId && screenId === 'leaderboards') {
      previousScreen = activeScreen;
    }
    activeScreen = screenId;
    document.querySelectorAll('.screen-view').forEach((el) => {
      if (el.id === `screen-${screenId}`) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    });

    if (screenId === 'title') {
      renderTitleScreen();
    } else if (screenId === 'setup') {
      renderSetupScreen();
    } else if (screenId === 'decision') {
      renderDecisionScreen();
    } else if (screenId === 'results') {
      renderResultsScreen();
    } else if (screenId === 'summary') {
      renderSummaryScreen();
    } else if (screenId === 'leaderboards') {
      renderLeaderboardsScreen();
    }

    window.scrollTo({ top: 0, behavior: currentTheme === 'retro' ? 'auto' : 'smooth' });
  }

  function getSavedNickname() {
    try {
      const saved = localStorage.getItem(NICKNAME_KEY);
      if (saved && root.ProfanityFilter.validateStandName(saved).valid) {
        return saved;
      }
    } catch (_) {}
    return '';
  }

  /**
   * Render Title Screen and check for saved game in localStorage.
   */
  function renderTitleScreen() {
    renderDynamicArtwork();
    const saved = loadGameFromStorage();
    const continueContainer = document.getElementById('continue-stand-container');
    const continueDetails = document.getElementById('continue-stand-details');

    if (saved) {
      continueContainer.classList.remove('hidden');
      const modeText = saved.gameMode === 'endless' ? 'Endless Mode' : `Day ${saved.day} of 12`;
      continueDetails.textContent = `${saved.standName} • ${modeText} • Cash: ${formatCurrency(saved.assetsCents)}`;
    } else {
      continueContainer.classList.add('hidden');
    }
  }

  /**
   * Render Nickname / Stand Name Setup Screen.
   */
  function renderSetupScreen() {
    const input = document.getElementById('stand-name-input');
    const feedback = document.getElementById('stand-name-feedback');
    const savedName = getSavedNickname();

    if (input && savedName && !input.value) {
      input.value = savedName;
    }

    if (feedback) {
      feedback.textContent = '';
      feedback.className = 'text-xs mt-2 hidden text-red-500 font-semibold';
    }
  }

  /**
   * Live validation feedback for the "Choose your Stand Name" input.
   * Completely silent on success; displays friendly failure message only on violation.
   */
  function updateNicknameFeedback(rawVal) {
    const feedback = document.getElementById('stand-name-feedback');
    if (!feedback) return false;

    const trimmed = (rawVal || '').trim();
    if (!trimmed) {
      feedback.textContent = '';
      feedback.className = 'text-xs mt-2 hidden text-red-500 font-semibold';
      return false;
    }

    const result = root.ProfanityFilter.validateStandName(trimmed);
    if (!result.valid) {
      feedback.textContent = FRIENDLY_FAILURE_MSG;
      feedback.className = 'text-xs mt-2 font-semibold text-red-500 block';
      return false;
    }

    // Validation success must be completely silent.
    feedback.textContent = '';
    feedback.className = 'text-xs mt-2 hidden text-red-500 font-semibold';
    return true;
  }

  /**
   * Render Daily Decision Screen (Weather Forecast, Cost Info, Glasses, Signs, Price).
   */
  function renderDecisionScreen() {
    if (!gameState) return;
    const weather = WEATHER_TYPES[gameState.currentWeather] || WEATHER_TYPES.sunny;

    document.getElementById('hud-stand-name').textContent = gameState.standName;
    document.getElementById('hud-day-badge').textContent =
      gameState.gameMode === 'endless'
        ? `DAY ${gameState.day} (ENDLESS)`
        : `DAY ${gameState.day} OF 12`;
    document.getElementById('hud-assets').textContent = formatCurrency(gameState.assetsCents);
    document.getElementById('hud-total-profit').textContent = formatCurrency(gameState.totalProfitCents);

    document.getElementById('forecast-weather-label').textContent = weather.label;
    document.getElementById('forecast-temp').textContent = `${weather.tempF}°F`;
    document.getElementById('forecast-description').textContent = weather.forecastText;
    document.getElementById('forecast-rain-risk').textContent = `Rain Risk: ${Math.round(weather.rainChance * 100)}%`;

    document.getElementById('cost-per-glass-display').textContent = `${gameState.costPerGlassCents}¢`;
    document.getElementById('cost-reason-banner').textContent = gameState.costReason;

    // Show/hide "Retire & Cash Out" button in Endless mode
    const retireBtn = document.getElementById('btn-retire-endless');
    if (retireBtn) {
      if (gameState.gameMode === 'endless' && gameState.day > 1) {
        retireBtn.classList.remove('hidden');
      } else {
        retireBtn.classList.add('hidden');
      }
    }

    // Configure input limits based on available cash
    const maxAffordableGlasses = Math.floor(gameState.assetsCents / gameState.costPerGlassCents);
    const glassesInput = document.getElementById('input-glasses');
    const glassesRange = document.getElementById('range-glasses');
    const signsInput = document.getElementById('input-signs');
    const signsRange = document.getElementById('range-signs');
    const priceInput = document.getElementById('input-price');
    const priceRange = document.getElementById('range-price');

    // Weather forecast suggested price
    const suggestedPrice =
      gameState.currentWeather === 'heatwave' || gameState.currentWeather === 'hot_dry'
        ? 15
        : gameState.currentWeather === 'cloudy' || gameState.currentWeather === 'cold_snap'
          ? 8
          : 10;

    // Load carried-forward daily settings from local save state
    const carried = getCarriedSettings();

    let initialGlasses;
    let initialSigns;
    let initialPrice;

    if (carried && typeof carried.glasses === 'number' && !Number.isNaN(carried.glasses)) {
      // Carry forward previous day setting, bounded by today's affordable max
      initialGlasses = Math.max(0, Math.min(carried.glasses, maxAffordableGlasses));
    } else {
      // Day 1 default
      initialGlasses = Math.min(maxAffordableGlasses, Math.max(10, Math.min(35, maxAffordableGlasses)));
    }

    if (carried && typeof carried.signs === 'number' && !Number.isNaN(carried.signs)) {
      // Carry forward previous day setting
      initialSigns = Math.max(0, carried.signs);
    } else {
      // Day 1 default
      initialSigns = 1;
    }

    if (carried && typeof carried.price === 'number' && !Number.isNaN(carried.price) && carried.price > 0) {
      // Weather forecast may suggest a price, but must NOT override the player's previous price
      initialPrice = Math.max(1, Math.min(100, carried.price));
    } else {
      // Player has not yet set a price: use weather forecast suggested price
      initialPrice = suggestedPrice;
    }

    glassesInput.max = String(maxAffordableGlasses);
    glassesRange.max = String(Math.max(1, maxAffordableGlasses));
    glassesInput.value = String(initialGlasses);
    glassesRange.value = String(initialGlasses);

    signsInput.value = String(initialSigns);
    signsRange.value = String(initialSigns);

    priceInput.value = String(initialPrice);
    priceRange.value = String(initialPrice);

    const priceHintEl = document.getElementById('price-recommend-hint');
    if (priceHintEl) {
      if (carried && typeof carried.price === 'number') {
        priceHintEl.textContent = `Forecast suggests: ${suggestedPrice}¢ (Previous: ${carried.price}¢)`;
      } else {
        priceHintEl.textContent = `Forecast suggests: ${suggestedPrice}¢`;
      }
    }

    document.getElementById('max-glasses-hint').textContent = `Max affordable: ${maxAffordableGlasses} glasses`;

    updateDecisionBudgetPreview();
    renderDynamicArtwork();
  }

  /**
   * Update live cost & remaining budget calculations as user adjusts sliders/inputs.
   */
  function updateDecisionBudgetPreview() {
    if (!gameState) return;

    const glassesInput = document.getElementById('input-glasses');
    const signsInput = document.getElementById('input-signs');
    const priceInput = document.getElementById('input-price');
    const errorEl = document.getElementById('decision-error-msg');

    const maxGlasses = Math.floor(gameState.assetsCents / gameState.costPerGlassCents);
    let glasses = Math.max(0, parseInt(glassesInput.value, 10) || 0);
    if (glasses > maxGlasses) {
      glasses = maxGlasses;
      glassesInput.value = String(glasses);
    }

    const cashAfterGlasses = Math.max(0, gameState.assetsCents - glasses * gameState.costPerGlassCents);
    const maxSigns = Math.floor(cashAfterGlasses / SIGN_COST_CENTS);
    const signsRange = document.getElementById('range-signs');
    signsInput.max = String(maxSigns);
    signsRange.max = String(Math.max(1, maxSigns));

    let signs = Math.max(0, parseInt(signsInput.value, 10) || 0);
    if (signs > maxSigns) {
      signs = maxSigns;
      signsInput.value = String(signs);
      signsRange.value = String(signs);
    }

    let price = Math.max(1, Math.min(100, parseInt(priceInput.value, 10) || 10));

    const glassesCost = glasses * gameState.costPerGlassCents;
    const signsCost = signs * SIGN_COST_CENTS;
    const totalCost = glassesCost + signsCost;
    const remainingCash = gameState.assetsCents - totalCost;
    const maxPotentialRevenue = glasses * price;

    document.getElementById('preview-glasses-cost').textContent = formatCurrency(glassesCost);
    document.getElementById('preview-signs-cost').textContent = formatCurrency(signsCost);
    document.getElementById('preview-total-cost').textContent = formatCurrency(totalCost);
    document.getElementById('preview-remaining-cash').textContent = formatCurrency(remainingCash);
    document.getElementById('preview-max-revenue').textContent = formatCurrency(maxPotentialRevenue);
    document.getElementById('max-signs-hint').textContent = `Max with remaining cash: ${maxSigns} signs`;

    if (errorEl) {
      errorEl.classList.add('hidden');
    }
  }

  /**
   * Handle "Open Stand for the Day" submission.
   */
  function handleOpenStandSubmit(e) {
    if (e) e.preventDefault();
    if (!gameState) return;

    const glassesMade = Math.max(0, parseInt(document.getElementById('input-glasses').value, 10) || 0);
    const signsMade = Math.max(0, parseInt(document.getElementById('input-signs').value, 10) || 0);
    const pricePerGlass = Math.max(1, Math.min(100, parseInt(document.getElementById('input-price').value, 10) || 10));

    const totalCost = glassesMade * gameState.costPerGlassCents + signsMade * SIGN_COST_CENTS;
    const errorEl = document.getElementById('decision-error-msg');

    if (totalCost > gameState.assetsCents) {
      if (errorEl) {
        errorEl.textContent = 'Not enough cash for that many glasses and advertising signs!';
        errorEl.classList.remove('hidden');
      }
      if (root.LemonadeSound) root.LemonadeSound.play('error');
      return;
    }

    const report = simulateDayOutcome(gameState, { glassesMade, signsMade, pricePerGlass });

    // Persist player's daily settings for carry-forward to subsequent days
    gameState.lastSettings = {
      glasses: glassesMade,
      signs: signsMade,
      price: pricePerGlass
    };

    // Update cumulative game state
    gameState.assetsCents += report.profitCents;
    gameState.totalProfitCents += report.profitCents;
    gameState.totalGlassesSold += report.glassesSold;
    gameState.totalGlassesMade += report.glassesMade;
    gameState.lastDayReport = report;

    if (report.profitCents > gameState.bestDayProfitCents) {
      gameState.bestDayProfitCents = report.profitCents;
      gameState.bestDayNumber = report.day;
      gameState.bestDayWeather = report.weatherKey;
    }

    if (report.glassesSold > gameState.bestDayGlasses) {
      gameState.bestDayGlasses = report.glassesSold;
      gameState.bestGlassesDayNumber = report.day;
      gameState.bestGlassesWeather = report.weatherKey;
    }

    gameState.dayLog.push({
      day: report.day,
      weather: report.weatherKey,
      event: report.eventKey,
      glassesMade: report.glassesMade,
      glassesSold: report.glassesSold,
      signsMade: report.signsMade,
      pricePerGlass: report.pricePerGlass,
      profitCents: report.profitCents,
      assetsAfterCents: gameState.assetsCents
    });

    if (root.LemonadeSound) {
      if (report.eventKey === 'thunderstorm_wipeout') {
        root.LemonadeSound.play('storm');
      } else if (report.profitCents > 0) {
        root.LemonadeSound.play('cash');
      } else {
        root.LemonadeSound.play('event');
      }
    }

    saveGameToStorage();
    showScreen('results');
  }

  /**
   * Render Daily Financial Report & Random Event Outcome Screen.
   */
  function renderResultsScreen() {
    if (!gameState || !gameState.lastDayReport) return;
    const r = gameState.lastDayReport;

    document.getElementById('result-day-title').textContent = `Day ${r.day} Financial Report`;
    document.getElementById('result-stand-subtitle').textContent = `${gameState.standName} • ${r.weatherLabel} (${r.tempF}°F)`;

    // Event callout
    document.getElementById('result-event-badge').textContent = r.eventBadge;
    document.getElementById('result-event-title').textContent = r.eventTitle;
    document.getElementById('result-event-desc').textContent =
      r.signsLost > 0
        ? `${r.eventDescription} (${r.signsLost} of your ${r.signsMade} signs blew away!)`
        : r.eventDescription;

    // Metrics
    document.getElementById('res-glasses-sold').textContent = `${r.glassesSold} / ${r.glassesMade}`;
    document.getElementById('res-price-per-glass').textContent = `${r.pricePerGlass}¢`;
    document.getElementById('res-gross-income').textContent = formatCurrency(r.grossRevenueCents);
    document.getElementById('res-lemonade-cost').textContent = formatCurrency(r.lemonadeCostCents);
    document.getElementById('res-signs-cost').textContent = formatCurrency(r.signsCostCents);
    document.getElementById('res-total-expenses').textContent = formatCurrency(r.totalExpensesCents);

    const profitEl = document.getElementById('res-net-profit');
    profitEl.textContent = (r.profitCents >= 0 ? '+' : '') + formatCurrency(r.profitCents);
    profitEl.className = `text-2xl font-extrabold ${r.profitCents >= 0 ? 'text-emerald-500' : 'text-red-500'}`;

    document.getElementById('res-ending-assets').textContent = formatCurrency(gameState.assetsCents);

    // Check if run ends after today (Day 12 completed in Standard mode, or Bankrupt)
    const minNextDayCost = getBaseCostPerGlass(gameState.day + 1);
    const isBankrupt = gameState.assetsCents < minNextDayCost;
    const isFinalStandardDay = gameState.gameMode === 'standard' && gameState.day >= 12;

    const nextBtn = document.getElementById('btn-next-day');
    if (isBankrupt) {
      nextBtn.textContent = 'Stand Bankrupt — View Final Summary';
    } else if (isFinalStandardDay) {
      nextBtn.textContent = 'Complete 12-Day Run — View Summary';
    } else {
      nextBtn.textContent = `Proceed to Day ${gameState.day + 1} →`;
    }

    renderDynamicArtwork();
  }

  /**
   * Advance from Daily Results to either the next day or End-of-Run Summary.
   */
  function handleNextDayOrFinish() {
    if (!gameState) return;

    const minNextDayCost = getBaseCostPerGlass(gameState.day + 1);
    const isBankrupt = gameState.assetsCents < minNextDayCost;
    const isFinalStandardDay = gameState.gameMode === 'standard' && gameState.day >= 12;

    if (isBankrupt || isFinalStandardDay) {
      finishRun(isBankrupt ? 'BANKRUPT' : 'COMPLETED');
      return;
    }

    // Advance to next day
    gameState.day += 1;
    const nextCond = generateDayConditions(gameState.day);
    gameState.currentWeather = nextCond.weatherKey;
    gameState.hasSupplyShortage = nextCond.hasSupplyShortage;
    gameState.costPerGlassCents = nextCond.costPerGlassCents;
    gameState.costReason = nextCond.costReason;

    // Ensure previous day settings are carried forward if not already set
    if (!gameState.lastSettings && gameState.lastDayReport) {
      gameState.lastSettings = {
        glasses: gameState.lastDayReport.glassesMade,
        signs: gameState.lastDayReport.signsMade,
        price: gameState.lastDayReport.pricePerGlass
      };
    }

    saveGameToStorage();
    if (root.LemonadeSound) root.LemonadeSound.play('dayStart');
    showScreen('decision');
  }

  /**
   * Finalize the current run, clear active save, and display the End-of-Run Summary.
   */
  function finishRun(reason = 'COMPLETED') {
    if (!gameState) return;
    gameState.isFinished = true;
    gameState.finishReason = reason;
    clearSavedGame();

    if (root.LemonadeSound) {
      root.LemonadeSound.play(reason === 'BANKRUPT' ? 'error' : 'victory');
    }

    showScreen('summary');
    submitRunScoreToServer();
  }

  /**
   * Render End-of-Run Summary Screen.
   */
  function renderSummaryScreen() {
    if (!gameState) return;

    const daysCompleted = gameState.dayLog.length || gameState.day;
    const badgeEl = document.getElementById('summary-status-badge');
    if (gameState.finishReason === 'BANKRUPT') {
      badgeEl.textContent = 'OUT OF BUSINESS (BANKRUPT)';
    } else if (gameState.gameMode === 'endless') {
      badgeEl.textContent = `ENDLESS RUN RETIRED (${daysCompleted} DAYS)`;
    } else {
      badgeEl.textContent = '12-DAY SUMMER SEASON COMPLETE!';
    }

    document.getElementById('summary-stand-name').textContent = gameState.standName;
    document.getElementById('summary-final-assets').textContent = formatCurrency(gameState.assetsCents);
    document.getElementById('summary-net-profit').textContent =
      (gameState.totalProfitCents >= 0 ? '+' : '') + formatCurrency(gameState.totalProfitCents);
    document.getElementById('summary-total-glasses').textContent =
      `${gameState.totalGlassesSold} sold / ${gameState.totalGlassesMade} made`;
    document.getElementById('summary-best-day-profit').textContent =
      `${formatCurrency(gameState.bestDayProfitCents)} (Day ${gameState.bestDayNumber})`;
    document.getElementById('summary-best-day-glasses').textContent =
      `${gameState.bestDayGlasses} glasses (Day ${gameState.bestGlassesDayNumber})`;

    // Render day-by-day history table
    const tbody = document.getElementById('summary-log-tbody');
    if (tbody) {
      tbody.innerHTML = gameState.dayLog
        .map((row) => {
          const wLabel = WEATHER_TYPES[row.weather] ? WEATHER_TYPES[row.weather].label : row.weather;
          const profitStr = (row.profitCents >= 0 ? '+' : '') + formatCurrency(row.profitCents);
          return `
            <tr class="border-b border-slate-200/30">
              <td class="py-2 px-2 font-bold">Day ${row.day}</td>
              <td class="py-2 px-2">${wLabel}</td>
              <td class="py-2 px-2">${row.glassesSold}/${row.glassesMade}</td>
              <td class="py-2 px-2">${row.pricePerGlass}¢</td>
              <td class="py-2 px-2">${row.signsMade}</td>
              <td class="py-2 px-2 font-bold">${profitStr}</td>
              <td class="py-2 px-2">${formatCurrency(row.assetsAfterCents)}</td>
            </tr>
          `;
        })
        .join('');
    }
  }

  /**
   * Submit verified score to the backend API.
   */
  async function submitRunScoreToServer() {
    if (!gameState || gameState.scoreSubmitted) return;
    const statusEl = document.getElementById('summary-submit-status');
    if (statusEl) {
      statusEl.textContent = 'Submitting verified score to leaderboards...';
    }

    const daysPlayed = Math.max(1, gameState.dayLog.length || gameState.day);
    const checksum = computeRunChecksum(
      gameState.standName,
      gameState.totalProfitCents,
      gameState.totalGlassesSold,
      gameState.bestDayProfitCents,
      gameState.bestDayGlasses,
      daysPlayed
    );

    const payload = {
      stand_name: gameState.standName,
      stand_token: getOrCreateStandToken(),
      score: gameState.totalProfitCents,
      best_day_profit: gameState.bestDayProfitCents,
      best_day_number: gameState.bestDayNumber,
      best_day_weather: gameState.bestDayWeather,
      total_glasses_sold: gameState.totalGlassesSold,
      best_day_glasses: gameState.bestDayGlasses,
      best_glasses_day_number: gameState.bestGlassesDayNumber,
      best_glasses_weather: gameState.bestGlassesWeather,
      final_assets: gameState.assetsCents,
      mode: currentTheme,
      game_mode: gameState.gameMode,
      days_played: daysPlayed,
      version: GAME_VERSION,
      day_log: gameState.dayLog,
      integrity_hash: checksum
    };

    try {
      const apiBase = window.LEMONADE_API_BASE || '';
      const res = await fetch(`${apiBase}/api/scores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        gameState.scoreSubmitted = true;
        if (statusEl) {
          statusEl.textContent = `✓ Score verified & saved to leaderboards under "${gameState.standName}"!`;
        }
      } else if (statusEl) {
        statusEl.textContent = `Note: ${data.error || 'Could not record score.'}`;
      }
    } catch (_) {
      if (statusEl) {
        statusEl.textContent = 'Offline mode: Score saved locally.';
      }
    }
  }

  /**
   * Fetch and render the Leaderboards Screen.
   */
  async function renderLeaderboardsScreen(categoryOverride) {
    if (categoryOverride) {
      activeLeaderboardTab = categoryOverride;
    }

    // Highlight active tab
    document.querySelectorAll('[data-lb-tab]').forEach((btn) => {
      if (btn.getAttribute('data-lb-tab') === activeLeaderboardTab) {
        btn.classList.add('ls-btn-primary');
        btn.classList.remove('ls-btn-secondary');
      } else {
        btn.classList.remove('ls-btn-primary');
        btn.classList.add('ls-btn-secondary');
      }
    });

    const tbody = document.getElementById('leaderboard-tbody');
    const titleEl = document.getElementById('leaderboard-category-title');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center opacity-75">Loading leaderboard...</td></tr>`;
    }

    try {
      const apiBase = window.LEMONADE_API_BASE || '';
      const query = activeLeaderboardModeFilter ? `?mode=${encodeURIComponent(activeLeaderboardModeFilter)}` : '';
      const res = await fetch(`${apiBase}/api/leaderboard/${activeLeaderboardTab}${query}`);
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to load leaderboard');
      }

      if (titleEl) {
        titleEl.textContent = data.title || 'Leaderboard';
      }

      if (!data.entries || data.entries.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center opacity-75">No entries recorded yet for this category. Be the first!</td></tr>`;
        return;
      }

      const isGlassesMetric = data.unit === 'glasses' || activeLeaderboardTab.startsWith('glasses');
      const localToken = getOrCreateStandToken();

      tbody.innerHTML = data.entries
        .map((entry, index) => {
          const rank = entry.rank !== undefined ? entry.rank : index + 1;
          const formattedScore = isGlassesMetric
            ? `${entry.score} glasses`
            : formatCurrency(entry.score);
          const dateShort = entry.date ? new Date(entry.date).toLocaleDateString() : 'Today';
          const modeLabel =
            entry.mode === 'retro' ? 'RETRO ][e' : entry.mode === '8-bit' ? '8-BIT' : 'MODERN';

          const isCurrentUser = Boolean(localToken && entry.stand_token && entry.stand_token === localToken);
          const youIndicator = isCurrentUser
            ? ' <span class="you-indicator">🍋 &lt;=== You</span>'
            : '';

          return `
            <tr class="border-b border-slate-200/25 hover:bg-amber-500/5">
              <td class="py-2.5 px-3 font-bold">#${rank}</td>
              <td class="py-2.5 px-3 font-bold">${escapeHtml(entry.stand_name)}${youIndicator}</td>
              <td class="py-2.5 px-3 font-extrabold">${formattedScore}</td>
              <td class="py-2.5 px-3"><span class="ls-badge px-2 py-0.5 text-xs uppercase">${modeLabel}</span></td>
              <td class="py-2.5 px-3 text-xs opacity-80">${dateShort}</td>
              <td class="py-2.5 px-3 text-xs opacity-60">v${escapeHtml(entry.version || '1.0.0')}</td>
            </tr>
          `;
        })
        .join('');
    } catch (err) {
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-red-500">Could not reach leaderboard server.</td></tr>`;
      }
    }
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Synchronize sound toggle UI state in navbar.
   */
  function syncSoundToggleUI() {
    const enabled = root.LemonadeSound ? root.LemonadeSound.isEnabled() : true;
    const navBtn = document.getElementById('btn-nav-sound');

    if (navBtn) {
      navBtn.textContent = enabled ? '🔊 Sound: ON' : '🔇 Sound: OFF';
      navBtn.setAttribute('aria-pressed', String(enabled));
    }
  }

  /**
   * Bind all UI event listeners on DOMContentLoaded.
   */
  function initApp() {
    // 1. Restore saved theme from localStorage
    let savedTheme = 'modern';
    try {
      savedTheme = localStorage.getItem(THEME_KEY) || 'modern';
    } catch (_) {}
    setTheme(savedTheme, false);
    syncSoundToggleUI();

    // 2. Bind Three-Way Theme Toggle Buttons
    document.querySelectorAll('[data-theme-btn]').forEach((btn) => {
      btn.addEventListener('click', () => {
        setTheme(btn.getAttribute('data-theme-btn'), true);
      });
    });

    // 3. Bind Sound Toggle Buttons
    document.querySelectorAll('[data-sound-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (root.LemonadeSound) {
          root.LemonadeSound.toggle();
          syncSoundToggleUI();
        }
      });
    });

    // 4. Bind Title Screen Navigation
    document.getElementById('btn-continue-stand')?.addEventListener('click', () => {
      const saved = loadGameFromStorage();
      if (saved) {
        gameState = saved;
        if (root.LemonadeSound) root.LemonadeSound.play('dayStart');
        showScreen('decision');
      }
    });

    document.getElementById('btn-start-new-stand')?.addEventListener('click', () => {
      if (root.LemonadeSound) root.LemonadeSound.play('click');
      clearSavedGame();
      showScreen('setup');
    });

    document.getElementById('btn-title-leaderboards')?.addEventListener('click', () => {
      if (root.LemonadeSound) root.LemonadeSound.play('click');
      showScreen('leaderboards');
    });

    document.getElementById('btn-nav-leaderboards')?.addEventListener('click', () => {
      if (root.LemonadeSound) root.LemonadeSound.play('click');
      showScreen('leaderboards');
    });

    document.getElementById('btn-nav-home')?.addEventListener('click', () => {
      if (root.LemonadeSound) root.LemonadeSound.play('click');
      showScreen('title');
    });

    // 5. Bind Stand Name Setup Form & Back Button
    document.getElementById('btn-setup-back')?.addEventListener('click', () => {
      if (root.LemonadeSound) root.LemonadeSound.play('click');
      showScreen('title');
    });

    // 6. Bind Leaderboards Back to Game Button
    document.getElementById('btn-leaderboard-back')?.addEventListener('click', () => {
      if (root.LemonadeSound) root.LemonadeSound.play('click');
      if (gameState && !gameState.isFinished) {
        showScreen(gameState.lastDayReport ? 'results' : 'decision');
      } else if (previousScreen && previousScreen !== 'leaderboards') {
        showScreen(previousScreen);
      } else {
        showScreen('title');
      }
    });

    const nameInput = document.getElementById('stand-name-input');
    nameInput?.addEventListener('input', (e) => {
      updateNicknameFeedback(e.target.value);
    });

    document.getElementById('setup-stand-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const rawName = nameInput ? nameInput.value : '';
      const validation = root.ProfanityFilter.validateStandName(rawName);

      if (!validation.valid) {
        updateNicknameFeedback(rawName);
        if (root.LemonadeSound) root.LemonadeSound.play('error');
        return;
      }

      // Also verify with backend endpoint if reachable
      try {
        const apiBase = window.LEMONADE_API_BASE || '';
        const resp = await fetch(`${apiBase}/api/validate-nickname`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stand_name: validation.sanitized })
        });
        if (resp.status === 400) {
          const feedback = document.getElementById('stand-name-feedback');
          if (feedback) {
            feedback.textContent = FRIENDLY_FAILURE_MSG;
            feedback.className = 'text-xs mt-2 font-semibold text-red-500 block';
          }
          if (root.LemonadeSound) root.LemonadeSound.play('error');
          return;
        }
      } catch (_) {
        // Offline fallback relies on client-side strict filter
      }

      // Completely silent success: clear any error feedback
      const feedback = document.getElementById('stand-name-feedback');
      if (feedback) {
        feedback.textContent = '';
        feedback.className = 'text-xs mt-2 hidden text-red-500 font-semibold';
      }

      // Store accepted nickname in localStorage
      try {
        localStorage.setItem(NICKNAME_KEY, validation.sanitized);
      } catch (_) {}

      const selectedModeEl = document.querySelector('input[name="game-length-mode"]:checked');
      const lengthMode = selectedModeEl ? selectedModeEl.value : 'standard';

      clearSavedGame();
      gameState = createNewGameState(validation.sanitized, lengthMode);
      saveGameToStorage();

      if (root.LemonadeSound) root.LemonadeSound.play('dayStart');
      showScreen('decision');
    });

    // 7. Bind Decision Sliders & Number Inputs
    function recordLiveSettings() {
      if (!gameState) return;
      const g = parseInt(document.getElementById('input-glasses')?.value, 10);
      const s = parseInt(document.getElementById('input-signs')?.value, 10);
      const p = parseInt(document.getElementById('input-price')?.value, 10);
      gameState.lastSettings = {
        glasses: Number.isFinite(g) ? Math.max(0, g) : 0,
        signs: Number.isFinite(s) ? Math.max(0, s) : 0,
        price: Number.isFinite(p) ? Math.max(1, Math.min(100, p)) : 10
      };
      saveGameToStorage();
    }

    const syncPairs = [
      ['input-glasses', 'range-glasses'],
      ['input-signs', 'range-signs'],
      ['input-price', 'range-price']
    ];

    for (const [numId, rangeId] of syncPairs) {
      const numEl = document.getElementById(numId);
      const rangeEl = document.getElementById(rangeId);
      numEl?.addEventListener('input', () => {
        if (rangeEl) rangeEl.value = numEl.value;
        updateDecisionBudgetPreview();
        recordLiveSettings();
      });
      rangeEl?.addEventListener('input', () => {
        if (numEl) numEl.value = rangeEl.value;
        updateDecisionBudgetPreview();
        recordLiveSettings();
      });
    }

    document.getElementById('decision-form')?.addEventListener('submit', handleOpenStandSubmit);

    document.getElementById('btn-retire-endless')?.addEventListener('click', () => {
      if (gameState && gameState.gameMode === 'endless') {
        finishRun('RETIRED');
      }
    });

    // 8. Bind Daily Results Next Day Button
    document.getElementById('btn-next-day')?.addEventListener('click', handleNextDayOrFinish);

    // 9. Bind Summary Screen Buttons
    document.getElementById('btn-summary-play-again')?.addEventListener('click', () => {
      if (root.LemonadeSound) root.LemonadeSound.play('click');
      showScreen('setup');
    });

    document.getElementById('btn-summary-leaderboards')?.addEventListener('click', () => {
      if (root.LemonadeSound) root.LemonadeSound.play('click');
      showScreen('leaderboards');
    });

    // 10. Bind Leaderboard Category Tabs & Mode Filter
    document.querySelectorAll('[data-lb-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (root.LemonadeSound) root.LemonadeSound.play('click');
        renderLeaderboardsScreen(btn.getAttribute('data-lb-tab'));
      });
    });

    document.getElementById('leaderboard-mode-filter')?.addEventListener('change', (e) => {
      activeLeaderboardModeFilter = e.target.value;
      if (root.LemonadeSound) root.LemonadeSound.play('click');
      renderLeaderboardsScreen();
    });

    // Initial render
    renderTitleScreen();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initApp);
    } else {
      initApp();
    }
  }

  root.LemonadeGame = {
    WEATHER_TYPES,
    RANDOM_EVENTS,
    computeRunChecksum,
    simulateDayOutcome,
    createNewGameState,
    getCarriedSettings,
    setTheme,
    showScreen
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
