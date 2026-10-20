# 🍋 Lemonade Stand

A complete, production-ready web recreation of the classic 1979 Apple ][e **Lemonade Stand** business simulation game, featuring a persistent **Three-Way Visual Mode Toggle** (**Retro Apple ][e**, **8-Bit Arcade**, and **Modern**), a strict **Family-Friendly Stand Name Filter**, automatic **LocalStorage Save State**, and **7 SQLite-backed Leaderboards**.

Target Subdomain: `lemonadestand.stabthefinger.com`

---

## ✨ Key Features

- **Three-Way Visual Mode Toggle** (persisted in `localStorage`):
  - **Retro Mode (`][e Retro`)**: Apple ][e green phosphor (`#33FF33`) monochrome CRT theme with scanlines, vignette glow, ASCII/vector phosphor art, and 1-bit speaker square-wave sound effects.
  - **8-Bit Mode (`8-Bit`)**: Atari/NES/Genesis pixel-art aesthetic with chunky pixel borders, 16x16 pixel weather & stand sprites, and multi-channel chiptune UI sounds.
  - **Modern Mode (`Modern`)**: Clean glassmorphic cards, soft citrus & sky gradients, smooth animations, vector SVG weather icons, and warm harmonic chimes.
- **Strict Family-Friendly Stand Name Filter**:
  - Enforces `3–12` characters (`A–Z`, `a–z`, `0–9`, `_`).
  - Normalizes lowercase, strips separators, decodes multi-variant leetspeak (`a55`, `f4g`, `b1tch`, `5h1t`, `c0ck`, etc.), resolves phonetic obfuscations (`azz`, `fuk`, `shyt`, `cawk`, `phuck`, `biatch`), collapses repeated letters (`fuuuuck`, `biiiiitch`), and blocks any nickname containing profanity even when embedded inside longer strings—both client-side and server-side.
  - **Silent Success & Friendly Failure**: Valid Stand Names produce zero text (completely silent success). Invalid names display the exact friendly message: *"Stand Name not allowed. Please choose a family-friendly name."*
  - **Non-Enforced Uniqueness**: Multiple players may freely use the same Stand Name.
- **Hidden Stand Token (Anonymous Player Identity)**:
  - Generates an anonymous random 6–10 character token on first visit stored in `localStorage` (`standToken`).
  - Never displayed to the user; included with leaderboard submissions and stored server-side.
  - **Leaderboard Highlighting**: Matching entries for the active player are marked with `🍋 <=== You`.
  - **Zero Tracking**: No IP addresses logged or displayed, and no cookie banner required.
- **Classic Apple ][e Gameplay Mechanics**:
  - Manage daily glasses made, advertising signs (`15¢` each), and price per glass (`1¢–100¢`).
  - Dynamic weather system: **Sunny**, **Cloudy**, **Hot & Dry**, **Thunderstorms**, **Extreme Heatwave**, and **Cold Snap**.
  - Random neighborhood events: **Severe Thunderstorms** wiping out sales, **Street Closures** (detours or thirsty road crews buying out your stock!), **Windy Gusts** blowing down signs, **Ingredient Supply Shortages**, and **Neighborhood Block Parties**.
  - Play **Standard 12-Day Mode** or **Endless Summer Mode** with automatic `localStorage` save state (`Continue Your Stand` / `Start New Stand`).
- **7 Leaderboards + Anti-Cheat Validation**:
  - `leaderboard_daily`, `leaderboard_weekly`, `leaderboard_all_time`, `leaderboard_best_day`, `leaderboard_best_run`, `leaderboard_glasses_day`, `leaderboard_glasses_run`.

---

## 📁 Project Structure

```text
lemstand/
├── backend/
│   ├── scripts/
│   │   ├── initDb.js            # Initializes SQLite database and applies schema.sql
│   │   └── seedDb.js            # Seeds starter family-friendly leaderboard entries
│   ├── src/
│   │   ├── db.js                # Parameterized SQLite queries (node:sqlite)
│   │   ├── profanityFilter.js   # Server-side strict family-friendly filter
│   │   └── validation.js        # Anti-cheat score integrity & input sanitization
│   └── server.js                # Express API server, rate-limiting, & static host
├── frontend/
│   ├── assets/
│   │   ├── icons/
│   │   │   ├── pixel/           # 8-bit pixel weather & stand sprites (.svg)
│   │   │   ├── retro/           # Apple ][e green phosphor vector icons (.svg)
│   │   │   └── svg/             # Modern gradient vector weather icons (.svg)
│   │   └── sounds/              # Generated 16-bit PCM WAV sound effects (.wav)
│   ├── css/
│   │   └── styles.css           # Retro CRT, 8-Bit Arcade, and Modern theme styles
│   ├── js/
│   │   ├── assets.js            # Theme-aware icon & ASCII banner renderer
│   │   ├── game.js              # Core Lemonade Stand simulation & UI controller
│   │   ├── profanityFilter.js   # Shared client/server strict nickname filter
│   │   └── sound.js             # Adaptive Web Audio synthesizer + sound toggle
│   └── index.html               # Responsive single-page game UI
├── scripts/
│   ├── build.js                 # Generates assets, builds dist/, and initializes DB
│   └── generateAssets.js        # Builds SVG, pixel, retro, and WAV sound assets
├── tests/
│   └── runTests.js              # Automated unit & E2E API test suite
├── API.md                       # Complete REST API documentation
├── DEPLOYMENT.md                # Vercel, Netlify, Fly.io, Render & DNS guide
├── Dockerfile                   # Production container build
├── fly.toml                     # Fly.io config with persistent SQLite volume
├── netlify.toml                 # Netlify frontend deployment config
├── package.json                 # Scripts and dependencies
├── render.yaml                  # Render.com blueprint with persistent SQLite disk
├── schema.sql                   # SQLite schema for all 7 leaderboard tables
└── vercel.json                  # Vercel frontend deployment config
```

---

## 🚀 Quick Start & Build Instructions

### Prerequisites
- **Node.js** `>= 22.5.0` (uses built-in native `node:sqlite` with zero native C++ compilation dependencies)

### 1. Install Dependencies
```bash
npm install
```

### 2. Build Production Assets & Initialize SQLite Database
```bash
npm run build
```
This generates all SVG, pixel-art, retro, and WAV sound assets in `frontend/assets/`, populates the production `dist/` directory, and initializes `backend/data/lemonadestand.db` using `schema.sql`.

### 3. Run the Test Suite
```bash
npm test
```

### 4. Start the Server
```bash
npm start
```
Open **`http://localhost:3000`** in your browser.
