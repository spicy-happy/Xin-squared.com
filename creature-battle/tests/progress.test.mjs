import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrainerProgress} from '../releases/v46/src/progress.js';
const win={mode:'ai',opponentId:'tr-unclemark',difficulty:'easy',over:true,winner:0,reason:'ko'};
function storage(){let value=null;return {getItem:()=>value,setItem:(_,v)=>{value=v;}};}
test('trainer victories survive reloads and belong to stable IDs and the chosen difficulty',()=>{
 const saved=storage(),progress=createTrainerProgress({storage:()=>saved});
 assert.equal(progress.hasVictory(win.opponentId,'easy'),false);assert.ok(progress.recordResult(win));
 const reloaded=createTrainerProgress({storage:()=>saved});assert.ok(reloaded.hasVictory(win.opponentId,'easy'));assert.equal(reloaded.hasVictory(win.opponentId,'hard'),false);assert.equal(reloaded.hasVictory('tr-other','easy'),false);
 reloaded.recordResult({...win,difficulty:'hard'});progress.recordResult({...win,opponentId:'tr-other'});
 const merged=createTrainerProgress({storage:()=>saved});assert.ok(merged.hasVictory(win.opponentId,'hard'));assert.ok(merged.hasVictory('tr-other','easy'));
});
test('losses, two-player games, unfinished battles, random bots and safety caps cannot award a trainer victory',()=>{
 const progress=createTrainerProgress({storage:()=>storage()});
 for(const change of [{winner:1},{mode:'friend'},{over:false},{reason:'cap'},{opponentId:'random'},{opponentId:''},{difficulty:'normal'}])assert.equal(progress.recordResult({...win,...change}),false);
 assert.equal(progress.hasVictory(win.opponentId,'easy'),false);
});
test('corrupt and blocked storage never prevent a battle or an in-session check mark',()=>{
 for(const getItem of [()=>'{bad json',()=>JSON.stringify({version:1,easy:42,hard:[null,{},'random']}),()=>{throw Error('blocked');}]){
  const progress=createTrainerProgress({storage:()=>({getItem,setItem:()=>{throw Error('blocked');}})});
  assert.equal(progress.hasVictory(win.opponentId,'easy'),false);assert.ok(progress.recordResult(win));assert.ok(progress.hasVictory(win.opponentId,'easy'));assert.equal(progress.hasVictory('random','hard'),false);
 }
 const progress=createTrainerProgress({storage:()=>{throw Error('SecurityError');}});assert.ok(progress.recordResult(win));assert.ok(progress.hasVictory(win.opponentId,'easy'));
});
