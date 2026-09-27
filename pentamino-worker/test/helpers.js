import { env } from 'cloudflare:workers';
import { createExecutionContext, runInDurableObject } from 'cloudflare:test';
import worker from '../src/index.js';

export const GOOD_ORIGIN = 'https://xin-squared.com';
export const ADMIN_KEY = 'test-admin-key'; // vitest.config.js miniflare binding

let ipCounter = 0;
// A fresh documentation-range IP per call, so tests don't share rate buckets.
export function freshIp() {
  ipCounter++;
  return `198.51.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;
}

// The new worker's fetch handler, called directly. (The pool's SELF /
// exports.default path gets slower with every request — ~20ms each after a
// few hundred — which makes the 1800-request classroom test impractical.)
export const NEW_WORKER = {
  fetch: (url, init) => worker.fetch(new Request(url, init), env, createExecutionContext()),
};

// fetch against the new worker, or `target` (e.g. env.ORIG)
export function call(path, { method = 'GET', body, origin = GOOD_ORIGIN, ip = '203.0.113.9', headers = {}, target } = {}) {
  const h = { 'CF-Connecting-IP': ip, ...headers };
  if (origin) h.Origin = origin;
  const init = { method, headers: h };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    h['Content-Type'] = 'application/json';
  }
  return (target || NEW_WORKER).fetch('https://pentamino-scores.test' + path, init);
}

export async function callJson(path, opts) {
  const res = await call(path, opts);
  return { status: res.status, body: await res.json(), res };
}

export const doodleStub = () => env.DOODLE.get(env.DOODLE.idFromName('global'));

// Insert a Doodle Dash token issued `seconds` ago, straight into the DO's
// SQLite (workerd's clock can't be faked, so we backdate the token instead).
export async function agedToken(seconds) {
  const id = crypto.randomUUID();
  await runInDurableObject(doodleStub(), (_instance, state) => {
    state.storage.sql.exec('INSERT INTO tokens (id, ts) VALUES (?, ?)', id, Date.now() - seconds * 1000);
  });
  return id;
}

export async function ddSql(query, ...args) {
  return runInDurableObject(doodleStub(), (_instance, state) => state.storage.sql.exec(query, ...args).toArray());
}

export function submitBody(overrides = {}) {
  return { adjIndex: 0, nounIndex: 0, heroId: 'doodle-kid', score: 100, token: 'x', ...overrides };
}

export async function kvSnapshot() {
  const out = {};
  let cursor;
  do {
    const page = await env.SCORES.list({ cursor });
    for (const k of page.keys) out[k.name] = await env.SCORES.get(k.name);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out;
}
