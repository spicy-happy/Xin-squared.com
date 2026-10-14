import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {loadCollection,validateCreature} from '../releases/v46/src/collection.js';
import {battleTrainers,chooseOpponent} from '../releases/v46/src/trainers.js';
import {createMatch,whoseTurn,applyAction,chooseReplacement} from '../releases/v46/src/engine.js';
import {chooseAction,chooseReplacement as aiReplacement} from '../releases/v46/src/ai.js';
import {rules} from './helpers.mjs';
const root=new URL('../',import.meta.url);
const raw=JSON.parse(readFileSync(new URL('data/creatures-v2.json',root)));
const all=loadCollection(raw,rules);
const manifest=JSON.parse(readFileSync(new URL('kit/reviews/wed-art-2026-10-14.json',root)));
const kids=all.filter(c=>c.added==='2026-10-14');

test('20 distinct class drawings belong to eight children, with one portrait per child',()=>{
 assert.equal(kids.length,20);assert.equal(new Set(kids.map(c=>c.id)).size,20);
 assert.deepEqual(Object.fromEntries(battleTrainers(kids).map(t=>[t.nickname,t.creatures.length])),{
  Jaiden:4,Ada:3,Evan:2,Leopold:3,'Jo Zulu':1,Gwendolyn:3,QQ:3,Hailey:1
 });
 for(const t of battleTrainers(kids))assert.equal(new Set(t.creatures.map(c=>c.trainer.portrait)).size,1);
 assert.equal(all.length,23);assert.ok(all.every(c=>!c.prototype));
 assert.equal(new Set(all.map(c=>c.name)).size,23);
 for(const c of kids){
  assert.deepEqual(validateCreature(c,rules),[]);
  assert.ok(Object.values(c.stats).reduce((a,b)=>a+b,0)<=10,c.name+' exceeds 10 points');
  for(const path of [c.image.src,c.trainer.portrait])assert.ok(existsSync(new URL(path,root)),path);
  const source=manifest.creatures.find(e=>e.id===c.id);
  assert.ok(source.reviewNotes);assert.equal(c.image.facing,source.facing);
  const canceled=source.moveMarks.filter(m=>m.status==='canceled').map(m=>m.id);
  assert.ok(Object.values(c.moves).every(m=>!canceled.includes(m.id)));
 }
});

test('same-name drawings stay separate, zero allocations stay zero, and canceled moves stay canceled',()=>{
 const find=id=>kids.find(c=>c.id==='cr-'+id);
 assert.equal(find('bobgold').name,'Bob #2');assert.equal(find('higold01').name,'Hi #2');assert.equal(find('flameada').name,'Flame #2');
 assert.notEqual(find('bobblue').image.src,find('bobgold').image.src);
 assert.notEqual(find('hired01').image.src,find('higold01').image.src);
 assert.deepEqual(find('bobblue').stats,{health:5,attack:0,defense:0,speed:5});
 assert.deepEqual(find('higold01').stats,{health:5,attack:5,defense:0,speed:0});
 assert.equal(find('solothy').stats.speed,0);
 assert.deepEqual(Object.values(find('hired01').moves).map(m=>m.id),['quick','heavy','heal']);
 assert.deepEqual(Object.values(find('flameada').moves).map(m=>m.id),['steady','blast','heal']);
 assert.deepEqual(Object.values(find('emberwing').moves).map(m=>m.id),['quick','heal','toughen']);
});

for(const trainer of battleTrainers(kids))test(`${trainer.nickname}'s submitted team completes battles with both difficulties`,()=>{
 for(const difficulty of ['easy','normal']){
  const opponent=chooseOpponent(all,trainer.id,17);
  assert.ok(opponent.team.every(c=>c.trainer.id===trainer.id));
  assert.equal(new Set(opponent.team.map(c=>c.id)).size,Math.min(3,trainer.creatures.length));
  let s=createMatch({rules,teams:[all.filter(c=>c.trainer.id==='tr-unclemark'),opponent.team],seed:17}).state,aiRng=17,lastSwitch=[false,false];
  for(let step=0;!s.over&&step<900;step++){
   const turn=whoseTurn(s),side=turn.side;
   const choice=turn.need==='replacement'?aiReplacement(s,side,{difficulty,aiRng}):chooseAction(s,side,{difficulty,aiRng,lastSwitch:lastSwitch[side]});
   aiRng=choice.aiRng;lastSwitch[side]=choice.lastSwitch;
   s=turn.need==='replacement'?chooseReplacement(s,side,choice.index).state:applyAction(s,side,choice.action).state;
  }
  assert.equal(s.over,true);assert.equal(s.reason,'ko');
 }
});
