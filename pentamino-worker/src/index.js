// Global high-score API for Pentamino (xin-squared.com/pentamino).
// GET  /scores -> { scores: [{name, score, lines, level, date}, ...] } (top 10)
// POST /scores {name, score, lines, level} -> { scores: [...], rank: 1-based | null }

const KEY = 'top';
const MAX_ENTRIES = 10;
const MAX_NAME = 12;
const MAX_SCORE = 5_000_000;

const ALLOWED_ORIGINS = new Set([
  'https://xin-squared.com',
  'https://www.xin-squared.com',
]);

function cors(origin) {
  const ok = ALLOWED_ORIGINS.has(origin) ||
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : 'https://xin-squared.com',
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = cors(request.headers.get('Origin') || '');

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }
    if (url.pathname !== '/scores') {
      return json({ error: 'not found' }, 404, headers);
    }

    if (request.method === 'GET') {
      return json({ scores: await readScores(env) }, 200, headers);
    }

    if (request.method === 'POST') {
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
      const lines = Number.isInteger(body.lines) && body.lines >= 0 ? body.lines : 0;
      const level = Number.isInteger(body.level) && body.level >= 1 ? body.level : 1;

      const scores = await readScores(env);
      const entry = { name, score, lines, level, date: new Date().toISOString().slice(0, 10) };
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
