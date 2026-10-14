import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {loadCollection} from '../releases/v46/src/collection.js';
import {loadRules} from '../releases/v46/src/rules.js';
import {battleTrainers} from '../releases/v46/src/trainers.js';
const rules=loadRules(JSON.parse(readFileSync(new URL('../data/rules-v2.json',import.meta.url))));
const roster=loadCollection(JSON.parse(readFileSync(new URL('../data/creatures-v2.json',import.meta.url))),rules);
const artists=battleTrainers(roster);
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined});
const origin=process.env.BATTLE_ORIGIN||'http://127.0.0.1:8918',out=process.env.BATTLE_OUTPUT||'/tmp/cb-trainer-order';mkdirSync(out,{recursive:true});
try{
 for(const [width,height] of [[1024,768],[844,390],[390,844],[320,740]]){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/creature-battle/');await page.locator('#play-ai').click();await page.locator('#opponent-next').click();
  for(const artist of width===1024?artists:artists.filter(t=>['Jaiden','QQ','Hailey'].includes(t.nickname))){
   await page.getByRole('button',{name:'Next creatures',exact:true}).click();
   await page.locator('.carousel-group:nth-child(2) .trainer-card').filter({hasText:artist.nickname}).click();
   const ids=artist.creatures.map(c=>c.id);
   for(let group=1;group<=3;group++){
    const cards=page.locator(`.carousel-group:nth-child(${group}) .pick-card`);
    assert.deepEqual(await cards.evaluateAll((nodes,n)=>nodes.slice(0,n).map(e=>e.dataset.creature),ids.length),ids,artist.nickname);
    assert.equal(await cards.count(),roster.length);
   }
   assert.ok(await page.locator('.carousel-group:nth-child(2) .pick-card').first().evaluate(e=>{const card=e.getBoundingClientRect(),rail=e.closest('.carousel-rail').getBoundingClientRect();return Math.abs(card.left-rail.left)<=4;}),'Trainer creatures start at the visible left edge');
   assert.equal(await page.locator('.carousel-group:nth-child(2) .pick-card.selected').count(),Math.min(3,ids.length));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   if(artist.nickname==='Jaiden'){
    await page.screenshot({path:`${out}/jaiden-${width}.png`,fullPage:true});
    // Four drawings stay grouped, even though only three are autofilled.
    assert.equal(ids.length,4);
    await page.getByRole('button',{name:'Remove Bob',exact:true}).click();
    await page.locator('.carousel-group:nth-child(2) [data-creature="cr-bobgold"]').click();
    assert.equal(await page.locator('.selection .team-chip').count(),3);
    await page.locator('#opponent-back').click();await page.locator('#opponent-next').click();
    assert.equal(await page.locator('#trainer-name').inputValue(),'Jaiden');
    assert.deepEqual(await page.locator('.carousel-group:nth-child(2) .pick-card').evaluateAll(nodes=>nodes.slice(0,4).map(e=>e.dataset.creature)),ids);
   }
  }
  assert.deepEqual(errors,[]);await page.close();console.log(`${width}x${height}: trainer-owned drawings grouped first, scrolled left, selections and Back preserved`);
 }
 // Selecting a trainer must also cancel a carousel arrow animation in flight.
 const page=await browser.newPage({viewport:{width:1024,height:768}});
 await page.goto(origin+'/creature-battle/');await page.locator('#play-ai').click();await page.locator('#opponent-next').click();
 await page.getByRole('button',{name:'Next creatures',exact:true}).click();
 await page.locator('.carousel-group:nth-child(2) .trainer-card').filter({hasText:'Jaiden'}).click();
 await page.waitForTimeout(300);
 assert.ok(await page.locator('.carousel-group:nth-child(2) [data-creature="cr-bobblue"]').evaluate(e=>Math.abs(e.getBoundingClientRect().left-e.closest('.carousel-rail').getBoundingClientRect().left)<=4));
 await page.close();
}finally{await browser.close();}
