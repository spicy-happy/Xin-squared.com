import { env } from 'cloudflare:workers';
import { reset } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import worker, { ddParseSubmit } from '../src/index.js';
import {
  ADMIN_KEY, agedToken, call, callJson, ddSql, freshIp, submitBody,
} from './helpers.js';

beforeEach(async () => {
  await reset();
});

const submit = (body, opts = {}) => callJson('/dd/scores', { method: 'POST', body, ...opts });
const auth = (key = ADMIN_KEY) => ({ Authorization: 'Bearer ' + key });

describe('routes', () => {
  it('GET /dd/words serves the lists with CORS + cache headers', async () => {
    const { status, body, res } = await callJson('/dd/words');
    expect(status).toBe(200);
    expect(body.adj).toHaveLength(44);
    expect(body.noun).toHaveLength(38);
    expect(body.adj[0]).toBe('BRAVE');
    expect(body.noun.at(-1)).toBe('WAFFLE');
    expect(body.retiredAdj).toEqual([]);
    expect(body.retiredNoun).toEqual([]);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://xin-squared.com');
    expect(res.headers.get('Content-Type')).toBe('application/json');
  });

  it('unknown /dd/ paths 404, wrong methods 405, OPTIONS 204', async () => {
    expect(await callJson('/dd/nope')).toMatchObject({ status: 404, body: { error: 'not found' } });
    expect(await callJson('/dd/')).toMatchObject({ status: 404, body: { error: 'not found' } });
    expect(await callJson('/dd/token')).toMatchObject({ status: 405, body: { error: 'method not allowed' } });
    expect(await callJson('/dd/scores', { method: 'PUT' })).toMatchObject({ status: 405 });
    expect(await callJson('/dd/words', { method: 'POST' })).toMatchObject({ status: 405 });
    expect(await callJson('/dd/admin/reset')).toMatchObject({ status: 405 });
    expect((await call('/dd/scores', { method: 'OPTIONS' })).status).toBe(204);
  });

  it('POST /dd/token and POST /dd/scores need an allowed Origin', async () => {
    for (const origin of ['https://evil.example', '', 'https://xin-squared.com.evil.example']) {
      expect(await callJson('/dd/token', { method: 'POST', origin })).toMatchObject({ status: 403, body: { error: 'forbidden' } });
      const token = await agedToken(60);
      expect(await submit(submitBody({ token }), { origin })).toMatchObject({ status: 403, body: { error: 'forbidden' } });
    }
    // GET needs no origin; localhost is allowed for dev
    expect((await call('/dd/scores', { origin: '' })).status).toBe(200);
    expect((await call('/dd/token', { method: 'POST', origin: 'http://localhost:8000' })).status).toBe(200);
  });
});

