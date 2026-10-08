import test from 'node:test';import assert from 'node:assert/strict';
import {eventLines,wrapLine} from '../src/messages.js';
const events=['enter','round','use','fallback','miss','hit','shieldBreak','hangOn','recoil','heal','shieldUp','toughen','rest','switch','faint','skip','needReplace','win'];
test('every event message with 24-character names fits two lines per text page',()=>{
  const long='ABCDEFGHIJKLMNOPQRSTUVWX';
  const context={name:()=>`${long}'s ${long}`,trainer:()=>long,previous:()=>`${long}'s ${long}`};
  for(const t of events)for(const eff of ['strong','weak',null]) {
    const e={t,side:0,name:long,moveId:'overload',order:[0,1],reason:'coin',double:0,amount:135,absorbed:35,crit:true,eff};
    const lines=eventLines(e,context);assert.ok(lines.length);
    for(const line of lines)assert.ok(wrapLine(line).length<=2,`${t}: ${line}`);
  }
  assert.throws(()=>eventLines({t:'unknown'}));
});
test('HP damage and shield blocked are separate lines; table wording',()=>{
  assert.deepEqual(eventLines({t:'hit',side:0,amount:0,absorbed:18,crit:false,eff:null}),['The shield blocked 18!']);
  assert.deepEqual(eventLines({t:'miss',side:0}),['So close! It missed!']);
});

test('round messages never ask for an undefined side name',()=>{
  assert.deepEqual(eventLines({t:'round',n:1,order:[0,1],reason:'speed',double:null},{name:side=>{assert.ok(side===0||side===1);return 'Fluff';}}),['Fluff is faster!']);
});

test('fully blocked hits omit damage, effectiveness and critical narration',()=>{
 assert.deepEqual(eventLines({t:'hit',side:0,amount:0,absorbed:10,crit:true,eff:'weak'}),['The shield blocked 10!']);
 assert.deepEqual(eventLines({t:'shieldUp',side:0,amount:29,unchanged:true}),['Bubble Shield is already fully charged.']);
 assert.deepEqual(eventLines({t:'toughen',side:0,unchanged:true}),['Creature 1 is already toughened.']);
});
