# Deployment Guide — `lemonadestand.stabthefinger.com`

This guide covers deploying **Lemonade Stand** in production with:
1. **Backend + Persistent SQLite** on **Fly.io** or **Render**
2. **Frontend** on **Vercel** or **Netlify** (or unified single-service hosting on Fly.io/Render)
3. **Custom Subdomain Mapping** for `lemonadestand.stabthefinger.com`

---

## Option 0: JetHost / PHP Shared Server (Zero Node.js Required)

If your web server is **JetHost** (or any standard cPanel / Apache / PHP shared host):

### 1. Build Production Assets Locally
Run the build script on your computer:
```bash
npm run build
```
This generates the complete production bundle in the `dist/` folder, including:
- `dist/index.html`, `dist/css/`, `dist/js/`, `dist/assets/`
- `dist/api/index.php` (native PHP + SQLite PDO leaderboard & save API)
- `dist/.htaccess` (Apache URL routing & database protection)

### 2. Upload to JetHost
1. Log into your **JetHost cPanel**.
2. Open **File Manager** and navigate to your website's root folder (`public_html` or your subdomain folder `public_html/lemonadestand`).
3. Upload all files and folders from inside `dist/` directly into that folder. (Ensure `.htaccess` and `api/` are included).
4. That's it! JetHost will automatically run the PHP SQLite API and serve the game. The SQLite database will be created automatically in `data/lemonadestand.db` and protected against direct browser access.

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
- Initialize all 7 leaderboard tables from [`schema.sql`](./schema.sql)

### 3. Map `lemonadestand.stabthefinger.com` on Fly.io

```bash
fly certs add lemonadestand.stabthefinger.com
```

Add the following DNS records at your DNS provider for `stabthefinger.com`:
- `CNAME` record: `lemonadestand` -> `<your-app-name>.fly.dev`
- (Or `A` / `AAAA` records pointing to the IPs shown by `fly ips list`)

---

## Option B: Backend on Render + Persistent Disk

1. Push this repository to GitHub/GitLab.
2. In the **Render Dashboard**, click **New + -> Blueprint** and select your repository.
3. Render automatically reads [`render.yaml`](./render.yaml):
   - Provisions a Docker web service (`lemonade-stand-api`)
   - Attaches a 1 GB persistent disk mounted at `/data`
   - Sets `DB_PATH=/data/lemonadestand.db` and `ALLOWED_ORIGINS=https://lemonadestand.stabthefinger.com`

---

## Option C: Split Frontend (Vercel or Netlify) + Backend (Fly.io or Render)

If you prefer hosting the static frontend on Vercel/Netlify's edge CDN while proxying `/api/*` requests to your Fly.io or Render backend:

### 1. Deploy Frontend on Vercel

1. Update the destination URL in [`vercel.json`](./vercel.json) if your backend hostname differs from `https://lemonade-stand-api.fly.dev`:
   ```json
   {
     "source": "/api/:path*",
     "destination": "https://lemonade-stand-api.fly.dev/api/:path*"
   }
   ```
2. Deploy with Vercel CLI:
   ```bash
   npx vercel --prod
   ```
3. In Vercel **Project Settings -> Domains**, add:
   ```text
   lemonadestand.stabthefinger.com
   ```
4. In your DNS provider for `stabthefinger.com`, add the CNAME record:
   - **Type:** `CNAME`
   - **Name:** `lemonadestand`
   - **Value:** `cname.vercel-dns.com`

### 2. Deploy Frontend on Netlify

1. Update the `/api/*` redirect target in [`netlify.toml`](./netlify.toml) if needed.
2. Run:
   ```bash
   npx netlify-cli deploy --prod --dir=frontend
   ```
3. In Netlify **Domain Management**, add custom domain `lemonadestand.stabthefinger.com` and point your `lemonadestand` CNAME record to `<your-site>.netlify.app`.

---

## SQLite Backup & Maintenance

Because SQLite runs in `WAL` (Write-Ahead Logging) mode at `/data/lemonadestand.db`, you can safely back up the database online from your Fly.io or Render container:

```bash
fly ssh console -C "sqlite3 /data/lemonadestand.db '.backup /data/lemonadestand-backup.db'"
fly sftp get /data/lemonadestand-backup.db ./lemonadestand-backup.db
```