describe('board', () => {
  it('stores resolved words (not indices), serves top 5, keeps 20, ranks', async () => {
    const r = await submit(submitBody({ adjIndex: 2, nounIndex: 3, heroId: 'hero-1', score: 500, token: await agedToken(3600) }));
    expect(r.status).toBe(200);
    expect(r.body.rank).toBe(1);
    expect(r.body.scores).toEqual([
      { adj: 'BRIGHT', noun: 'BUTTON', heroId: 'hero-1', score: 500, date: new Date().toISOString().slice(0, 10) },
    ]);
    for (let i = 1; i <= 24; i++) {
      const res = await submit(submitBody({ adjIndex: i, nounIndex: i % 38, score: 100 + i * 10, token: await agedToken(3600) }));
      expect(res.status).toBe(200);
    }
    const rows = await ddSql('SELECT adj, noun, score FROM board');
    expect(rows).toHaveLength(20);
    expect(rows.every(r => typeof r.adj === 'string' && /^[A-Z]+$/.test(r.adj))).toBe(true);
    const { body } = await callJson('/dd/scores');
    expect(body.scores.map(e => e.score)).toEqual([500, 340, 330, 320, 310]);
    // 25 submitted (500 and 110..340); the 20 kept are 500 and 160..340
    expect(Math.min(...rows.map(r => r.score))).toBe(160);

    // a new score that makes the top 20 but not the top 5 → rank null
    const mid = await submit(submitBody({ adjIndex: 40, score: 200, token: await agedToken(3600) }));
    expect(mid.body.rank).toBeNull();
    // one that falls below the 20th is pruned immediately
    await submit(submitBody({ adjIndex: 41, score: 60, token: await agedToken(3600) }));
    expect(await ddSql('SELECT 1 FROM board WHERE score = 60')).toHaveLength(0);
  });

  it('ties rank the earlier entry first; same adj+noun+score is deduped', async () => {
    await submit(submitBody({ adjIndex: 5, score: 300, token: await agedToken(3600) }));
    const second = await submit(submitBody({ adjIndex: 6, score: 300, token: await agedToken(3600) }));
    expect(second.body.scores.map(e => e.adj)).toEqual(['CLEVER', 'COMFY']);
    expect(second.body.rank).toBe(2);
    const dup = await submit(submitBody({ adjIndex: 5, heroId: 'other', score: 300, token: await agedToken(3600) }));
    expect(dup.status).toBe(200);
    expect(dup.body.rank).toBe(1);
    expect(dup.body.scores).toHaveLength(2);
    expect(dup.body.scores[0].heroId).toBe('doodle-kid'); // original kept
  });
});

describe('tokens', () => {
  it('are game-bound: a Pentabomb token fails /dd/scores, a Doodle Dash token fails /scores', async () => {
    const pb = await callJson('/token', { method: 'POST' });
    expect(pb.status).toBe(200);
    const r1 = await submit(submitBody({ token: pb.body.token }));
    expect(r1).toMatchObject({ status: 403, body: { error: 'invalid token' } });

    const dd = await callJson('/dd/token', { method: 'POST' });
    expect(dd.status).toBe(200);
    expect(dd.body.token).toMatch(/^[0-9a-f-]{36}$/);
    const r2 = await callJson('/scores', { method: 'POST', body: { name: 'KID', score: 10, token: dd.body.token } });
    expect(r2).toMatchObject({ status: 403, body: { error: 'invalid token' } });
  });

  it('are single-use', async () => {
    const token = await agedToken(60);
    expect((await submit(submitBody({ token }))).status).toBe(200);
    expect(await submit(submitBody({ token, score: 60 }))).toMatchObject({ status: 403, body: { error: 'invalid token' } });
  });

  it('are single-use under two concurrent submits', async () => {
    for (let round = 0; round < 5; round++) {
      const token = await agedToken(60);
      const results = await Promise.all([
        submit(submitBody({ adjIndex: round, score: 100, token })),
        submit(submitBody({ adjIndex: round, nounIndex: 1, score: 200, token })),
      ]);
      expect(results.map(r => r.status).sort()).toEqual([200, 403]);
      expect(results.find(r => r.status === 403).body).toEqual({ error: 'invalid token' });
    }
    expect(await ddSql('SELECT 1 FROM board')).toHaveLength(5);
  });

  it('expire after 2h and are pruned when new ones are issued', async () => {
    const old = await agedToken(2 * 3600 + 5);
    expect(await submit(submitBody({ token: old }))).toMatchObject({ status: 403, body: { error: 'invalid token' } });
    const stale = await agedToken(2 * 3600 + 5);
    await call('/dd/token', { method: 'POST' });
    expect(await ddSql('SELECT 1 FROM tokens WHERE id = ?', stale)).toHaveLength(0);
    expect(await ddSql('SELECT 1 FROM tokens')).toHaveLength(1);
  });
});

