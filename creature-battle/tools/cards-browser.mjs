import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined});
const origin=process.env.BATTLE_ORIGIN||'http://127.0.0.1:8918',out=process.env.BATTLE_OUTPUT||'/tmp/cb-cards-browser';mkdirSync(out,{recursive:true});
const page=await browser.newPage({viewport:{width:1024,height:768},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(origin+'/creature-battle/');await page.locator('#collection').click();
const expected=await page.evaluate(async()=>{const {creatures}=await(await fetch('data/creatures-v2.json')).json();return creatures.map(c=>({id:c.id,moves:['regular','special','defense'].map(slot=>c.moves[slot].name)}));});
async function checkCards(kind){
 for(const c of expected){const card=page.locator(`.carousel-group:nth-child(2) .${kind}[data-creature="${c.id}"]`);assert.deepEqual(await card.locator('.card-move').allTextContents(),c.moves);assert.equal(await card.getByRole('list',{name:'Moves',exact:true}).count(),1);
  assert.ok(await card.evaluate(e=>{const card=e.getBoundingClientRect();return [...e.querySelectorAll('.card-move')].every(move=>{const box=move.getBoundingClientRect();return box.top>=card.top&&box.bottom<=card.bottom&&box.left>=card.left&&box.right<=card.right;});}),`${c.id} moves fit inside ${kind}`);
 }
 assert.equal(await page.locator('.attack-warning').count(),0);assert.ok(!/Only 3 attack uses|No selected attacks|Struggle with recoil/.test(await page.locator('#app').innerText()));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
}
for(const [width,height]of [[1024,768],[320,740],[844,390]]){await page.setViewportSize({width,height});await checkCards('collection-card');await page.screenshot({path:`${out}/gallery-${width}.png`,fullPage:true});}
await page.getByRole('button',{name:'Home',exact:true}).click();await page.locator('#play-ai').click();await page.locator('#opponent-next').click();
for(const [width,height]of [[1024,768],[320,740],[844,390]]){await page.setViewportSize({width,height});await checkCards('pick-card');await page.screenshot({path:`${out}/picker-${width}.png`,fullPage:true});}
await page.locator('.carousel-group:nth-child(2) .trainer-card').filter({hasText:'Uncle Mark'}).click();await checkCards('pick-card');assert.equal(await page.locator('.selection .team-chip').count(),3);assert.equal(await page.locator('#team-done').isEnabled(),true);
assert.deepEqual(errors,[]);await browser.close();console.log('All three moves shown on every gallery/picker card; no special notes; no clipping at desktop, portrait or landscape widths');
