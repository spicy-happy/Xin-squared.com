const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');import assert from 'node:assert/strict';
const origin=process.env.BATTLE_ORIGIN||'http://127.0.0.1:8902';const b=await chromium.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
for(const mode of ['normal','hard','friend']){
 const p=await b.newPage({viewport:{width:844,height:390}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(origin+'/creature-battle/');await p.getByRole('button',{name:'Solo Battle',exact:true}).waitFor();
 for(const text of ['Solo Battle','2 Player Battle','See Creatures','Print Creature Sheet'])assert.ok(await p.getByRole(text==='Print Creature Sheet'?'link':'button',{name:text,exact:true}).isVisible());
 assert.equal(await p.locator('#confirm-setting').count(),0);assert.ok(!(await p.locator('#app').innerText()).includes('Make the first creature'));assert.equal(await p.evaluate(()=>!!window.__battleDebug),false);
 const href=await p.locator('#print-sheet').getAttribute('href');const response=await p.request.get(origin+'/creature-battle/'+href);assert.equal(response.status(),200);assert.ok((await response.body()).subarray(0,5).toString()==='%PDF-');
 await p.locator('#collection').click();assert.equal(await p.locator('.carousel-group:nth-child(2) .collection-card').count(),6);await p.waitForFunction(()=>[...document.querySelectorAll('.collection-card img')].every(i=>i.complete&&i.naturalWidth>0));assert.ok(await p.locator('.collection-card img').evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth>0)));await p.getByRole('button',{name:'Home',exact:true}).click();
 await p.locator('#play-'+(mode==='friend'?'friend':'ai')).click();if(mode!=='friend'){await p.locator('#difficulty').click();await p.getByRole('option',{name:mode==='hard'?'Hard':'Normal',exact:true}).click();}for(let i=0;i<3;i++)await p.locator('.carousel-group:nth-child(2) .pick-card').nth(i).click();await p.locator('#team-done').click();
 if(mode==='friend'){await p.locator('#lookaway-ready').click();for(let i=0;i<3;i++)await p.locator('.carousel-group:nth-child(2) .pick-card').nth(i+3).click();await p.locator('#team-done').click();}
 await p.locator('#battle-text').click();await p.waitForTimeout(450);
 const chosen=p.locator('[data-side="0"] [data-action="regular"]:enabled');if(await chosen.count()){await chosen.click();assert.equal(await p.locator('.confirm').count(),0);assert.ok(await p.locator('#battle-text .message-line').evaluateAll(es=>es.some(e=>e.dataset.text.includes('used'))));}
 if(mode!=='friend')assert.equal(await p.locator('[data-side="1"] button:enabled').count(),0);
 const deadline=Date.now()+180000;
 while(!await p.locator('#rematch').count()){
  if(Date.now()>deadline)throw Error(mode+' battle timed out');
  const bench=p.locator('[data-bench]:enabled'),special=p.locator('[data-action="special"]:enabled'),regular=p.locator('[data-action="regular"]:enabled');
  if(await bench.count())await bench.first().click();else if(await special.count())await special.first().click();else if(await regular.count())await regular.first().click();
  await p.locator('#battle-text').click().catch(()=>{});await p.waitForTimeout(450);
 }
 assert.deepEqual(errors,[]);await p.close();console.log(mode+' production prototype: labels, six loaded assets, linked PDF, and full battle pass');
}
const p=await b.newPage();await p.goto(origin+'/games.html');assert.equal(await p.locator('a[href="creature-battle/"]').count(),0);const sm=await (await p.request.get(origin+'/sitemap.xml')).text();assert.ok(!sm.includes('/creature-battle/'));await b.close();console.log('Game is unlisted from Games and sitemap.');
