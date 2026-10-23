# Player observations backend (Cloudflare Pages + D1)

The game pages show a "玩家观察 / Player observations" panel backed by the Pages Function at `/api/feedback`.

## Setup (once)

1. Cloudflare Dashboard → Storage & databases → D1 → create a database (for example `gameaichecker-feedback`).
2. Pages project → Settings → Bindings → Add → D1 database: variable name **`DB`**, select the database. Add it to **Production** (and Preview if you test there).
3. Pages project → Settings → Variables and Secrets → add a **secret** named **`FEEDBACK_SECRET`** with a long random value (for example the output of `openssl rand -hex 32`). Production and Preview are configured separately.
4. Redeploy (Deployments → latest → Retry deployment). Bindings and secrets only apply to new deployments.

The table is created and migrated automatically on the first request. Running `schema.sql` is optional.

## Check it works

Open `https://gameaichecker.com/api/feedback?health=1`:

```json
{"db":true,"secret":true,"schema":true,"writable":true}
```

- `db:false` → the D1 binding is missing or not named `DB`, or the deployment predates it.
- `secret:false` → `FEEDBACK_SECRET` is missing in this environment.
- `schema:false` → see `schemaError`; usually a permissions or binding problem.

If the panel says "玩家反馈暂未开放", the health check will say which piece is missing. The rest of the page is unaffected.

## How votes are counted

- No account. Each browser gets a random anonymous id (localStorage); one vote per browser per game, and it can be changed.
- The id and the network address are stored only as HMACs keyed by `FEEDBACK_SECRET`. Raw IPs are never stored.
- Per network: the first 5 voters on a game count; further new votes are stored with `flagged = 1` and left out of public counts. More than 30 new votes per hour from one network get HTTP 429.
- The panel shows counts only under 10 observations, and percentages from 10 upward.
- This limits casual vote stuffing; it cannot stop determined abuse. Consider Cloudflare Turnstile before heavy promotion.

Clues (specific locations, interviews, sources) go to GitHub issues through the "提交线索" button and are reviewed before anything enters the evidence table. Vote counts are subjective impressions, not verified AI-use percentages.

## Useful queries (D1 console)

```sql
-- Public counts for one game
SELECT vote, COUNT(*) FROM game_feedback WHERE game_key='steam:4598530' AND flagged=0 GROUP BY vote;
-- Games with many flagged votes (possible stuffing)
SELECT game_key, COUNT(*) AS flagged FROM game_feedback WHERE flagged=1 GROUP BY game_key ORDER BY flagged DESC LIMIT 20;
```
