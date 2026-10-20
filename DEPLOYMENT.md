# Deployment Guide — `lemonadestand.stabthefinger.com`

This guide covers deploying **Lemonade Stand** in production with:
1. **Backend + Persistent SQLite** on **Fly.io** or **Render**
2. **Frontend** on **Vercel** or **Netlify** (or unified single-service hosting on Fly.io/Render)
3. **Custom Subdomain Mapping** for `lemonadestand.stabthefinger.com`

---

## Option 0: JetHost / PHP Shared Server (Zero Node.js Required)

If your web server is **JetHost** (or any standard cPanel / Apache / PHP shared host):

### 1. Build Production Assets Locally
Run the frontend build script on your computer:
```bash
npm run build
```
This generates all icons, sounds, and minified CSS directly inside `frontend/`, including:
- `frontend/index.html`, `frontend/css/`, `frontend/js/`, `frontend/assets/`
- `frontend/api/index.php` (native PHP + SQLite PDO leaderboard & save API)
- `frontend/.htaccess` (Apache URL routing & database protection)

### 2. Upload to JetHost
1. Log into your **JetHost cPanel**.
2. Open **File Manager** and navigate to your website's root folder (`public_html` or your subdomain folder `public_html/lemonadestand`).
3. Upload all files and folders from inside `frontend/` (plus `schema.sql`) directly into that folder.
4. JetHost will automatically run the PHP SQLite API and serve the game.

---

## Option A: Unified Full-Stack Deployment on Fly.io (Recommended Fastest Setup)

Because `backend/server.js` serves both the `/api/*` SQLite endpoints and the static `frontend/` assets, you can deploy the entire application on Fly.io with a persistent SQLite volume mounted at `/data`.

### 1. Create the Fly App & Persistent SQLite Volume

```bash
fly launch --no-deploy --name lemonade-stand-api
fly volumes create lemonade_sqlite_data --region ord --size 1
```

### 2. Deploy

```bash
fly deploy
```

The included [`fly.toml`](./fly.toml) and [`Dockerfile`](./Dockerfile) automatically:
- Mount the persistent volume at `/data`
- Store the SQLite database at `/data/lemonadestand.db` (enabled with `PRAGMA journal_mode = WAL;`)
- Initialize all leaderboard and run-session tables from [`schema.sql`](./schema.sql)

---

## Option B: Backend on Render + Persistent Disk

1. Push this repository to GitHub/GitLab.
2. In the **Render Dashboard**, click **New + -> Blueprint** and select your repository.
3. Render automatically reads [`render.yaml`](./render.yaml):
   - Provisions a Docker web service (`lemonade-stand-api`)
   - Attaches a 1 GB persistent disk mounted at `/data`
   - Sets `DB_PATH=/data/lemonadestand.db` and `TRUST_PROXY=2`

---

## Option C: Split Frontend (Vercel or Netlify) + Backend (Fly.io or Render)

`npm run build` is frontend-only (generates assets and compiles Tailwind CSS into `frontend/` without touching SQLite or creating a `dist/` folder), so Netlify and Vercel builds work out of the box and publish `frontend/`.

### 1. Deploy Frontend on Vercel
```bash
npx vercel --prod
```

### 2. Deploy Frontend on Netlify
```bash
npx netlify-cli deploy --prod --dir=frontend
```
