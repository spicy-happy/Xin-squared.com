import test from 'node:test';
import assert from 'node:assert/strict';
import { rules, creature, stats } from './helpers.mjs';
import { damage, maxHp, loadRules, roundHalfUp, typeFactor } from '../src/rules.js';
import { next } from '../src/rng.js';

test('Rules loader freezes a copy and rejects malformed rules', () => {
  assert.ok(Object.isFrozen(rules.moves.regular));
  for (const edit of [r=>r.schema=2,r=>r.stats.budget=0,r=>r.moves.regular.steady.power=1.1,r=>r.types.fire.strong=['fire','grass'],r=>r.crit.basePercent=101,r=>r.fallback.crit=true]) {
    const r=structuredClone(rules);edit(r);assert.throws(()=>loadRules(r));
  }
  assert.equal(maxHp(rules,stats(0,5,5,0)),82);assert.equal(maxHp(rules,stats(5,0,0,5)),117);
  assert.equal(roundHalfUp(10,4),3);assert.throws(()=>roundHalfUp(Number.MAX_SAFE_INTEGER,1));
});
test('20 hand-computed integer damage cases', () => {
  // power, A, D, type factor, crit, tough, expected. Neutral Water/Water.
  const cases=[
    [12,0,0,'neutral',false,false,12],[12,5,0,'neutral',false,false,18],
    [12,0,5,'neutral',false,false,8],[12,5,5,'neutral',false,false,12],
    [6,4,2,'strong',false,false,11],[15,1,1,'strong',false,false,23],
    [12,0,0,'weak',false,false,9],[12,0,0,'strong',false,false,18],
    [12,0,0,'neutral',true,false,18],[12,0,0,'neutral',false,true,8],
    [12,0,0,'strong',true,false,27],[12,0,0,'strong',true,true,19],
    [12,0,0,'weak',true,false,14],[12,0,0,'weak',true,true,9],
    [40,5,0,'strong',true,false,135],[40,5,5,'strong',true,true,63],
    [1,0,5,'weak',false,true,1],[30,2,2,'neutral',false,false,30],
    [32,0,0,'neutral',false,false,32],[26,3,3,'weak',false,false,20]];
  for(const [power,a,d,type,crit,toughened,expected] of cases) {
    const attacker=creature({stats:stats(0,a,0,0)}),defender=creature({type:type==='strong'?'fire':type==='weak'?'grass':'water',stats:stats(0,0,d,0),toughened});
    assert.equal(damage(rules,attacker,defender,{power},{crit}),expected,JSON.stringify([power,a,d,type,crit,toughened]));
  }
});
test('all powers, A/D, types, crit, Toughen and Piercing match BigInt half-up reference', () => {
  const powers=[...new Set([rules.fallback.power,...Object.values(rules.moves.regular).flatMap(m=>[m.power,m.secondPower].filter(Boolean)),...Object.values(rules.moves.special).map(m=>m.power)])];
  for(const power of powers)for(let a=0;a<=5;a++)for(let d=0;d<=5;d++)for(const type of ['fire','water','grass'])for(const crit of [false,true])for(const toughened of [false,true])for(const piercing of [false,true]) {
    const att=creature({stats:stats(0,a,0,0)}),def=creature({type,stats:stats(0,0,d,0),toughened});
    const [tn,td]=typeFactor(rules,'water',type);
    const num=BigInt(power*(10+a)*tn*(crit?3:1)*(toughened?7:1));
    const den=BigInt((10+(piercing?0:d))*td*(crit?2:1)*(toughened?10:1));
    const expected=Math.max(1,Number((2n*num+den)/(2n*den)));
    assert.equal(damage(rules,att,def,{power,piercing},{crit}),expected);
  }
});
test('mulberry32 known values; uint32 accumulator wraps', () => {
  const [v,n]=next(0);assert.equal(n,1831565813);assert.equal(v,0.26642920868471265);
  assert.equal(next(0xffffffff)[1],1831565812);
});
