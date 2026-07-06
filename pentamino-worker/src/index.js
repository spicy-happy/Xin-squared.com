// Global high-score + analytics API for Pentabomb (xin-squared.com/pentabomb).
// POST /token  -> { token }  (anonymous play token, issued at game start)
// GET  /scores -> { scores: [{name, score, clears, level, date}, ...] } (top 10)
// POST /scores {name, score, clears, level, token} -> { scores: [...], rank: 1-based | null }
// POST /event  {type: visit|start|end, first?, score?, clears?, level?, sec?} -> { ok }
// GET  /stats  -> { all: {...}, days: [{date, ...}, ...] }  (aggregate counters)
//
// Anti-cheat (friction, not proof): scores need a single-use server-issued
// token, and are rejected unless enough real time elapsed since the token
// was issued (MAX_PTS_PER_SEC). Per-IP hourly rate limits on top.
//
// The leaderboard itself lives in a Durable Object so concurrent submissions
// serialize instead of racing a KV read-modify-write. KV still holds tokens,
// rate-limit counters, and analytics (races there are tolerable), plus the
// legacy "top" key the DO seeds itself from on first run.

const KEY = 'top';
const MAX_ENTRIES = 10;
const MAX_NAME = 16;
const MAX_SCORE = 5_000_000;
const TOKEN_TTL = 6 * 3600; // a game session should finish within 6h
// Scoring scales with level (a 5x5 blast is 1000 x level, and levels keep
// climbing), so a whole-game average of several hundred pts/sec is normal in
// a good run — 100 pts/sec rejected a legitimate 500k game. 1000 pts/sec
// still forces a forger to age a token ~8 min per 500k points.
const MAX_PTS_PER_SEC = 1000;
const MIN_SCORE_GRACE = 500; // scores this small skip the rate check
const SUBMITS_PER_HOUR = 20;
const TOKENS_PER_HOUR = 120;
const EVENTS_PER_HOUR = 400;
const STAT_DAYS_SHOWN = 14;
const STAT_DAY_TTL = 90 * 86400; // daily stat keys expire after ~3 months

const ALLOWED_ORIGINS = new Set([
  'https://xin-squared.com',
  'https://www.xin-squared.com',
]);

function originAllowed(origin) {
  return ALLOWED_ORIGINS.has(origin) ||
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': originAllowed(origin) ? origin : 'https://xin-squared.com',
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

// Single global leaderboard object. Durable Object input gates close during
// storage awaits, so read-sort-write here can't interleave between requests.
export class Leaderboard {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }
  async scores() {
    let list = await this.state.storage.get(KEY);
    if (list === undefined) {
      // first run: seed from the legacy KV copy so existing scores survive
      list = [];
      try {
        const raw = await this.env.SCORES.get(KEY);
        const parsed = JSON.parse(raw || '[]');
        if (Array.isArray(parsed)) list = parsed;
      } catch { /* unreadable legacy data: start empty */ }
      await this.state.storage.put(KEY, list);
    }
    return list;
  }
  async fetch(request) {
    const scores = await this.scores();
    if (request.method === 'POST') {
      const entry = await request.json();
      scores.push(entry);
      scores.sort((a, b) => b.score - a.score);
      const top = scores.slice(0, MAX_ENTRIES);
      const rank = top.indexOf(entry);
      if (rank !== -1) await this.state.storage.put(KEY, top);
      return json({ scores: top, rank: rank === -1 ? null : rank + 1 }, 200, {});
    }
    return json({ scores }, 200, {});
  }
}

function cleanName(name) {
  if (typeof name !== 'string') return null;
  const cleaned = name.replace(/[^A-Za-z0-9 ._\-!?]/g, '').trim().toUpperCase().slice(0, MAX_NAME);
  return cleaned.length ? cleaned : null;
}

// Aggregate analytics counters. visits = pageviews, uniques = first-ever
// visits (client-side localStorage flag), starts/ends = games begun/finished,
// scoreSum/secSum feed averages, best = top score of the bucket.
// KV read-modify-write means concurrent events can occasionally drop a
// count — fine for traction tracking, don't use for billing.
const EMPTY_STATS = { visits: 0, uniques: 0, starts: 0, ends: 0, scoreSum: 0, secSum: 0, best: 0 };

async function readStats(env, key) {
  try {
    const parsed = JSON.parse(await env.SCORES.get(key));
    return { ...EMPTY_STATS, ...(parsed || {}) };
  } catch {
    return { ...EMPTY_STATS };
  }
}

function withAverages(s) {
  return {
    ...s,
    avgScore: s.ends ? Math.round(s.scoreSum / s.ends) : 0,
    avgSec: s.ends ? Math.round(s.secSum / s.ends) : 0,
  };
}

