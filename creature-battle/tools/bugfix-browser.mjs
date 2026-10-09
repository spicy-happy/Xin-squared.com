const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
import assert from 'node:assert/strict';
const origin=process.env.BATTLE_ORIGIN||'http://127.0.0.1:8902';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || undefined,headless:true});
try{
for(const [width,height]of [[844,340],[667,325],[568,320],[667,375],[1024,768]]){
 const p=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'}),errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 await p.goto(origin+'/creature-battle/?debug=1');await p.waitForFunction(()=>window.__battleReady);
 assert.equal(await p.locator('#sound-toggle').getAttribute('aria-label'),null);
 assert.equal(await p.locator('#sound-toggle').innerText(),'Sound on');
 assert.equal(await p.locator('#sound-toggle').getAttribute('aria-pressed'),'true');
 await p.evaluate(async()=>{
  const {battleView}=await import(`/creature-battle/releases/v43/src/ui/battle.js?v=${GAME_VERSION}`);
  const {createMatch,applyAction,chooseReplacement}=await import(`/creature-battle/releases/v43/src/engine.js?v=${GAME_VERSION}`);
  const rules=await (await fetch('/creature-battle/data/rules-v2.json')).json(),defs=__battleDebug.fixtures();
  const team=[defs[0],defs[1],defs[2]].map(m=>({...m,name:'ABCDEFGHIJKLMNOPQRSTUVWX'}));
  window.checkState=createMatch({rules,teams:[team,team],seed:9}).state;
  document.body.classList.add('in-battle');document.querySelector('#quit-game').hidden=false;
  const mount=()=>{window.checkView?.dispose();window.checkView=battleView({app:document.querySelector('#app'),initial:checkState,trainers:[{nickname:'Test Trainer 1'},{nickname:'Test Trainer 2'}],humanSides:[0,1],imageSrc:()=>'/creature-battle/tests/fixtures/placeholder.svg',portraitSrc:()=>'/creature-battle/tests/fixtures/portrait.svg',getState:()=>checkState,onAction:(side,a)=>{const r=applyAction(checkState,side,a);checkState=r.state;checkView.animate(r.events);},onReplacement:(side,i)=>{const r=chooseReplacement(checkState,side,i);checkState=r.state;checkView.animate(r.events);},onDrain:()=>{},twoTap:()=>false});};
  window.mountCheck=mount;mount();
 });
 await p.evaluate(()=>document.fonts.ready);
 assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight+1),`page overflow ${width}x${height}`);
 assert.ok(await p.locator('[data-action]').evaluateAll(es=>es.every(e=>{const r=e.getBoundingClientRect();return r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;})));
 const sw=p.locator('[data-action="switch"]:enabled');await sw.focus();await p.keyboard.press('Enter');
 assert.ok(await p.evaluate(()=>document.activeElement.matches('.bench-card:enabled')),'tray focuses a creature');
 await p.keyboard.press('Escape');assert.equal(await p.locator('.tray').count(),0);
 assert.equal(await p.evaluate(()=>document.activeElement.dataset.action),'switch');
 await p.keyboard.press('Enter');await p.locator('.tray button').last().click();
 assert.equal(await p.evaluate(()=>document.activeElement.dataset.action),'switch','Back returns focus');
 const action=p.locator('[data-action="regular"]:enabled');await action.focus();await p.keyboard.press('Enter');
 await p.waitForFunction(()=>document.querySelector('[data-action]:enabled'));
 assert.equal(await p.evaluate(()=>document.activeElement.dataset.action),'regular','action focus survives animation and turn change');
 await p.evaluate(async()=>{
  const s=checkState,side=s.order[s.slot],m=s.teams[side][s.active[side]];
  m.hp=0;s.needReplacement=side;mountCheck();
  await checkView.animate([{t:'use',side:1-side,name:'Double Rush',moveId:'recoil'},{t:'hit',side:1-side,target:side,amount:30,absorbed:0,eff:'strong',crit:true,hpAfter:0},{t:'hangOn',side},{t:'recoil',side:1-side,amount:15,hpAfter:s.teams[1-side][s.active[1-side]].hp},{t:'faint',side},{t:'needReplace',side}]);
 });
 await p.waitForFunction(()=>document.querySelector('.replacement-tray button:enabled'));
 assert.equal(await p.locator('.replacement-tray .bench-card').count(),3);
 assert.ok(await p.evaluate(()=>document.activeElement.matches('.replacement-tray .bench-card:enabled')),'replacement focuses a living creature');
 assert.ok(await p.locator('.replacement-tray').evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&e.scrollHeight<=e.clientHeight+1;}),'all three replacement cards fit');
 assert.ok(await p.locator('#battle-text').evaluate(e=>Math.abs(e.scrollHeight-e.clientHeight-e.scrollTop)<=1),'latest prompt visible');
 await p.setViewportSize({width:390,height:844});
 await p.waitForFunction(()=>!document.body.classList.contains('in-battle')); 
 await p.evaluate(()=>{document.body.classList.add('rotate-required');document.querySelector('#rotate').hidden=false;});
 assert.equal(await p.locator('.arena').isVisible(),false);
 assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'portrait has no sideways pan');
 assert.ok(await p.locator('#rotate').isVisible());
 assert.deepEqual(errors,[]);await p.close();console.log(`Layout, messages and keyboard checks pass at ${width}x${height} and portrait`);
}
const p=await browser.newPage();await p.goto(origin+'/creature-battle/');await p.waitForSelector('#play-ai');
const href=await p.locator('link[rel="icon"]').getAttribute('href');assert.equal((await p.request.get(origin+'/creature-battle/'+href)).status(),200);
await p.setViewportSize({width:390,height:844});await p.locator('#play-friend').click();
for(let side=0;side<2;side++){for(let i=0;i<3;i++)await p.locator('.carousel-group:nth-child(2) .pick-card').nth(i).click();await p.locator('#team-done').click();}
await p.waitForSelector('#rotate:not([hidden])');assert.equal(await p.locator('.arena').isVisible(),false);
assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'real portrait battle has no overflow');
await p.setViewportSize({width:568,height:320});await p.waitForSelector('.arena',{state:'visible'});
assert.equal(await p.locator('#rotate').isVisible(),false);await p.close();console.log('Favicon and actual portrait/landscape orientation flow pass');
}finally{await browser.close();}
