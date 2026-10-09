import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined});
const origin=process.env.BATTLE_ORIGIN||'http://127.0.0.1:8918',out=process.env.BATTLE_OUTPUT||'/tmp/cb-polish';mkdirSync(out,{recursive:true});
const errors=[];
const make=async options=>{const p=await browser.newPage({reducedMotion:'reduce',...options});p.on('pageerror',e=>errors.push(e.message));return p;};
const setup=async(p,mode='friend')=>{
 await p.locator('#play-'+mode).click();if(mode==='ai')await p.locator('#opponent-next').click();
 for(let side=0;side<(mode==='friend'?2:1);side++){
  for(let i=0;i<3;i++)await p.locator('.carousel-group:nth-child(2) .pick-card').nth(i).click();
  await p.locator('#team-done').click();
 }
};
try{
 // Capture the seeds passed to the real engine on the production code path.
 const p=await make({viewport:{width:844,height:390}});
 await p.route('**/releases/v46/src/engine.js*',async route=>{const r=await route.fetch();let body=await r.text();body=body.replace(/(export function createMatch\([^\n]+\) \{)/,'$1\n (window.__seeds??=[]).push(seed);');await route.fulfill({response:r,body});});
 await p.goto(origin+'/creature-battle/');await setup(p);
 await p.locator('#quit-game').click();await p.locator('#confirm-quit').click();await setup(p);
 const seeds=await p.evaluate(()=>window.__seeds);assert.equal(seeds.length,2);assert.notEqual(seeds[0],seeds[1]);await p.close();console.log('Fresh production seeds pass');
 // Rapid Next taps cannot overwrite a preserved team/name on return from Back.
 const picker=await make({viewport:{width:667,height:375}});await picker.goto(origin+'/creature-battle/');await picker.locator('#play-ai').click();
 assert.equal(await picker.evaluate(()=>document.activeElement.textContent),'Select Opponent');
 assert.ok(await picker.locator('#opponent-next').evaluate(e=>e.getBoundingClientRect().bottom<=innerHeight));
 await picker.locator('#opponent-next').click();await picker.locator('.carousel-group:nth-child(2) .trainer-card').filter({hasText:'Uncle Mark'}).click();
 await picker.getByRole('button',{name:'Remove Broot',exact:true}).click();await picker.locator('#trainer-name').fill('My Trainer');
 const kept=await picker.locator('.team-creature-name').allTextContents();await picker.locator('#opponent-back').click();
 const rect=await picker.locator('#opponent-next').boundingBox();await picker.mouse.click(rect.x+rect.width/2,rect.y+rect.height/2,{clickCount:2,delay:30});
 assert.deepEqual(await picker.locator('.team-creature-name').allTextContents(),kept);assert.equal(await picker.locator('#trainer-name').inputValue(),'My Trainer');
 // An explicit immediate trainer click is suppressed, then normal selection returns.
 await picker.evaluate(()=>document.querySelector('.carousel-group:nth-child(2) .trainer-card').click());
 assert.deepEqual(await picker.locator('.team-creature-name').allTextContents(),kept);
 await picker.waitForTimeout(400);
 const focusCards=picker.locator('.carousel-group:nth-child(2) .trainer-card');
 await focusCards.first().focus();for(let i=1;i<await focusCards.count();i++){
  await picker.keyboard.press('Tab');assert.ok(await picker.evaluate(()=>{const e=document.activeElement,r=e.getBoundingClientRect(),rail=e.closest('.carousel-rail')?.getBoundingClientRect();return rail&&r.left>=rail.left-2&&r.right<=rail.right+2;}));
 }
 await picker.close();console.log('Rapid taps and carousel focus pass');
 // Real two-player battle, with Quit opened during the winning animation.
 const game=await make({viewport:{width:844,height:390}});await game.clock.install();await game.goto(origin+'/creature-battle/?debug=1');await setup(game);await game.clock.runFor(15000);
 let sawQuit=false;
 for(let step=0;step<250&&!await game.locator('#rematch').count();step++){
  const s=await game.evaluate(()=>__battleDebug.state());const side=s.order[s.slot],foe=1-side;
  if(s.needReplacement===null&&s.teams[foe].filter(c=>c.hp>0).length===1){
   await game.evaluate(side=>__battleDebug.setHp(side,1),foe);
  }
  const bench=game.locator('[data-bench]:enabled'),moves=game.locator('[data-action="special"]:enabled,[data-action="regular"]:enabled');
  if(await bench.count())await bench.first().click();else if(await moves.count())await moves.first().click();
  if(await game.evaluate(()=>__battleDebug.state().over)){
   await game.locator('#quit-game').click();assert.equal(await game.locator('#quit-dialog').evaluate(e=>e.open),true);sawQuit=true;
  }
  await game.clock.runFor(15000);
 }
 assert.ok(sawQuit);await game.locator('#rematch').waitFor();assert.equal(await game.locator('#quit-dialog').evaluate(e=>e.open),false);
 assert.equal(await game.evaluate(()=>document.activeElement.tagName),'H1');assert.match(await game.evaluate(()=>document.activeElement.textContent),/wins!/);
 for(const [width,height]of [[844,390],[667,375],[740,360]]){
  await game.setViewportSize({width,height});await game.evaluate(()=>document.fonts.ready);
  for(const id of ['rematch','home'])assert.ok(await game.locator('#'+id).evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),`${id} fits at ${width}`);
  await game.screenshot({path:`${out}/result-${width}.png`});
 }
 await game.locator('#home').click();await setup(game);await game.clock.runFor(15000);
 for(const [width,height]of [[740,360],[667,375],[844,390],[1024,768]]){
  await game.setViewportSize({width,height});await game.clock.runFor(1000);
  const regular=game.locator('[data-action="regular"]:enabled');if(await regular.count())await regular.first().click();await game.clock.runFor(15000);
  assert.ok(await game.locator('#battle-text').evaluate(e=>{
   const style=getComputedStyle(e),lineHeight=parseFloat(style.lineHeight),lines=e.scrollTop/lineHeight;return Math.abs(lines-Math.round(lines))*lineHeight<=1&&e.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom)>=2*lineHeight-1;
  }),`complete narration at ${width}`);
  await game.screenshot({path:`${out}/battle-${width}.png`});
 }
 await game.close();console.log('Quit/win, result layout and narration pass');
 // A broken drawing or portrait degrades to a placeholder without blocking play.
 const image=await make();await image.route('**/assets/creatures/*.webp',route=>route.abort());await image.route('**/assets/portraits/*.webp',route=>route.abort());
 await image.goto(origin+'/creature-battle/');await image.locator('#play-ai').click();await image.locator('#opponent-next').click();
 await image.waitForFunction(()=>[...document.querySelectorAll('.trainer-card img,.pick-card img')].every(i=>i.complete&&i.naturalWidth>0));await image.close();
 // Updates use increasing server versions only; URL protection survives blocked storage.
 for(const serverVersion of [45,47]){
  const update=await make();await update.addInitScript(()=>{Object.defineProperty(window,'sessionStorage',{get(){throw Error('Storage blocked');}});});
  let navigations=0;
  update.on('framenavigated',f=>{if(f===update.mainFrame())navigations++;});
  await update.route('**/creature-battle/*',async route=>{
   const req=route.request();if(req.resourceType()==='fetch'&&new URL(req.url()).pathname==='/creature-battle/')await route.fulfill({contentType:'text/html',body:`<script>const GAME_VERSION = ${serverVersion};</script>`});else await route.continue();
  });
  await update.goto(origin+'/creature-battle/?debug=1');await update.locator('#play-ai').waitFor();await update.waitForTimeout(1000);
  if(serverVersion===47)await update.waitForURL('**cb-update=47*');
  await update.waitForTimeout(4500);assert.equal(navigations,serverVersion===47?2:1);await update.close();
 }
 assert.deepEqual(errors,[]);console.log('Fresh match seeds, quit/win race, rapid setup taps, landscape layout, full narration, focus, image fallbacks and storage-blocked updates pass');
}finally{await browser.close();}
