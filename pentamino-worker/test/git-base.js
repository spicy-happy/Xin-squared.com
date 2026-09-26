// Shared by vitest.config.js and the node tests: find the commit this branch
// grew from, and read files as they were there. Works whether the Doodle Dash
// change is still uncommitted or already committed on a feature branch.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const MAIN_BRANCH = 'claude/recreate-xin-squared-website-PlRbZ';

function git(...args) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

// merge-base with the deploy branch (remote first, then local), else HEAD.
export function baseCommit() {
  for (const ref of ['origin/' + MAIN_BRANCH, MAIN_BRANCH]) {
    try {
      return git('merge-base', 'HEAD', ref).trim();
    } catch { /* ref missing: try the next one */ }
  }
  return git('rev-parse', 'HEAD').trim();
}

export function showAtBase(repoPath, base = baseCommit()) {
  return git('show', `${base}:${repoPath}`);
}
