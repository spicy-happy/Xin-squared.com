import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('balance CLI runs real engine from another cwd and fails non-zero on failed gates',()=>{
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('../tools/balance-sim.mjs',import.meta.url)),'--battles','20','--paired','20','--easy','20'],{cwd:'/tmp',encoding:'utf8'});
  assert.equal(result.status,1);assert.match(result.stdout,/FAIL \|/);assert.match(result.stdout,/paired health→attack/);assert.match(result.stdout,/Heavy exhausted/);assert.match(result.stdout,/Normal beats Easy/);assert.match(result.stdout,/Hang on/);
});
