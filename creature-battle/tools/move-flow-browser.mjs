const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
import assert from 'node:assert/strict';import {mkdirSync} from 'node:fs';
const origin=process.env.BATTLE_ORIGIN||'http://127.0.0.1:8902',out=process.env.ARTIFACT_DIR||'/tmp/cb-move-flow-browser';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || undefined,headless:true});
for(const [width,height] of [[667,375],[844,390],[1024,768]]){
 const p=await browser.newPage({viewport:{width,height}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(origin+'/creature-battle/?debug=1');await p.waitForFunction(()=>window.__battleReady);await p.locator('#play-friend').click();
 for(let side=0;side<2;side++){for(let i=0;i<3;i++)await p.locator('.carousel-group:nth-child(2) .pick-card').nth(i+side*3).click();await p.locator('#team-done').click();}
 await p.locator('[data-action]:enabled').first().waitFor();
 assert.equal(await p.locator('#battle-text').evaluate(e=>e.tagName),'DIV');assert.equal(await p.locator('#battle-text').evaluate(e=>e.tabIndex),-1);
 assert.ok(await p.locator('.category').evaluateAll(es=>es.every(e=>!['Reg Attack','Spec Attack','Defense'].includes(e.textContent))));
 assert.ok(await p.locator('.category').evaluateAll(es=>es.every(e=>e.scrollWidth<=e.clientWidth&&e.parentElement.scrollWidth<=e.parentElement.clientWidth)));
 await p.screenshot({path:`${out}/arena-${width}.png`});
 await p.locator('[data-action="regular"]:enabled').first().click();await p.waitForTimeout(80);assert.equal(await p.locator('[data-action]:enabled').count(),0);
 await p.locator('#battle-text').click();await p.waitForTimeout(80);assert.equal(await p.locator('[data-action]:enabled').count(),0);assert.ok(await p.locator('#battle-text.writing').count());
 await p.locator('[data-action]:enabled').first().waitFor();
 // Isolated view verifies exhausted controls, recoil narration, and fall animation.
 await p.evaluate(async()=>{
  const {battleView}=await import(`/creature-battle/releases/v46/src/ui/battle.js?v=${GAME_VERSION}`);
  const state=structuredClone(__battleDebug.state());state.slot=0;state.order=[0,1];state.needReplacement=null;
  const m=state.teams[0][state.active[0]];m.pp.regular=m.pp.special=0;m.pp.defense=3;m.hp=m.maxHp;
  window.moveState=state;window.moveView=battleView({app:document.querySelector('#app'),initial:state,trainers:[{nickname:'Xin'},{nickname:'Bot'}],humanSides:[0,1],imageSrc:()=>'/creature-battle/tests/fixtures/placeholder.svg',portraitSrc:()=>'/creature-battle/tests/fixtures/portrait.svg',getState:()=>state,onAction:()=>{},onReplacement:()=>{},onDrain:()=>{},twoTap:()=>false});
 });
 const grid=p.locator('[data-grid="0"]');assert.equal(await grid.locator('button').count(),3);assert.equal(await grid.locator('.struggle').innerText(),'Struggle\n--');assert.ok(await grid.locator('[data-action="defense"]').isEnabled());
 await p.screenshot({path:`${out}/struggle-${width}.png`});
 await p.evaluate(()=>{moveState.teams[0][moveState.active[0]].hp=0;window.moveAnimation=moveView.animate([{t:'faint',side:0,hpAfter:0}]);});
 await p.waitForFunction(()=>document.querySelector('.side[data-side="0"] .creature-sprite').getAnimations().length>0);
 const frames=await p.locator('.side[data-side="0"] .creature-sprite').evaluate(e=>e.getAnimations()[0].effect.getKeyframes());assert.ok(parseFloat(frames.at(-1).transform.match(/translateY\((.+)px/)[1])>100);
 await p.evaluate(()=>moveAnimation);assert.deepEqual(errors,[]);await p.close();
}
const p=await browser.newPage();await p.goto(origin+'/creature-battle/');await p.locator('#play-ai').click();await p.waitForTimeout(100);
const audio=await p.evaluate(async()=>{const {soundState,playSound}=await import(`/creature-battle/releases/v46/src/ui/audio.js?v=${GAME_VERSION}`);await playSound('win');return soundState();});assert.equal(audio.decoded,9);assert.ok(audio.played>0);
const duration=await p.evaluate(async()=>{const ctx=new AudioContext();const data=await(await fetch(`/creature-battle/assets/sounds/win.wav?v=${GAME_VERSION}`)).arrayBuffer();const decoded=await ctx.decodeAudioData(data);await ctx.close();return decoded.duration;});assert.ok(duration>=1.3);await browser.close();
console.log('Move flow: read-only log, named moves, one-line responsive controls, merged Struggle, usable defense, falling faint and original victory jingle pass.');
