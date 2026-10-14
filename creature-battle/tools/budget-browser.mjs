import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined});
const origin=process.env.BATTLE_ORIGIN||'http://127.0.0.1:8918';
try{
 for(const [total,stats] of [[0,{health:0,attack:0,defense:0,speed:0}],[9,{health:3,attack:3,defense:2,speed:1}],[11,{health:5,attack:4,defense:1,speed:1}]]){
  const page=await browser.newPage({viewport:{width:844,height:390},reducedMotion:'reduce'});await page.clock.install();
  await page.route('**/data/creatures-v2.json',async route=>{
   const response=await route.fetch(),data=await response.json();
   for(const c of data.creatures)c.stats=stats;
   await route.fulfill({response,json:data});
  });
  await page.goto(origin+'/creature-battle/');
  if(total>10){
   await page.locator('#app').getByText(/at most 10/).waitFor();
   assert.equal(await page.locator('#play-ai,#play-friend').count(),0);
  }else{
   await page.locator('#play-friend').click();
   for(let side=0;side<2;side++){
    await page.locator('.carousel-group:nth-child(2) .trainer-card').filter({hasText:'Uncle Mark'}).click();
    await page.locator('#team-done').click();
   }
   await page.clock.runFor(6000);
   assert.equal(await page.locator('.creature-sprite').count(),2);
   const enabled=page.locator('.grid button.regular:enabled,.grid button.special:enabled');
   await enabled.first().click();await page.clock.runFor(6000);
   assert.ok(await page.locator('.creature-sprite').count());
  }
  console.log(`${total} total: ${total>10?'blocked':'loads and battles'}`);await page.close();
 }
}finally{await browser.close();}
