import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {loadCollection,validateCreature} from '../releases/v46/src/collection.js';
import {battleTrainers,chooseOpponent} from '../releases/v46/src/trainers.js';
import {createMatch,whoseTurn,applyAction,chooseReplacement} from '../releases/v46/src/engine.js';
import {chooseAction,chooseReplacement as aiReplacement} from '../releases/v46/src/ai.js';
import {rules} from './helpers.mjs';
const root=new URL('../',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('kit/reviews/scan2-2026-10-14.json',root)));
// Historical intake assertions use the roster at that batch’s date.
const all=loadCollection(JSON.parse(readFileSync(new URL('data/creatures-v2.json',root))),rules).filter(c=>c.added<='2026-10-14');
const batchIds=new Set(manifest.creatures.map(e=>e.id));
const batch=all.filter(c=>batchIds.has(c.id));
const get=id=>batch.find(c=>c.id==='cr-'+id);

test('Scan2 keeps all 23 different drawings, eight new artists, and Ada’s existing identity',()=>{
 assert.equal(batch.length,23);assert.equal(batchIds.size,23);
 assert.equal(new Set(batch.map(c=>c.image.src)).size,23);
 assert.equal(new Set(all.map(c=>c.name)).size,49);
 assert.equal(battleTrainers(all).length,18);
 assert.deepEqual(Object.fromEntries(battleTrainers(batch).map(t=>[t.nickname,t.creatures.length])),{
  Keira:3,Nicole:3,Adrian:3,Emily:1,Duncan:3,Arjan:3,Kaiden:3,Max:3,Ada:1
 });
 assert.notEqual(get('watertail').trainer.id,'tr-jaiden');
 const ada=all.filter(c=>c.trainer.id==='tr-ada001');assert.equal(ada.length,4);
 assert.equal(new Set(ada.map(c=>c.trainer.portrait)).size,1);
 for(const t of battleTrainers(all))assert.equal(new Set(t.creatures.map(c=>c.trainer.portrait)).size,1,t.nickname);
 for(const c of batch){
  const e=manifest.creatures.find(e=>e.id===c.id);
  assert.equal(e.reviewed,true);assert.ok(e.reviewNotes);
  assert.deepEqual(validateCreature(c,rules),[]);assert.deepEqual(c.stats,e.stats);
  assert.equal(c.image.facing,e.facing);
  assert.deepEqual(Object.values(c.moves).map(m=>m.id),e.moveMarks.filter(m=>m.status==='selected').map(m=>m.id));
  for(const path of [c.image.src,c.trainer.portrait])assert.ok(existsSync(new URL(path,root)),path);
  assert.ok(Object.values(c.stats).reduce((a,b)=>a+b,0)<=10);
  for(const [stat,canceled] of Object.entries(e.canceledStatMarks))assert.ok(!canceled.includes(c.stats[stat]),c.name+' '+stat);
 }
});

test('only over-budget allocations are reduced; lower totals and canceled stats stay unchanged',()=>{
 assert.deepEqual(get('five002').stats,{health:4,attack:1,defense:2,speed:3});
 assert.deepEqual(get('firemajik').stats,{health:1,attack:4,defense:2,speed:3});
 assert.deepEqual(get('firebeast').stats,{health:1,attack:1,defense:1,speed:1});
 assert.deepEqual(get('wutmax01').stats,{health:5,attack:0,defense:0,speed:0});
 assert.deepEqual(get('otomax01').stats,{health:4,attack:1,defense:1,speed:1});
 assert.deepEqual(get('waterdot').stats,{health:5,attack:0,defense:5,speed:0});
 assert.deepEqual(get('pokeball').stats,{health:0,attack:0,defense:5,speed:5});
 for(const id of ['watertail','bigtail01'])assert.ok(Object.values(get(id).moves).every(m=>m.id!=='heal'));
 assert.deepEqual(Object.values(get('waterdot').moves).map(m=>m.id),['steady','guard','toughen']);
});

for(const trainer of battleTrainers(batch))test(`${trainer.nickname}'s Scan2 team can complete battles on both difficulties`,()=>{
 for(const difficulty of ['easy','normal']){
  const opponent=chooseOpponent(all,trainer.id,93);
  assert.ok(opponent.team.every(c=>c.trainer.id===trainer.id));
  let s=createMatch({rules,teams:[all.filter(c=>c.trainer.id==='tr-unclemark'),opponent.team],seed:93}).state,aiRng=93,lastSwitch=[false,false];
  for(let step=0;!s.over&&step<1200;step++){
   const turn=whoseTurn(s),side=turn.side;
   const choice=turn.need==='replacement'?aiReplacement(s,side,{difficulty,aiRng}):chooseAction(s,side,{difficulty,aiRng,lastSwitch:lastSwitch[side]});
   aiRng=choice.aiRng;lastSwitch[side]=choice.lastSwitch;
   s=turn.need==='replacement'?chooseReplacement(s,side,choice.index).state:applyAction(s,side,choice.action).state;
  }
  assert.equal(s.over,true);assert.equal(s.reason,'ko');
 }
});
