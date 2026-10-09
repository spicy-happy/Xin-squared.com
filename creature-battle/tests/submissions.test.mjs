import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadCollection, validateCreature } from '../releases/v39/src/collection.js';
import { createMatch, getActions, applyAction, chooseReplacement, whoseTurn } from '../releases/v39/src/engine.js';
import { chooseAction, chooseReplacement as aiReplacement } from '../releases/v39/src/ai.js';
import { chooseOpponent, gymLeaders, sameTrainerName } from '../releases/v39/src/trainers.js';
import { facingFlip } from '../releases/v39/src/moves.js';
import { rules } from './helpers.mjs';
const raw=JSON.parse(readFileSync(new URL('../data/creatures-v2.json',import.meta.url)));
const collection=loadCollection(raw,rules).filter(c=>!c.prototype);
const find=name=>collection.find(c=>c.name===name);
test('Uncle Mark roster honors the active sheet choices and one shared portrait',()=>{
 assert.deepEqual(collection.map(c=>c.name),['Broot','Amphidian','Bassault']);
 assert.equal(new Set(collection.map(c=>c.trainer.id)).size,1);
 assert.equal(new Set(collection.map(c=>c.trainer.portrait)).size,1);
 assert.deepEqual(Object.values(find('Broot').moves).map(m=>m.id),['heavy','risky','heal']);
 assert.deepEqual(Object.values(find('Amphidian').moves).map(m=>m.id),['quick','heavy','blast']);
 assert.deepEqual(Object.values(find('Bassault').moves).map(m=>m.id),['blast','guard','toughen']);
 assert.equal(find('Bassault').type,'ground');
 for(const c of collection)assert.deepEqual(validateCreature(c,rules),[]);
});
test('gym leaders use only their own creatures, sample every creature before repeating, and random bots draw from the roster',()=>{
 assert.equal(gymLeaders(collection).length,1);
 const outsider=structuredClone(find('Broot'));outsider.id='cr-other01';outsider.trainer={...outsider.trainer,id:'tr-other01',nickname:'Other'};
 const all=[...collection,outsider];
 for(let seed=1;seed<30;seed++){
  const gym=chooseOpponent(all,'tr-unclemark',seed);
  assert.equal(gym.trainer.nickname,'Uncle Mark');assert.equal(gym.trainer.gymLeader,true);
  assert.equal(new Set(gym.team.map(c=>c.id)).size,3);assert.ok(gym.team.every(c=>c.trainer.id==='tr-unclemark'));
  const sparse=chooseOpponent(collection.slice(0,2),'tr-unclemark',seed);
  assert.equal(sparse.team.length,3);assert.equal(new Set(sparse.team.map(c=>c.id)).size,2);
  const random=chooseOpponent(all,'random',seed);assert.equal(random.trainer.bot,true);assert.equal(random.team.length,3);assert.ok(random.team.every(c=>all.some(m=>m.id===c.id)));
 }
 assert.throws(()=>chooseOpponent(all,'tr-missing',1));
});
test('side-facing art mirrors toward the opponent without flipping front-facing creatures',()=>{
 assert.equal(facingFlip(find('Amphidian'),0),true);assert.equal(facingFlip(find('Amphidian'),1),false);
 for(const name of ['Broot','Bassault'])for(const side of [0,1])assert.equal(facingFlip(find(name),side),false);
});
function match(name){const c=find(name);return createMatch({rules,teams:[[c,c,c],[c,c,c]],seed:2}).state;}
test('two regular attacks keep independent PP and the third special remains usable',()=>{
 let s=match('Amphidian'),side=whoseTurn(s).side,m=s.teams[side][0];
 assert.deepEqual(m.pp,{regular:12,special:6,defense:3});
 m.pp.regular=0;m.pp.special=0;
 assert.ok(getActions(s,side).some(a=>a.kind==='defense'&&a.enabled));
 assert.ok(!getActions(s,side).some(a=>a.kind==='fallback'));
 const r=applyAction(s,side,{kind:'defense'});assert.ok(r.events.some(e=>e.t==='use'&&e.moveId==='blast'));assert.equal(r.state.teams[side][0].pp.defense,2);
 m.pp.defense=0;assert.ok(getActions(s,side).some(a=>a.kind==='fallback'&&a.enabled));
});
test('two defense moves apply their distinct effects without consuming attack PP',()=>{
 for(const [kind,effect]of [['special','shieldUp'],['defense','toughen']]){
  const s=match('Bassault'),side=whoseTurn(s).side,m=s.teams[side][0];m.hp-=30;
  const r=applyAction(s,side,{kind});assert.ok(r.events.some(e=>e.t===effect));assert.equal(r.state.teams[side][0].pp.regular,3);assert.equal(r.state.teams[side][0].pp[kind],2);
 }
});
for(const difficulty of ['easy','normal'])test(`real mixed-category teams finish with ${difficulty} AI, including duplicate gym teams`,()=>{
 for(let seed=1;seed<=8;seed++){
  let s=createMatch({rules,teams:[collection,[find('Bassault'),find('Bassault'),find('Bassault')]],seed}).state,aiRng=seed,lastSwitch=[false,false];
  for(let step=0;!s.over&&step<650;step++){
   const t=whoseTurn(s),side=t.side;
   if(t.need==='replacement'){const choice=aiReplacement(s,side,{difficulty,aiRng});aiRng=choice.aiRng;lastSwitch[side]=choice.lastSwitch;s=chooseReplacement(s,side,choice.index).state;}
   else{const choice=chooseAction(s,side,{difficulty,aiRng,lastSwitch:lastSwitch[side]});aiRng=choice.aiRng;lastSwitch[side]=choice.lastSwitch;s=applyAction(s,side,choice.action).state;}
  }
  assert.equal(s.over,true);assert.equal(s.reason,'ko');
 }
});
test('three defensive selections retain all three controls and a separate fallback attack',()=>{
 const c=structuredClone(find('Bassault'));c.moves.regular={id:'heal',name:'Healing Glow',category:'defense'};
 const s=createMatch({rules,teams:[[c,c,c],[c,c,c]],seed:2}).state,side=whoseTurn(s).side;
 const actions=getActions(s,side).filter(a=>a.enabled&&a.kind!=='switch');
 assert.deepEqual(actions.map(a=>a.kind),['regular','special','defense','fallback']);
 assert.ok(applyAction(s,side,{kind:'regular'}).events.some(e=>e.t==='heal'));
 assert.ok(applyAction(s,side,{kind:'fallback'}).events.some(e=>e.t==='hit'));
});

test('trainer collisions normalize case, spacing and Unicode',()=>{
 assert.ok(sameTrainerName(' uncle  mark ','Uncle Mark'));
 assert.ok(sameTrainerName('Ｕncle Mark','Uncle Mark'));
 assert.ok(!sameTrainerName('Mark','Uncle Mark'));
});
