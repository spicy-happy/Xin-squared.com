# pentamino-scores worker

Cloudflare Worker serving the global top-10 leaderboard for
[/pentamino](../pentamino/index.html). Deployed at
`https://pentamino-scores.mail-f78.workers.dev`, storage in Workers KV
(binding `SCORES`, single key `top`).

## API

- `GET /scores` → `{ "scores": [{ name, score, lines, level, date }, ...] }`
- `POST /scores` with `{ name, score, lines, level }` → same shape plus
  `rank` (1-based position if the entry made the top 10, else `null`)

CORS allows `xin-squared.com`, `www.xin-squared.com`, and localhost (for dev).

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
