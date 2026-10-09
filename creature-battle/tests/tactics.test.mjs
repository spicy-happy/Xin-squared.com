import test from 'node:test';
import assert from 'node:assert/strict';
import { match, moves, stats, active } from './helpers.mjs';
import { chooseAction } from '../releases/v43/src/ai.js';
import { deepFreeze } from '../releases/v43/src/rules.js';
const hard = (s, seed=9, extra={}) => chooseAction(deepFreeze(s),0,{difficulty:'normal',aiRng:seed,...extra}).action;
const fast = {stats:stats(2,3,0,5)}, slow = {stats:stats(5,3,2,0)};

test('UI Normal stays in, including while exhausted or recharging',()=>{
 const {state:s}=match(fast,slow);
 for(let seed=0;seed<1000;seed++)assert.notEqual(chooseAction(s,0,{difficulty:'easy',aiRng:seed}).action.kind,'switch');
 active(s,0).pp.regular=0;active(s,0).recharging=true;active(s,0).pp.defense=0;
 assert.equal(chooseAction(s,0,{difficulty:'easy',aiRng:9}).action.kind,'fallback');
});
test('Hard consistently uses a reliable finisher and saves its special',()=>{
 const {state:s}=match({...fast,moves:moves('steady','risky')},slow);
 active(s,1).hp=1;s.teams[1][1].hp=0;s.teams[1][2].hp=0;
 for(let seed=0;seed<100;seed++)assert.equal(hard(s,seed).kind,'regular');
});
test('Hard heals to survive a reply instead of gambling on a knockout',()=>{
 const {state:s}=match({...fast,moves:moves('steady','blast','heal')},{...slow,moves:moves('steady','blast','toughen')});
 s.switchesLeft=[0,0];active(s,0).hp=20;active(s,1).hp=50;
 assert.equal(hard(s).kind,'defense');
});
test('Hard rescues a wounded creature with a healthy counter and pays for the switch turn',()=>{
 const {state:s}=match({...fast,type:'fire'},{...slow,type:'water'});
 s.teams[0][1].type='grass';active(s,0).hp=15;active(s,0).lastChanceUsed=true;
 assert.deepEqual(hard(s),{kind:'switch',index:1});
 const risky=structuredClone(s);risky.teams[0][1].hp=1;risky.teams[0][2].hp=1;
 assert.notEqual(hard(risky).kind,'switch','do not send a nearly fainted teammate into the reply');
});
test('Hard uses a special through a small shield when it is better than wasting a turn',()=>{
 const {state:s}=match({...fast,moves:moves('steady','overload','guard')},slow);
 s.switchesLeft=[0,0];active(s,1).shield=10;
 assert.equal(hard(s).kind,'special');
});
test('Hard never chooses full-HP healing, a full shield or repeated Iron Hide',()=>{
 for(const defense of ['heal','guard','toughen']){
  const {state:s}=match({...fast,moves:moves('steady','blast',defense)},slow);
  if(defense==='guard'){active(s,0).hp-=29;active(s,0).shield=29;}
  if(defense==='toughen')active(s,0).toughened=true;
  for(let seed=0;seed<30;seed++)assert.notEqual(hard(s,seed).kind,'defense');
 }
});
test('Hard cannot use recharging specials and plans with a guaranteed hit after a miss',()=>{
 const {state:s}=match({...fast,moves:moves('steady','risky')},slow);
 active(s,0).recharging=true;
 assert.notEqual(hard(s).kind,'special');
 const next=structuredClone(s);active(next,0).recharging=false;next.nextHitGuaranteed[0]=true;
 active(next,1).hp=30;active(next,1).lastChanceUsed=true;next.teams[1][1].hp=0;next.teams[1][2].hp=0;
 assert.equal(hard(next).kind,'special');
});
