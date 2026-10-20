/**
 * Seed sample family-friendly leaderboard entries into the SQLite database
 */
'use strict';

const { getDb, seedInitialData } = require('../src/db');

const db = getDb();
seedInitialData(db);
console.log('🍋 Sample family-friendly leaderboard entries seeded successfully.');
