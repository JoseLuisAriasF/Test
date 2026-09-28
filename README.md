# BloxPulse

Auto-updating Roblox codes & guides site for the 50 most played games right now.
Astro 7 (static) → Cloudflare Workers static assets. Everything free.

## How it works

Every 2 hours GitHub Actions runs `scripts/update.mjs`:

| Data | Source |
|---|---|
| Top 50 by live players | Roblox explore API (`top-playing-now`) |
| Stats, description, updates | games.roblox.com |
| Icons, screenshots | thumbnails.roblox.com |
| Badges + rarity | badges.roblox.com |
| Game passes + prices | apis.roblox.com/game-passes |
| Codes (majority vote) | Pocket Tactics, Beebom, Destructoid |
| Guide, tips, beginner steps, FAQ | GitHub Models AI (free with the Actions token) |

It commits `src/data/games.json`, builds, and deploys. Games that leave the top 50 keep their pages for 120 days.

## Setup (one time)

1. Push this folder to a GitHub repo (public = unlimited free Actions minutes).
2. Cloudflare dashboard → My Profile → API Tokens → template **Edit Cloudflare Workers**. Copy the token and your Account ID.
3. GitHub repo → Settings → Secrets and variables → Actions:
   - Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
   - Variables: `SITE_URL` = `https://yourdomain.com`
4. Actions tab → **Update data & deploy** → Run workflow.
5. Cloudflare → Workers → bloxpulse → Settings → Domains: add your domain.
6. Submit `https://yourdomain.com/sitemap-index.xml` in Google Search Console.

### Sign in with Google (optional, free)

Without it everything works: players get a guest profile saved on their device.

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → Create credentials → **OAuth client ID** → Web application.
2. Authorized JavaScript origins: `https://yourdomain.com` (and `http://localhost:8787` for testing).
3. Copy the Client ID (public, not a secret) into the GitHub **variable** `GOOGLE_CLIENT_ID`.
   The workflow passes it to the site build and to the Worker, which verifies Google's signature itself.

Only a hash of Google's user id is stored: no email, no name. Players under 13 (neutral age question)
keep playing as guests, as Google accounts require 13+ (or Family Link).

## Local

```
npm install
npm run update   # fetch fresh data (AI guides only if GITHUB_TOKEN is set)
npm run dev      # site only (fast, hot reload) - live VS battles won't connect
npm run dev:full # site + battles/ranked on http://127.0.0.1:8787 (local Cloudflare simulator)
npm test         # codes, round engine, Google token verifier, avatars
```

Don't run `npm run build` while `dev:full` is open: the simulator's file watcher crashes when Astro
clears `dist/`. Stop it, build, start it again.

## RoGuessr (`/guessr/`), Ranking (`/ranking/`), Locker (`/avatar/`)

- **6 round types**, all generated from the site data (`src/lib/rounds.js`): screenshots, pixel icons,
  higher-or-lower, trivia, codes, badges. Players mix any of them, pick rounds and timer.
- **Modes**: Classic, Daily, Endless, custom solo, friend rooms (room codes), challenge links, quick match, Ranked.
- **Same engine on both sides**: seed + config + `guessr.json` produce identical rounds in the browser and
  the Worker, so battles are scored by the server with its own clock (clients can't send fake points).
- **Ranked**: multiplayer Elo, tiers Bronze → Legend, alts on the same IP don't move rating, leavers still lose.
  Ranked = 1v1 challenges: a player posts one with the modes/rounds/timer they pick, it appears on a live board
  (pushed over WebSocket by the Matchmaker DO), others see the modes and the rating at stake and accept it.
  It waits as long as needed (no bots) and starts the moment someone accepts.
  Casual quick match starts after 15s, with a labelled bot if you are alone.
- **Avatars** (`src/lib/avatar.js`): blocky SVG, 3 body types (Other = 8-bit pixel head), every cosmetic anchored to shared head/torso
  points. Unlocks come only from server-scored stats; top 1/3/10 cosmetics are removed when the spot is lost.
- **Backend** (`worker/index.js`): `Room` (one Durable Object per match), `Matchmaker`, `Leaderboard` (SQLite).
  No free text anywhere: names are generated.

## Costs

| Part | Plan | Limit |
|---|---|---|
| Site (static assets) | Workers Free | unlimited |
| Battles, ranking, profiles (`/api/*`) | Workers Free + SQLite Durable Objects | ~100k requests/day; over it, battles pause and solo modes keep working |
| Sign in with Google | Google Identity Services | free, unlimited |
| Data refresh + AI guides | GitHub Actions + GitHub Models | free (public repo) |

Scaling up later: Workers Paid ($5/mo) lifts the VS limits with no code changes.

Rename the site: `SITE_NAME` in `src/lib/data.js` and `name` in `wrangler.jsonc`.
