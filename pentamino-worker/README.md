# pentamino-scores worker

Cloudflare Worker serving the global top-10 leaderboard and basic analytics
for [/pentabomb](../pentabomb/index.html) (the game formerly at /pentamino —
the worker keeps its original name so the deployed URL never changes).
Deployed at `https://pentamino-scores.mail-f78.workers.dev`, storage in
Workers KV (binding `SCORES`; leaderboard under key `top`, analytics under
`stats:*`).

## API

- `POST /token` → `{ token }` — single-use play token, fetched at game start
- `GET /scores` → `{ "scores": [{ name, score, clears, level, date }, ...] }`
- `POST /scores` with `{ name, score, clears, level, token }` → same shape plus
  `rank` (1-based position if the entry made the top 10, else `null`)
- `POST /event` with `{ type: "visit"|"start"|"end", first?, score?, clears?,
  level?, sec? }` → `{ ok: true }` — fired by the game as beacons
- `GET /stats` → `{ all: {...}, days: [{ date, ... }, ...] }` — all-time and
  last-14-days aggregates (visits, uniques, starts, ends, avgScore, avgSec,
  best). Rendered at [/pentabomb/stats.html](../pentabomb/stats.html).

CORS allows `xin-squared.com`, `www.xin-squared.com`, and localhost (for dev).

## Analytics

Aggregate counters only — no cookies, no per-user IDs, nothing personal
stored. `visits` counts page loads; `uniques` counts first-ever visits per
device (a localStorage flag client-side). Counters live in KV keys
`stats:all` (forever) and `stats:d:<YYYY-MM-DD>` (auto-expire after ~3
months). KV read-modify-write means two simultaneous events can occasionally
drop a count; that's fine for tracking traction.

## Anti-cheat

Friction, not proof (the game runs client-side, so a determined attacker can
always fake a score; real prevention would need server-side replay validation):

- Submissions require a server-issued single-use token (`t:<uuid>` in KV).
- A score is rejected unless the token is old enough for the points to have
  been physically playable (1000 pts/sec ceiling, 500-pt grace) — forging a
  big score means holding a fresh token for minutes per attempt. (The
  ceiling was originally 100 pts/sec, which rejected a legitimate 500k
  game — scoring scales with level, so good runs average far above 100.)
- Per-IP hourly rate limits: 120 tokens, 20 submissions, 400 events
  (`rl:*` keys in KV).
- POST endpoints require an allowlisted Origin header.

## Maintenance

Run from this directory:

```sh
npx wrangler@4 deploy                                    # redeploy after edits
npx wrangler@4 kv key get top --binding=SCORES --remote  # view leaderboard
npx wrangler@4 kv key delete top --binding=SCORES --remote  # wipe leaderboard
npx wrangler@4 kv key get stats:all --binding=SCORES --remote  # raw counters
npx wrangler@4 tail pentamino-scores                     # live request logs
```

To remove a single bogus entry: `kv key get`, edit the JSON, then
`npx wrangler@4 kv key put top '<edited json>' --binding=SCORES --remote`.

Duplicates (same name + same score) collapse automatically, keeping the copy
with the most clears — so a hand-seeded placeholder disappears once the real
run's entry is on the board. Note the seed merge only ever *adds* entries to
the Durable Object's list; deleting one that's already on the board means
shipping a code change or a storage edit, not just a KV edit + mark bump.
