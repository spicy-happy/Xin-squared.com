import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {match} from './helpers.mjs';import {applyAction,chooseReplacement} from '../releases/v46/src/engine.js';import {deepFreeze} from '../releases/v46/src/rules.js';
const replays=JSON.parse(readFileSync(new URL('./fixtures/golden-replays.json',import.meta.url)));
for(const replay of replays)test(`golden complete replay seed ${replay.seed}`,()=>{
  let {state,events}=match(...replay.defs,replay.seed);const all=[...events];
  for(const a of replay.actions) {
    ({state,events}=a.action?applyAction(deepFreeze(state),a.side,a.action):chooseReplacement(deepFreeze(state),a.side,a.replacement));all.push(...events);
  }
  assert.deepEqual(all,replay.events);assert.equal(state.rng,replay.rng);assert.equal(state.winner,replay.winner);assert.equal(state.reason,'ko');
});
