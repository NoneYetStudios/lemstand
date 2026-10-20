/**
 * Production Frontend Build Script for Lemonade Stand
 * 1. Generates all SVG, Pixel-Art, Retro, and WAV sound assets in frontend/assets/
 * 2. Compiles and minifies production Tailwind CSS into frontend/css/tailwind.min.css
 *
 * Note: Does NOT create SQLite databases or duplicate dist/ directories, ensuring
 * clean frontend-only builds on Netlify and Vercel.
 */
'use strict';

const path = require('node:path');
const { execSync } = require('node:child_process');

// 1. Ensure all visual and audio assets are generated in frontend/assets/
require('./generateAssets');

// 2. Compile Tailwind CSS directly into frontend/css/tailwind.min.css
console.log('📦 Compiling production Tailwind CSS...');
execSync('npx tailwindcss -i frontend/css/tailwind-input.css -o frontend/css/tailwind.min.css --minify', {
  cwd: path.resolve(__dirname, '..'),
  stdio: 'inherit'
});

console.log('✅ Frontend production build completed in frontend/!');
