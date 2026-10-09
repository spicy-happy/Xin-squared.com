import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined});
const origin=process.env.BATTLE_ORIGIN||'http://127.0.0.1:8918',out=process.env.BATTLE_OUTPUT||'/tmp/cb-setup-browser';mkdirSync(out,{recursive:true});
const page=await browser.newPage({viewport:{width:1024,height:768},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(origin+'/creature-battle/');await page.locator('#play-ai').click();
assert.equal(await page.locator('#solo-opponent').count(),1);assert.equal(await page.locator('#trainer-name,.trainer-card,.pick-card,#team-done').count(),0);
await page.locator('#difficulty').click();await page.getByRole('option',{name:'Hard',exact:true}).click();
await page.locator('#solo-opponent').click();await page.getByRole('option',{name:'Random Battle Bot',exact:true}).click();
await page.screenshot({path:out+'/opponent-1024.png'});await page.locator('#opponent-next').click();
assert.equal(await page.locator('#solo-opponent,#difficulty').count(),0);assert.equal(await page.locator('#team-done').isEnabled(),false);
const mark=page.locator('.carousel-group:nth-child(2) .trainer-card').filter({hasText:'Uncle Mark'});
await mark.click();assert.equal(await page.locator('.selection .team-chip').count(),3);assert.equal(await page.locator('#trainer-name').inputValue(),'Uncle Mark');assert.equal(await page.locator('#team-done').isEnabled(),true);
assert.deepEqual((await page.locator('.selection .team-chip').allTextContents()).map(s=>s.replace(/x$/,'')).sort(),['Amphidian','Bassault','Broot']);
await mark.click();assert.equal(await page.locator('.selection .team-chip').count(),3,'Selecting the same trainer does not toggle off their team');
await page.getByRole('button',{name:'Remove Broot',exact:true}).click();await page.locator('#trainer-name').fill('My Trainer');
await page.locator('#opponent-back').click();assert.equal(await page.locator('#difficulty').getAttribute('data-value'),'hard');assert.equal(await page.locator('#solo-opponent').getAttribute('data-value'),'random');
await page.locator('#opponent-next').click();assert.equal(await page.locator('.selection .team-chip').count(),2);assert.equal(await page.locator('#trainer-name').inputValue(),'My Trainer');
await page.locator('.carousel-group:nth-child(2) .trainer-card').filter({hasText:'Test Trainer 1'}).click();assert.equal(await page.locator('.selection .team-chip').count(),1,'A trainer with one drawing selects that drawing');assert.equal(await page.locator('#team-done').isEnabled(),false);
await page.locator('.carousel-group:nth-child(2) .trainer-card').filter({hasText:'Uncle Mark'}).click();
for(const [width,height]of [[1024,768],[320,740],[844,390]]){
 await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:`${out}/team-${width}.png`,fullPage:true});
 await page.locator('#opponent-back').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:`${out}/opponent-${width}.png`,fullPage:true});await page.locator('#opponent-next').click();assert.equal(await page.locator('.selection .team-chip').count(),3);
}
await page.locator('#game-home').click();await page.locator('#play-friend').click();assert.equal(await page.locator('#solo-opponent,#opponent-next').count(),0);
for(let side=0;side<2;side++){
 assert.match(await page.locator('.picker-heading .eyebrow').innerText(),new RegExp(`PLAYER ${side+1}`));await page.locator('.carousel-group:nth-child(2) .trainer-card').filter({hasText:'Uncle Mark'}).click();assert.equal(await page.locator('.selection .team-chip').count(),3);assert.equal(await page.locator('#team-done').isEnabled(),true);
 if(side===0)await page.locator('#team-done').click();
}
// Duplicate slots remain usable when the entire roster has fewer than three drawings.
const tiny=await browser.newPage({viewport:{width:844,height:390},reducedMotion:'reduce'});tiny.on('pageerror',e=>errors.push(e.message));
await tiny.route('**/data/creatures-v2.json',async route=>{const response=await route.fetch(),data=await response.json();data.creatures=data.creatures.filter(c=>!c.prototype).slice(0,2);await route.fulfill({response,json:data});});
await tiny.goto(origin+'/creature-battle/');await tiny.locator('#play-ai').click();await tiny.locator('#opponent-next').click();await tiny.locator('.carousel-group:nth-child(2) .trainer-card').click();
assert.equal(await tiny.locator('.selection .team-chip').count(),3);assert.equal(await tiny.locator('#team-done').isEnabled(),true);
await tiny.getByRole('button',{name:'Remove Broot',exact:true}).first().click();assert.equal(await tiny.locator('.selection .team-chip').count(),2);
await tiny.locator('.carousel-group:nth-child(2) [data-pick="cr-broot01-copy-0"]').click();assert.equal(await tiny.locator('#team-done').isEnabled(),true);await tiny.close();
assert.deepEqual(errors,[]);await browser.close();console.log('Two-screen solo setup, Back preservation, manual changes and both players’ trainer auto-fill pass');
