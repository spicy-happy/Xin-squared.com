// Global high-score API for Pentamino (xin-squared.com/pentamino).
// POST /token  -> { token }  (anonymous play token, issued at game start)
// GET  /scores -> { scores: [{name, score, clears, level, date}, ...] } (top 10)
// POST /scores {name, score, clears, level, token} -> { scores: [...], rank: 1-based | null }
//
// Anti-cheat (friction, not proof): scores need a single-use server-issued
// token, and are rejected unless enough real time elapsed since the token
// was issued (MAX_PTS_PER_SEC). Per-IP hourly rate limits on top.

const KEY = 'top';
const MAX_ENTRIES = 10;
const MAX_NAME = 16;
const MAX_SCORE = 5_000_000;
const TOKEN_TTL = 6 * 3600; // a game session should finish within 6h
const MAX_PTS_PER_SEC = 100; // generous ceiling on legit scoring rate
const MIN_SCORE_GRACE = 500; // scores this small skip the rate check
const SUBMITS_PER_HOUR = 20;
const TOKENS_PER_HOUR = 120;

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

async function readScores(env) {
  const raw = await env.SCORES.get(KEY);
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function cleanName(name) {
  if (typeof name !== 'string') return null;
  const cleaned = name.replace(/[^A-Za-z0-9 ._\-!?]/g, '').trim().toUpperCase().slice(0, MAX_NAME);
  return cleaned.length ? cleaned : null;
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

    if (url.pathname !== '/scores') {
      return json({ error: 'not found' }, 404, headers);
    }

    if (request.method === 'GET') {
      return json({ scores: await readScores(env) }, 200, headers);
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

      const scores = await readScores(env);
      const entry = { name, score, clears, level, date: new Date().toISOString().slice(0, 10) };
      scores.push(entry);
      scores.sort((a, b) => b.score - a.score);
      const top = scores.slice(0, MAX_ENTRIES);

      const rank = top.indexOf(entry);
      if (rank !== -1) {
        await env.SCORES.put(KEY, JSON.stringify(top));
      }
      return json({ scores: top, rank: rank === -1 ? null : rank + 1 }, 200, headers);
    }

    return json({ error: 'method not allowed' }, 405, headers);
  },
};
