import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('balance CLI runs real engine from another cwd and fails non-zero on failed gates',()=>{
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('../tools/balance-sim.mjs',import.meta.url)),'--battles','20','--paired','20','--easy','20'],{cwd:'/tmp',encoding:'utf8'});
  assert.equal(result.status,1);assert.match(result.stdout,/FAIL \|/);assert.match(result.stdout,/paired health→attack/);assert.match(result.stdout,/Heavy exhausted/);assert.match(result.stdout,/Hard beats Easy/);assert.match(result.stdout,/Hang on/);
  assert.equal((result.stdout.match(/Samples: random/g)||[]).length,3);
  for(const seed of [3,17,101])assert.match(result.stdout,new RegExp('seed '+seed+'\\n'));
  assert.match(result.stdout,/3-creature Hard beats Easy/);assert.match(result.stdout,/24-creature collection Hard\/Easy \(diagnostic\)/);
});

import { simulate } from '../tools/balance-sim.mjs';
test('difficulty gate uses launch collection result rather than larger-collection diagnostic',()=>{
  const r=simulate({n:20,paired:20,easy:20,seed:3});
  const gate=r.gates.find(g=>g.metric.startsWith('3-creature Hard'));
  assert.equal(gate.value,r.normalVsEasy);assert.equal(gate.pass,r.normalVsEasy>=70);
  assert.ok(Number.isFinite(r.largeCollectionNormalVsEasy));
});
