import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {match,creature,moves,stats,active} from './helpers.mjs';import {deepFreeze} from '../src/rules.js';
import {chooseAction,chooseTeam,chooseReplacement,publicBattle,scoreAction} from '../src/ai.js';
import {applyAction,getActions} from '../src/engine.js';
test('AI module never calls or imports engine transition APIs',()=>{
  const source=readFileSync(new URL('../src/ai.js',import.meta.url),'utf8');
  assert.ok(!source.includes('applyAction'));assert.ok(!source.includes('state.rng'));assert.ok(!source.includes('state.pairCoin'));
  assert.match(source,/import \{ getActions \} from '\.\/engine.js'/);
});
test('AI cannot read battle RNG or coin memo, and deep-frozen state is unchanged',()=>{
  const {state}=match();const before=JSON.stringify(state);deepFreeze(state);
  const guarded=new Proxy(state,{get(target,key){if(['rng','pairCoin'].includes(key))throw Error('private RNG read');return target[key];}});
  for(const difficulty of ['easy','normal'])for(let seed=0;seed<100;seed++) {
    const side=state.order[0],result=chooseAction(guarded,side,{difficulty,aiRng:seed});
    assert.ok(getActions(state,side).some(a=>a.enabled&&a.kind===result.action.kind&&a.index===result.action.index));
  }
  assert.equal(JSON.stringify(state),before);assert.equal('rng' in publicBattle(state),false);
});
test('replaying same actions after arbitrary AI draws leaves battle replay unchanged',()=>{
  const {state}=match();const side=state.order[0],action={kind:'regular'};
  const expected=applyAction(state,side,action);
  for(let seed=0;seed<100;seed++)chooseAction(state,side,{difficulty:'normal',aiRng:seed});
  assert.deepEqual(applyAction(state,side,action),expected);
});
test('Easy never switches twice in a row and choices depend on separate aiRng',()=>{
  const {state}=match();const side=state.order[0],choices=new Set();
  for(let seed=0;seed<100;seed++) {
    assert.notEqual(chooseAction(state,side,{aiRng:seed,lastSwitch:true}).action.kind,'switch');
    choices.add(chooseAction(state,side,{aiRng:seed}).action.kind);
  }
  assert.ok(choices.size>1);
});
test('Normal secure KO, early defenses, Heal threshold, shield use and Overload punish scoring',()=>{
  let {state}=match({stats:stats(2,3,0,5),moves:moves('steady','risky','heal')},{stats:stats(5,3,2,0)});
  const side=0;active(state,1).hp=1;
  assert.ok(scoreAction(state,side,{kind:'regular'})>scoreAction(state,side,{kind:'special'}));
  active(state,0).hp=20;assert.equal(scoreAction(state,side,{kind:'defense'}),24*0.85);
  active(state,0).hp=active(state,0).maxHp;assert.equal(scoreAction(state,side,{kind:'defense'}),-5);
  state=match({stats:stats(2,3,0,5),moves:moves('steady','overload','guard')},{stats:stats(5,3,2,0)}).state;
  active(state,1).shield=10;assert.equal(scoreAction(state,0,{kind:'special'}),-20);
  active(state,1).shield=0;active(state,0).hp=5;assert.equal(scoreAction(state,0,{kind:'special'}),-30);
  active(state,0).hp=active(state,0).maxHp;assert.equal(scoreAction(state,0,{kind:'defense'}),13);
});
test('Normal replacements use revealed matchup; team selection has no opponent and legal 0/1/2/3+ picks',()=>{
  const a=creature(),b=creature({id:'cr-test01',type:'grass'}),c=creature({id:'cr-test02',type:'fire'});
  for(const difficulty of ['easy','normal'])for(const collection of [[],[a],[a,b],[a,b,c]]) {
    const {team}=chooseTeam(deepFreeze(collection),{difficulty,aiRng:12});
    assert.equal(team.length,collection.length?3:0);
    if(collection.length===3)assert.equal(new Set(team.map(c=>c.id)).size,3);
  }
  const {state}=match();state.teams[0][1].type='grass';state.teams[0][2].type='fire';active(state,0).hp=0;
  assert.equal(chooseReplacement(state,0,{difficulty:'normal',aiRng:12}).index,1);
});
