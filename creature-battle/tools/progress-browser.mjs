import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined});
const origin=process.env.BATTLE_ORIGIN||'http://127.0.0.1:8918',out=process.env.BATTLE_OUTPUT||'/tmp/cb-trainer-progress';mkdirSync(out,{recursive:true});
const page=await browser.newPage({viewport:{width:1024,height:768}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
// A second submitted artist exercises automatic discovery before their art is published.
const artistRoster=async route=>{
 const response=await route.fetch(),data=await response.json(),artist=structuredClone(data.creatures.find(c=>!c.prototype));
 artist.id='cr-newartist';artist.name='New Creature';artist.stats={health:0,attack:0,defense:5,speed:5};artist.trainer={...artist.trainer,id:'tr-newartist',nickname:'New Artist'};data.creatures.push(artist);
 for(const c of data.creatures.filter(c=>!c.prototype&&c.id!=='cr-newartist')){c.stats={health:5,attack:5,defense:0,speed:0};c.type='fire';c.moves={regular:{id:'steady',name:'Steady'},special:{id:'blast',name:'Blast'},defense:{id:'heal',name:'Heal'}};}
 await route.fulfill({response,json:data});
};
await page.route('**/data/creatures-v2.json',artistRoster);
await page.goto(origin+'/creature-battle/');await page.locator('#play-ai').click();
assert.deepEqual(await page.locator('#solo-opponent-options [role=option]').allTextContents(),['Uncle Mark','New Artist','Random Battle Bot']);
assert.equal(await page.locator('.trainer-win-check').count(),0);assert.ok(!/Gym|gym|More drawings/.test(await page.locator('#app').innerText()));
// Seed completed results through the same production persistence API used by the result screen.
await page.evaluate(async()=>{
 const {createTrainerProgress}=await import(`/creature-battle/releases/v42/src/progress.js?v=${GAME_VERSION}`),progress=createTrainerProgress();
 const result={mode:'ai',over:true,winner:0,reason:'ko'};
 progress.recordResult({...result,opponentId:'tr-unclemark',difficulty:'hard'});
 progress.recordResult({...result,opponentId:'tr-newartist',difficulty:'easy'});
});
await page.reload();await page.locator('#play-ai').click();
const menu=page.locator('#solo-opponent');assert.equal(await menu.locator('.trainer-win-check').count(),0);
await menu.click();assert.equal(await page.locator('#solo-opponent-tr-newartist .trainer-win-check').count(),1);assert.equal(await page.locator('#solo-opponent-tr-unclemark .trainer-win-check').count(),0);
await page.getByRole('option',{name:'New Artist Defeated',exact:true}).click();assert.equal(await menu.locator('.trainer-win-check').count(),1);assert.match(await page.locator('.opponent-preview').innerText(),/New Artist · 1 creature/);
await page.locator('#difficulty').click();await page.getByRole('option',{name:'Hard',exact:true}).click();assert.equal(await menu.locator('.trainer-win-check').count(),0);
await menu.click();assert.equal(await page.locator('#solo-opponent-tr-unclemark .trainer-win-check').count(),1);assert.equal(await page.locator('#solo-opponent-tr-newartist .trainer-win-check').count(),0);
await page.getByRole('option',{name:'Uncle Mark Defeated',exact:true}).click();assert.equal(await menu.locator('.trainer-win-check').count(),1);
for(const [width,height]of [[1024,768],[320,740],[844,390]]){
 await page.setViewportSize({width,height});await menu.click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:`${out}/checks-${width}.png`,fullPage:true});await menu.press('Escape');
}
// A real visible-control battle verifies that the result screen awards the mark.
const battle=await browser.newPage({viewport:{width:844,height:390},reducedMotion:'reduce'});battle.on('pageerror',e=>errors.push(e.message));await battle.clock.install({time:new Date('2026-10-09T06:00:00Z')});await battle.addInitScript(()=>{crypto.getRandomValues=values=>{values.fill(17);return values;};});await battle.route('**/data/creatures-v2.json',artistRoster);
await battle.goto(origin+'/creature-battle/');await battle.locator('#play-ai').click();await battle.locator('#solo-opponent').click();await battle.getByRole('option',{name:'New Artist',exact:true}).click();
for(const id of ['cr-amphidian','cr-broot01','cr-bassault'])await battle.locator(`.carousel-group:nth-child(2) [data-creature="${id}"]`).click();
await battle.locator('#team-done').click();await battle.clock.runFor(6000);
for(let step=0;step<300&&!await battle.locator('#rematch').count();step++){
 const bench=battle.locator('[data-bench]:enabled'),blast=battle.locator('[data-side="0"] .grid button.special:enabled'),attack=battle.locator('[data-side="0"] .grid button.regular:enabled');
 if(await bench.count())await bench.first().click();else if(await blast.count())await blast.first().click();else if(await attack.count())await attack.first().click();else if(await battle.locator('[data-side="0"] [data-action="fallback"]:enabled').count())await battle.locator('[data-side="0"] [data-action="fallback"]:enabled').click();
 await battle.clock.runFor(6000);
}
assert.equal(await battle.getByText('You defeated New Artist on Easy!',{exact:true}).count(),1,await battle.locator('#app').innerText());
assert.ok(await battle.evaluate(()=>JSON.parse(localStorage.getItem('cb-trainer-victories-v1')||'null')?.easy?.includes('tr-newartist')),'Victory persisted by result screen');
await battle.locator('#rematch').click();await battle.locator('#team-done').waitFor();assert.equal(await battle.locator('#solo-opponent .trainer-win-check').count(),1);
await battle.reload();await battle.locator('#play-ai').click();await battle.locator('#solo-opponent').click();assert.equal(await battle.locator('#solo-opponent-tr-newartist .trainer-win-check').count(),1);
await battle.screenshot({path:out+'/earned-victory.png'});await battle.close();
assert.deepEqual(errors,[]);await browser.close();writeFileSync(out+'/results.json',JSON.stringify({automaticArtistDiscovery:true,perDifficultyChecks:true,realVictoryRecorded:true,reloaded:true,errors},null,2));console.log('Trainer discovery, per-difficulty checks, persistence and responsive layout pass');
