# pentamino-scores worker

Cloudflare Worker serving the global top-10 leaderboard for
[/pentamino](../pentamino/index.html). Deployed at
`https://pentamino-scores.mail-f78.workers.dev`, storage in Workers KV
(binding `SCORES`, single key `top`).

## API

- `POST /token` → `{ token }` — single-use play token, fetched at game start
- `GET /scores` → `{ "scores": [{ name, score, clears, level, date }, ...] }`
- `POST /scores` with `{ name, score, clears, level, token }` → same shape plus
  `rank` (1-based position if the entry made the top 10, else `null`)

CORS allows `xin-squared.com`, `www.xin-squared.com`, and localhost (for dev).

## Anti-cheat

Friction, not proof (the game runs client-side, so a determined attacker can
always fake a score; real prevention would need server-side replay validation):

- Submissions require a server-issued single-use token (`t:<uuid>` in KV).
- A score is rejected unless the token is old enough for the points to have
  been physically playable (100 pts/sec ceiling, 500-pt grace) — forging a
  big score means holding a fresh token for many minutes per attempt.
- Per-IP hourly rate limits: 120 tokens, 20 submissions (`rl:*` keys in KV).
- POST endpoints require an allowlisted Origin header.

## Maintenance

Run from this directory:

```sh
npx wrangler@4 deploy                                    # redeploy after edits
npx wrangler@4 kv key get top --binding=SCORES --remote  # view leaderboard
npx wrangler@4 kv key delete top --binding=SCORES --remote  # wipe leaderboard
npx wrangler@4 tail pentamino-scores                     # live request logs
```

To remove a single bogus entry: `kv key get`, edit the JSON, then
`npx wrangler@4 kv key put top '<edited json>' --binding=SCORES --remote`.
