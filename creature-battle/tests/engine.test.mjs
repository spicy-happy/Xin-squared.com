import test from 'node:test';
import assert from 'node:assert/strict';
import { rules, creature, moves, stats, match, active, runRandom } from './helpers.mjs';
import { createMatch, whoseTurn, getActions, applyAction, chooseReplacement } from '../src/engine.js';
import { deepFreeze, damage } from '../src/rules.js';
import { next } from '../src/rng.js';
const fast = {stats:stats(2,3,0,5)},slow={stats:stats(5,3,2,0)};
const act=(s,kind='regular',index)=>applyAction(s,whoseTurn(s).side,{kind,...(index===undefined?{}:{index})});
const ev=(result,t)=>result.events.find(e=>e.t===t);

test('faster first; tie memoised only until either active changes, including re-meeting',()=>{
  assert.deepEqual(match(fast,slow).state.order,[0,1]);
  let {state:s}=match();const coin=s.pairCoin;const initial=s.rng;
  s=act(s).state;s=act(s).state;
  assert.equal(s.pairCoin,coin);assert.equal(s.rng,next(next(initial)[1])[1]);
  const order=[...s.order];const side=whoseTurn(s).side;
  s=applyAction(s,side,{kind:'switch',index:1}).state;assert.equal(s.pairCoin,null);assert.deepEqual(s.order,order);
  const rngBefore=s.rng;const r=act(s);s=r.state;
  assert.equal(s.rng,next(next(rngBefore)[1])[1]);assert.ok(ev(r,'round'));
  if (whoseTurn(s).side !== side) s=act(s).state;
  const before = s;
  s=applyAction(s,side,{kind:'switch',index:0}).state;
  if (before.slot === 1) { assert.equal(s.rng,next(before.rng)[1]); assert.equal(s.pairCoin,+(next(before.rng)[0]>=0.5)); }
  else assert.equal(s.pairCoin,null);
});
test('faint before action skips slot, replacement at round end re-compares speed; double after first-slot KO',()=>{
  let {state:s}=match(fast,slow);active(s,1).hp=1;
  const r=act(s);assert.deepEqual(r.events.map(e=>e.t),['use','hit','faint','skip','needReplace']);
  assert.deepEqual(whoseTurn(r.state),{side:1,need:'replacement'});
  const replaced=chooseReplacement(deepFreeze(r.state),1,1);
  assert.equal(ev(replaced,'round').double,0);assert.deepEqual(replaced.state.order,[0,1]);
  assert.equal(replaced.state.switchesLeft[1],3);
});
test('faint after action has no skip; faster replacement gives double after second-slot KO',()=>{
  let {state:s}=match(fast,slow);s.teams[0][1].stats.speed=0;s.teams[1][0].stats.speed=3;
  s=act(s).state;active(s,0).hp=1;
  const r=act(s);assert.ok(ev(r,'faint'));assert.ok(!ev(r,'skip'));
  const replaced=chooseReplacement(r.state,0,1);assert.equal(ev(replaced,'round').double,1);
});
test('switch preserves current order and next round can give consecutive turns',()=>{
  let {state:s}=match(fast,slow);s=act(s).state;s.teams[1][1].stats.speed=5;active(s,0).stats.speed=1;
  const r=applyAction(s,1,{kind:'switch',index:1});assert.deepEqual(ev(r,'round').order,[1,0]);assert.equal(ev(r,'round').double,1);
});
test('Overload automatic next-slot rest after KO, no rest action or switch window; faint discards rest',()=>{
  let {state:s}=match({...fast,moves:moves('steady','overload')},slow);active(s,1).hp=1;
  const r=act(s,'special');assert.equal(active(r.state,0).resting,true);
  const repl=chooseReplacement(r.state,1,1);assert.ok(ev(repl,'rest'));assert.equal(whoseTurn(repl.state).side,1);
  assert.equal(active(repl.state,0).resting,false);assert.ok(!getActions(repl.state,0).some(a=>a.enabled));
  let {state:q}=match(fast,{...slow,moves:moves('steady','overload')});q=act(q).state;q=act(q,'special').state;
  active(q,1).hp=1;const killed=act(q);assert.ok(ev(killed,'faint'));assert.equal(active(killed.state,1).resting,false);assert.ok(!ev(killed,'rest'));
});
test('recoil uses actual HP loss, half-up, min 1; cannot KO or emit at 1 HP; shield-all means none',()=>{
  for(const hp of [1,2,6,10]) {
    let {state:s}=match({...fast,moves:moves('steady','recoil')},slow);active(s,1).hp=hp;
    const r=act(s,'special');assert.equal(ev(r,'recoil').amount,Math.max(1,Math.floor(hp/4+0.5)));
  }
  let {state:s}=match({...fast,moves:moves('steady','recoil')},slow);active(s,0).hp=2;active(s,1).hp=20;
  const r=act(s,'special');assert.equal(ev(r,'recoil').hpAfter,1);
  s=match({...fast,moves:moves('steady','recoil')},slow).state;active(s,0).hp=1;
  assert.ok(!ev(act(s,'special'),'recoil'));
  s=match({...fast,moves:moves('steady','recoil')},slow).state;active(s,1).shield=1000;
  assert.equal(ev(act(s,'special'),'hit').amount,0);assert.ok(!ev(act(s,'special'),'recoil'));
});
test('Hang on only at full HP; Heal to full re-arms, partial Heal does not',()=>{
  for(const full of [true,false]) {
    let {state:s}=match({...fast,type:'water',moves:moves('heavy','overload')},{...slow,type:'fire'});
    active(s,1).maxHp=30;active(s,1).hp=full?30:29;
    const r=act(s,'special');assert.equal(!!ev(r,'hangOn'),full);assert.equal(active(r.state,1).hp,full?1:0);
  }
  for(const starting of [80,40]) {
    const testRules=structuredClone(rules);testRules.moves.regular.steady.power=1000;
    let {state:s}=createMatch({rules:testRules,teams:[Array.from({length:3},()=>creature({...fast,moves:moves('steady','blast','heal')})),Array.from({length:3},()=>creature(slow))],seed:9});active(s,0).hp=starting;
    s=act(s,'defense').state;
    const full=active(s,0).hp===active(s,0).maxHp;
    const r=act(s);assert.equal(!!ev(r,'hangOn'),full);
  }
});
test('Guard persists, absorbs final crit/type damage, partial absorption and break; refill never stacks',()=>{
  let {state:s}=match({...fast,moves:moves('steady','blast','guard')},slow);
  s=act(s,'defense').state;assert.equal(active(s,0).shield,29);
  assert.equal(getActions(s,0).find(a=>a.kind==='defense').enabled,false);
  let r=act(s);const h=ev(r,'hit');assert.equal(h.absorbed,damage(rules,active(s,1),active(s,0),rules.moves.regular.steady,{first:false,crit:h.crit}));
  assert.ok(active(r.state,0).shield>0);s=r.state;
  assert.equal(getActions(s,0).find(a=>a.kind==='defense').enabled,true);
  s=act(s,'defense').state;assert.equal(active(s,0).shield,29);
  active(s,0).shield=2;r=act(s);assert.equal(ev(r,'hit').absorbed,2);assert.ok(ev(r,'shieldBreak'));assert.equal(active(r.state,0).shield,0);
  s=r.state;active(s,0).shield=20;s=act(s,'switch',1).state;assert.equal(s.teams[0][0].shield,0);
});
test('Toughen cannot stack, switch clears; Heal disabled at full and capped',()=>{
  let {state:s}=match({...fast,moves:moves('steady','blast','toughen')},slow);
  s=act(s,'defense').state;s=act(s).state;
  assert.equal(getActions(s,0).find(a=>a.kind==='defense').reason,'Already tough!');
  s=act(s,'switch',1).state;assert.equal(s.teams[0][0].toughened,false);
  s=match(fast,slow).state;assert.equal(getActions(s,0).find(a=>a.kind==='defense').reason,'Already full!');
  active(s,0).hp--;const r=act(s,'defense');assert.equal(ev(r,'heal').amount,1);assert.equal(active(r.state,0).hp,96);
});
test('Piercing ignores Defense, respects Toughen and shield',()=>{
  let {state:s}=match({...fast,moves:moves('pierce')},slow);active(s,1).toughened=true;active(s,1).shield=3;
  const r=act(s);const hit=ev(r,'hit');const zero=structuredClone(active(s,1));zero.stats.defense=0;
  assert.equal(hit.amount+hit.absorbed,damage(rules,active(s,0),zero,rules.moves.regular.pierce,{crit:hit.crit}));
});
test('Quick 14 first and 10 second, including a previous mid-round switch',()=>{
  let {state:s}=match({...fast,moves:moves('quick')},{...slow,moves:moves('quick')});
  let r=act(s);let h=ev(r,'hit');assert.equal(h.amount,damage(rules,active(s,0),active(s,1),{power:14},{crit:h.crit}));
  s=r.state;r=act(s);h=ev(r,'hit');assert.equal(h.amount,damage(rules,active(s,1),active(s,0),{power:10},{crit:h.crit}));
  s=match(fast,{...slow,moves:moves('quick')}).state;s=act(s,'switch',1).state;
  r=act(s);h=ev(r,'hit');assert.equal(h.amount,damage(rules,active(s,1),active(s,0),{power:10},{crit:h.crit}));
});
test('miss spends PP, RNG draws accuracy then crit only on hit; guaranteed attacks draw only crit',()=>{
  let seed=0;while(next(seed)[0]<0.9)seed++;
  let {state:s}=match(fast,slow,seed);const r=act(s,'special');assert.ok(ev(r,'miss'));assert.equal(active(r.state,0).pp.special,2);assert.equal(r.state.rng,next(seed)[1]);
  s=match(fast,slow,0).state;const hit=act(s,'special');assert.ok(ev(hit,'hit'));assert.equal(hit.state.rng,next(next(0)[1])[1]);
  assert.equal(act(match(fast,slow,0).state).state.rng,next(0)[1]);
});
test('fallback only when both attacks exhausted; no type/crit or RNG draw; Toughen and shield still apply',()=>{
  let {state:s}=match({...fast,type:'water'},{...slow,type:'fire'});active(s,0).pp.regular=0;
  assert.equal(getActions(s,0)[0].kind,'regular');assert.equal(getActions(s,0)[0].enabled,false);
  active(s,0).pp.special=0;active(s,1).shield=2;active(s,1).toughened=true;
  const r=act(s,'fallback');const h=ev(r,'hit');assert.ok(ev(r,'fallback'));assert.equal(h.crit,false);assert.equal(h.eff,null);assert.equal(r.state.rng,s.rng);
  assert.equal(h.amount+h.absorbed,damage(rules,active(s,0),active(s,1),rules.fallback,{fallback:true}));
});
test('three voluntary switches only; illegal actions and replacements reject without mutation',()=>{
  let {state:s}=match(fast,slow);
  for(const index of [1,0,1]) {s=act(s,'switch',index).state;s=act(s).state;}
  assert.equal(s.switchesLeft[0],0);assert.throws(()=>applyAction(s,0,{kind:'switch',index:0}));assert.throws(()=>chooseReplacement(s,0,0));
  assert.throws(()=>applyAction(s,1,{kind:'regular'}));assert.throws(()=>applyAction(s,0,{kind:'rest'}));
});
test('deep-frozen input and definitions unchanged; duplicates independent; state JSON round-trip',()=>{
  const c=deepFreeze(creature());const r=createMatch({rules,teams:[[c,c,c],[c,c,c]],seed:1});
  const before=JSON.stringify(r.state);const after=act(deepFreeze(r.state));
  assert.equal(JSON.stringify(r.state),before);assert.deepEqual(after.state,JSON.parse(JSON.stringify(after.state)));
  assert.notEqual(after.state.teams[0][0],after.state.teams[0][1]);assert.equal(after.state.teams[0][1].pp.regular,12);
});
test('KO victory after action; no draws; cap fraction, damage, and final coin tiebreak',()=>{
  let {state:s}=match(fast,slow);s.teams[1].forEach(m=>m.hp=0);active(s,1).hp=1;
  let r=act(s);assert.deepEqual(whoseTurn(r.state),{over:true,winner:0,reason:'ko'});
  for(const scenario of ['hp','damage','coin']) {
    s=match(fast,slow).state;s.round=100;s.slot=1;s.order=[0,1];
    s.teams.flat().forEach(m=>{m.hp=1;m.maxHp=100;m.shield=999});
    if(scenario==='hp')s.teams[0][1].hp=2;
    if(scenario==='damage')s.teams[0][1].damageDealt=1;
    const afterCrit=next(s.rng)[1];r=act(s);
    assert.equal(r.state.reason,'cap');assert.equal(r.state.winner,scenario==='coin'?+(next(afterCrit)[0]>=0.5):0);
    assert.equal(r.state.rng,scenario==='coin'?next(afterCrit)[1]:afterCrit);
  }
});
test('10,000 seeded random-policy battles terminate without safety cap',()=>{
  for(let seed=0;seed<10000;seed++)assert.equal(runRandom(seed).reason,'ko',`seed ${seed}`);
});

test('rules stay deeply frozen after actions and replacements',()=>{
  let {state:s}=match(fast,slow);s=act(s).state;
  assert.ok(Object.isFrozen(s.rules.moves.regular.steady));
  assert.throws(()=>{s.rules.moves.regular.steady.power=1000;},TypeError);
  s.needReplacement=0;active(s,0).hp=0;s=chooseReplacement(s,0,1).state;
  assert.ok(Object.isFrozen(s.rules.moves.defense.heal.factor));
  assert.throws(()=>{s.rules.moves.defense.heal.factor[0]=1000;},TypeError);
});
