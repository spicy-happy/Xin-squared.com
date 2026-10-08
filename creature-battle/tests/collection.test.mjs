import test from 'node:test';import assert from 'node:assert/strict';
import { creature, rules } from './helpers.mjs';
import { loadCollection, validateCreature, teamRule, validateTeam } from '../src/collection.js';
test('empty/one/two/three collection team rules',()=>{
  const a=creature(),b=creature({id:'cr-test01'}),c=creature({id:'cr-test02'});
  assert.equal(teamRule([]).canBattle,false);assert.equal(validateTeam([a,a,a],[]),false);
  assert.equal(validateTeam([a,a,a],[a]),true);assert.equal(validateTeam([a,a,a],[a,b]),true);
  assert.equal(validateTeam([a,b,c],[a,b,c]),true);assert.equal(validateTeam([a,a,b],[a,b,c]),false);
});
test('collection schema, stats, names, move slots, paths and stable IDs',()=>{
  assert.deepEqual(loadCollection({schema:1,creatures:[]},rules),[]);
  const a=creature();assert.deepEqual(validateCreature(a,rules),[]);
  assert.throws(()=>loadCollection({schema:1,creatures:[a,a]},rules));
  for(const edit of [c=>c.stats.speed=3,c=>c.type='ice',c=>c.name='https://example.com',c=>c.moves.regular.id='blast',c=>c.id='Name',c=>c.image.src='../photo.jpg',c=>c.schema=2,c=>c.trainer.nickname='']) {
    const c=structuredClone(a);edit(c);assert.ok(validateCreature(c,rules).length);assert.throws(()=>loadCollection({schema:1,creatures:[c]},rules));
  }
});
