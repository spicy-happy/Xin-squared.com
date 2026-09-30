// Plain-Node checks that need git / the filesystem.
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

// The Pentabomb part of the file (everything before the appended Doodle Dash
// suffix, minus the one dispatch line). Works whether or not the merge-base
// already contains Doodle Dash.
const SUFFIX_RE = /\n\/\/ =+\n\/\/ Doodle Dash/;
function pentabombPart(src) {
  const i = src.search(SUFFIX_RE);
  return (i < 0 ? src : src.slice(0, i)).replace(OPTIONS_BLOCK + DISPATCH, OPTIONS_BLOCK);
}

describe('Pentabomb source is untouched', () => {
  const base = baseCommit();
  const original = showAtBase(SRC, base);
  const current = fs.readFileSync(path.join(REPO_ROOT, SRC), 'utf8');

  it(`Pentabomb part is byte-identical to the merge-base (${base.slice(0, 7)})`, () => {
    expect(pentabombPart(original).split(OPTIONS_BLOCK)).toHaveLength(2); // anchor is unique
    expect(pentabombPart(current)).toBe(pentabombPart(original));
  });

  it('only change: one dispatch line after the OPTIONS block + an appended Doodle Dash suffix', () => {
    expect(current.split(OPTIONS_BLOCK + DISPATCH)).toHaveLength(2);
    const i = current.search(SUFFIX_RE);
    expect(i).toBeGreaterThan(0);
    const suffix = current.slice(i);
    // the suffix doesn't redefine Pentabomb pieces
    expect(suffix).not.toMatch(/export default|class Leaderboard|function (cors|json|originAllowed|overLimit)\b/);
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
      ? 'DD_MAX_PTS_PER_SEC >= 1.2 x peak client rate (3 x SPEED_MAX / 10 + 110 bonus/s)'
      : 'DD_MAX_PTS_PER_SEC >= 1.2 x peak client rate — SKIPPED: doodle-dash/index.html does not exist yet',
    () => {
      const client = fs.readFileSync(clientPath, 'utf8');
      const m = /const SPEED_MAX = (\d+(?:\.\d+)?)/.exec(client);
      expect(m, 'doodle-dash/index.html must declare `const SPEED_MAX = <number>`').not.toBeNull();
      const speedMax = Number(m[1]);
      // peak: distance x3 multiplier at top speed + clear bonuses (3 things per full-hold air time x 30)
      expect(client).toMatch(/function scoreMult\(d\) \{ return 1 \+ 2 \* clamp\(d, 0, 1\); \}/);
      expect(client).toMatch(/const CLEAR_BONUS = 10;/);
      expect(Number(serverMatch[1])).toBeGreaterThanOrEqual(1.2 * (3 * speedMax / 10 + 110));
    },
  );
});
