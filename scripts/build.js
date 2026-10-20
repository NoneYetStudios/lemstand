/**
 * Production Build Script for Lemonade Stand
 * 1. Regenerates all SVG, Pixel-Art, Retro, and WAV sound assets
 * 2. Copies and bundles frontend static files into dist/ for Vercel / Netlify deployment
 * 3. Initializes the SQLite database schema
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

// 1. Ensure all assets are generated
require('./generateAssets');

// 2. Compile Tailwind CSS for production
console.log('📦 Compiling production Tailwind CSS...');
execSync('npx tailwindcss -i frontend/css/tailwind-input.css -o frontend/css/tailwind.min.css --minify', {
  cwd: path.resolve(__dirname, '..'),
  stdio: 'inherit'
});

const frontendSrc = path.resolve(__dirname, '../frontend');
const distDir = path.resolve(__dirname, '../dist');

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}
copyDirRecursive(frontendSrc, distDir);

// Remove build-only input files from dist
const distTailwindInput = path.join(distDir, 'css', 'tailwind-input.css');
if (fs.existsSync(distTailwindInput)) {
  fs.unlinkSync(distTailwindInput);
}

// Initialize SQLite database schema
const { getDb } = require('../backend/src/db');
getDb();

console.log('✅ Production build completed in dist/ and SQLite database initialized!');
