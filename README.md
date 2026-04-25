# atomic dashboard

Public dashboard for your chess.com atomic games, with a password-gated
paste-to-upload flow. Stack: Vercel (hosting + serverless API) + Neon (free
Postgres).

## Files

- `index.html` — dashboard (static, fetches `/api/games`)
- `api/games.js` — `GET /api/games`, returns all games as JSON
- `api/upload.js` — `POST /api/upload`, password-gated, parses pasted text + inserts
- `api/sync.js` — `POST /api/sync`, password-gated, pulls every atomic game from
  your chess.com archives via the public API and inserts new ones
- `lib/parse.js` — shared parser for chess.com txt dumps
- `schema.sql` — Postgres table definition (fresh installs)
- `migrate.sql` — one-time alter for databases created before the sync feature
- `convert.py` — optional local txt → csv converter (unchanged)
- `games.txt` — your sample dump (unused by the web app)

## Setup

### 1. Create a Neon database (free)

1. Sign up at <https://neon.tech>
2. Create a project → you get a connection string like
   `postgresql://user:pass@host/db?sslmode=require`
3. Open the **SQL Editor** and paste the contents of `schema.sql`, run it.
   - If you already had a database from before the sync feature, run
     `migrate.sql` instead — it adds the new columns (`pgn`, `chesscom_url`,
     `time_class`, `rated`, `eco`, `source`) without touching existing rows.

### 2. Push this folder to GitHub

```bash
git init
git add .
git commit -m "initial"
git branch -M main
git remote add origin https://github.com/<you>/atomic-dashboard.git
git push -u origin main
```

### 3. Deploy to Vercel

1. Sign up at <https://vercel.com> with your GitHub account.
2. **Add New → Project** → import the repo.
3. Framework preset: **Other**. Leave everything else default.
4. In **Environment Variables** add:
   - `DATABASE_URL` → your Neon connection string
   - `UPLOAD_PASSWORD` → whatever password you want
   - `CHESSCOM_USERNAME` → your chess.com handle (defaults to `w-a-s-u-k-e`)
5. Deploy.

(Alternatively: Vercel has a one-click Neon integration under **Storage** that
sets `DATABASE_URL` automatically.)

### 4. Use it

- Public URL shows the dashboard.
- Open the **Upload** tab and either:
  - Enter your password and click **Sync** to pull every atomic game from your
    chess.com archives via the public API. Safe to re-run — dedup is by
    timestamp. Use **Wipe & resync** to truncate first if your data is messy.
  - Or paste chess.com activity-feed blocks into the textarea and **Submit**.

### Timezone wrinkle

The chess.com API returns game times in UTC. The paste-upload flow stores the
viewer's *local* time (the activity feed doesn't include a year, so we attach
the upload-time year and the browser's local TZ). If you mix the two sources,
the same physical game can land in the DB twice with timestamps that differ by
your UTC offset. If you've already paste-uploaded games and want to switch to
the API sync, hit **Wipe & resync** once for a clean slate.

## How winner/color is derived

chess.com's list doesn't consistently put white first. So:

- **Winner** = whoever gained rating points (draw if score is `½-½`).
- **Color** = combine winner + score: `1-0` → winner was white; `0-1` → winner
  was black. For draws, color is stored as NULL.

## Local dev (optional)

```bash
npm install
npx vercel dev          # runs the API routes + static site locally
```

You'll need `.env.local` with `DATABASE_URL` and `UPLOAD_PASSWORD`.

## Notes / limits

- Neon free tier: 0.5 GB storage, plenty for years of game history.
- Vercel free tier (Hobby): unlimited requests for a personal project like this.
- No auth on reads — anyone who hits your URL can see games. Password only gates
  uploads. If you want read auth too, add a check to `api/games.js`.