describe('time check (90 pts/sec, no grace)', () => {
  it('rejects a score above elapsed x 90, even a small one', async () => {
    // 50 pts at ~0.5s: limit 45
    const t1 = await agedToken(0.5);
    expect(await submit(submitBody({ score: 50, token: t1 }))).toMatchObject({ status: 403, body: { error: 'implausible score' } });
    // a fresh token from the API: ~0s elapsed
    const { body: { token } } = await callJson('/dd/token', { method: 'POST' });
    expect(await submit(submitBody({ score: 50, token }))).toMatchObject({ status: 403, body: { error: 'implausible score' } });
    // just over the line at 10s (limit 900)
    const t2 = await agedToken(10);
    expect(await submit(submitBody({ score: 905, token: t2 }))).toMatchObject({ status: 403, body: { error: 'implausible score' } });
  });

  it('a rejected submit still burns the token', async () => {
    const token = await agedToken(1);
    expect((await submit(submitBody({ score: 5000, token }))).status).toBe(403);
    expect(await submit(submitBody({ score: 50, token }))).toMatchObject({ status: 403, body: { error: 'invalid token' } });
  });

  it('accepts scores at or under the limit', async () => {
    expect((await submit(submitBody({ score: 900, token: await agedToken(10) }))).status).toBe(200);
    expect((await submit(submitBody({ adjIndex: 1, score: 50, token: await agedToken(0.6) }))).status).toBe(200);
    expect((await submit(submitBody({ adjIndex: 2, score: 1_000_000, token: await agedToken(11112) }))).status).toBe(403); // > TTL
    expect((await submit(submitBody({ adjIndex: 3, score: 647_000, token: await agedToken(7200 - 5) }))).status).toBe(200);
  });
});

describe('validation (400)', () => {
  const bad = [
    ['score below 50', { score: 49 }, 'invalid score'],
    ['score 0', { score: 0 }, 'invalid score'],
    ['score over max', { score: 1_000_001 }, 'invalid score'],
    ['fractional score', { score: 100.5 }, 'invalid score'],
    ['string score', { score: '100' }, 'invalid score'],
    ['adjIndex -1', { adjIndex: -1 }, 'invalid name'],
    ['adjIndex = length', { adjIndex: 44 }, 'invalid name'],
    ['nounIndex = length', { nounIndex: 38 }, 'invalid name'],
    ['fractional index', { adjIndex: 1.5 }, 'invalid name'],
    ['string index', { nounIndex: '3' }, 'invalid name'],
    ['uppercase heroId', { heroId: 'Bolt' }, 'invalid hero'],
    ['long heroId', { heroId: 'a'.repeat(41) }, 'invalid hero'],
    ['path heroId', { heroId: '../x' }, 'invalid hero'],
    ['empty heroId', { heroId: '' }, 'invalid hero'],
    ['long token', { token: 'a'.repeat(65) }, 'missing token'],
    ['numeric token', { token: 5 }, 'missing token'],
  ];
  for (const [label, override, error] of bad) {
    it(label, async () => {
      const token = await agedToken(3600);
      expect(await submit(submitBody({ token, ...override }))).toMatchObject({ status: 400, body: { error } });
    });
  }

  it('rejects free text and any extra or missing key', async () => {
    const token = await agedToken(3600);
    expect(await submit({ ...submitBody({ token }), name: 'hello' })).toMatchObject({ status: 400, body: { error: 'invalid fields' } });
    const { heroId, ...missing } = submitBody({ token });
    expect(await submit(missing)).toMatchObject({ status: 400, body: { error: 'invalid fields' } });
    expect(await submit([1, 2])).toMatchObject({ status: 400, body: { error: 'invalid body' } });
    expect(await submit('null')).toMatchObject({ status: 400, body: { error: 'invalid body' } });
    expect(await submit('{nope')).toMatchObject({ status: 400, body: { error: 'invalid json' } });
    expect(await submit(JSON.stringify({ ...submitBody({ token }), pad: 'x'.repeat(2000) }))).toMatchObject({ status: 400, body: { error: 'invalid json' } });
    // the token survived all of that (validation happens before it is consumed)
    expect((await submit(submitBody({ token }))).status).toBe(200);
  });

  it('retired word indices are refused (validator with injected retired sets)', () => {
    const body = submitBody({ adjIndex: 3, nounIndex: 7 });
    expect(ddParseSubmit(body)).toMatchObject({ adj: 'BREEZY', noun: 'CRICKET' });
    expect(ddParseSubmit(body, new Set([3]), new Set())).toEqual({ error: 'invalid name' });
    expect(ddParseSubmit(body, new Set(), new Set([7]))).toEqual({ error: 'invalid name' });
    expect(ddParseSubmit(body, new Set([4]), new Set([8]))).toMatchObject({ adj: 'BREEZY' });
  });
});

