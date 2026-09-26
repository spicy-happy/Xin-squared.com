// Plain-Node checks that need git / the filesystem.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT, baseCommit, showAtBase } from './git-base.js';

const SRC = 'pentamino-worker/src/index.js';
const DISPATCH = "    if (url.pathname.startsWith('/dd/')) return doodle(request, env, url, origin, headers, ip);\n";
const OPTIONS_BLOCK =
  "    if (request.method === 'OPTIONS') {\n" +
  '      return new Response(null, { status: 204, headers });\n' +
  '    }\n';

describe('Pentabomb source is untouched', () => {
  const base = baseCommit();
  const original = showAtBase(SRC, base);
  const current = fs.readFileSync(path.join(REPO_ROOT, SRC), 'utf8');

  it('new file = original + one dispatch line after the OPTIONS block + an appended suffix', () => {
    expect(original.split(OPTIONS_BLOCK)).toHaveLength(2); // anchor is unique
    const expectedPrefix = original.replace(OPTIONS_BLOCK, OPTIONS_BLOCK + DISPATCH);
    expect(current.startsWith(expectedPrefix)).toBe(true);
    const suffix = current.slice(expectedPrefix.length);
    expect(suffix).toMatch(/^\n\/\/ =+\n\/\/ Doodle Dash/);
    // the suffix doesn't redefine Pentabomb pieces
    expect(suffix).not.toMatch(/export default|class Leaderboard|function (cors|json|originAllowed|overLimit)\b/);
  });

  it(`git diff against the merge-base (${base.slice(0, 7)}) removes nothing`, () => {
    const diff = execFileSync('git', ['diff', '--unified=0', base, '--', SRC], { cwd: REPO_ROOT, encoding: 'utf8' });
    const removed = diff.split('\n').filter(l => l.startsWith('-') && !l.startsWith('---'));
    expect(removed).toEqual([]);
    const hunks = diff.split('\n').filter(l => l.startsWith('@@'));
    const originalLines = original.split('\n').length - 1;
    // hunk 1: the dispatch line; every other hunk starts past the original end
    expect(hunks.length).toBeGreaterThanOrEqual(2);
    const firstAdded = diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'))[0];
    expect(firstAdded + '\n').toBe('+' + DISPATCH);
    for (const h of hunks.slice(1)) {
      const oldStart = Number(/^@@ -(\d+)/.exec(h)[1]);
      expect(oldStart).toBeGreaterThanOrEqual(originalLines);
    }
  });
});

describe('client/server score-rate ceiling', () => {
  const clientPath = path.join(REPO_ROOT, 'doodle-dash/index.html');
  const clientExists = fs.existsSync(clientPath);
  const server = fs.readFileSync(path.join(REPO_ROOT, SRC), 'utf8');
  const serverMatch = /const DD_MAX_PTS_PER_SEC = (\d+(?:\.\d+)?)/.exec(server);

  it('DD_MAX_PTS_PER_SEC is declared in the worker', () => {
    expect(serverMatch).not.toBeNull();
  });

  it.skipIf(!clientExists)(
    clientExists
      ? 'DD_MAX_PTS_PER_SEC >= 1.2 x SPEED_MAX / 10 (doodle-dash/index.html)'
      : 'DD_MAX_PTS_PER_SEC >= 1.2 x SPEED_MAX / 10 — SKIPPED: doodle-dash/index.html does not exist yet',
    () => {
      const client = fs.readFileSync(clientPath, 'utf8');
      const m = /const SPEED_MAX = (\d+(?:\.\d+)?)/.exec(client);
      expect(m, 'doodle-dash/index.html must declare `const SPEED_MAX = <number>`').not.toBeNull();
      const speedMax = Number(m[1]);
      expect(Number(serverMatch[1])).toBeGreaterThanOrEqual(1.2 * speedMax / 10);
    },
  );
});
