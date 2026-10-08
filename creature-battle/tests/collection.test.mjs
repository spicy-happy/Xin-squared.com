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

test('collection numbers repeated names without colliding with existing numbered names',()=>{
  const names=['Moss','moss','Moss 1','Moss','MOSS 2'];
  const source={schema:1,creatures:names.map((name,i)=>creature({id:`cr-name0${i}`,name}))};
  const loaded=loadCollection(source,rules);
  assert.deepEqual(loaded.map(c=>c.name),['Moss','moss 3','Moss 1','Moss 4','MOSS 2']);
  assert.deepEqual(source.creatures.map(c=>c.name),names);
  assert.deepEqual(loadCollection(source,rules),loaded);
});
test('repeated 24-character names keep suffixes within the name limit',()=>{
  const base='A'.repeat(24),source={schema:1,creatures:[0,1,2].map(i=>creature({id:`cr-long0${i}`,name:base}))};
  const loaded=loadCollection(source,rules);
  assert.deepEqual(loaded.map(c=>c.name),[base,'A'.repeat(22)+' 1','A'.repeat(22)+' 2']);
  assert.ok(loaded.every(c=>!validateCreature(c,rules).length));
});
