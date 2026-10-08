const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');import assert from 'node:assert/strict';import {mkdirSync,writeFileSync} from 'node:fs';
const origin=process.env.BATTLE_ORIGIN||'http://127.0.0.1:8902',out=process.env.ARTIFACT_DIR||'/tmp/creature-juice';mkdirSync(out,{recursive:true});
const b=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true}),results=[];
for(const [width,height]of [[1024,768],[667,375],[844,390]]){
 const p=await b.newPage({viewport:{width,height}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(origin+'/creature-battle/?debug=1');await p.waitForFunction(()=>window.__battleReady);
 await p.evaluate(async()=>{
  const {createMatch}=await import(`/creature-battle/src/engine.js?v=${GAME_VERSION}`),{battleView}=await import(`/creature-battle/src/ui/battle.js?v=${GAME_VERSION}`),{battleJuice,moveAnimations}=await import(`/creature-battle/src/ui/juice.js?v=${GAME_VERSION}`),rules=await(await fetch('/creature-battle/data/rules-v1.json')).json();
  window.juiceState=createMatch({rules,teams:[0,1].map(()=>__battleDebug.fixtures().slice(0,3)),seed:9}).state;
  window.juiceView=battleView({app:document.querySelector('#app'),initial:juiceState,trainers:[{nickname:'Xin'},{nickname:'Bot'}],humanSides:[0,1],imageSrc:()=>'/creature-battle/tests/fixtures/placeholder.svg',portraitSrc:()=>'/creature-battle/tests/fixtures/portrait.svg',getState:()=>juiceState,onAction:()=>{},onReplacement:()=>{},onDrain:()=>{},twoTap:()=>false});
  const panels=[...document.querySelectorAll('.side')].map(s=>({img:s.querySelector('.creature-sprite'),fighter:s.querySelector('.fighter'),stage:s.querySelector('.stage')}));
  window.makeJuice=()=>battleJuice({panels,fx:document.querySelector('.battle-effects'),scenery:document.querySelector('.battle-scenery'),active:side=>juiceState.teams[side][juiceState.active[side]]});window.juiceController=makeJuice();window.moveAnimations=moveAnimations;
  window.animationsSeen=[];const original=Element.prototype.animate;Element.prototype.animate=function(frames,opts){animationsSeen.push({class:this.className,frames,opts});return original.call(this,frames,opts);};
 });
 const controls=await p.locator('[data-grid="0"]').boundingBox(),log=await p.locator('#battle-text').boundingBox(),signatures=[];
 const ids=width===1024?Object.keys(await p.evaluate(()=>moveAnimations)):['quick','overload','guard','heavy','recoil'];
 for(const [i,id]of ids.entries()){
  await p.evaluate(id=>{animationsSeen.length=0;window.juiceRun=(async()=>{await juiceController.effect({t:'use',side:0,moveId:id});const t=id==='guard'?'shieldUp':id==='heal'?'heal':id==='toughen'?'toughen':'hit';await juiceController.effect({t,side:0,target:1,amount:30,crit:id==='overload'});})();},id);
  if(['overload','guard','heavy','quick'].includes(id)){
   await p.waitForTimeout(id==='overload'?900:id==='guard'?440:600);await p.screenshot({path:`${out}/${id}-${width}.png`});
   assert.deepEqual(await p.locator('[data-grid="0"]').boundingBox(),controls);assert.deepEqual(await p.locator('#battle-text').boundingBox(),log);
  }
  await p.evaluate(()=>juiceRun);
  const trace=await p.evaluate(()=>animationsSeen);assert.ok(trace.length>0,id+' animated');assert.equal(await p.evaluate(()=>juiceController.pending()),0);assert.equal(await p.locator('.juice-fx').count(),0);
  signatures.push(JSON.stringify(trace.map(a=>({class:a.class,frames:a.frames,opts:a.opts}))));
  assert.equal(await p.locator('.battle-effects').getAttribute('data-move'),await p.evaluate(id=>moveAnimations[id],id));
 }
 if(width===1024)assert.equal(new Set(signatures).size,12,'Every supported move including Struggle has a distinct timeline');
 for(const [t,side]of [['enter',0],['enter',1],['faint',0],['hangOn',1],['shieldBreak',1],['miss',0]])await p.evaluate(async({t,side})=>{await juiceController.effect({t,side});}, {t,side});
 await p.evaluate(()=>juiceController.exit(1));assert.equal(await p.locator('.juice-fx').count(),0);
 await p.evaluate(()=>{window.cancelledRun=juiceController.effect({t:'use',side:0,moveId:'overload'});});await p.waitForTimeout(50);await p.evaluate(()=>juiceController.cancel());await p.evaluate(()=>cancelledRun);assert.equal(await p.locator('.juice-fx').count(),0);assert.equal(await p.evaluate(()=>juiceController.pending()),0);
 await p.emulateMedia({reducedMotion:'reduce'});await p.evaluate(async()=>{juiceController=makeJuice();animationsSeen.length=0;await juiceController.effect({t:'hit',side:0,target:1,crit:true});});assert.equal(await p.evaluate(()=>animationsSeen.length),0);
 assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight+1));assert.deepEqual(errors,[]);results.push({width,height,moves:ids.length,staticControls:true,cleanedUp:true,reducedMotion:true});await p.close();console.log(`Juice animations passed at ${width}x${height}: ${ids.length} moves, entrances, exit, faint, impact, cleanup.`);
}
await b.close();writeFileSync(out+'/results.json',JSON.stringify(results,null,2));