// Sliding-ish per-IP counter in KV. Races just make it slightly lenient.
async function overLimit(env, bucket, limit) {
  const key = 'rl:' + bucket;
  const n = parseInt((await env.SCORES.get(key)) || '0', 10);
  if (n >= limit) return true;
  await env.SCORES.put(key, String(n + 1), { expirationTtl: 3600 });
  return false;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const headers = cors(origin);
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    if (url.pathname === '/token' && request.method === 'POST') {
      if (!originAllowed(origin)) return json({ error: 'forbidden' }, 403, headers);
      if (await overLimit(env, ip + ':tok', TOKENS_PER_HOUR)) {
        return json({ error: 'rate limited' }, 429, headers);
      }
      const token = crypto.randomUUID();
      await env.SCORES.put('t:' + token, String(Date.now()), { expirationTtl: TOKEN_TTL });
      return json({ token }, 200, headers);
    }

    if (url.pathname === '/event' && request.method === 'POST') {
      if (!originAllowed(origin)) return json({ error: 'forbidden' }, 403, headers);
      // over the limit: swallow silently so a hot loop can't probe anything
      if (await overLimit(env, ip + ':ev', EVENTS_PER_HOUR)) {
        return json({ ok: true }, 200, headers);
      }
      let body;
      try {
        body = JSON.parse(await request.text()); // beacons send text/plain
      } catch {
        return json({ error: 'invalid json' }, 400, headers);
      }
      const type = body && body.type;
      if (type !== 'visit' && type !== 'start' && type !== 'end') {
        return json({ error: 'invalid type' }, 400, headers);
      }
      const day = new Date().toISOString().slice(0, 10);
      for (const [key, ttl] of [['stats:all', 0], ['stats:d:' + day, STAT_DAY_TTL]]) {
        const s = await readStats(env, key);
        if (type === 'visit') {
          s.visits++;
          if (body.first === true) s.uniques++;
        } else if (type === 'start') {
          s.starts++;
        } else {
          const score = Number.isInteger(body.score) && body.score >= 0 && body.score <= MAX_SCORE ? body.score : 0;
          const sec = Number.isInteger(body.sec) && body.sec >= 0 && body.sec <= 86400 ? body.sec : 0;
          s.ends++;
          s.scoreSum += score;
          s.secSum += sec;
          if (score > s.best) s.best = score;
        }
        await env.SCORES.put(key, JSON.stringify(s), ttl ? { expirationTtl: ttl } : {});
      }
      return json({ ok: true }, 200, headers);
    }

    if (url.pathname === '/stats' && request.method === 'GET') {
      const days = [];
      for (let i = 0; i < STAT_DAYS_SHOWN; i++) {
        days.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
      }
      const [all, ...daily] = await Promise.all([
        readStats(env, 'stats:all'),
        ...days.map(d => readStats(env, 'stats:d:' + d)),
      ]);
      return json({
        all: withAverages(all),
        days: days.map((d, i) => ({ date: d, ...withAverages(daily[i]) })),
      }, 200, headers);
    }

    if (url.pathname !== '/scores') {
      return json({ error: 'not found' }, 404, headers);
    }

    const board = () => env.LEADERBOARD.get(env.LEADERBOARD.idFromName('global'));

    if (request.method === 'GET') {
      const res = await board().fetch('https://do/scores');
      return json(await res.json(), 200, headers);
    }

    if (request.method === 'POST') {
      if (!originAllowed(origin)) return json({ error: 'forbidden' }, 403, headers);
      if (await overLimit(env, ip + ':sub', SUBMITS_PER_HOUR)) {
        return json({ error: 'rate limited' }, 429, headers);
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'invalid json' }, 400, headers);
      }

      const name = cleanName(body.name);
      const score = body.score;
      if (!name) return json({ error: 'invalid name' }, 400, headers);
      if (!Number.isInteger(score) || score <= 0 || score > MAX_SCORE) {
        return json({ error: 'invalid score' }, 400, headers);
      }
      const clears = Number.isInteger(body.clears) && body.clears >= 0 ? body.clears : 0;
      const level = Number.isInteger(body.level) && body.level >= 1 ? body.level : 1;

      // token must exist (issued by us, unexpired, unused) and be old enough
      // for the claimed score to have been physically playable
      if (typeof body.token !== 'string' || body.token.length > 64) {
        return json({ error: 'missing token' }, 403, headers);
      }
      const issued = await env.SCORES.get('t:' + body.token);
      if (!issued) return json({ error: 'invalid token' }, 403, headers);
      const elapsedSec = (Date.now() - Number(issued)) / 1000;
      if (score > Math.max(MIN_SCORE_GRACE, elapsedSec * MAX_PTS_PER_SEC)) {
        return json({ error: 'implausible score' }, 403, headers);
      }
      await env.SCORES.delete('t:' + body.token); // single use

      const entry = { name, score, clears, level, date: new Date().toISOString().slice(0, 10) };
      const res = await board().fetch('https://do/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
      return json(await res.json(), 200, headers);
    }

    return json({ error: 'method not allowed' }, 405, headers);
  },
};
