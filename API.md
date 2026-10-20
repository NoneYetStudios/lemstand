# Lemonade Stand — REST API Documentation

**Base URL (Production):** `https://lemonadestand.stabthefinger.com/api`  
**Base URL (Local Development):** `http://localhost:3000/api`

All endpoints enforce:
- Strict input sanitization (stripping control & HTML characters)
- Strict server-side family-friendly nickname filtering (`ProfanityFilter.validateStandName`)
- Parameterized SQLite queries (`node:sqlite` prepared statements)
- IP-based rate limiting (`express-rate-limit`) without storing or exposing raw IP addresses
- Anonymous identity via hidden Stand Tokens (`standToken` in `localStorage`)
- Silent validation success and friendly failure messaging

---

## 1. Submit Score

Records a verified game run across the SQLite leaderboard tables (`leaderboard_daily`, `leaderboard_weekly`, `leaderboard_all_time`, `leaderboard_best_day`, `leaderboard_best_run`, `leaderboard_glasses_day`, `leaderboard_glasses_run`).

- **Endpoints:**
  - `POST /api/scores`
  - `POST /api/leaderboard/submit` (alias)
- **Rate Limit:** 10 submissions per minute per IP
- **Content-Type:** `application/json`

### Request Body

```json
{
  "stand_name": "Sunny_Cups",
  "stand_token": "Xk9Pq2Lm",
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
  ],
  "integrity_hash": "8a4f21c0"
}
```

### Field Rules & Anti-Cheat Integrity Validation

| Field | Type | Validation Rule |
| :--- | :--- | :--- |
| `stand_name` | `string` | Required. `3–12` chars (`^[A-Za-z0-9_]{3,12}$`). Strictly filtered against direct, partial, repeated, leetspeak, and obfuscated profanity. **Non-enforced uniqueness**: Multiple players can use the same Stand Name. |
| `stand_token` | `string` | Optional/Recommended. Anonymous 6–10 character random token stored in client `localStorage` (`standToken`). Used to highlight current player's entries (`🍋 <=== You`). |
| `score` | `integer` | Required. Net profit in cents (e.g. `2640` = `$26.40`). Must match sum of `day_log[].profitCents` if `day_log` is supplied. |
| `mode` | `string` | Required. Must be `'retro'`, `'8-bit'`, or `'modern'`. |
| `game_mode` | `string` | Optional (`'standard'` or `'endless'`). Standard runs max out at 12 days. |
| `days_played` | `integer` | `1–12` for `'standard'`, `1–365` for `'endless'`. |
| `best_day_profit` | `integer` | Highest single-day profit in cents during the run. |
| `total_glasses_sold` | `integer` | Cumulative glasses sold across the run. |
| `best_day_glasses` | `integer` | Highest single-day glasses sold during the run (`<= total_glasses_sold`). |
| `integrity_hash` | `string` | Optional FNV-1a 32-bit hex signature computed over `(stand_name, score, total_glasses_sold, best_day_profit, best_day_glasses, days_played)`. |

### Success Response (`201 Created`)

```json
{
  "ok": true,
  "message": "Score verified and recorded on leaderboards!",
  "entry": {
    "id": "e4c3f682-6c73-4f1a-8e33-9a8d71c2b901",
    "ids": {
      "daily": "0f8fad5b-d9cb-469f-a165-70867728950e",
      "weekly": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      "all_time": "e4c3f682-6c73-4f1a-8e33-9a8d71c2b901",
      "best_day": "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
      "best_run": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "glasses_day": "6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b",
      "glasses_run": "c9a646d3-9c61-4cb7-bfcd-ee2522c8f633"
    },
    "stand_name": "Sunny_Cups",
    "stand_token": "Xk9Pq2Lm",
    "score": 2640,
    "date": "2026-10-19T19:45:00.000Z",
    "mode": "modern",
    "version": "1.0.0"
  }
}
```

### Error Response (`400 Bad Request` / `429 Too Many Requests`)

```json
{
  "ok": false,
  "code": "PROFANITY_REJECTED",
  "error": "Stand Name not allowed. Please choose a family-friendly name."
}
```

