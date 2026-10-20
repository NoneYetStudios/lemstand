/**
 * Initialize the SQLite database and apply schema.sql
 */
'use strict';

const { getDb } = require('../src/db');

const db = getDb();
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'leaderboard_%' ORDER BY name")
  .all();

console.log('✅ SQLite database initialized successfully.');
console.log('📊 Active Leaderboard Tables:', tables.map((t) => t.name).join(', '));
