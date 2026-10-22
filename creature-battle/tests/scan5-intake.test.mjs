import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {loadCollection,validateCreature} from '../releases/v46/src/collection.js';
import {battleTrainers,chooseOpponent} from '../releases/v46/src/trainers.js';
import {createMatch,whoseTurn,applyAction,chooseReplacement} from '../releases/v46/src/engine.js';
import {chooseAction,chooseReplacement as aiReplacement} from '../releases/v46/src/ai.js';
import {rules} from './helpers.mjs';
const root=new URL('../',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('kit/reviews/scan5-2026-10-21.json',root)));
const all=loadCollection(JSON.parse(readFileSync(new URL('data/creatures-v2.json',root))),rules);
const batch=all.filter(c=>manifest.creatures.some(e=>e.id===c.id));
const get=n=>batch.find(c=>c.id===`cr-scan5${String(n).padStart(2,'0')}`);

test('Scan5 keeps six submissions, confirmed stats, moves, identities and assets',()=>{
 assert.equal(batch.length,6);assert.equal(all.length,84);assert.equal(battleTrainers(all).length,23);
 assert.deepEqual(batch.map(c=>c.name),['Mrina','Ashton’s Battler','Old and little','Boc','boxy','blow']);
 assert.deepEqual(get(1).stats,{health:4,attack:3,defense:1,speed:2});
 assert.deepEqual(Object.values(get(0).moves).map(m=>m.id),['blast','guard','heal']);
 assert.deepEqual(Object.values(get(5).moves).map(m=>m.id),['steady','blast','guard']);
 assert.equal(get(0).image.facing,'left');
 for(const c of batch){
  assert.deepEqual(validateCreature(c,rules),[]);
  for(const path of [c.image.src,c.trainer.portrait])assert.ok(existsSync(new URL(path,root)),path);
 }
 for(const t of battleTrainers(all))assert.equal(new Set(t.creatures.map(c=>c.trainer.portrait)).size,1,t.nickname);
 assert.equal(get(2).trainer.id,'tr-evda001');
 for(const n of [3,4,5])assert.equal(get(n).trainer.id,'tr-adrian1');
});

for(const difficulty of ['easy','normal'])test(`every new drawing can take part in a complete ${difficulty} battle`,()=>{
 for(let offset=0;offset<batch.length;offset+=3){
  const team=Array.from({length:3},(_,i)=>batch[(offset+i)%batch.length]);
  const opponent=chooseOpponent(all,team[0].trainer.id,39+offset);
  let s=createMatch({rules,teams:[team,opponent.team],seed:39+offset}).state,aiRng=39+offset,lastSwitch=[false,false];
  for(let step=0;!s.over&&step<1500;step++){
   const turn=whoseTurn(s),side=turn.side;
   const choice=turn.need==='replacement'?aiReplacement(s,side,{difficulty,aiRng}):chooseAction(s,side,{difficulty,aiRng,lastSwitch:lastSwitch[side]});
   aiRng=choice.aiRng;lastSwitch[side]=choice.lastSwitch;
   s=turn.need==='replacement'?chooseReplacement(s,side,choice.index).state:applyAction(s,side,choice.action).state;
  }
  assert.equal(s.over,true,team.map(c=>c.name).join(', '));assert.equal(s.reason,'ko');
 }
});
