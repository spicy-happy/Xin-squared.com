// Pentabomb must behave exactly as before Doodle Dash moved in.
//
// Old-vs-new replay: vitest.config.js runs the Pentabomb worker source from
// the branch's git merge-base as an auxiliary worker ("pentabomb-original",
// bound here as env.ORIG, with its own KV + Durable Object). The same scripted
// flow runs against it and against the current worker; responses must match
// once tokens / dates / week boundaries are normalised.
import { env } from 'cloudflare:workers';
import { reset } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { GOOD_ORIGIN, ADMIN_KEY, call, callJson, kvSnapshot, agedToken, submitBody } from './helpers.js';

beforeEach(async () => {
  await reset();
});

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const DAY = /\d{4}-\d{2}-\d{2}/g;

function normalise(text) {
  return text.replace(UUID, '<uuid>').replace(DAY, '<date>').replace(/"weekEndsAt":\d+/, '"weekEndsAt":<ts>');
}

const HEADERS = ['content-type', 'access-control-allow-origin', 'access-control-allow-methods',
  'access-control-allow-headers', 'access-control-max-age', 'vary', 'cache-control'];

async function pentabombFlow(target) {
  const log = [];
  const step = async (label, path, opts = {}) => {
    const res = await call(path, { ip: '203.0.113.50', ...opts, target });
    const text = await res.text();
    log.push({
      label,
      status: res.status,
      headers: Object.fromEntries(HEADERS.map(h => [h, res.headers.get(h)])),
      body: normalise(text),
    });
    return text ? JSON.parse(text) : null;
  };

  await step('preflight', '/scores', { method: 'OPTIONS' });
  await step('preflight evil origin', '/token', { method: 'OPTIONS', origin: 'https://evil.example' });
  await step('scores empty', '/scores');
  await step('token no origin', '/token', { method: 'POST', origin: '' });
  const { token } = await step('token', '/token', { method: 'POST' });
  const { token: token2 } = await step('token 2', '/token', { method: 'POST' });
  await step('submit bad name', '/scores', { method: 'POST', body: { name: '$$$', score: 10, token } });
  await step('submit bad score', '/scores', { method: 'POST', body: { name: 'AL', score: -1, token } });
  await step('submit no token', '/scores', { method: 'POST', body: { name: 'AL', score: 10 } });
  await step('submit bogus token', '/scores', { method: 'POST', body: { name: 'AL', score: 10, token: 'nope' } });
  await step('submit bad json', '/scores', { method: 'POST', body: '{nope' });
  await step('submit no origin', '/scores', { method: 'POST', origin: '', body: { name: 'AL', score: 10, token } });
  await step('submit implausible', '/scores', { method: 'POST', body: { name: 'BOB', score: 900_000, clears: 1, level: 1, token: token2 } });
  await step('submit', '/scores', { method: 'POST', body: { name: 'alice!', score: 400, clears: 3, level: 2, token } });
  await step('submit reused token', '/scores', { method: 'POST', body: { name: 'alice', score: 400, token } });
  await step('scores after', '/scores');
  await step('leaderboard', '/leaderboard');
  for (const type of ['visit', 'start', 'end', 'share', 'challenge']) {
    await step('event ' + type, '/event', { method: 'POST', body: { type, first: true, score: 400, sec: 30 } });
  }
  await step('event bad type', '/event', { method: 'POST', body: { type: 'hack' } });
  await step('event bad json', '/event', { method: 'POST', body: 'not json' });
  await step('event no origin', '/event', { method: 'POST', origin: '', body: { type: 'visit' } });
  await step('stats', '/stats');
  await step('not found', '/nope');
  await step('method', '/scores', { method: 'PUT' });
  await step('method token', '/token');
  return log;
}

describe('Pentabomb unchanged', () => {
  it('scripted flow gives the same responses on the original and new worker', async () => {
    const before = await pentabombFlow(env.ORIG);
    await reset();
    const after = await pentabombFlow(undefined);
    expect(after).toEqual(before);
    // sanity: the flow really exercised things
    expect(after.find(s => s.label === 'submit').status).toBe(200);
    expect(after.find(s => s.label === 'submit reused token').status).toBe(403);
    expect(after.find(s => s.label === 'stats').body).toContain('"challenges":1');
  });

  it('a full /dd/* flow leaves every KV key and value unchanged', async () => {
    // put some Pentabomb state in KV first
    await call('/token', { method: 'POST' });
    await call('/event', { method: 'POST', body: { type: 'visit' } });
    await env.SCORES.put('top', JSON.stringify([{ name: 'ZED', score: 777, clears: 1, level: 1, date: '2026-01-01' }]));
    const before = await kvSnapshot();
    expect(Object.keys(before).length).toBeGreaterThan(2);

    await call('/dd/words');
    await call('/dd/scores');
    const { body: { token } } = await callJson('/dd/token', { method: 'POST' });
    await call('/dd/scores', { method: 'POST', body: submitBody({ token }) }); // implausible (fresh token)
    await call('/dd/scores', { method: 'POST', body: submitBody({ token: await agedToken(60) }) });
    await call('/dd/scores', { method: 'POST', body: submitBody({ name: 'X' }) });
    await call('/dd/scores', { method: 'POST', origin: 'https://evil.example', body: submitBody() });
    const auth = { Authorization: 'Bearer ' + ADMIN_KEY };
    await call('/dd/admin/remove', { method: 'POST', headers: auth, body: { adj: 'BRAVE', noun: 'ACORN', score: 100 } });
    await call('/dd/admin/reset', { method: 'POST', headers: auth });
    await call('/dd/admin/reset', { method: 'POST' });
    await call('/dd/nope');
    await call('/dd/token');

    expect(await kvSnapshot()).toEqual(before);
  });

  it('a fresh Doodle Dash board is empty even when KV "top" holds Pentabomb scores', async () => {
    await env.SCORES.put('top', JSON.stringify([{ name: 'ZED', score: 777, clears: 1, level: 1, date: '2026-01-01' }]));
    const pb = await callJson('/scores'); // lets Pentabomb's DO seed from KV
    expect(pb.body.scores.map(e => e.name)).toEqual(['ZED']);
    const dd = await callJson('/dd/scores');
    expect(dd.status).toBe(200);
    expect(dd.body).toEqual({ scores: [] });
  });

  it('Pentabomb and Doodle Dash rate limits are separate', async () => {
    const ip = '203.0.113.77';
    // exhaust Pentabomb's KV token limit (120/h)
    await env.SCORES.put('rl:' + ip + ':tok', '120');
    expect((await call('/token', { method: 'POST', ip })).status).toBe(429);
    expect((await call('/dd/token', { method: 'POST', ip })).status).toBe(200);
  });
});