describe('admin', () => {
  async function seed() {
    await submit(submitBody({ adjIndex: 0, nounIndex: 0, score: 300, token: await agedToken(3600) }));
    await submit(submitBody({ adjIndex: 1, nounIndex: 1, score: 200, token: await agedToken(3600) }));
  }

  it('401 without a key, with a wrong key, a malformed header, or when the secret is unset', async () => {
    await seed();
    const body = { adj: 'BRAVE', noun: 'ACORN', score: 300 };
    for (const path of ['/dd/admin/remove', '/dd/admin/reset']) {
      expect(await callJson(path, { method: 'POST', body, ip: freshIp() })).toMatchObject({ status: 401, body: { error: 'unauthorized' } });
      expect(await callJson(path, { method: 'POST', body, headers: auth('wrong'), ip: freshIp() })).toMatchObject({ status: 401 });
      expect(await callJson(path, { method: 'POST', body, headers: { Authorization: ADMIN_KEY }, ip: freshIp() })).toMatchObject({ status: 401 });
      expect(await callJson(path, { method: 'POST', body, headers: auth(ADMIN_KEY + 'x'), ip: freshIp() })).toMatchObject({ status: 401 });
    }
    // secret unset (or empty): nothing unlocks it, not even an empty/undefined bearer
    for (const DD_ADMIN_KEY of [undefined, '']) {
      const res = await worker.fetch(new Request('https://w/dd/admin/reset', {
        method: 'POST', headers: { Authorization: 'Bearer ' + ADMIN_KEY, 'CF-Connecting-IP': freshIp() },
      }), { ...env, DD_ADMIN_KEY });
      expect(res.status).toBe(401);
      const res2 = await worker.fetch(new Request('https://w/dd/admin/reset', {
        method: 'POST', headers: { Authorization: 'Bearer undefined', 'CF-Connecting-IP': freshIp() },
      }), { ...env, DD_ADMIN_KEY });
      expect(res2.status).toBe(401);
    }
    expect(await ddSql('SELECT 1 FROM board')).toHaveLength(2);
  });

  it('remove deletes one entry; reset clears the board only', async () => {
    await seed();
    const r = await callJson('/dd/admin/remove', { method: 'POST', origin: '', headers: auth(), body: { adj: 'brave', noun: 'ACORN', score: 300 } });
    expect(r.status).toBe(200);
    expect(r.body.removed).toBe(1);
    expect(r.body.scores.map(e => e.adj)).toEqual(['BOUNCY']);
    const none = await callJson('/dd/admin/remove', { method: 'POST', origin: '', headers: auth(), body: { adj: 'BRAVE', noun: 'ACORN', score: 300 } });
    expect(none.body).toMatchObject({ removed: 0 });
    expect(await callJson('/dd/admin/remove', { method: 'POST', headers: auth(), body: { adj: 'BRAVE' } })).toMatchObject({ status: 400 });

    await agedToken(10); // an outstanding token
    const x = await callJson('/dd/admin/reset', { method: 'POST', origin: '', headers: auth() });
    expect(x).toMatchObject({ status: 200, body: { ok: true } });
    expect((await callJson('/dd/scores')).body).toEqual({ scores: [] });
    expect((await ddSql('SELECT 1 FROM tokens')).length).toBe(1);
    expect((await ddSql('SELECT 1 FROM rl')).length).toBeGreaterThan(0);
  });

  it('is rate limited per IP (30/h), counting before the key check', async () => {
    const ip = freshIp();
    for (let i = 0; i < 30; i++) {
      expect((await call('/dd/admin/reset', { method: 'POST', headers: auth('guess' + i), ip })).status).toBe(401);
    }
    expect(await callJson('/dd/admin/reset', { method: 'POST', headers: auth(), ip })).toMatchObject({ status: 429, body: { error: 'rate limited' } });
    expect((await call('/dd/admin/reset', { method: 'POST', headers: auth(), ip: freshIp() })).status).toBe(200);
  });
});

