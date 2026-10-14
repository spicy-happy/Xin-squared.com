import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {loadCollection} from '../releases/v46/src/collection.js';
import {loadRules} from '../releases/v46/src/rules.js';
import {battleTrainers} from '../releases/v46/src/trainers.js';
const rules=loadRules(JSON.parse(readFileSync(new URL('../data/rules-v2.json',import.meta.url))));
const collection=loadCollection(JSON.parse(readFileSync(new URL('../data/creatures-v2.json',import.meta.url))),rules);
const artists=battleTrainers(collection).filter(t=>t.id!=='tr-unclemark');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined});
const origin=process.env.BATTLE_ORIGIN||'http://127.0.0.1:8918',out=process.env.BATTLE_OUTPUT||'/tmp/cb-oct14-intake';mkdirSync(out,{recursive:true});
const errors=[],missing=[],results=[];
try{
 const gallery=await browser.newPage({viewport:{width:1024,height:768},reducedMotion:'reduce'});
 gallery.on('pageerror',e=>errors.push(e.message));
 gallery.on('response',r=>{if(r.url().includes('/assets/')&&r.status()>=400)missing.push(r.url());});
 await gallery.goto(origin+'/creature-battle/');await gallery.locator('#collection').click();
 const cards=gallery.locator('.carousel-group:nth-child(2) .collection-card');
 assert.equal(await cards.count(),23);
 assert.deepEqual((await cards.locator('h2').allTextContents()).sort(),collection.map(c=>c.name).sort());
 await gallery.waitForFunction(()=>[...document.querySelectorAll('.collection-card img')].every(img=>img.complete&&img.naturalWidth>0));
 await gallery.screenshot({path:out+'/collection.png',fullPage:true});await gallery.close();
 for(const artist of artists){
  const page=await browser.newPage({viewport:{width:844,height:390},reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));await page.clock.install();
  await page.goto(origin+'/creature-battle/');await page.locator('#play-ai').click();await page.locator('#solo-opponent').click();await page.getByRole('option',{name:artist.nickname,exact:true}).click();
  assert.match(await page.locator('.opponent-preview').innerText(),new RegExp(`${artist.creatures.length} creature`));
  await page.locator('#opponent-next').click();await page.locator('.carousel-group:nth-child(2) .trainer-card').filter({hasText:artist.nickname}).click();
  assert.equal(await page.locator('#trainer-name').inputValue(),artist.nickname);
  const owned=await page.locator('.selection .team-creature-name').allTextContents();
  assert.equal(owned.length,Math.min(3,artist.creatures.length));assert.ok(owned.every(n=>artist.creatures.some(c=>c.name===n)));
  while(await page.locator('.selection .team-chip').count()<3)await page.locator('.carousel-group:nth-child(2) .pick-card[aria-pressed=false]:enabled').first().click();
  await page.locator('#team-done').click();await page.clock.runFor(6000);
  assert.ok(await page.locator('[data-side="1"] .creature-sprite').count());
  await page.screenshot({path:`${out}/${artist.id}-arena.png`});
  // Two full visible-control battles exercise new art, names, zero stats and mixed moves.
  let actions=0;
  if(['tr-jaiden','tr-qq0001'].includes(artist.id)){
   for(let step=0;step<800&&!await page.locator('#rematch').count();step++){
    const replacement=page.locator('[data-bench]:enabled');
    const attacks=page.locator('.grid button.regular:enabled,.grid button.special:enabled');
    if(await replacement.count())await replacement.first().click();else if(await attacks.count()){await attacks.first().click();actions++;}
    await page.clock.runFor(6000);
   }
   assert.equal(await page.locator('#rematch').count(),1,artist.nickname+' battle completes');assert.ok(actions>0);
   await page.screenshot({path:`${out}/${artist.id}-result.png`});
  }
  results.push({artist:artist.nickname,drawings:artist.creatures.length,autofill:owned,actions});await page.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
 writeFileSync(out+'/results.json',JSON.stringify({results,errors,missing},null,2));console.log(JSON.stringify(results));
}finally{await browser.close();}
