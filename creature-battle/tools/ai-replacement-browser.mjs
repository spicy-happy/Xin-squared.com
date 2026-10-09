const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
import assert from 'node:assert/strict';
const origin=process.env.BATTLE_ORIGIN||'http://127.0.0.1:8902';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
 for(const difficulty of ['Easy','Hard']){
  const p=await browser.newPage({viewport:{width:844,height:390},reducedMotion:'reduce'}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>{crypto.getRandomValues=a=>{a.fill(571);return a;};window.aiChoices=[];window.aiReplacements=[];});
  // Observe the real controller's policy arguments and choices without changing them.
  await p.route('**/src/ai.js?*',async route=>{
   const response=await route.fetch();let source=await response.text();
   source=source.replace('return { action:',"window.aiChoices.push({side,lastSwitch,kind:action.kind});return { action:");
   source=source.replace('return { index, aiRng: random.state, lastSwitch: true };',"window.aiReplacements.push({side,index});return { index, aiRng: random.state, lastSwitch: true };");
   await route.fulfill({response,body:source});
  });
  await p.goto(origin+'/creature-battle/?debug=1');await p.waitForFunction(()=>window.__battleReady);
  await p.evaluate(()=>__battleDebug.seed(9));await p.locator('#play-ai').click();
  if(difficulty==='Hard'){await p.locator('.difficulty-trigger').click();await p.getByRole('option',{name:'Hard',exact:true}).click();}
  // Select the fast, accurate Tackle user first, independent of shuffled picker order.
  const cards=p.locator('.carousel-group:nth-child(2) .pick-card');
  for(const name of ['Test fire','Test water','Test grass'])await cards.filter({has:p.locator('strong',{hasText:name})}).click();
  await p.locator('#team-done').click();await p.locator('[data-side="0"] [data-action="regular"]:enabled').waitFor();
  await p.evaluate(()=>{__battleDebug.setHp(1,1);aiChoices.length=0;aiReplacements.length=0;});
  await p.locator('[data-side="0"] [data-action="regular"]:enabled').click();
  await p.waitForFunction(()=>aiReplacements.length===1&&aiChoices.length>0,{},{timeout:45000});
  const choice=await p.evaluate(()=>aiChoices[0]);assert.equal(choice.lastSwitch,true);assert.notEqual(choice.kind,'switch');
  await p.locator('[data-side="0"] [data-action]:enabled').first().waitFor({timeout:30000});
  assert.deepEqual(errors,[]);console.log(`${difficulty}: replacement is followed by ${choice.kind}, with no immediate switch`);await p.close();
 }
}finally{await browser.close();}
