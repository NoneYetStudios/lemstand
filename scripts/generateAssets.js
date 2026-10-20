/**
 * Asset Generator for Lemonade Stand
 * Generates:
 * 1. Modern SVG Weather & Stand Icons (frontend/assets/icons/svg/*.svg)
 * 2. 8-bit Pixel-Art Weather & Stand Sprites (frontend/assets/icons/pixel/*.svg)
 * 3. Retro Apple ][e Phosphor Vector/ASCII Icons (frontend/assets/icons/retro/*.svg)
 * 4. Physical WAV Sound Assets for UI, Coin, Day Start, Storm, Victory, Error (frontend/assets/sounds/*.wav)
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const baseDir = path.resolve(__dirname, '../frontend/assets');
const svgDir = path.join(baseDir, 'icons/svg');
const pixelDir = path.join(baseDir, 'icons/pixel');
const retroDir = path.join(baseDir, 'icons/retro');
const soundDir = path.join(baseDir, 'sounds');

for (const dir of [svgDir, pixelDir, retroDir, soundDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

// 1. Modern SVG Weather Icons
const modernSvgs = {
  sunny: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <defs>
    <radialGradient id="sunGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#FFF176"/>
      <stop offset="100%" stop-color="#F59E0B"/>
    </radialGradient>
  </defs>
  <circle cx="32" cy="32" r="14" fill="url(#sunGrad)" stroke="#D97706" stroke-width="2"/>
  <g stroke="#F59E0B" stroke-width="3.5" stroke-linecap="round">
    <line x1="32" y1="6" x2="32" y2="12"/>
    <line x1="32" y1="52" x2="32" y2="58"/>
    <line x1="6" y1="32" x2="12" y2="32"/>
    <line x1="52" y1="32" x2="58" y2="32"/>
    <line x1="13.6" y1="13.6" x2="17.8" y2="17.8"/>
    <line x1="46.2" y1="46.2" x2="50.4" y2="50.4"/>
    <line x1="50.4" y1="13.6" x2="46.2" y2="17.8"/>
    <line x1="17.8" y1="46.2" x2="13.6" y2="50.4"/>
  </g>
</svg>`,

  cloudy: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <defs>
    <linearGradient id="cloudGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#F8FAFC"/>
      <stop offset="100%" stop-color="#CBD5E1"/>
    </linearGradient>
  </defs>
  <circle cx="24" cy="24" r="9" fill="#FBBF24"/>
  <path d="M20 46H47C52.5 46 57 41.5 57 36C57 30.8 53 26.5 47.9 26.1C46.4 18.6 39.8 13 32 13C23.2 13 16 20.2 16 29C16 29.4 16 29.8 16.1 30.2C11.5 31.4 8 35.5 8 40.5C8 43.5 13.4 46 20 46Z" fill="url(#cloudGrad)" stroke="#64748B" stroke-width="2" stroke-linejoin="round"/>
</svg>`,

  hot_dry: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <defs>
    <radialGradient id="hotSun" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#FDE047"/>
      <stop offset="100%" stop-color="#EA580C"/>
    </radialGradient>
  </defs>
  <circle cx="28" cy="28" r="13" fill="url(#hotSun)" stroke="#C2410C" stroke-width="2"/>
  <path d="M12 52C16 49 20 55 24 52C28 49 32 55 36 52C40 49 44 55 48 52" stroke="#EA580C" stroke-width="3" stroke-linecap="round"/>
  <rect x="46" y="14" width="8" height="28" rx="4" fill="#FEE2E2" stroke="#DC2626" stroke-width="2"/>
  <circle cx="50" cy="42" r="6" fill="#DC2626"/>
  <rect x="48" y="20" width="4" height="20" rx="2" fill="#DC2626"/>
</svg>`,

  thunderstorms: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <path d="M18 39H46C51.5 39 56 34.5 56 29C56 23.8 52 19.5 46.9 19.1C45.4 11.6 38.8 6 31 6C22.2 6 15 13.2 15 22C10.5 23.2 7 27.3 7 32.3C7 36 11.9 39 18 39Z" fill="#475569" stroke="#1E293B" stroke-width="2"/>
  <polygon points="33,35 23,48 31,48 28,59 41,44 33,44" fill="#FACC15" stroke="#CA8A04" stroke-width="1.5" stroke-linejoin="round"/>
  <line x1="18" y1="44" x2="15" y2="52" stroke="#38BDF8" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="45" y1="44" x2="42" y2="52" stroke="#38BDF8" stroke-width="2.5" stroke-linecap="round"/>
</svg>`,

  heatwave: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <circle cx="32" cy="26" r="14" fill="#EF4444" stroke="#991B1B" stroke-width="2"/>
  <circle cx="32" cy="26" r="9" fill="#FDE047"/>
  <path d="M10 46C15 42 20 50 25 46C30 42 35 50 40 46C45 42 50 50 54 46" stroke="#DC2626" stroke-width="3" stroke-linecap="round"/>
  <path d="M10 54C15 50 20 58 25 54C30 50 35 58 40 54C45 50 50 58 54 54" stroke="#F97316" stroke-width="3" stroke-linecap="round"/>
</svg>`,

  cold_snap: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <g stroke="#0284C7" stroke-width="3" stroke-linecap="round">
    <line x1="32" y1="8" x2="32" y2="56"/>
    <line x1="8" y1="32" x2="56" y2="32"/>
    <line x1="15" y1="15" x2="49" y2="49"/>
    <line x1="49" y1="15" x2="15" y2="49"/>
    <polyline points="26,14 32,20 38,14"/>
    <polyline points="26,50 32,44 38,50"/>
    <polyline points="14,26 20,32 14,38"/>
    <polyline points="50,26 44,32 50,38"/>
  </g>
  <circle cx="32" cy="32" r="5" fill="#E0F2FE" stroke="#0284C7" stroke-width="2.5"/>
</svg>`,

  stand: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <rect x="8" y="34" width="48" height="22" rx="3" fill="#FDE047" stroke="#B45309" stroke-width="2.5"/>
  <line x1="12" y1="18" x2="12" y2="34" stroke="#92400E" stroke-width="3"/>
  <line x1="52" y1="18" x2="52" y2="34" stroke="#92400E" stroke-width="3"/>
  <path d="M6 18H58L54 8H10L6 18Z" fill="#EF4444" stroke="#991B1B" stroke-width="2"/>
  <rect x="20" y="25" width="10" height="9" rx="2" fill="#FEF08A" stroke="#CA8A04" stroke-width="1.5"/>
  <rect x="36" y="27" width="6" height="7" rx="1" fill="#BAE6FD" stroke="#0284C7" stroke-width="1.5"/>
</svg>`
};

for (const [name, content] of Object.entries(modernSvgs)) {
  fs.writeFileSync(path.join(svgDir, `${name}.svg`), content, 'utf8');
}

// 2. 8-bit Pixel-Art Weather & Stand Sprites (Crisp 16x16 grid SVGs)
const pixelSvgs = {
  sunny: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
  <rect x="7" y="1" width="2" height="2" fill="#FACC15"/>
  <rect x="7" y="13" width="2" height="2" fill="#FACC15"/>
  <rect x="1" y="7" width="2" height="2" fill="#FACC15"/>
  <rect x="13" y="7" width="2" height="2" fill="#FACC15"/>
  <rect x="3" y="3" width="2" height="2" fill="#FACC15"/>
  <rect x="11" y="3" width="2" height="2" fill="#FACC15"/>
  <rect x="3" y="11" width="2" height="2" fill="#FACC15"/>
  <rect x="11" y="11" width="2" height="2" fill="#FACC15"/>
  <rect x="5" y="5" width="6" height="6" fill="#F59E0B"/>
  <rect x="6" y="4" width="4" height="8" fill="#FACC15"/>
  <rect x="4" y="6" width="8" height="4" fill="#FACC15"/>
  <rect x="6" y="6" width="2" height="2" fill="#FEF08A"/>
</svg>`,

  cloudy: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
  <rect x="3" y="4" width="4" height="4" fill="#FACC15"/>
  <rect x="6" y="5" width="5" height="6" fill="#E2E8F0"/>
  <rect x="4" y="7" width="9" height="5" fill="#F8FAFC"/>
  <rect x="2" y="8" width="12" height="4" fill="#CBD5E1"/>
  <rect x="3" y="12" width="10" height="1" fill="#64748B"/>
</svg>`,

  hot_dry: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
  <rect x="4" y="3" width="6" height="6" fill="#EA580C"/>
  <rect x="5" y="4" width="4" height="4" fill="#FACC15"/>
  <rect x="12" y="2" width="2" height="9" fill="#FCA5A5"/>
  <rect x="12" y="5" width="2" height="6" fill="#DC2626"/>
  <rect x="11" y="10" width="4" height="4" fill="#DC2626"/>
  <rect x="2" y="13" width="7" height="1" fill="#F97316"/>
</svg>`,

  thunderstorms: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
  <rect x="5" y="2" width="6" height="6" fill="#475569"/>
  <rect x="3" y="4" width="10" height="5" fill="#334155"/>
  <rect x="2" y="6" width="12" height="3" fill="#1E293B"/>
  <rect x="7" y="9" width="3" height="2" fill="#FACC15"/>
  <rect x="6" y="11" width="3" height="2" fill="#FACC15"/>
  <rect x="5" y="13" width="2" height="2" fill="#FEF08A"/>
  <rect x="3" y="11" width="1" height="3" fill="#38BDF8"/>
  <rect x="12" y="11" width="1" height="3" fill="#38BDF8"/>
</svg>`,

  heatwave: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
  <rect x="5" y="2" width="6" height="6" fill="#DC2626"/>
  <rect x="6" y="3" width="4" height="4" fill="#FDE047"/>
  <rect x="2" y="10" width="3" height="1" fill="#EF4444"/>
  <rect x="5" y="11" width="3" height="1" fill="#EF4444"/>
  <rect x="8" y="10" width="3" height="1" fill="#EF4444"/>
  <rect x="11" y="11" width="3" height="1" fill="#EF4444"/>
  <rect x="2" y="13" width="3" height="1" fill="#F97316"/>
  <rect x="5" y="14" width="3" height="1" fill="#F97316"/>
  <rect x="8" y="13" width="3" height="1" fill="#F97316"/>
  <rect x="11" y="14" width="3" height="1" fill="#F97316"/>
</svg>`,

  cold_snap: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
  <rect x="7" y="1" width="2" height="14" fill="#38BDF8"/>
  <rect x="1" y="7" width="14" height="2" fill="#38BDF8"/>
  <rect x="3" y="3" width="2" height="2" fill="#BAE6FD"/>
  <rect x="11" y="3" width="2" height="2" fill="#BAE6FD"/>
  <rect x="3" y="11" width="2" height="2" fill="#BAE6FD"/>
  <rect x="11" y="11" width="2" height="2" fill="#BAE6FD"/>
  <rect x="6" y="6" width="4" height="4" fill="#E0F2FE"/>
</svg>`,

  stand: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
  <rect x="2" y="2" width="12" height="3" fill="#EF4444"/>
  <rect x="4" y="2" width="2" height="3" fill="#FEF08A"/>
  <rect x="10" y="2" width="2" height="3" fill="#FEF08A"/>
  <rect x="3" y="5" width="1" height="4" fill="#92400E"/>
  <rect x="12" y="5" width="1" height="4" fill="#92400E"/>
  <rect x="6" y="7" width="2" height="2" fill="#FDE047"/>
  <rect x="2" y="9" width="12" height="6" fill="#FACC15"/>
  <rect x="3" y="10" width="10" height="4" fill="#CA8A04"/>
</svg>`
};

for (const [name, content] of Object.entries(pixelSvgs)) {
  fs.writeFileSync(path.join(pixelDir, `${name}.svg`), content, 'utf8');
}

// 3. Retro Apple ][e Green Phosphor Vector Icons
const retroSvgs = {
  sunny: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="#33FF33" stroke-width="2.5">
  <circle cx="32" cy="32" r="12"/>
  <line x1="32" y1="6" x2="32" y2="14"/>
  <line x1="32" y1="50" x2="32" y2="58"/>
  <line x1="6" y1="32" x2="14" y2="32"/>
  <line x1="50" y1="32" x2="58" y2="32"/>
  <line x1="14" y1="14" x2="20" y2="20"/>
  <line x1="44" y1="44" x2="50" y2="50"/>
  <line x1="50" y1="14" x2="44" y2="20"/>
  <line x1="20" y1="44" x2="14" y2="50"/>
</svg>`,
  cloudy: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="#33FF33" stroke-width="2.5">
  <path d="M18 46H48C53 46 57 42 57 37C57 32 53 28 48 28C46 19 39 14 31 14C22 14 15 21 15 30C11 31 8 35 8 39C8 43 12 46 18 46Z"/>
</svg>`,
  hot_dry: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="#33FF33" stroke-width="2.5">
  <circle cx="26" cy="26" r="10"/>
  <rect x="44" y="12" width="8" height="30"/>
  <circle cx="48" cy="44" r="6" fill="#33FF33"/>
  <path d="M10 52 L20 48 L30 52 L40 48"/>
</svg>`,
  thunderstorms: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="#33FF33" stroke-width="2.5">
  <path d="M16 38H48C52 38 56 34 56 30C56 25 52 21 47 21C45 13 38 8 30 8C22 8 15 15 15 23C10 24 7 28 7 32C7 36 11 38 16 38Z"/>
  <polyline points="34,38 24,49 33,49 28,60"/>
</svg>`,
  heatwave: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="#33FF33" stroke-width="2.5">
  <circle cx="32" cy="24" r="11"/>
  <path d="M10 44 Q18 38 26 44 T42 44 T56 44"/>
  <path d="M10 53 Q18 47 26 53 T42 53 T56 53"/>
</svg>`,
  cold_snap: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="#33FF33" stroke-width="2.5">
  <line x1="32" y1="8" x2="32" y2="56"/>
  <line x1="8" y1="32" x2="56" y2="32"/>
  <line x1="15" y1="15" x2="49" y2="49"/>
  <line x1="49" y1="15" x2="15" y2="49"/>
</svg>`
};

for (const [name, content] of Object.entries(retroSvgs)) {
  fs.writeFileSync(path.join(retroDir, `${name}.svg`), content, 'utf8');
}

// 4. Generate 16-bit PCM WAV files for sound assets
function writeWavFile(filename, samples, sampleRate = 22050) {
  const numSamples = samples.length;
  const buffer = Buffer.alloc(44 + numSamples * 2);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (PCM)
  buffer.writeUInt16LE(1, 20);  // AudioFormat (1 = PCM)
  buffer.writeUInt16LE(1, 22);  // NumChannels (1 = mono)
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // ByteRate
  buffer.writeUInt16LE(2, 32);  // BlockAlign
  buffer.writeUInt16LE(16, 34); // BitsPerSample
  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples * 2, 40);

  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }

  fs.writeFileSync(path.join(soundDir, filename), buffer);
}

function synthTone(freqs, durationSec, wave = 'square', sampleRate = 22050) {
  const totalSamples = Math.floor(durationSec * sampleRate);
  const samples = new Float32Array(totalSamples);
  const segLen = Math.floor(totalSamples / freqs.length);

  for (let i = 0; i < totalSamples; i++) {
    const segIdx = Math.min(freqs.length - 1, Math.floor(i / segLen));
    const freq = freqs[segIdx];
    const t = i / sampleRate;
    const env = Math.max(0, 1 - (i % segLen) / segLen) * 0.35;
    const phase = 2 * Math.PI * freq * t;
    let val = 0;
    if (wave === 'square') {
      val = Math.sin(phase) >= 0 ? 1 : -1;
    } else if (wave === 'sine') {
      val = Math.sin(phase);
    } else {
      val = (2 / Math.PI) * Math.asin(Math.sin(phase));
    }
    samples[i] = val * env;
  }
  return samples;
}

writeWavFile('click.wav', synthTone([880], 0.06, 'square'));
writeWavFile('cash.wav', synthTone([987.77, 1318.51], 0.22, 'square'));
writeWavFile('day_start.wav', synthTone([523.25, 659.25, 783.99, 1046.5], 0.36, 'triangle'));
writeWavFile('event_alert.wav', synthTone([440, 349.23, 440], 0.3, 'square'));
writeWavFile('victory.wav', synthTone([523.25, 659.25, 783.99, 1046.5, 1318.51], 0.55, 'square'));
writeWavFile('error.wav', synthTone([220, 164.81], 0.28, 'square'));

console.log('✅ All SVG, Pixel-Art, Retro, and WAV sound assets generated in frontend/assets/');
