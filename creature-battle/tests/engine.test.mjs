import test from 'node:test';
import assert from 'node:assert/strict';
import { rules, creature, moves, stats, match, active, runRandom } from './helpers.mjs';
import { createMatch, whoseTurn, getActions, applyAction, chooseReplacement } from '../releases/v46/src/engine.js';
import { deepFreeze, damage } from '../releases/v46/src/rules.js';
import { next } from '../releases/v46/src/rng.js';
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
test('faint before action gives the replacement the unspent turn',()=>{
  let {state:s}=match(fast,slow);active(s,1).hp=1;
  const r=act(s);assert.deepEqual(r.events.map(e=>e.t),['use','hit','faint','needReplace']);
  assert.deepEqual(whoseTurn(r.state),{side:1,need:'replacement'});
  const replaced=chooseReplacement(deepFreeze(r.state),1,1);
  assert.ok(!ev(replaced,'round'));assert.deepEqual(whoseTurn(replaced.state),{side:1,need:'action'});
  assert.equal(replaced.state.switchesLeft[1],3);assert.equal(replaced.state.slot,1);
});
test('faint after action prevents a consecutive turn after second-slot KO',()=>{
  let {state:s}=match(fast,slow);s.teams[0][1].stats.speed=0;s.teams[1][0].stats.speed=3;
  s=act(s).state;active(s,0).hp=1;
  const r=act(s);assert.ok(ev(r,'faint'));assert.ok(!ev(r,'skip'));
  const replaced=chooseReplacement(r.state,0,1);assert.equal(ev(replaced,'round').double,null);assert.equal(whoseTurn(replaced.state).side,0);
});
test('switch preserves alternating turns even when the new creature is faster',()=>{
  let {state:s}=match(fast,slow);s=act(s).state;s.teams[1][1].stats.speed=5;active(s,0).stats.speed=1;
  const r=applyAction(s,1,{kind:'switch',index:1});assert.deepEqual(ev(r,'round').order,[0,1]);assert.equal(ev(r,'round').double,null);
});
test('Mega Burst recharges its special without skipping a turn, including after a knockout',()=>{
  let {state:s}=match({...fast,moves:moves('steady','overload')},slow);active(s,1).hp=1;
  const r=act(s,'special');assert.equal(active(r.state,0).recharging,true);
  s=chooseReplacement(r.state,1,1).state;s=act(s,'defense').state;
  assert.equal(whoseTurn(s).side,0);assert.equal(getActions(s,0).find(a=>a.kind==='special').enabled,false);
  assert.ok(getActions(s,0).find(a=>a.kind==='regular').enabled);assert.ok(getActions(s,0).find(a=>a.kind==='defense').enabled);
  const recover=act(s,'regular');assert.equal(whoseTurn(recover.state).side,1);assert.equal(active(recover.state,0).recharging,false);
  assert.ok(!recover.events.some(e=>e.t==='rest'));s=act(recover.state,'defense').state;
  assert.equal(getActions(s,0).find(a=>a.kind==='special').enabled,true);
});
test('recoil uses actual HP loss, half-up, min 1; cannot KO or emit at 1 HP; shield-all means none',()=>{
  for(const hp of [1,2,6,10]) {
    let {state:s}=match({...fast,moves:moves('steady','recoil')},slow);active(s,1).hp=hp;active(s,1).lastChanceUsed=true;
    const r=act(s,'special');assert.equal(ev(r,'recoil').amount,Math.max(1,Math.floor(hp/4+0.5)));
  }
  let {state:s}=match({...fast,moves:moves('steady','recoil')},slow);active(s,0).hp=2;active(s,1).hp=20;
  const r=act(s,'special');assert.equal(ev(r,'recoil').hpAfter,1);
  s=match({...fast,moves:moves('steady','recoil')},slow).state;active(s,0).hp=1;
  assert.ok(!ev(act(s,'special'),'recoil'));
  s=match({...fast,moves:moves('steady','recoil')},slow).state;active(s,1).shield=1000;
  assert.equal(ev(act(s,'special'),'hit').amount,0);assert.ok(!ev(act(s,'special'),'recoil'));
});
test('Last Chance saves a heavy lethal hit once above 1 HP, even below full health',()=>{
  for(const hp of [30,29,2,1]){
    let {state:s}=match({...fast,type:'water',moves:moves('heavy','overload')},{...slow,type:'fire'});
    active(s,1).maxHp=30;active(s,1).hp=hp;
    const r=act(s,'special');assert.equal(!!ev(r,'hangOn'),hp>1);assert.equal(active(r.state,1).hp,hp>1?1:0);
    assert.equal(active(r.state,1).lastChanceUsed,hp>1);
  }
});
test('Last Chance is not reset by healing to full or switching out and back',()=>{
  let {state:s}=match({...fast,type:'water',moves:moves('heavy','overload')},{...slow,type:'fire'});
  active(s,1).hp=2;s=act(s,'special').state;assert.equal(active(s,1).hp,1);assert.equal(active(s,1).lastChanceUsed,true);
  s=applyAction(s,1,{kind:'switch',index:1}).state;assert.equal(s.teams[1][0].lastChanceUsed,true);
  // A creature healed back to full still has used its one chance.
  s.teams[1][0].hp=s.teams[1][0].maxHp;s.teams[1][0].maxHp=30;s.teams[1][0].hp=30;
  s=applyAction(s,0,{kind:'defense'}).state;
  s=applyAction(s,1,{kind:'switch',index:0}).state;
  // Wait for the fast attacker's slot; the saved creature's next lethal hit faints it.
  if(whoseTurn(s).side!==0)s=act(s).state;
  const r=applyAction(s,0,{kind:'special'});assert.ok(!ev(r,'hangOn'));assert.equal(active(r.state,1).hp,0);
});
test('Guard persists, absorbs final crit/type damage, partial absorption and break; refill never stacks',()=>{
  let {state:s}=match({...fast,moves:moves('steady','blast','guard')},slow);
  active(s,0).hp-=40;
  s=act(s,'defense').state;assert.equal(active(s,0).shield,29);
  assert.equal(getActions(s,0).find(a=>a.kind==='defense').enabled,false);
  let r=act(s);const h=ev(r,'hit');assert.equal(h.absorbed,damage(rules,active(s,1),active(s,0),rules.moves.regular.steady,{first:false,crit:h.crit}));
  assert.ok(active(r.state,0).shield>0);s=r.state;
  assert.equal(getActions(s,0).find(a=>a.kind==='defense').enabled,true);
  s=act(s,'defense').state;assert.equal(active(s,0).shield,29);
  active(s,0).shield=2;r=act(s);assert.equal(ev(r,'hit').absorbed,2);assert.ok(ev(r,'shieldBreak'));assert.equal(active(r.state,0).shield,0);
  s=r.state;active(s,0).shield=20;s=act(s,'switch',1).state;assert.equal(s.teams[0][0].shield,0);
});
test('Toughen cannot stack, switch clears; Heal usable at full and capped',()=>{
  let {state:s}=match({...fast,moves:moves('steady','blast','toughen')},slow);
  s=act(s,'defense').state;s=act(s).state;
  assert.equal(getActions(s,0).find(a=>a.kind==='defense').enabled,true);
  s=act(s,'switch',1).state;assert.equal(s.teams[0][0].toughened,false);
  s=match(fast,slow).state;assert.equal(getActions(s,0).find(a=>a.kind==='defense').enabled,true);
  active(s,0).hp--;const r=act(s,'defense');assert.equal(ev(r,'heal').amount,1);assert.equal(active(r.state,0).hp,96);
});
test('Piercing ignores Defense, respects Toughen and shield',()=>{
  let {state:s}=match({...fast,moves:moves('pierce')},slow);active(s,1).toughened=true;active(s,1).shield=3;
  const r=act(s);const hit=ev(r,'hit');const zero=structuredClone(active(s,1));zero.stats.defense=0;
  assert.equal(hit.amount+hit.absorbed,damage(rules,active(s,0),zero,rules.moves.regular.pierce,{crit:hit.crit}));
});
test('Quick uses 14 when faster and 10 when slower, including a mid-round switch',()=>{
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

test('ordinary finishing hits do not trigger Last Chance; shields reduce the heavy-hit threshold',()=>{
 let {state:s}=match(fast,slow);active(s,1).hp=2;const r=act(s);assert.ok(!ev(r,'hangOn'));assert.equal(active(r.state,1).hp,0);
 s=match({...fast,moves:moves('steady','overload')},slow).state;active(s,1).hp=2;active(s,1).shield=50;const q=act(s,'special');assert.ok(!ev(q,'hangOn'));
});

test('a replacement inherits one turn but cannot chain another after a faint',()=>{
 let {state:s}=match(fast,slow);s.teams[1][1].stats.speed=5;active(s,0).stats.speed=3;active(s,1).hp=1;
 s=act(s).state;s=chooseReplacement(s,1,1).state;
 assert.equal(whoseTurn(s).side,1);s=act(s).state;
 assert.equal(whoseTurn(s).side,0);assert.deepEqual(s.order,[0,1]);
});
test('the sole surviving creature enters automatically without spending its turn or switch',()=>{
 let {state:s}=match(fast,slow);active(s,1).hp=1;s.teams[1][1].hp=0;
 const r=act(s);assert.equal(r.state.active[1],2);assert.ok(ev(r,'enter'));assert.ok(!ev(r,'needReplace'));
 assert.equal(whoseTurn(r.state).side,1);assert.equal(r.state.switchesLeft[1],3);
});
test('defenses can be repeated or used at full HP while PP remains, without stacking',()=>{
 for(const id of ['heal','guard','toughen']){
  let {state:s}=match({...fast,moves:moves('steady','blast',id)},slow);
  for(let i=0;i<3;i++){
   assert.equal(getActions(s,0).find(a=>a.kind==='defense').enabled,true);
   const r=act(s,'defense');assert.equal(active(r.state,0).pp.defense,2-i);
   if(id==='heal'&&i===0)assert.equal(ev(r,'heal').amount,0);
   s=act(r.state,'defense').state;
  }
  assert.equal(getActions(s,0).find(a=>a.kind==='defense').enabled,false);
 }
});
test('Struggle causes small recoil even against a shield and can faint its user',()=>{
 let {state:s}=match(fast,slow);active(s,0).pp.regular=active(s,0).pp.special=0;
 active(s,1).shield=999;active(s,0).hp=1;s.teams[0][1].hp=0;
 const r=act(s,'fallback');assert.equal(ev(r,'hit').amount,0);assert.equal(ev(r,'recoil').amount,1);
 assert.equal(ev(r,'faint').side,0);assert.equal(r.state.active[0],2);assert.ok(!ev(r,'needReplace'));
 assert.equal(whoseTurn(r.state).side,1);assert.equal(r.state.rng,s.rng);
 s=match(fast,slow).state;active(s,0).pp.regular=active(s,0).pp.special=0;
 s.teams[0].forEach(m=>m.hp=0);active(s,0).hp=1;
 assert.equal(act(s,'fallback').state.winner,1);
});

test('Struggle double faint resolves both replacements and final-hit victory deterministically',()=>{
 let {state:s}=match(fast,slow);active(s,0).pp.regular=active(s,0).pp.special=0;active(s,0).hp=active(s,1).hp=1;
 const r=act(s,'fallback');assert.equal(r.events.filter(e=>e.t==='faint').length,2);
 s=chooseReplacement(r.state,0,1).state;assert.deepEqual(whoseTurn(s),{side:1,need:'replacement'});
 s=chooseReplacement(s,1,1).state;assert.deepEqual(whoseTurn(s),{side:1,need:'action'});
 assert.equal(whoseTurn(act(s).state).side,0);
 s=match(fast,slow).state;s.teams.flat().forEach(m=>m.hp=0);active(s,0).hp=active(s,1).hp=1;active(s,0).pp.regular=active(s,0).pp.special=0;
 assert.equal(act(s,'fallback').state.winner,0);
});


test('Bubble Shield caps combined HP and shield at max HP at every health level',()=>{
 for(let hp=1;hp<=96;hp++){
  let {state:s}=match({...fast,moves:moves('steady','blast','guard')},slow);active(s,0).hp=hp;
  let r=act(s,'defense');let m=active(r.state,0);
  assert.equal(m.hp,hp);assert.equal(m.shield,Math.min(96-hp,29));assert.ok(m.hp+m.shield<=m.maxHp);
  assert.equal(ev(r,'shieldUp').amount,m.shield);assert.equal(m.pp.defense,2);
  s=r.state;s.slot=0;s.order=[0,1];r=act(s,'defense');m=active(r.state,0);
  assert.equal(m.shield,Math.min(96-hp,29));assert.ok(m.hp+m.shield<=m.maxHp);
 }
});


test('turns keep alternating for multiple rounds after a faster replacement',()=>{
 let {state:s}=match(fast,slow);s.teams[1][1].stats.speed=5;active(s,0).stats.speed=3;active(s,1).hp=1;
 const actors=[];
 for(let i=0;i<8;i++){
  if(whoseTurn(s).need==='replacement')s=chooseReplacement(s,1,1).state;
  const side=whoseTurn(s).side;actors.push(side);s=applyAction(s,side,{kind:i===0?'regular':i<7?'defense':'regular'}).state;
 }
 assert.deepEqual(actors,[0,1,0,1,0,1,0,1]);
});
test('a real heal after Last Chance cannot grant that same creature a second chance',()=>{
 let {state:s}=match({...fast,type:'water',moves:moves('heavy','blast')},{...slow,type:'fire',moves:moves('steady','blast','heal')});
 active(s,1).maxHp=30;active(s,1).hp=2;
 const first=act(s,'regular');assert.ok(ev(first,'hangOn'));s=first.state;
 const healed=act(s,'defense');assert.ok(ev(healed,'heal').amount>0);s=healed.state;
 const second=act(s,'regular');assert.equal(ev(second,'hangOn'),undefined);assert.ok(ev(second,'faint'));assert.equal(s.teams[1][0].lastChanceUsed,true);
 // Another creature has its own independent chance.
 s=chooseReplacement(second.state,1,1).state;s=act(s,'defense').state;
 active(s,1).maxHp=30;active(s,1).hp=2;
 assert.ok(ev(act(s,'regular'),'hangOn'));
});

test('1000 AI battles alternate spent turns and never save the same creature twice',async()=>{
 const {chooseAction,chooseReplacement:botReplacement}=await import('../releases/v46/src/ai.js');
 const {randomCreature}=await import('./helpers.mjs');
 for(let seed=0;seed<1000;seed++){
  let rng=seed;const random=()=>{let value;[value,rng]=next(rng);return value;};
  const teams=[0,1].map(()=>Array.from({length:3},()=>randomCreature(random)));
  let {state:s}=createMatch({rules,teams,seed});const saved=new Set();const missed=[false,false];let previous=null;
  const policies=[{difficulty:'easy',aiRng:seed,lastSwitch:false},{difficulty:'normal',aiRng:(seed+1024)>>>0,lastSwitch:false}];
  while(!s.over){
   const t=whoseTurn(s),slots=[...s.active];let r;
   if(t.need==='replacement'){
    const choice=botReplacement(s,t.side,policies[t.side]);policies[t.side]={...policies[t.side],...choice};r=chooseReplacement(s,t.side,choice.index);
   }else{
    const choice=chooseAction(s,t.side,policies[t.side]);policies[t.side]={...policies[t.side],...choice};r=applyAction(s,t.side,choice.action);
   }
   assert.ok(!r.events.some(e=>e.t==='rest'),`no automatically skipped turn, seed ${seed}`);
   if(t.need==='action'&&!r.state.over&&r.state.needReplacement===null)assert.equal(whoseTurn(r.state).side,1-t.side,`turn must hand off, seed ${seed}`);
   for(const e of r.events){
    if(['use','switch','rest'].includes(e.t)){assert.notEqual(e.side,previous,`consecutive spent turns, seed ${seed}`);previous=e.side;}
    if(e.t==='miss'){assert.equal(missed[e.side],false,`consecutive misses, seed ${seed}`);missed[e.side]=true;}
    if(e.t==='hit')missed[e.side]=false;
    if(e.t==='hangOn'){const key=`${e.side}:${slots[e.side]}`;assert.ok(!saved.has(key),`second Last Chance ${key}, seed ${seed}`);saved.add(key);}
   }
   s=r.state;
  }
 }
});


test('switching always hands off one turn, including switching while recharging',()=>{
 for(const starts of [0,1]){
  let {state:s}=starts===0?match(fast,slow):match(slow,fast);
  active(s,starts).recharging=true;
  for(const index of [1,0,2]){
   const r=applyAction(s,starts,{kind:'switch',index});assert.equal(whoseTurn(r.state).side,1-starts);assert.equal(r.events.filter(e=>e.t==='switch').length,1);
   const reply=applyAction(r.state,1-starts,{kind:'defense'});assert.equal(whoseTurn(reply.state).side,starts);assert.ok(!reply.events.some(e=>e.t==='rest'));s=reply.state;
  }
 }
});
test('Struggle remains legal during recharge if all other attacks and defenses are unavailable',()=>{
 let {state:s}=match({...fast,moves:moves('steady','overload')},slow);active(s,0).pp.regular=0;active(s,0).pp.defense=0;active(s,0).recharging=true;s.switchesLeft[0]=0;
 assert.equal(getActions(s,0).find(a=>a.kind==='fallback').enabled,true);
 const r=act(s,'fallback');assert.equal(whoseTurn(r.state).side,1);assert.equal(active(r.state,0).recharging,false);
});

test('a miss guarantees the next attack, spends PP and restores normal accuracy after hitting',()=>{
 let seed=0;while(next(seed)[0]<0.9)seed++;
 let {state:s}=match(fast,slow,seed);
 const missed=act(s,'special');assert.ok(ev(missed,'miss'));assert.deepEqual(missed.state.nextHitGuaranteed,[true,false]);assert.deepEqual(s.nextHitGuaranteed,[false,false]);
 s=act(missed.state,'defense').state;
 // This roll would miss again without the guarantee.
 s.rng=seed;const hit=act(s,'special');assert.ok(ev(hit,'hit'));assert.ok(!ev(hit,'miss'));assert.equal(active(hit.state,0).pp.special,1);assert.equal(hit.state.rng,next(seed)[1]);assert.deepEqual(hit.state.nextHitGuaranteed,[false,false]);
 s=act(hit.state,'defense').state;s.rng=seed;
 const nextMiss=act(s,'special');assert.ok(ev(nextMiss,'miss'));assert.equal(nextMiss.state.nextHitGuaranteed[0],true);
 assert.deepEqual(match(fast,slow).state.nextHitGuaranteed,[false,false]);
});

test('miss protection survives defense, switches and replacement, independently for each player',()=>{
 let seed=0;while(next(seed)[0]<0.9)seed++;
 let {state:s}=match(fast,slow,seed);s=act(s,'special').state;
 s.rng=seed;s=act(s,'special').state;assert.deepEqual(s.nextHitGuaranteed,[true,true]);
 s=act(s,'defense').state;s=act(s,'defense').state;assert.deepEqual(s.nextHitGuaranteed,[true,true]);
 s=act(s,'switch',1).state;s=act(s,'defense').state;assert.deepEqual(s.nextHitGuaranteed,[true,true]);
 // A forced replacement does not spend the banked hit or its inherited turn.
 active(s,0).hp=0;s.needReplacement=0;s=chooseReplacement(s,0,2).state;
 assert.deepEqual(s.nextHitGuaranteed,[true,true]);s.rng=seed;
 const hit=act(s,'special');assert.ok(ev(hit,'hit'));assert.deepEqual(hit.state.nextHitGuaranteed,[false,true]);
});

test('guaranteed-accuracy attacks and Struggle consume banked miss protection',()=>{
 for(const kind of ['regular','fallback']){
  let {state:s}=match(fast,slow);s.nextHitGuaranteed[0]=true;
  if(kind==='fallback'){active(s,0).pp.regular=0;active(s,0).pp.special=0;}
  const hit=act(s,kind);assert.ok(ev(hit,'hit'));assert.equal(hit.state.nextHitGuaranteed[0],false);
 }
});

test('Quick bonus follows matchup speed even in the second slot, and excludes ties',()=>{
 for(const [a,b] of [[slow,fast],[fast,slow],[fast,fast]]){
  let {state:s}=match({...a,moves:moves('quick')},{...b,moves:moves('quick')});
  // Reverse the opening matchup without changing the alternating turn order.
  [active(s,0).stats.speed,active(s,1).stats.speed]=[active(s,1).stats.speed,active(s,0).stats.speed];
  for(let i=0;i<4;i++){
   const side=whoseTurn(s).side,me=active(s,side),foe=active(s,1-side),r=act(s),h=ev(r,'hit');
   assert.equal(h.amount,Math.min(foe.hp,damage(rules,me,foe,{power:me.stats.speed>foe.stats.speed?14:10},{crit:h.crit})));
   s=r.state;
  }
 }
});
test('defense events flag repeats that do not change protection',()=>{
 for(const id of ['guard','toughen']){
  let {state:s}=match({...fast,moves:moves('steady','blast',id)},slow);
  active(s,0).hp-=40;
  const first=act(s,'defense');assert.equal(ev(first,id==='guard'?'shieldUp':'toughen').unchanged,false);
  s=first.state;s=act(s,'defense').state;
  const repeated=act(s,'defense');assert.equal(ev(repeated,id==='guard'?'shieldUp':'toughen').unchanged,true);
 }
});


test('healing preserves shield and caps their combined total at max HP',()=>{
 const me=creature({...fast,moves:{...moves(),regular:{id:'guard',name:'Guard',category:'defense'},defense:{id:'heal',name:'Heal'}}});
 let {state:s}=createMatch({rules,teams:[[me,me,me],[creature(slow),creature(slow),creature(slow)]],seed:1});
 const m=active(s,0);m.hp=5;
 s=applyAction(s,0,{kind:'regular'}).state;
 const shield=active(s,0).shield;
 s=applyAction(s,1,{kind:'defense'}).state;
 const before=active(s,0).hp,r=applyAction(s,0,{kind:'defense'}),after=active(r.state,0);
 assert.equal(after.shield,shield);assert.ok(after.hp+after.shield<=after.maxHp);
 assert.equal(ev(r,'heal').amount,after.hp-before);
 after.hp=after.maxHp-after.shield;
 // Restoring the actor's turn isolates the zero-gain edge case.
 r.state.order=[0,1];r.state.slot=0;
 assert.equal(ev(applyAction(r.state,0,{kind:'defense'}),'heal').amount,0);
});
