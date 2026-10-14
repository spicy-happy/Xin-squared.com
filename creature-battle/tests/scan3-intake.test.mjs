import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {loadCollection,validateCreature} from '../releases/v46/src/collection.js';
import {battleTrainers,chooseOpponent} from '../releases/v46/src/trainers.js';
import {createMatch,whoseTurn,applyAction,chooseReplacement} from '../releases/v46/src/engine.js';
import {chooseAction,chooseReplacement as aiReplacement} from '../releases/v46/src/ai.js';
import {rules} from './helpers.mjs';
const root=new URL('../',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('kit/reviews/scan3-2026-10-14.json',root)));
const all=loadCollection(JSON.parse(readFileSync(new URL('data/creatures-v2.json',root))),rules);
const batch=all.filter(c=>manifest.creatures.some(e=>e.id===c.id));

test('Scan3 adds three original drawings, shares existing portraits, and preserves all selected stats and moves',()=>{
 assert.equal(batch.length,3);assert.equal(all.length,49);assert.equal(battleTrainers(all).length,18);
 assert.equal(new Set(all.map(c=>c.name)).size,49);
 assert.equal(new Set(batch.map(c=>c.image.src)).size,3);
 assert.deepEqual(batch.map(c=>c.name),['WTV','EZ','The Vampire Creature']);
 assert.deepEqual(batch.map(c=>c.stats),[
  {health:5,attack:3,defense:2,speed:0},
  {health:3,attack:3,defense:2,speed:2},
  {health:3,attack:4,defense:0,speed:3}
 ]);
 for(const c of batch){
  const e=manifest.creatures.find(e=>e.id===c.id);
  assert.equal(e.reviewed,true);assert.ok(e.reviewNotes);assert.deepEqual(validateCreature(c,rules),[]);
  assert.equal(c.type,'fire');assert.equal(c.image.facing,e.facing);
  assert.deepEqual(Object.values(c.moves).map(m=>m.id),e.moveMarks.filter(m=>m.status==='selected').map(m=>m.id));
  assert.deepEqual(c.stats,e.stats);assert.equal(Object.values(c.stats).reduce((a,b)=>a+b),10);
  for(const path of [c.image.src,c.trainer.portrait])assert.ok(existsSync(new URL(path,root)),path);
 }
 for(const [id,count] of [['tr-emily01',2],['tr-arjan01',4],['tr-luca001',1]]){
  const own=all.filter(c=>c.trainer.id===id);assert.equal(own.length,count);assert.equal(new Set(own.map(c=>c.trainer.portrait)).size,1);
 }
});

for(const difficulty of ['easy','normal'])test(`the new drawings and Luca's single-creature bot complete ${difficulty} battles`,()=>{
 const opponent=chooseOpponent(all,'tr-luca001',39);
 assert.equal(opponent.team.length,3);assert.ok(opponent.team.every(c=>c.id==='cr-wtvluca'));
 let s=createMatch({rules,teams:[batch,opponent.team],seed:39}).state,aiRng=39,lastSwitch=[false,false];
 for(let step=0;!s.over&&step<1200;step++){
  const turn=whoseTurn(s),side=turn.side;
  const choice=turn.need==='replacement'?aiReplacement(s,side,{difficulty,aiRng}):chooseAction(s,side,{difficulty,aiRng,lastSwitch:lastSwitch[side]});
  aiRng=choice.aiRng;lastSwitch[side]=choice.lastSwitch;
  s=turn.need==='replacement'?chooseReplacement(s,side,choice.index).state:applyAction(s,side,choice.action).state;
 }
 assert.equal(s.over,true);assert.equal(s.reason,'ko');
});
