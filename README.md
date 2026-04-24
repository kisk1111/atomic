# atomic dashboard

Public dashboard for your chess.com atomic games, with a password-gated
paste-to-upload flow. Stack: Vercel (hosting + serverless API) + Neon (free
Postgres).

## Files

- `index.html` — dashboard (static, fetches `/api/games`)
- `api/games.js` — `GET /api/games`, returns all games as JSON
- `api/upload.js` — `POST /api/upload`, password-gated, parses + inserts
- `lib/parse.js` — shared parser for chess.com txt dumps
- `schema.sql` — Postgres table definition
- `convert.py` — optional local txt → csv converter (unchanged)
- `games.txt` — your sample dump (unused by the web app)

## Setup

### 1. Create a Neon database (free)

1. Sign up at <https://neon.tech>
2. Create a project → you get a connection string like
   `postgresql://user:pass@host/db?sslmode=require`
3. Open the **SQL Editor** and paste the contents of `schema.sql`, run it.

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
5. Deploy.

(Alternatively: Vercel has a one-click Neon integration under **Storage** that
sets `DATABASE_URL` automatically.)

### 4. Use it

- Public URL shows the dashboard.
- Scroll to **Upload new games**, enter your password, paste chess.com blocks,
  hit Submit. Server parses, dedupes on `(timestamp, opponent)`, and inserts.

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
