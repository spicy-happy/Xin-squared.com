import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {loadCollection,validateCreature} from '../releases/v46/src/collection.js';
import {battleTrainers,chooseOpponent} from '../releases/v46/src/trainers.js';
import {createMatch,whoseTurn,applyAction,chooseReplacement} from '../releases/v46/src/engine.js';
import {chooseAction,chooseReplacement as aiReplacement} from '../releases/v46/src/ai.js';
import {rules} from './helpers.mjs';
const root=new URL('../',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('kit/reviews/scan4-2026-10-21.json',root)));
const all=loadCollection(JSON.parse(readFileSync(new URL('data/creatures-v2.json',root))),rules);
const batch=all.filter(c=>manifest.creatures.some(e=>e.id===c.id));
const get=n=>batch.find(c=>c.id===`cr-scan4${String(n).padStart(2,'0')}`);

test('Scan4 adds all 29 original submissions, preserving stable identities and independent same-name drawings',()=>{
 assert.equal(batch.length,29);assert.equal(all.length,78);assert.equal(battleTrainers(all).length,21);
 assert.equal(new Set(all.map(c=>c.name)).size,78);assert.equal(new Set(batch.map(c=>c.image.src)).size,29);
 assert.equal(all.some(c=>c.prototype),false);
 assert.equal(get(1).name,'Bob #3');assert.equal(get(26).name,'Bob #4');
 assert.equal(get(10).name,'Bubble');assert.equal(get(17).name,'Bubble #2');
 assert.deepEqual(Object.fromEntries(battleTrainers(batch).map(t=>[t.nickname,t.creatures.length])),{
  Evda:15,Jaida:2,Emily:2,Adrian:3,Ada:2,AXS:4,Luca:1
 });
 for(const c of batch){
  assert.deepEqual(validateCreature(c,rules),[]);
  for(const path of [c.image.src,c.trainer.portrait])assert.ok(existsSync(new URL(path,root)),path);
 }
 for(const t of battleTrainers(all))assert.equal(new Set(t.creatures.map(c=>c.trainer.portrait)).size,1,t.nickname);
 for(const [newId,oldId] of [[2,'cr-doobie01'],[3,'cr-rextron'],[7,'cr-silverwing'],[16,'cr-wtvluca']]){
  assert.deepEqual(get(newId).trainer,all.find(c=>c.id===oldId).trainer);
 }
 assert.notEqual(get(1).trainer.id,all.find(c=>c.id==='cr-bobblue').trainer.id,'Jaida is separate from Jaiden');
});

test('Scan4 cancels crossed-out choices, preserves zero stats, and documents completed choices and art',()=>{
 assert.deepEqual(get(1).stats,{health:5,attack:0,defense:0,speed:1});
 assert.equal(get(0).stats.speed,0);assert.equal(get(23).stats.speed,0);
 assert.equal(get(9).stats.health,3);assert.equal(get(26).stats.speed,1);
 assert.equal(get(21).type,'water');assert.equal(get(22).type,'water');
 assert.deepEqual(Object.values(get(23).moves).map(m=>m.id),['steady','blast','guard']);
 assert.deepEqual(Object.values(get(2).moves).map(m=>m.category),['regular','regular','regular']);
 assert.deepEqual(Object.values(get(28).moves).map(m=>m.id),['heavy','heal','steady']);
 for(const n of [11,18,28])assert.match(manifest.creatures[n].reviewNotes,/supplied|filled/);
 for(const n of [12,25,27]){
  assert.ok(manifest.creatures[n].completedArtwork);assert.ok(manifest.creatures[n].artworkCompletion);
 }
 for(const c of batch){
  const entry=manifest.creatures.find(e=>e.id===c.id);
  for(const canceled of entry.moveMarks.filter(m=>m.status==='canceled'))assert.ok(Object.values(c.moves).every(m=>m.id!==canceled.id));
  for(const canceled of entry.typeMarks.filter(m=>m.status==='canceled'))assert.notEqual(c.type,canceled.id);
 }
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
