import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined});
const origin=process.env.BATTLE_ORIGIN||'http://127.0.0.1:8918',out=process.env.BATTLE_OUTPUT||'/tmp/cb-order-browser';mkdirSync(out,{recursive:true});
const page=await browser.newPage({viewport:{width:1024,height:768},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install();
const names=p=>p.locator('.selection .team-creature-name').allTextContents();
const chip=(p,name)=>p.locator('.team-chip').filter({has:p.locator('.team-creature-name',{hasText:name})});
await page.goto(origin+'/creature-battle/');await page.locator('#play-ai').click();await page.locator('#opponent-next').click();await page.locator('.carousel-group:nth-child(2) .trainer-card').filter({hasText:'Uncle Mark'}).click();
assert.deepEqual(await names(page),['Broot','Amphidian','Bassault']);
await chip(page,'Bassault').locator('.team-order-handle').dragTo(chip(page,'Broot').locator('.team-order-handle'));
assert.deepEqual(await names(page),['Bassault','Broot','Amphidian']);assert.deepEqual(await page.locator('.selection .team-position').allTextContents(),['1','2','3']);assert.equal(await page.locator('.team-drag-preview').count(),0);assert.equal(await page.locator('#team-done').isEnabled(),true);
await chip(page,'Amphidian').locator('.team-order-handle').press('Home');assert.deepEqual(await names(page),['Amphidian','Bassault','Broot']);assert.match(await page.locator('.team-order-handle').first().getAttribute('aria-label'),/opens the battle/);
await chip(page,'Amphidian').locator('.team-order-handle').press('ArrowRight');assert.deepEqual(await names(page),['Bassault','Amphidian','Broot']);assert.equal(await page.locator(':focus .team-creature-name').innerText(),'Amphidian');
// Cancel an in-progress pointer move instead of accidentally changing the lead.
const from=await chip(page,'Broot').locator('.team-order-handle').boundingBox(),to=await chip(page,'Bassault').locator('.team-order-handle').boundingBox();
await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();await page.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:8});await page.keyboard.press('Escape');await page.mouse.up();assert.deepEqual(await names(page),['Bassault','Amphidian','Broot']);assert.equal(await page.locator('.team-drag-preview').count(),0);
await page.locator('#opponent-back').click();await page.locator('#opponent-next').click();assert.deepEqual(await names(page),['Bassault','Amphidian','Broot']);await page.screenshot({path:out+'/order-desktop.png'});
await page.locator('#team-done').click();await page.clock.runFor(6000);assert.equal(await page.locator('[data-side="0"] .creature-sprite').getAttribute('alt'),'Bassault','First ordered creature opens the actual battle');
// Two-player selection also retains each player's independently ordered team.
await page.locator('#game-home').click();await page.locator('#confirm-quit').click();await page.locator('#play-friend').click();
for(let side=0;side<2;side++){
 await page.locator('.carousel-group:nth-child(2) .trainer-card').filter({hasText:'Uncle Mark'}).click();const lead=side===0?'Amphidian':'Bassault';await chip(page,lead).locator('.team-order-handle').press('Home');assert.equal((await names(page))[0],lead);await page.locator('#team-done').click();
}
await page.clock.runFor(6000);assert.equal(await page.locator('[data-side="0"] .creature-sprite').getAttribute('alt'),'Amphidian');assert.equal(await page.locator('[data-side="1"] .creature-sprite').getAttribute('alt'),'Bassault');
// Trusted touchscreen input tests vertical reordering in a wrapped phone layout.
const touch=await browser.newPage({viewport:{width:320,height:740},hasTouch:true,isMobile:true,reducedMotion:'reduce'});touch.on('pageerror',e=>errors.push(e.message));
await touch.goto(origin+'/creature-battle/');await touch.locator('#play-ai').click();await touch.locator('#opponent-next').click();await touch.locator('.carousel-group:nth-child(2) .trainer-card').filter({hasText:'Uncle Mark'}).click();
const start=await chip(touch,'Bassault').locator('.team-order-handle').boundingBox(),end=await chip(touch,'Broot').locator('.team-order-handle').boundingBox(),cdp=await touch.context().newCDPSession(touch);
const point={x:start.x+start.width/2,y:start.y+start.height/2};await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
for(let i=1;i<=10;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x+(end.x+end.width/2-point.x)*i/10,y:point.y+(end.y+end.height/2-point.y)*i/10}]});
await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.deepEqual(await names(touch),['Bassault','Broot','Amphidian']);assert.equal(await touch.locator('.team-drag-preview').count(),0);assert.equal(await touch.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await touch.screenshot({path:out+'/order-touch.png',fullPage:true});
await touch.getByRole('button',{name:'Remove Broot',exact:true}).click();assert.deepEqual(await names(touch),['Bassault','Amphidian']);assert.deepEqual(await touch.locator('.team-position').allTextContents(),['1','2']);assert.equal(await touch.locator('#team-done').isEnabled(),false);
await touch.close();
// Repeated creatures must keep independent slots when a tiny roster allows duplicates.
const tiny=await browser.newPage({viewport:{width:844,height:390},reducedMotion:'reduce'});tiny.on('pageerror',e=>errors.push(e.message));
await tiny.route('**/data/creatures-v2.json',async route=>{const response=await route.fetch(),data=await response.json();data.creatures=data.creatures.filter(c=>!c.prototype).slice(0,2);await route.fulfill({response,json:data});});
await tiny.goto(origin+'/creature-battle/');await tiny.locator('#play-ai').click();await tiny.locator('#opponent-next').click();await tiny.locator('.carousel-group:nth-child(2) .trainer-card').click();assert.deepEqual(await names(tiny),['Broot','Amphidian','Broot']);
await tiny.locator('.team-order-handle').last().dragTo(tiny.locator('.team-order-handle').nth(1));assert.deepEqual(await names(tiny),['Broot','Broot','Amphidian']);assert.equal(await tiny.locator('#team-done').isEnabled(),true);
await tiny.locator('#opponent-back').click();await tiny.locator('#opponent-next').click();assert.deepEqual(await names(tiny),['Broot','Broot','Amphidian']);await tiny.close();
assert.deepEqual(errors,[]);await browser.close();writeFileSync(out+'/results.json',JSON.stringify({mouse:true,touch:true,keyboard:true,cancel:true,duplicateSlots:true,backPreserved:true,soloLead:'Bassault',friendLeads:['Amphidian','Bassault'],errors},null,2));console.log('Mouse/touch/keyboard ordering, cancellation, Back and actual solo/two-player opening creatures pass');