describe('rate limits', () => {
  it('store a hash of the IP, never the raw IP', async () => {
    const ip = '192.0.2.123';
    await call('/dd/token', { method: 'POST', ip });
    const rows = await ddSql('SELECT bucket FROM rl');
    expect(rows).toHaveLength(1);
    expect(rows[0].bucket).toMatch(/^tok:[0-9a-f]{32}$/);
    expect(rows[0].bucket).not.toContain(ip);
  });

  it('Doodle Dash limits are separate from Pentabomb\'s (both directions)', async () => {
    const ip = '203.0.113.88';
    // exhaust the Doodle Dash token bucket for this IP
    expect((await call('/dd/token', { method: 'POST', ip })).status).toBe(200);
    await ddSql("UPDATE rl SET n = 5000 WHERE bucket LIKE 'tok:%'");
    expect(await callJson('/dd/token', { method: 'POST', ip })).toMatchObject({ status: 429, body: { error: 'rate limited' } });
    expect((await call('/token', { method: 'POST', ip })).status).toBe(200);
    // and the other way round
    await env.SCORES.put('rl:' + ip + ':sub', '60');
    expect((await call('/scores', { method: 'POST', ip, body: {} })).status).toBe(429);
    expect((await call('/dd/scores', { method: 'POST', ip, body: submitBody({ token: await agedToken(60) }) })).status).toBe(200);
  });

  it('a classroom on one IP (30 kids, 2.5 quick runs/min for an hour) is not throttled', async () => {
    const ip = '203.0.113.200';
    const statuses = new Map();
    for (let batch = 0; batch < 150; batch++) {
      const res = await Promise.all(Array.from({ length: 30 }, () => call('/dd/token', { method: 'POST', ip })));
      for (const r of res) statuses.set(r.status, (statuses.get(r.status) || 0) + 1);
    }
    expect(Object.fromEntries(statuses)).toEqual({ 200: 4500 });
    for (let i = 0; i < 40; i++) {
      const r = await submit(submitBody({ adjIndex: i, score: 60 + i, token: await agedToken(120) }), { ip });
      expect(r.status).toBe(200);
    }
  }, 120_000);

  it('submits are capped at 120/h per IP (counted before validation)', async () => {
    const ip = freshIp();
    for (let i = 0; i < 120; i++) {
      expect((await call('/dd/scores', { method: 'POST', ip, body: '{bad' })).status).toBe(400);
    }
    expect(await callJson('/dd/scores', { method: 'POST', ip, body: submitBody({ token: await agedToken(60) }) }))
      .toMatchObject({ status: 429, body: { error: 'rate limited' } });
  }, 60_000);

  it('old hourly rows are pruned', async () => {
    await call('/dd/token', { method: 'POST' });
    await ddSql("INSERT INTO rl (bucket, hour, n) VALUES ('tok:old', 1, 5)");
    await call('/dd/token', { method: 'POST' });
    expect(await ddSql("SELECT 1 FROM rl WHERE bucket = 'tok:old'")).toHaveLength(0);
  });
});
