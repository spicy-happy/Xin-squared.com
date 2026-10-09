import test from 'node:test';import assert from 'node:assert/strict';
import { creature, rules } from './helpers.mjs';
import { loadCollection, validateCreature, teamRule, validateTeam } from '../releases/v43/src/collection.js';
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

test('both submitted names reject profanity, insults, threats and common disguises',()=>{
  for(const name of ['Fuck','F U C K','f-u-c-k','fúck','ＦＵＣＫ','f4ck','Sh1t','ѕhіt','Dick','D1ck','Cunt1','Loser99','asshole','You are stupid','Loser','I hate you','Shut up','Go die','Kill yourself','Nazi','porn','www.example.com','Nice\u200bName','Nice\nName']){
    for(const field of ['creature','trainer']){
      const c=creature();if(field==='creature')c.name=name;else c.trainer.nickname=name;
      assert.ok(validateCreature(c,rules).some(e=>e.startsWith(field==='creature'?'Creature name:':'Trainer name:')),`${field}: ${name}`);
      assert.throws(()=>loadCollection({schema:1,creatures:[c]},rules));
    }
  }
});
test('friendly multilingual names, apostrophes and innocent word fragments remain usable',()=>{
  for(const name of ['Ishita','Harshit','Cassie','Dickens','Scunthorpe','Butterfly','Captain Noodle','José','Zoë','O’Connor','Anne-Marie','小明','A','It','Go','Test Trainer 1']){
    const c=creature({name,trainer:{...creature().trainer,nickname:name}});assert.deepEqual(validateCreature(c,rules),[],name);
  }
  const c=creature({name:'  Moss  Buddy ',trainer:{...creature().trainer,nickname:'  Zoë  Green '}});
  const [loaded]=loadCollection({schema:1,creatures:[c]},rules);assert.equal(loaded.name,'Moss Buddy');assert.equal(loaded.trainer.nickname,'Zoë Green');assert.equal(c.trainer.nickname,'  Zoë  Green ');
});

test('prototype entries retire once six real creatures are uploaded',()=>{
 const prototype=creature({id:'cr-debug99',prototype:true,name:'Test sprite'}),real=[0,1,2,3,4,5].map(i=>creature({id:`cr-real0${i}`}));
 for(const count of [0,1,2,3,4,5])assert.equal(loadCollection({schema:1,creatures:[prototype,...real.slice(0,count)]},rules).length,count+1);
 assert.deepEqual(loadCollection({schema:1,creatures:[prototype,...real]},rules).map(c=>c.id),real.map(c=>c.id));
});

test('unusual move budgets are flagged without changing reviewed choices',async()=>{
 const {creatureWarnings}=await import('../releases/v43/src/collection.js');
 const c=creature();assert.deepEqual(creatureWarnings(c,rules),[]);
 c.moves.regular={id:'blast',name:'Burst',category:'special'};
 c.moves.special={id:'guard',name:'Shield',category:'defense'};
 assert.match(creatureWarnings(c,rules)[0],/Only 3 attack uses/);
 c.moves.regular={id:'toughen',name:'Hide',category:'defense'};
 assert.match(creatureWarnings(c,rules)[0],/No selected attacks/);
 assert.deepEqual(validateCreature(c,rules),[]);
});
