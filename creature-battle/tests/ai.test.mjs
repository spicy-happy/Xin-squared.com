import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {rules,match,creature,moves,stats,active} from './helpers.mjs';import {deepFreeze,expectedDamage} from '../releases/v42/src/rules.js';
import {chooseAction,chooseTeam,chooseReplacement,publicBattle,scoreAction} from '../releases/v42/src/ai.js';
import {applyAction,getActions,chooseReplacement as replaceCreature,whoseTurn} from '../releases/v42/src/engine.js';
test('AI module never calls or imports engine transition APIs',()=>{
  const source=readFileSync(new URL('../releases/v42/src/ai.js',import.meta.url),'utf8');
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
  active(state,0).hp=active(state,0).maxHp;assert.equal(scoreAction(state,0,{kind:'defense'}),-5);
  active(state,0).hp-=29;assert.equal(scoreAction(state,0,{kind:'defense'}),13);
  active(state,0).shield=29;assert.equal(scoreAction(state,0,{kind:'defense'}),-5);
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

test('Normal practice opener is weak to the player opening type, with a legal team',async()=>{
 const {choosePracticeTeam}=await import('../releases/v42/src/ai.js');
 const pool=Object.keys(rules.types).map((type,i)=>creature({type,id:`cr-open0${i}`}));
 for(const openingType of Object.keys(rules.types))for(const seed of [3,17,101]){
  const choice=choosePracticeTeam(pool,{rules,openingType,aiRng:seed});assert.equal(choice.team.length,3);assert.equal(new Set(choice.team.map(c=>c.id)).size,3);assert.ok(rules.types[openingType].strong.includes(choice.team[0].type));
 }
 const small=pool.slice(0,2);assert.equal(choosePracticeTeam(small,{rules,openingType:'fire',aiRng:3}).team.length,3);
});

test('practice teams favour each child pick, randomising equally favourable choices',async()=>{
 const {choosePracticeTeam}=await import('../releases/v42/src/ai.js');
 const {typeMult}=await import('../releases/v42/src/rules.js');
 const pool=Object.keys(rules.types).map((type,i)=>creature({type,id:`cr-favor${i}`}));
 const playerTeam=pool.slice(0,3),openers=new Set();
 for(let seed=0;seed<100;seed++){
  const {team}=choosePracticeTeam(pool,{rules,playerTeam,openingType:playerTeam[0].type,aiRng:seed});
  const remaining=[...pool];
  team.forEach((c,i)=>{
   const score=m=>typeMult(rules,playerTeam[i].type,m.type)/typeMult(rules,m.type,playerTeam[i].type);
   assert.equal(score(c),Math.max(...remaining.map(score)));remaining.splice(remaining.findIndex(m=>m.id===c.id),1);
  });openers.add(team[0].id);
 }
 assert.ok(openers.size>1);
});
test('Normal usually follows a simple strategy but sometimes picks a weaker move',()=>{
 const {state}=match({stats:stats(2,3,0,5)},{});let weaker=0;const kinds=new Set();
 const legal=getActions(state,0).filter(a=>a.enabled&&['regular','special'].includes(a.kind));
 const best=Math.max(...legal.map(a=>scoreAction(state,0,a,'normal')));
 for(let seed=0;seed<2000;seed++){
  const {action}=chooseAction(state,0,{difficulty:'easy',aiRng:seed});
  assert.ok(['regular','special'].includes(action.kind),'no switches or full-HP healing');
  kinds.add(action.kind);
  if(scoreAction(state,0,action,'normal')<best)weaker++;
 }
 assert.equal(kinds.size,2);
 assert.ok(weaker>500&&weaker<700,`weaker move rate: ${weaker}/2000`);
});
test('Normal random choices remain legal and avoid defense moves with no benefit',()=>{
 for(const defense of ['heal','guard','toughen']){
  const {state}=match({stats:stats(2,3,0,5),moves:moves('steady','blast',defense)},{});
  if(defense==='guard'){active(state,0).hp-=29;active(state,0).shield=29;}
  if(defense==='toughen')active(state,0).toughened=true;
  for(let seed=0;seed<100;seed++){
   const {action}=chooseAction(state,0,{difficulty:'easy',aiRng:seed});
   assert.notEqual(action.kind,'defense');assert.notEqual(action.kind,'switch');
   assert.ok(getActions(state,0).some(a=>a.enabled&&a.kind===action.kind));
  }
 }
});

test('practice selection safely handles an empty collection',async()=>{
 const {choosePracticeTeam}=await import('../releases/v42/src/ai.js');
 assert.deepEqual(choosePracticeTeam([],{rules,openingType:'fire',aiRng:12}),{team:[],aiRng:12});
});


test('AI uses the revealed next-hit guarantee without reading random rolls',()=>{
 const {state:s}=match();const side=s.order[0],me=active(s,side),foe=active(s,1-side),move=rules.moves.special[me.moves.special.id];
 const ordinary=expectedDamage(rules,me,foe,move);
 s.nextHitGuaranteed[side]=true;
 assert.equal(publicBattle(s).nextHitGuaranteed[side],true);
 assert.ok(Math.abs(expectedDamage(rules,me,foe,move,{guaranteedHit:true})-ordinary*100/move.accuracy)<1e-9);
 assert.ok(scoreAction(s,side,{kind:'special'},'easy')>scoreAction({...s,nextHitGuaranteed:[false,false]},side,{kind:'special'},'easy'));
});

test('Hard scoring avoids repeated Iron Hide and values Quick by current speed',()=>{
 const {state:s}=match({moves:moves('quick','blast','toughen')});
 const side=s.order[0],me=active(s,side),foe=active(s,1-side);
 me.moves=moves('quick','blast','toughen');me.toughened=true;
 assert.equal(scoreAction(s,side,{kind:'defense'},'normal'),-5);
 for(const speed of [0,2,5]){
  me.stats.speed=speed;s.slot=1;
  assert.equal(scoreAction(s,side,{kind:'regular'},'easy'),expectedDamage(rules,me,foe,rules.moves.regular.quick,{first:speed>foe.stats.speed}));
 }
});

test('AI uses a move after a faint replacement in both difficulty modes',()=>{
 for(const difficulty of ['easy','normal'])for(let seed=0;seed<300;seed++){
  let {state}=match({stats:stats(2,3,0,5)},{stats:stats(5,3,2,0)});
  active(state,1).hp=1;
  state=applyAction(state,0,{kind:'regular'}).state;
  assert.deepEqual(whoseTurn(state),{side:1,need:'replacement'});
  const replacement=chooseReplacement(deepFreeze(state),1,{difficulty,aiRng:seed});
  assert.equal(replacement.lastSwitch,true);
  state=replaceCreature(state,1,replacement.index).state;
  assert.deepEqual(whoseTurn(state),{side:1,need:'action'});
  assert.ok(getActions(state,1).some(a=>a.enabled&&a.kind==='switch'),'engine still permits human switches');
  const choice=chooseAction(deepFreeze(state),1,{difficulty,...replacement});
  assert.notEqual(choice.action.kind,'switch',`${difficulty}, seed ${seed}`);
  assert.equal(choice.lastSwitch,false,'using a move clears the AI switch restriction');
  const result=applyAction(state,1,choice.action);
  assert.ok(result.events.some(e=>e.t==='use'));
  assert.equal(result.state.switchesLeft[1],3);
 }
});
test('Hard also avoids consecutive voluntary switches',()=>{
 let {state}=match({type:'water',stats:stats(2,3,0,5)},{type:'fire',stats:stats(5,3,2,0)});
 state=applyAction(state,0,{kind:'defense'}).state;
 state.teams[1][1].type='grass';
 // This matchup gives switching a higher score than attacks, rather than relying on random mistakes.
 assert.ok(scoreAction(state,1,{kind:'switch',index:1})>scoreAction(state,1,{kind:'regular'}));
 for(let seed=0;seed<300;seed++)assert.notEqual(chooseAction(state,1,{difficulty:'normal',aiRng:seed,lastSwitch:true}).action.kind,'switch');
 const choices=new Set();
 for(let seed=0;seed<100;seed++)choices.add(chooseAction(state,1,{difficulty:'normal',aiRng:seed,lastSwitch:false}).action.kind);
 assert.ok(choices.has('switch'),'switching remains available after a move');
});

test('random opponent preserves practice Easy and balanced Hard team selection',async()=>{
 const {chooseOpponent}=await import('../releases/v42/src/trainers.js');
 const {chooseTeam,choosePracticeTeam}=await import('../releases/v42/src/ai.js');
 const {creature,rules}=await import('./helpers.mjs');
 const collection=Object.keys(rules.types).map((type,i)=>creature({id:`cr-team0${i}`,type}));
 const playerTeam=[collection[0],collection[0],collection[0]];
 for(let aiRng=1;aiRng<20;aiRng++){
  for(const difficulty of ['easy','hard']){
   const actual=chooseOpponent(collection,'random',aiRng,{difficulty,rules,playerTeam});
   const expected=difficulty==='easy'?choosePracticeTeam(collection,{rules,playerTeam,aiRng}):chooseTeam(collection,{difficulty:'normal',aiRng});
   assert.deepEqual(actual.team,expected.team);assert.equal(actual.aiRng,expected.aiRng);
  }
 }
});