---

## 2. Validate Stand Name

Validates a candidate Stand Name against length, character whitelist, and strict normalization/profanity rules.

- **Endpoint:** `POST /api/validate-nickname`
- **Request Body:**
  ```json
  { "stand_name": "Sunny_Cups" }
  ```
- **Response on Success (`200 OK` - Silent):**
  ```json
  {
    "ok": true,
    "valid": true,
    "stand_name": "Sunny_Cups",
    "normalized": "sunnycups",
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

## 3. Leaderboard Fetch Endpoints

All 7 leaderboard endpoints accept optional query parameters:
- `mode`: Filter by visual mode (`retro`, `8-bit`, or `modern`)
- `limit`: Number of rows to return (`1–100`, default `25`)

### Endpoints

| Category | Endpoint | Score Metric | Description |
| :--- | :--- | :--- | :--- |
| **Daily** | `GET /api/leaderboard/daily` | Cents (`2640` = `$26.40`) | Top runs recorded in the last 24 hours |
| **Weekly** | `GET /api/leaderboard/weekly` | Cents (`2640` = `$26.40`) | Top runs recorded in the last 7 days |
| **All-Time** | `GET /api/leaderboard/all-time` | Cents (`3480` = `$34.80`) | Highest net profit across all runs |
| **Best Single-Day Profit** | `GET /api/leaderboard/best-day` | Cents (`640` = `$6.40`) | Highest net profit achieved in a single day |
| **Best 12-Day Run** | `GET /api/leaderboard/best-run` | Cents (`3480` = `$34.80`) | Highest total profit in a standard 12-day season |
| **Most Glasses (Day)** | `GET /api/leaderboard/glasses-day` | Glasses (`78`) | Most glasses of lemonade sold in a single day |
| **Most Glasses (Run)** | `GET /api/leaderboard/glasses-run` | Glasses (`485`) | Most glasses of lemonade sold across a full run |

### Example Response (`200 OK`)

```json
{
  "ok": true,
  "category": "all-time",
  "title": "All-Time Top Profits",
  "unit": "cents",
  "mode_filter": "all",
  "count": 2,
  "entries": [
    {
      "rank": 1,
      "id": "e4c3f682-6c73-4f1a-8e33-9a8d71c2b901",
      "stand_name": "Apple_IIe",
      "stand_token": "STARTER_Apple_IIe",
      "score": 3480,
      "date": "2026-10-19T19:45:00.000Z",
      "mode": "retro",
      "version": "1.0.0"
    },
    {
      "rank": 2,
      "id": "2c5f9b81-1e34-4a91-b502-7f9e1a0c4412",
      "stand_name": "Pixel_Press",
      "stand_token": "STARTER_Pixel_Press",
      "score": 2950,
      "date": "2026-10-19T19:45:00.000Z",
      "mode": "8-bit",
      "version": "1.0.0"
    }
  ]
}
```

---

## 4. Active Game Save State (Carry-Forward Daily Settings)

Persists and synchronizes in-progress game state across days, including carry-forward settings (`glasses`, `signs`, `price`).

### 4.1 Save Game State
- **Endpoint:** `POST /api/save`
- **Content-Type:** `application/json`

#### Request Body
```json
{
  "stand_token": "Xk9Pq2Lm",
  "state": {
    "standName": "Sunny_Cups",
    "gameMode": "standard",
    "day": 2,
    "assetsCents": 345,
    "lastSettings": {
      "glasses": 35,
      "signs": 2,
      "price": 12
    }
  }
}
```

#### Response (`200 OK`)
```json
{
  "ok": true,
  "updated_at": "2026-10-19T21:10:00.000Z"
}
```

### 4.2 Load Game State
- **Endpoint:** `GET /api/save/:standToken`
- **Response (`200 OK`):**
```json
{
  "ok": true,
  "state": { ... }
}
```

### 4.3 Delete Game State
- **Endpoint:** `DELETE /api/save/:standToken`
- **Response (`200 OK`):**
```json
{
  "ok": true
}
```
