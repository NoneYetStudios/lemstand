# Lemonade Stand — REST API Documentation

**Base URL (Production):** `https://lemonadestand.stabthefinger.com/api`  
**Base URL (Local Development):** `http://localhost:3000/api`

All endpoints enforce:
- Strict input sanitization and structured JSON error responses (`{ ok: false, code, error }`)
- Shared client/server family-friendly nickname filtering (`ProfanityFilter.validateStandName`)
- Parameterized SQLite queries (`node:sqlite` prepared statements)
- Proxy-accurate IP rate limiting (`express-rate-limit` resolving Netlify/Vercel/Cloudflare → Fly.io headers)
- Anonymous player identity via SHA-256 hashed Stand Tokens (`sha256(standToken)` stored and returned; raw token never exposed)
- Server-issued per-run seeds (`/api/run/start`) and deterministic server-side simulation replay anti-cheat verification

---

## 1. Start Run & Issue Server Seed

Issues a cryptographically signed per-run seed when a player starts a new stand. Standard and Endless runs roll this seed deterministically across days.

- **Endpoint:** `POST /api/run/start`
- **Content-Type:** `application/json`

### Request Body

```json
{
  "stand_name": "SunnyLemonCart",
  "game_mode": "standard",
  "stand_token": "Xk9Pq2LmAb3Cd4Ef5Gh6"
}
```

### Success Response (`201 Created`)

```json
{
  "ok": true,
  "run_id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "run_seed": 1482950123,
  "run_token": "9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e",
  "stand_name": "SunnyLemonCart",
  "game_mode": "standard"
}
```

---

## 2. Submit Score

Replays the player's `day_log` decisions against the server-issued `run_seed` and records the verified game run across the SQLite leaderboard tables (`leaderboard_daily`, `leaderboard_weekly`, `leaderboard_all_time`, `leaderboard_best_day`, `leaderboard_best_run`, `leaderboard_glasses_day`, `leaderboard_glasses_run`).

- **Endpoints:**
  - `POST /api/scores`
  - `POST /api/leaderboard/submit` (alias)
- **Rate Limit:** 10 submissions per minute per real client IP
- **Content-Type:** `application/json`

### Request Body

```json
{
  "stand_name": "SunnyLemonCart",
  "stand_token": "Xk9Pq2LmAb3Cd4Ef5Gh6",
  "run_id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "run_seed": 1482950123,
  "run_token": "9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e",
  "score": 2640,
  "best_day_profit": 475,
  "best_day_number": 5,
  "best_day_weather": "sunny",
  "total_glasses_sold": 376,
  "best_day_glasses": 58,
  "best_glasses_day_number": 5,
  "best_glasses_weather": "sunny",
  "final_assets": 2840,
  "mode": "modern",
  "game_mode": "standard",
  "days_played": 12,
  "version": "1.0.0",
  "day_log": [
    {
      "day": 1,
      "weather": "sunny",
      "event": "none",
      "glassesMade": 30,
      "glassesSold": 28,
      "signsMade": 1,
      "pricePerGlass": 10,
      "profitCents": 205,
      "assetsAfterCents": 405
    }
  ]
}
```

### Field Rules & Anti-Cheat Integrity Validation

| Field | Type | Validation Rule |
| :--- | :--- | :--- |
| `stand_name` | `string` | Required. `3–18` chars (`^[A-Za-z0-9_]{3,18}$`). Filtered via shared token + substring profanity filter. **Non-enforced uniqueness**: Multiple players can use the same Stand Name. |
| `stand_token` | `string` | Optional/Recommended. Anonymous 16–24 alphanumeric token stored in client `localStorage` (`standToken`). Server stores and returns `sha256(stand_token)`, never the raw token. |
| `run_id` / `run_seed` / `run_token` | `string` / `integer` | Required. Issued by `POST /api/run/start` when the stand begins. Consumed on submission to prevent replay attacks. |
| `day_log` | `array` | Required. Complete day-by-day decision and outcome log. Replayed server-side from `run_seed` (with rolling seeds for each day) to verify affordability, weather, events, sales, and profits. |
| `score` | `integer` | Required. Net profit in cents (e.g. `2640` = `$26.40`). Must match the server-replayed run total. |
| `mode` | `string` | Required. Must be `'retro'`, `'8-bit'`, or `'modern'`. |
| `game_mode` | `string` | Optional (`'standard'` or `'endless'`). Standard runs max out at 12 days; Endless mode uses rolling seeds up to 365 days. |

---

## 3. Validate Stand Name

Validates a candidate Stand Name against length, character whitelist, and token/substring profanity rules.

- **Endpoint:** `POST /api/validate-nickname`
- **Request Body:**
  ```json
  { "stand_name": "Glass" }
  ```
- **Response on Success (`200 OK` - Silent):**
  ```json
  {
    "ok": true,
    "valid": true,
    "stand_name": "Glass",
    "normalized": "glass",
    "message": ""
  }
  ```
- **Response on Failure (`400 Bad Request` - Friendly Error):**
  ```json
  {
    "ok": false,
    "valid": false,
    "code": "PROFANITY_REJECTED",
    "error": "Stand Name not allowed. Please choose a family-friendly name."
  }
  ```

---

## 4. Leaderboard Fetch Endpoints

All 7 leaderboard endpoints accept optional query parameters:
- `mode`: Filter by visual mode (`retro`, `8-bit`, or `modern`)
- `limit`: Number of rows to return (`1–100`, default `25`)

All leaderboard entries return `stand_token` as a 64-character SHA-256 hex digest (`sha256(token)`). The client hashes its own local token to identify `"You"` rows (`🍋 <=== You`).

---

## 5. Active Game Save State (Carry-Forward Daily Settings)

Persists and synchronizes in-progress game state across days, keyed by `sha256(stand_token)`. Requires a valid 16–24 character raw `stand_token` so leaderboard hashes can never read, overwrite, or delete another player's save.

- `POST /api/save`
- `GET /api/save/:standToken`
- `DELETE /api/save/:standToken`
