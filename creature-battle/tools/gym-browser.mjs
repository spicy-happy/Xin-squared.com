import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || undefined});
const origin=process.env.BATTLE_ORIGIN||'http://127.0.0.1:8918',out=process.env.BATTLE_OUTPUT||'/tmp/cb-gym-browser';mkdirSync(out,{recursive:true});
const results=[];
for(const [mode,difficulty,width,height] of [['gym','easy',844,390],['gym','hard',1024,768],['random','easy',844,390],['random','hard',844,390],['friend','easy',844,390]]){
 const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install();
 await page.goto(origin+'/creature-battle/');await page.locator('#play-ai').waitFor();
 await page.locator('#collection').click();assert.equal(await page.locator('.carousel-group:nth-child(2) .collection-card').count(),9);assert.deepEqual((await page.locator('.carousel-group:nth-child(2) .collection-card h2').allTextContents()).filter(n=>!n.startsWith('Test ')).sort(),['Amphidian','Bassault','Broot']);
 await page.getByRole('button',{name:'Home',exact:true}).click();await page.locator(mode==='friend'?'#play-friend':'#play-ai').click();
 assert.equal(await page.locator('.carousel-group:nth-child(2) .trainer-card').count(),7);
 if(mode!=='friend'){
  assert.deepEqual(await page.locator('#solo-opponent-options [role=option]').allTextContents(),['Gym Leader Uncle Mark','Random Battle Bot']);
  await page.locator('#solo-opponent').click();await page.getByRole('option',{name:mode==='gym'?'Gym Leader Uncle Mark':'Random Battle Bot',exact:true}).click();
  await page.locator('#difficulty').click();await page.getByRole('option',{name:difficulty==='hard'?'Hard':'Easy',exact:true}).click();
 }
 const nameInput=page.locator('#trainer-name');await nameInput.fill('Player One');await nameInput.dispatchEvent('input');
 for(const id of ['cr-amphidian','cr-bassault','cr-broot01'])await page.locator(`.carousel-group:nth-child(2) [data-creature="${id}"]`).click();
 await page.screenshot({path:`${out}/${mode}-${difficulty}-${width}-picker.png`,fullPage:true});await page.locator('#team-done').click();
 if(mode==='friend'){await page.locator('#trainer-name').fill('Player Two');for(const id of ['cr-amphidian','cr-broot01','cr-bassault'])await page.locator(`.carousel-group:nth-child(2) [data-creature="${id}"]`).click();await page.locator('#team-done').click();}
 await page.clock.runFor(6000);
 assert.equal(await page.locator('[data-side="0"] .creature-sprite').getAttribute('alt'),'Amphidian');
 assert.equal(await page.locator('[data-side="0"] .creature-sprite').evaluate(e=>e.style.transform),'scaleX(-1)');
 assert.match(await page.locator('[data-side="0"] [data-action="special"]').getAttribute('aria-label'),/Body Slam, 6 of 6/);
 assert.match(await page.locator('[data-side="0"] [data-action="defense"]').getAttribute('aria-label'),/Energy Burst, 3 of 3/);
 assert.equal(await page.locator('[data-side="0"] [data-action="special"]').getAttribute('class'),'regular');
 assert.equal(await page.locator('[data-side="0"] [data-action="defense"]').getAttribute('class'),'special');
 await page.screenshot({path:`${out}/${mode}-${difficulty}-${width}-arena.png`});
 let actions=0;
 for(let step=0;step<500&&!await page.locator('#rematch').count();step++){
  const bench=page.locator('[data-bench]:enabled'),attack=page.locator('.grid button.regular:enabled,.grid button.special:enabled');
  if(await bench.count())await bench.first().click();else if(await attack.count()){await attack.first().click();actions++;}
  await page.clock.runFor(6000);
 }
 assert.equal(await page.locator('#rematch').count(),1,'Match finishes through visible controls');assert.ok(actions>0);
 if(mode==='gym')assert.ok(!/Battle Bot/.test(await page.locator('#app').innerText()));
 await page.screenshot({path:`${out}/${mode}-${difficulty}-${width}-result.png`});
 await page.locator('#rematch').click();await page.locator('#team-done').waitFor();assert.equal(await page.locator('.selection .team-chip').count(),3);assert.equal(await page.locator('#team-done').isEnabled(),true);
 if(mode!=='friend'){assert.equal(await page.locator('#solo-opponent').getAttribute('data-value'),mode==='gym'?'tr-unclemark':'random');assert.equal(await page.locator('#difficulty').getAttribute('data-value'),difficulty);}
 assert.deepEqual(errors,[]);results.push({mode,difficulty,width,height,actions,finished:true,errors});writeFileSync(out+'/results.json',JSON.stringify(results,null,2));await page.close();
}
// Smaller picker and portrait battle overlay, plus mirroring during real animations.
for(const [width,height]of [[320,740],[390,844],[667,375]]){
 const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});await page.goto(origin+'/creature-battle/');await page.locator('#play-ai').click();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:`${out}/picker-${width}.png`});await page.close();
}
const animated=await browser.newPage({viewport:{width:844,height:390}});await animated.clock.install();await animated.goto(origin+'/creature-battle/');await animated.locator('#play-friend').click();
for(let side=0;side<2;side++){for(const id of ['cr-amphidian','cr-broot01','cr-bassault'])await animated.locator(`.carousel-group:nth-child(2) [data-creature="${id}"]`).click();await animated.locator('#team-done').click();}
await animated.clock.runFor(6000);assert.equal(await animated.locator('[data-side="1"] .creature-sprite').evaluate(e=>e.style.transform),'scaleX(1)');
await animated.locator('.grid button.regular:enabled').first().click();await animated.clock.runFor(100);assert.equal(await animated.locator('[data-side="0"] .creature-sprite').evaluate(e=>e.style.transform),'scaleX(-1)');await animated.clock.runFor(6000);
await animated.setViewportSize({width:390,height:844});await animated.clock.runFor(100);await animated.locator('#rotate').waitFor({state:'visible'});assert.equal(await animated.locator('#rotate').isVisible(),true);await animated.close();
await browser.close();writeFileSync(out+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
