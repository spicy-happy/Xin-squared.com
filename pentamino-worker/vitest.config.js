// Two projects:
//  - "workers": runs inside workerd via @cloudflare/vitest-pool-workers against
//    wrangler.toml. An auxiliary worker "pentabomb-original" runs the Pentabomb
//    worker source exactly as it was at the branch's merge-base (read from git
//    at config load), bound to the test worker as env.ORIG with its own KV and
//    Durable Object, so tests can replay one flow against old and new code.
//  - "node": plain Node tests that need git / the filesystem (source diff,
//    client-constant checks).
import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { showAtBase } from './test/git-base.js';

const originalSource = showAtBase('pentamino-worker/src/index.js');

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [
          cloudflareTest({
            wrangler: { configPath: './wrangler.toml' },
            remoteBindings: false,
            miniflare: {
              bindings: { DD_ADMIN_KEY: 'test-admin-key' },
              serviceBindings: { ORIG: 'pentabomb-original' },
              workers: [
                {
                  name: 'pentabomb-original',
                  modules: true,
                  script: originalSource,
                  compatibilityDate: '2026-07-01',
                  kvNamespaces: { SCORES: 'orig-scores' },
                  durableObjects: { LEADERBOARD: { className: 'Leaderboard', useSQLite: true } },
                },
              ],
            },
          }),
        ],
        test: { name: 'workers', include: ['test/**/*.worker.test.js'] },
      },
      {
        test: { name: 'node', environment: 'node', include: ['test/**/*.node.test.js'] },
      },
    ],
  },
});
